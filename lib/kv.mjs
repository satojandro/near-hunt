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
 * @param {string} [opts.key]        exact key, e.g. "vote/{id}" (one row per writer); not with keyPrefix
 * @param {string} [opts.network]    "mainnet" (default) or "testnet"
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<Array<{predecessor_id:string,current_account_id:string,block_height:number,key:string,value:unknown}>>}
 */
export async function readLatest({ account, writer, keyPrefix, key, network = 'mainnet', fetchImpl = fetch }) {
  const host = KV_HOSTS[network];
  if (!host) throw new Error(`unknown network: ${network}`);
  if (!account) throw new Error('account is required');
  if (key != null && keyPrefix != null) throw new Error('pass key or keyPrefix, not both');

  const url = `${host}/v0/latest/${writer ? `${account}/${writer}` : account}`;
  const entries = [];
  let pageToken = null;

  do {
    const body = { limit: 200 };
    if (key != null) body.key = key;
    else if (keyPrefix) body.key_prefix = keyPrefix;
    if (pageToken) body.page_token = pageToken;

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`KV API returned ${res.status} for ${url}`);

    const json = typeof res.text === 'function' ? parseKvJson(await res.text()) : await res.json();
    entries.push(...(json.entries ?? []).map(exactTimestamp));
    pageToken = json.page_token ?? null;
  } while (pageToken);

  // Belt and braces: never let a row from another writer, or another key, through a scoped read.
  return entries.filter((e) => (!writer || e.predecessor_id === writer) && (key == null || e.key === key));
}

/**
 * Parse a KV API response without losing `block_timestamp` precision.
 *
 * The API sends `block_timestamp` as a bare JSON number of nanoseconds (~1.79e18), above 2^53, so
 * `JSON.parse` rounds it (…502512600 instead of …502512652). The reviver's source-text argument
 * (Node 21+) gives the exact digits; they are kept per holder object and put back, as a decimal
 * string, only on the top-level `entries[]` rows. A `block_timestamp` key inside a row's `value`
 * (user data) is left as parsed.
 *
 * @param {string} text
 */
export function parseKvJson(text) {
  const exact = new WeakMap();
  const json = JSON.parse(text, function (k, v, ctx) {
    if (k === 'block_timestamp' && typeof v === 'number' && ctx && typeof ctx.source === 'string') {
      exact.set(this, ctx.source);
    }
    return v;
  });
  if (json && Array.isArray(json.entries)) {
    for (const e of json.entries) {
      if (e && typeof e === 'object' && exact.has(e)) e.block_timestamp = exact.get(e);
    }
  }
  return json;
}

/**
 * Rows carry `block_timestamp` as an exact decimal string of nanoseconds. A number (from a runtime
 * without reviver source text, or a test stub) is converted with `String()`, which is exact only
 * below 2^53.
 */
function exactTimestamp(e) {
  if (e && typeof e === 'object' && typeof e.block_timestamp === 'number' && Number.isFinite(e.block_timestamp)) {
    return { ...e, block_timestamp: BigInt(Math.trunc(e.block_timestamp)).toString() };
  }
  return e;
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
