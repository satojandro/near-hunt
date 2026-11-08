/**
 * Reading NEAR Hunt data from the public FastData KV API.
 *
 * Why writer scoping matters: anyone can call `__fastdata_kv` on `nearhunt.near`, and the
 * indexer stores the row under the receiver either way, tagged with the signer as
 * `predecessor_id`. A read of `/v0/latest/nearhunt.near` therefore returns rows written by
 * strangers too. Project records are only authentic when `nearhunt.near` wrote them, so every
 * project read goes through `/v0/latest/{account}/{writer}`, and rows from any other writer are
 * dropped even if the API returns them.
 */

export const KV_HOSTS = {
  mainnet: 'https://kv.main.fastnear.com',
  testnet: 'https://kv.test.fastnear.com',
};

export const DEFAULT_ACCOUNT = 'nearhunt.near';

/**
 * Read every latest row under `account`, following page tokens.
 *
 * @param {object} opts
 * @param {string} opts.account      receiver account (the namespace)
 * @param {string} [opts.writer]     only rows written by this account; omit for all writers
 * @param {string} [opts.keyPrefix]  key prefix filter, e.g. "project/"
 * @param {string} [opts.network]    "mainnet" (default) or "testnet"
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<Array<{predecessor_id:string,current_account_id:string,block_height:number,key:string,value:unknown}>>}
 */
export async function readLatest({ account, writer, keyPrefix, network = 'mainnet', fetchImpl = fetch }) {
  const host = KV_HOSTS[network];
  if (!host) throw new Error(`unknown network: ${network}`);
  if (!account) throw new Error('account is required');

  const url = `${host}/v0/latest/${writer ? `${account}/${writer}` : account}`;
  const entries = [];
  let pageToken = null;

  do {
    const body = { limit: 200 };
    if (keyPrefix) body.key_prefix = keyPrefix;
    if (pageToken) body.page_token = pageToken;

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`KV API returned ${res.status} for ${url}`);

    const json = await res.json();
    entries.push(...(json.entries ?? []));
    pageToken = json.page_token ?? null;
  } while (pageToken);

  // Belt and braces: never let a row from another writer through a scoped read.
  return writer ? entries.filter((e) => e.predecessor_id === writer) : entries;
}

/** Authentic project rows: written by `account` itself. Tombstones (value null) included. */
export function readProjects({ account = DEFAULT_ACCOUNT, network = 'mainnet', fetchImpl } = {}) {
  return readLatest({ account, writer: account, keyPrefix: 'project/', network, fetchImpl });
}

/** `project/` rows in the namespace written by anyone else: spoofing attempts, never data. */
export async function readForeignProjectRows({ account = DEFAULT_ACCOUNT, network = 'mainnet', fetchImpl } = {}) {
  const all = await readLatest({ account, keyPrefix: 'project/', network, fetchImpl });
  return all.filter((e) => e.predecessor_id !== account);
}
