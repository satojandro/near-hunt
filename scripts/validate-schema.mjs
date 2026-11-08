#!/usr/bin/env node
/**
 * Validate every live on-chain project record against nearhunt/project/1.
 *
 * This is the contract test for the data layer: if a schema change or an importer change
 * breaks compatibility with what is already on chain, this fails. It reads from the public
 * indexer, so it checks reality, not a fixture.
 *
 * Usage: node scripts/validate-schema.mjs
 */

import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ACCOUNT = process.env.NEARHUNT_ACCOUNT ?? 'nearhunt.near';
const KV_API = 'https://kv.main.fastnear.com';

const schema = JSON.parse(
  await readFile(new URL('../schema/nearhunt-project-1.schema.json', import.meta.url), 'utf8'),
);

// The schema declares draft 2020-12, so it must be compiled with the matching Ajv build
// (Ajv's default entry point only understands draft-07).
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

/** Read every `project/` record, following page tokens. */
async function fetchAll(keyPrefix) {
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

const entries = await fetchAll('project/');
console.log(`fetched ${entries.length} records from ${ACCOUNT}`);

let valid = 0;
let tombstones = 0;
const failures = [];

for (const entry of entries) {
  if (entry.value === null) {
    tombstones += 1;
    continue;
  }

  if (validate(entry.value)) {
    valid += 1;
    continue;
  }

  failures.push({
    key: entry.key,
    errors: validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`),
  });
}

// Cross-field invariants the schema cannot express.
const ids = new Set();
const duplicateIds = [];
for (const entry of entries) {
  if (!entry.value) continue;
  if (ids.has(entry.value.id)) duplicateIds.push(entry.value.id);
  ids.add(entry.value.id);

  const expectedKey = `project/${entry.value.source?.submission_id}`;
  if (entry.key !== expectedKey) {
    failures.push({ key: entry.key, errors: [`key does not match source.submission_id (${expectedKey})`] });
  }
  if (entry.value.id !== `${entry.value.source?.event}:${entry.value.source?.submission_id}`) {
    failures.push({ key: entry.key, errors: ['id is not {source.event}:{source.submission_id}'] });
  }
}

console.log(`valid:      ${valid}`);
console.log(`tombstones: ${tombstones}`);
console.log(`distinct ids: ${ids.size}`);

if (duplicateIds.length) {
  console.error(`\nDUPLICATE IDS (${duplicateIds.length}): ${duplicateIds.slice(0, 5).join(', ')}`);
}

if (failures.length) {
  console.error(`\nINVALID RECORDS (${failures.length}):`);
  for (const f of failures.slice(0, 10)) {
    console.error(`  ${f.key}`);
    for (const e of f.errors.slice(0, 4)) console.error(`    - ${e}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nAll records conform to nearhunt/project/1.');
}
