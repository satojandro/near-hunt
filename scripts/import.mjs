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
 *   node scripts/import.mjs --execute --yes       # sign and broadcast the diff
 *   node scripts/import.mjs --account X --network testnet
 *   node scripts/import.mjs --execute --yes --key-file path/to/limited-key.json
 *
 * Requires a NEAR credentials file for the signing account, by default at
 * ~/.near-credentials/{network}/{account}.json (override with --key-file). A function-call key limited to
 * `__fastdata_kv` on the account is enough (docs/runbooks/keys.md). Never commit that file.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connect, keyStores, KeyPair, transactions, utils } from 'near-api-js';
import { readProjects, KV_HOSTS } from '../lib/kv.mjs';
import { planImport, toBatches, canonical, MAX_KEYS_PER_CALL } from '../lib/import-plan.mjs';

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
const KEY_FILE = flag('key-file', join(homedir(), '.near-credentials', NETWORK, `${ACCOUNT}.json`));
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
// Signing and broadcast
// ---------------------------------------------------------------------------

async function loadSigner(near, accountId) {
  const path = KEY_FILE;
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const secret = raw.secret_key ?? raw.private_key;
  if (!secret) throw new Error(`no secret key in ${path}`);

  const keyPair = KeyPair.fromString(secret);
  await near.connection.signer.keyStore.setKey(NETWORK, accountId, keyPair);
  return keyPair.getPublicKey();
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
  const publicKey = await loadSigner(near, ACCOUNT);
  console.log(`signer:  ${ACCOUNT} (${publicKey.toString()})`);

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
