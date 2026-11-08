#!/usr/bin/env node
/**
 * Import NEAR Hackathon submissions into the NEAR Hunt namespace as FastData KV records.
 *
 * Why this is not a normal "write to a contract" script:
 *
 *   Project records are not stored in a smart contract. They are FastData KV writes:
 *   a FunctionCall to `__fastdata_kv` whose JSON arguments are themselves the key/value
 *   pairs to store. The FastData indexer picks them out of the chain by method-name
 *   suffix ("kv") and ignores receipt status — which matters, because the receiving
 *   account `nearhunt.near` has no contract, so the receipt ALWAYS fails with
 *   CodeDoesNotExist. That failure is the success case.
 *
 *   Therefore this script broadcasts asynchronously (sendTransactionAsync) and verifies
 *   against the indexer rather than the receipt. See docs/phase-0-spike.md.
 *
 * Safety (see AGENTS.md):
 *   - Writes only keys that are new or whose source-owned fields changed (lib/import-plan.mjs).
 *     A re-run on an unchanged feed sends nothing.
 *   - Never tombstones. Projects that left the feed are reported for a human to decide.
 *   - Signing requires BOTH --execute and --yes. Without them it is a dry run that prints
 *     the exact diff it would write.
 *
 * Usage:
 *   node scripts/import.mjs                       # dry run: fetch, diff against chain, report
 *   node scripts/import.mjs --check-key           # resolve the signer key and print its permission
 *   node scripts/import.mjs --execute --yes       # sign and broadcast the diff
 *   node scripts/import.mjs --account X --network testnet
 *   node scripts/import.mjs --execute --yes --key-file path/to/limited-key.json
 *
 * Before signing, the importer asks the RPC what the key is allowed to do. A `FullAccess` key
 * is refused with a non-zero exit, because an import needs only `__fastdata_kv` on one
 * receiver; pass --accept-full-access to override that on purpose.
 *
 * Requires a NEAR credentials file for the signing account, in either shape the CLIs write
 * (both are resolved, see resolveKeyFile): a flat ~/.near-credentials/{network}/{account}.json
 * (older near-cli) or a directory of one file per public key,
 * ~/.near-credentials/{network}/{account}/{public-key}.json (near-cli-rs
 * `save-to-legacy-keychain`). Override with --key-file. A function-call key limited to
 * `__fastdata_kv` on the account is enough (docs/runbooks/keys.md). Never commit that file.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connect, keyStores, KeyPair, transactions, utils } from 'near-api-js';
import { readProjects, KV_HOSTS } from '../lib/kv.mjs';
import { planImport, toBatches, canonical, MAX_KEYS_PER_CALL } from '../lib/import-plan.mjs';
import { describePermission, isFullAccess, importKeyDecision } from '../lib/key-permission.mjs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The hackathon's own directory API. 8 projects per page, fixed — hence the loop. */
const SOURCE_API = 'https://nearhackathon.com/api/projects';

/**
 * 1 Ggas of prepaid gas. The call does no work, so this is the maximum that can be
 * charged, not the amount that will be. It matches what the near.social standard
 * recommends (never attach 30–300 TGas, which burns allowance for nothing).
 */
const GAS = 1_000_000_000n;

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const CONFIRMED = args.includes('--yes');
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const NETWORK = flag('network', 'mainnet');
const ACCOUNT = flag('account', 'nearhunt.near');
const KEY_FILE_FLAG = flag('key-file', undefined);
const CHECK_KEY = args.includes('--check-key');
const ACCEPT_FULL_ACCESS = args.includes('--accept-full-access');
const CREDENTIALS_ROOT = join(homedir(), '.near-credentials');
const NODE_URL =
  NETWORK === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org';

// ---------------------------------------------------------------------------
// Source ingestion
// ---------------------------------------------------------------------------

async function fetchSubmissions() {
  const all = [];
  let total = null;
  let page = 1;

  while (true) {
    const res = await fetch(`${SOURCE_API}?page=${page}`);
    if (!res.ok) throw new Error(`source API returned ${res.status} on page ${page}`);
    const body = await res.json();

    total = body.total;
    if (!body.projects?.length) break;
    all.push(...body.projects);
    if (all.length >= total) break;

    page += 1;
    await new Promise((r) => setTimeout(r, 400)); // be a polite client
  }

  // The feed grows while we read it, so dedupe on the source's own id rather than
  // trusting that page boundaries are stable.
  const seen = new Map();
  for (const p of all) seen.set(p.id, p);

  return { projects: [...seen.values()], reportedTotal: total };
}

// ---------------------------------------------------------------------------
// Credentials resolution
// ---------------------------------------------------------------------------

const statOrNull = async (path) => {
  try {
    return await stat(path);
  } catch {
    return null;
  }
};

/** One credentials file per public key lives inside a directory named after the account. */
async function keyFilesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(dir, e.name))
    .sort();
}

/**
 * A near-cli-rs keychain directory can hold several keys (full access, function call, old
 * rotated keys). Every candidate is reported with the permission its key holds on chain, so
 * the choice is visible rather than implied; the newest file is chosen unless --key-file pins
 * one.
 */
async function newestFirst(files) {
  const dated = await Promise.all(
    files.map(async (file) => ({ file, mtimeMs: (await stat(file)).mtimeMs })),
  );
  dated.sort((a, b) => b.mtimeMs - a.mtimeMs || a.file.localeCompare(b.file));
  return dated.map((d) => d.file);
}

/**
 * Resolve the credentials file for an account, accepting both shapes the NEAR CLIs write:
 *
 *   ~/.near-credentials/{network}/{account}.json                     (older near-cli)
 *   ~/.near-credentials/{network}/{account}/{public-key}.json        (near-cli-rs)
 *
 * The flat file wins when both exist, so behaviour for existing setups never changes. Every
 * candidate found is returned alongside the pick, so the caller can print what each key is
 * allowed to do on chain. On failure the message lists every path that was tried.
 *
 * @returns {Promise<{path: string, candidates: string[]}>}
 */
async function resolveKeyFile({ network, account, explicit }) {
  if (explicit) {
    const info = await statOrNull(explicit);
    if (info?.isFile()) return { path: explicit, candidates: [explicit] };
    if (info?.isDirectory()) {
      const files = await keyFilesIn(explicit);
      if (!files.length) {
        throw new Error(`--key-file ${explicit} is a directory with no .json file inside it`);
      }
      const ordered = await newestFirst(files);
      return { path: ordered[0], candidates: ordered };
    }
    throw new Error(`--key-file ${explicit} does not exist`);
  }

  const base = join(CREDENTIALS_ROOT, network, account);
  const flat = `${base}.json`;
  const tried = [flat];

  const flatExists = (await statOrNull(flat))?.isFile();
  const dirInfo = await statOrNull(base);
  const dirFiles = dirInfo?.isDirectory() ? await newestFirst(await keyFilesIn(base)) : [];

  if (flatExists) return { path: flat, candidates: [flat, ...dirFiles] };

  tried.push(base);
  if (dirInfo?.isDirectory()) {
    if (dirFiles.length) return { path: dirFiles[0], candidates: dirFiles };
    throw new Error(
      `no key file for ${account} on ${network}. Tried:\n  ${tried.join('\n  ')}\n` +
        `  (${base} exists but holds no .json file)`,
    );
  }

  throw new Error(
    `no credentials for ${account} on ${network}. Tried:\n  ${tried.join('\n  ')}\n` +
      `near-cli-rs writes ${base}/<public-key>.json; older near-cli writes ${flat}. ` +
      `Add a key as described in docs/runbooks/keys.md, or pass --key-file <path>.`,
  );
}

/** Read a credentials file and hand the secret key back as a near-api-js KeyPair. */
async function readKeyPair(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const secret = raw.secret_key ?? raw.private_key;
  if (!secret) throw new Error(`no secret_key/private_key field in ${path}`);
  return { path, accountId: raw.account_id ?? null, keyPair: KeyPair.fromString(secret) };
}

/**
 * Ask the RPC what the key may do. `permission` is either "FullAccess" or
 * `{ FunctionCall: { receiver_id, method_names, allowance } }`.
 *
 * A credentials file cannot answer this: the file holds a secret, the chain holds the
 * authority. Reading it costs one read-only RPC call against the same node the importer
 * already talks to.
 */
async function queryPermission(near, accountId, publicKey) {
  const accessKey = await near.connection.provider.query({
    request_type: 'view_access_key',
    finality: 'final',
    account_id: accountId,
    public_key: publicKey,
  });
  return accessKey.permission ?? null;
}

/**
 * Print every candidate file with the permission its public key actually holds on chain.
 * The chosen file is marked `*`. Returns the chosen permission, or null when it could not
 * be read (an unpublished key, or an RPC failure).
 */
async function reportKeyCandidates(near, { candidates, chosen, accountId }) {
  console.log('key candidates:');
  let chosenPermission = null;

  for (const file of candidates) {
    const mark = file === chosen ? '*' : ' ';
    let described;
    try {
      const { keyPair } = await readKeyPair(file);
      const permission = await queryPermission(near, accountId, keyPair.getPublicKey().toString());
      described = `permission: ${describePermission(permission)}`;
      if (file === chosen) chosenPermission = permission;
    } catch (err) {
      described = `permission: unknown (${err.message})`;
    }
    console.log(`  ${mark} ${file}  ${described}`);
  }

  return chosenPermission;
}


/**
 * Send one batch and return the transaction hash.
 *
 * sendTransactionAsync is deliberate: the receipt fails by design, so any call that
 * waits for an outcome either throws or reports failure for a write that succeeded.
 * Correctness is established afterwards, against the indexer.
 */
async function sendBatch(near, accountId, publicKey, receiverId, kvPairs) {
  const provider = near.connection.provider;

  // Nonce and block hash must come from a fresh access key, and the nonce must be
  // read per batch because each accepted transaction advances it.
  const accessKey = await provider.query({
    request_type: 'view_access_key',
    finality: 'optimistic',
    account_id: accountId,
    public_key: publicKey.toString(),
  });

  const action = transactions.functionCall(
    '__fastdata_kv',
    Buffer.from(JSON.stringify(kvPairs), 'utf8'),
    GAS,
    0n,
  );

  // The 7-argument form of signTransaction builds the unsigned transaction and signs it
  // in one step. (The object form needs a real Transaction instance — near-api-js v5's
  // createTransaction returns a plain object, so passing it here would be misread as
  // the legacy receiverId argument.)
  //
  // It returns a tuple [txHashBytes, SignedTransaction], not a SignedTransaction.
  const [txHashBytes, signedTx] = await transactions.signTransaction(
    receiverId,
    accessKey.nonce + 1,
    [action],
    utils.serialize.base_decode(accessKey.block_hash),
    near.connection.signer,
    accountId,
    NETWORK,
  );

  const hash = utils.serialize.base_encode(txHashBytes);
  await provider.sendTransactionAsync(signedTx);
  return hash;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printPlan(plan) {
  const { create, update, unchanged, missingFromFeed, deletedOnChain } = plan;
  console.log(`\nplan:`);
  console.log(`  new:              ${create.length}`);
  console.log(`  changed:          ${update.length}`);
  console.log(`  unchanged:        ${unchanged}`);
  console.log(`  missing from feed ${missingFromFeed.length}  (reported only, never deleted)`);
  console.log(`  deleted on chain  ${deletedOnChain.length}  (tombstoned on purpose, not recreated)`);

  for (const w of create.slice(0, 20)) console.log(`  + ${w.key}  "${w.value.name}"`);
  if (create.length > 20) console.log(`  + … ${create.length - 20} more`);
  for (const w of update.slice(0, 20)) console.log(`  ~ ${w.key}  changed: ${w.changes.join(', ')}`);
  if (update.length > 20) console.log(`  ~ … ${update.length - 20} more`);
  for (const k of missingFromFeed.slice(0, 20)) console.log(`  ? ${k}  no longer in the feed`);
  for (const k of deletedOnChain.slice(0, 20)) console.log(`  x ${k}  in the feed but tombstoned on chain`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const nowIso = new Date().toISOString();

  // Resolve the signer, print what the key is allowed to do, and sign nothing. This is what
  // makes the key rules in docs/runbooks/keys.md testable before a real import.
  if (CHECK_KEY) {
    const near = await connect({
      networkId: NETWORK,
      nodeUrl: NODE_URL,
      keyStore: new keyStores.InMemoryKeyStore(),
    });
    const { path, candidates } = await resolveKeyFile({
      network: NETWORK,
      account: ACCOUNT,
      explicit: KEY_FILE_FLAG,
    });
    const { accountId, keyPair } = await readKeyPair(path);
    const permission = await reportKeyCandidates(near, {
      candidates,
      chosen: path,
      accountId: accountId ?? ACCOUNT,
    });

    console.log(`key file:   ${path}`);
    console.log(`account:    ${accountId ?? ACCOUNT}`);
    console.log(`public:     ${keyPair.getPublicKey().toString()}`);
    console.log(`permission: ${describePermission(permission)}`);
    if (isFullAccess(permission)) {
      console.warn(
        '  ! full access — --execute will refuse this key unless --accept-full-access is passed.',
      );
    }
    console.log('resolved and parsed — nothing signed, nothing sent.');
    return;
  }

  console.log(`source:  ${SOURCE_API}`);
  const { projects, reportedTotal } = await fetchSubmissions();
  console.log(`fetched: ${projects.length} projects (source reports ${reportedTotal})`);
  if (projects.length !== reportedTotal) {
    console.warn(`  ! count mismatch — the feed moved while reading; records deduped by id`);
  }

  const existing = await readProjects({ account: ACCOUNT, network: NETWORK });
  console.log(`chain:   ${existing.length} project rows written by ${ACCOUNT} on ${NETWORK}`);

  const plan = planImport({ submissions: projects, existing, nowIso });
  printPlan(plan);

  const writes = [...plan.create, ...plan.update];
  if (writes.length === 0) {
    console.log('\nNothing to write. The chain already matches the feed.');
    return;
  }

  const batches = toBatches(writes);
  const bytes = Buffer.byteLength(JSON.stringify(Object.fromEntries(writes.map((w) => [w.key, w.value]))));
  console.log(`\nwould write: ${writes.length} keys, ${bytes} bytes, ${batches.length} transaction(s) of <=${MAX_KEYS_PER_CALL} keys`);
  console.log(`target:      ${ACCOUNT} on ${NETWORK} (contract-less; receipt failure expected)`);

  if (!EXECUTE || !CONFIRMED) {
    console.log('\nDRY RUN — nothing signed. After a human has reviewed the diff above, re-run with --execute --yes.');
    return;
  }

  const near = await connect({
    networkId: NETWORK,
    nodeUrl: NODE_URL,
    keyStore: new keyStores.InMemoryKeyStore(),
  });
  const { path, candidates } = await resolveKeyFile({
    network: NETWORK,
    account: ACCOUNT,
    explicit: KEY_FILE_FLAG,
  });
  const { keyPair } = await readKeyPair(path);
  const permission = await reportKeyCandidates(near, {
    candidates,
    chosen: path,
    accountId: ACCOUNT,
  });

  // Refuse to sign an import with a key that can drain or delete the account. This runs
  // before the signer is installed and before any transaction is built.
  const decision = importKeyDecision({
    permission,
    keyPath: path,
    acceptFullAccess: ACCEPT_FULL_ACCESS,
  });
  if (!decision.allowed) throw new Error(decision.reason);
  if (decision.warning) console.warn(`  ! ${decision.warning}`);

  await near.connection.signer.keyStore.setKey(NETWORK, ACCOUNT, keyPair);
  const publicKey = keyPair.getPublicKey();
  console.log(`signer:  ${ACCOUNT} (${publicKey.toString()}) — ${describePermission(permission)}`);

  const hashes = [];
  for (const [i, batch] of batches.entries()) {
    const hash = await sendBatch(near, ACCOUNT, publicKey, ACCOUNT, batch);
    hashes.push(hash);
    console.log(`sent ${i + 1}/${batches.length}: ${hash} (${Object.keys(batch).length} keys)`);
  }

  // Poll the indexer until every written key reads back with the exact content we sent.
  console.log('\nverifying against the indexer...');
  const expected = new Map(writes.map((w) => [w.key, canonical(w.value)]));
  let pending = [...expected.keys()];
  for (let attempt = 1; attempt <= 20 && pending.length; attempt++) {
    const rows = await readProjects({ account: ACCOUNT, network: NETWORK });
    const latest = new Map(rows.map((r) => [r.key, canonical(r.value)]));
    pending = pending.filter((k) => latest.get(k) !== expected.get(k));
    process.stdout.write(`  attempt ${attempt}: ${expected.size - pending.length}/${expected.size} verified\r`);
    if (pending.length) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nverified: ${expected.size - pending.length}/${expected.size} written keys read back`);
  console.log(`read them: POST ${KV_HOSTS[NETWORK]}/v0/latest/${ACCOUNT}/${ACCOUNT} {"key_prefix":"project/"}`);
  console.log(`txs: ${hashes.join(', ')}`);

  if (pending.length) {
    console.error(`INCOMPLETE — ${pending.length} keys not yet indexed, e.g. ${pending[0]}. Re-run (dry) to see what remains.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
});
