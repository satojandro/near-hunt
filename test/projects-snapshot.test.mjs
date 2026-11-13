import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import {
  SNAPSHOT_KEY,
  SNAPSHOT_TTL_SECONDS,
  decodeSnapshot,
  encodeSnapshot,
  isSnapshot,
  newestSnapshot,
} from '../lib/projects-snapshot.mjs';

/**
 * The durable copy must never be the reason a page breaks: a stored value that cannot be read has
 * to come back as `null`, not as an exception the caller has to guess about.
 */

const LIST = {
  items: [
    { submission_id: 'a', name: 'One', tracks: ['agents'], block_height: 100 },
    { submission_id: 'b', name: 'Two', tracks: ['defi'], block_height: 101 },
  ],
  fetched_at: '2026-11-13T02:48:00.000Z',
  account: 'nearhunt.near',
};

test('a snapshot survives the round trip byte for byte', () => {
  const stored = encodeSnapshot(LIST);
  assert.equal(typeof stored, 'string');
  assert.deepEqual(decodeSnapshot(stored), LIST);
});

test('the stored value is compressed, not raw JSON', () => {
  const stored = encodeSnapshot(LIST);
  assert.doesNotMatch(stored, /submission_id/, 'base64 of gzip must not expose the JSON');
  assert.ok(stored.length < JSON.stringify(LIST).length, 'a stored copy should be smaller');
});

test('unicode names survive the round trip', () => {
  const list = { ...LIST, items: [{ submission_id: 'c', name: '中文 🐴 — ünïcode', tracks: [] }] };
  assert.deepEqual(decodeSnapshot(encodeSnapshot(list)), list);
});

test('decode returns null for everything that is not a stored snapshot', () => {
  for (const value of [
    undefined,
    null,
    0,
    '',
    'not base64 at all !!',
    Buffer.from('{"items":[]}').toString('base64'), // valid base64, not gzipped
    Buffer.from([0x1f, 0x8b, 0x08]).toString('base64'), // gzip magic byte, truncated stream
  ]) {
    assert.equal(decodeSnapshot(value), null, `should reject ${JSON.stringify(value)}`);
  }
});

test('decode returns null for a snapshot of the wrong shape', () => {
  const asStored = (value) => gzipSync(Buffer.from(JSON.stringify(value))).toString('base64');
  for (const value of [
    { items: 'not an array', fetched_at: LIST.fetched_at, account: LIST.account },
    { items: [], fetched_at: '', account: LIST.account },
    { items: [], fetched_at: LIST.fetched_at, account: '' },
    { items: [], fetched_at: LIST.fetched_at },
    [],
  ]) {
    assert.equal(isSnapshot(value), false);
    assert.equal(decodeSnapshot(asStored(value)), null, `should reject ${JSON.stringify(value)}`);
  }
  // The control: a well-formed snapshot built by the same helper does decode.
  assert.deepEqual(decodeSnapshot(asStored(LIST)), LIST);
});

test('encodeSnapshot refuses a value that is not a snapshot', () => {
  assert.throws(() => encodeSnapshot({ items: [] }), /not a snapshot/);
  assert.throws(() => encodeSnapshot(null), /not a snapshot/);
});

test('newestSnapshot picks the newer copy and tolerates a missing one', () => {
  const older = { ...LIST, fetched_at: '2026-11-13T01:00:00.000Z' };
  const newer = { ...LIST, fetched_at: '2026-11-13T02:00:00.000Z' };
  assert.equal(newestSnapshot(older, newer), newer);
  assert.equal(newestSnapshot(newer, older), newer);
  assert.equal(newestSnapshot(null, older), older);
  assert.equal(newestSnapshot(older, null), older);
  assert.equal(newestSnapshot(null, null), null);
});

test('the key is namespaced and versioned, and the copy expires', () => {
  assert.equal(SNAPSHOT_KEY, 'nearhunt:projects-snapshot:v1');
  assert.ok(SNAPSHOT_TTL_SECONDS >= 24 * 60 * 60, 'a snapshot should outlive a day of trouble');
  assert.ok(SNAPSHOT_TTL_SECONDS <= 30 * 24 * 60 * 60, 'and not be kept for a month');
});
