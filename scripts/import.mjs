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
 * Usage:
 *   node scripts/import.mjs                 # dry run: build and report, send nothing
 *   node scripts/import.mjs --execute       # sign and broadcast
 *   node scripts/import.mjs --account X --network mainnet
 *
 * Requires a NEAR credentials file for the signing account, by default at
 * ~/.near-credentials/mainnet/nearhunt.near.json. Never commit that file.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connect, keyStores, KeyPair, transactions, utils } from 'near-api-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EVENT = 'nearhackathon-2026';
const SCHEMA = 'nearhunt/project/1';

/** The hackathon's own directory API. 8 projects per page, fixed — hence the loop. */
const SOURCE_API = 'https://nearhackathon.com/api/projects';

/** FastData enforces a hard limit of 256 keys per call; larger calls are dropped whole. */
const MAX_KEYS_PER_CALL = 256;

/**
 * 1 Ggas of prepaid gas. The call does no work, so this is the maximum that can be
 * charged, not the amount that will be. It matches what the near.social standard
 * recommends (never attach 30–300 TGas, which burns allowance for nothing).
 */
const GAS = 1_000_000_000n;

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const NETWORK = flag('network', 'mainnet');
const ACCOUNT = flag('account', 'nearhunt.near');
const NODE_URL =
  NETWORK === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org';
const KV_API =
  NETWORK === 'mainnet' ? 'https://kv.main.fastnear.com' : 'https://kv.test.fastnear.com';

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
// Record shaping
// ---------------------------------------------------------------------------

/**
 * Canonical project object. Versioned by `schema` so a later shape can be added under a
 * new namespace instead of mutating this one (same approach as near.social's post2/).
 *
 * Fields the source cannot supply are present as null rather than omitted, so every
 * record has the same keys and consumers never need to distinguish "absent" from
 * "empty". The source API exposes only id, project_name, tracks and demo_url.
 */
function toRecord(p, nowIso) {
  return {
    schema: SCHEMA,
    id: `${EVENT}:${p.id}`,
    source: {
      event: EVENT,
      submission_id: p.id,
      url: 'https://nearhackathon.com/#submissions',
    },
    name: p.project_name,
    description: null,
    tracks: p.tracks ?? [],
    repository_url: null,
    demo_url: p.demo_url ?? null,
    external_campaigns: [],
    updated_at: nowIso,
  };
}

// ---------------------------------------------------------------------------
// Signing and broadcast
// ---------------------------------------------------------------------------

async function loadSigner(near, accountId) {
  const path = join(homedir(), '.near-credentials', NETWORK, `${accountId}.json`);
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

  // Async broadcast: no receipt is awaited, because the receipt is guaranteed to fail
  // (the receiver has no contract). Success is decided by the indexer, not here.
  const hash = utils.serialize.base_encode(txHashBytes);
  await provider.sendTransactionAsync(signedTx);
  return hash;
}

// ---------------------------------------------------------------------------
// Verification — the only thing that counts as success
// ---------------------------------------------------------------------------

async function readBack(keyPrefix) {
  const entries = [];
  let pageToken = null;

  do {
    const body = { key_prefix: keyPrefix, limit: 200 };
    if (pageToken) body.page_token = pageToken;

    const res = await fetch(`${KV_API}/v0/latest/${ACCOUNT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`KV API returned ${res.status}`);
    const json = await res.json();
    entries.push(...(json.entries ?? []));
    pageToken = json.page_token ?? null;
  } while (pageToken);

  return entries;
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

  // Build the KV payload: one key per project, keyed by source submission id so that
  // re-running the import overwrites rather than duplicating.
  const kvPairs = {};
  for (const p of projects) kvPairs[`project/${p.id}`] = toRecord(p, nowIso);

  const keys = Object.keys(kvPairs);
  const batches = [];
  for (let i = 0; i < keys.length; i += MAX_KEYS_PER_CALL) {
    const slice = keys.slice(i, i + MAX_KEYS_PER_CALL);
    batches.push(Object.fromEntries(slice.map((k) => [k, kvPairs[k]])));
  }

  const bytes = Buffer.byteLength(JSON.stringify(kvPairs));
  console.log(`records: ${keys.length} keys, ${bytes} bytes total`);
  console.log(`plan:    ${batches.length} transaction(s) of <=${MAX_KEYS_PER_CALL} keys`);
  console.log(`target:  ${ACCOUNT} on ${NETWORK} (contract-less; receipt failure expected)`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing signed. Re-run with --execute to write.');
    console.log('first record:', JSON.stringify(Object.values(kvPairs)[0], null, 2));
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
    const id = typeof hash === 'string' ? hash : hash?.transaction_outcome?.id ?? hash;
    hashes.push(id);
    console.log(`sent ${i + 1}/${batches.length}: ${id} (${Object.keys(batch).length} keys)`);
  }

  // Poll the indexer. Writes typically land in a few seconds; the index is the truth.
  console.log('\nverifying against the indexer...');
  let verified = [];
  for (let attempt = 1; attempt <= 20; attempt++) {
    verified = await readBack('project/');
    process.stdout.write(`  attempt ${attempt}: ${verified.length}/${keys.length} readable\r`);
    if (verified.length >= keys.length) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nverified: ${verified.length}/${keys.length} project records readable`);
  console.log(`read them: POST ${KV_API}/v0/latest/${ACCOUNT} {"key_prefix":"project/"}`);
  console.log(`txs: ${hashes.join(', ')}`);

  if (verified.length < keys.length) {
    console.error('INCOMPLETE — some records are not yet indexed. Re-run to converge.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
});
