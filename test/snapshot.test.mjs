import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import {
  SNAPSHOT_TTL_SECONDS,
  decodeSnapshot,
  encodeSnapshot,
  isFreshnessRecord,
  isPlainRecord,
  laterFetchedAt,
  newestSnapshot,
  recordDigest,
  snapshotKey,
  snapshotReadAtKey,
} from '../lib/snapshot.mjs';

/**
 * A stored copy must never be the reason a page breaks: anything that cannot be read has to come
 * back as `null`, not as an exception the caller has to guess about.
 */

const LIST = {
  items: [
    { submission_id: 'a', name: 'One', tracks: ['agents'], block_height: 100 },
    { submission_id: 'b', name: 'Two', tracks: ['defi'], block_height: 101 },
  ],
  fetched_at: '2026-11-13T02:48:00.000Z',
  account: 'nearhunt.near',
};

/** The check the projects, votes, comments and participants copies all use. */
const isList = (v) => isFreshnessRecord(v, (items) => Array.isArray(items));

test('a value survives the round trip byte for byte', () => {
  const stored = encodeSnapshot(LIST);
  assert.equal(typeof stored, 'string');
  assert.deepEqual(decodeSnapshot(stored, isList), LIST);
});

test('the stored value is compressed, not raw JSON', () => {
  const stored = encodeSnapshot(LIST);
  assert.doesNotMatch(stored, /submission_id/, 'base64 of gzip must not expose the JSON');
  assert.ok(stored.length < JSON.stringify(LIST).length, 'a stored copy should be smaller');
});

test('unicode survives the round trip', () => {
  const value = { items: [{ name: '中文 🐴 — ünïcode' }], fetched_at: LIST.fetched_at };
  assert.deepEqual(decodeSnapshot(encodeSnapshot(value), isList), value);
});

test('decode returns null for everything that is not a stored value', () => {
  for (const stored of [
    undefined,
    null,
    0,
    '',
    'not base64 at all !!',
    Buffer.from('{"items":[]}').toString('base64'), // valid base64, not gzipped
    Buffer.from([0x1f, 0x8b, 0x08]).toString('base64'), // gzip magic byte, truncated stream
  ]) {
    assert.equal(decodeSnapshot(stored, isList), null, `should reject ${JSON.stringify(stored)}`);
  }
});

test('decode returns null when the shape check fails', () => {
  const asStored = (value) => gzipSync(Buffer.from(JSON.stringify(value))).toString('base64');
  for (const value of [
    { items: 'not an array', fetched_at: LIST.fetched_at },
    { items: [], fetched_at: '' },
    { items: [], fetched_at: 'not a date' },
    { items: [] },
    [],
  ]) {
    assert.equal(isList(value), false, `shape check should reject ${JSON.stringify(value)}`);
    assert.equal(decodeSnapshot(asStored(value), isList), null, `should reject ${JSON.stringify(value)}`);
  }
  assert.deepEqual(decodeSnapshot(asStored(LIST), isList), LIST, 'the control still decodes');
});

test('encodeSnapshot refuses what it cannot serialise', () => {
  assert.throws(() => encodeSnapshot(undefined), /nothing to encode/);
  assert.throws(() => encodeSnapshot(null), /nothing to encode/);
  const circular = {};
  circular.self = circular;
  assert.throws(() => encodeSnapshot(circular), /circular/i);
});

test('isPlainRecord accepts records and rejects arrays, null and scalars', () => {
  assert.equal(isPlainRecord({}), true);
  assert.equal(isPlainRecord([]), false);
  assert.equal(isPlainRecord(null), false);
  assert.equal(isPlainRecord('x'), false);
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

test('isFreshnessRecord can validate a copy whose payload is not called "items"', () => {
  // The vote and comment copies store `rows`, not `items`. A validator that only looked at `items`
  // would reject every one of them while the store answered correctly — the fallback would fire and
  // the answer would be thrown away, which reads to a visitor as "unavailable right now".
  const rowsCopy = { rows: [{ key: 'vote/abc' }], fetched_at: LIST.fetched_at };
  const isRowsCopy = (v) => isFreshnessRecord(v, (rows) => Array.isArray(rows), 'rows');
  assert.equal(isRowsCopy(rowsCopy), true);
  assert.deepEqual(decodeSnapshot(encodeSnapshot(rowsCopy), isRowsCopy), rowsCopy);

  // The default stays `items`, and still rejects a copy that has only `rows`.
  assert.equal(isFreshnessRecord(rowsCopy, (v) => Array.isArray(v)), false);
  assert.equal(isRowsCopy({ items: [], fetched_at: LIST.fetched_at }), false);
});

test('keys are namespaced and versioned, and copies expire', () => {
  assert.equal(snapshotKey('projects'), 'nearhunt:snapshot:projects:v1');
  assert.equal(snapshotKey('votes', 2), 'nearhunt:snapshot:votes:v2');
  assert.notEqual(snapshotKey('projects'), snapshotKey('votes'));
  assert.throws(() => snapshotKey('Projects'), /bad name/);
  assert.throws(() => snapshotKey(''), /bad name/);
  assert.ok(SNAPSHOT_TTL_SECONDS >= 24 * 60 * 60, 'a copy should outlive a day of trouble');
  assert.ok(SNAPSHOT_TTL_SECONDS <= 30 * 24 * 60 * 60, 'and not be kept for a month');
});

test('recordDigest fingerprints the content, not the time it was read', () => {
  // NH-125: the whole point is that the same rows read twice must look identical, or the copy is
  // rewritten on every revalidation (that write is what filled the Upstash plan's bandwidth).
  const rows = [{ key: 'vote/a', value: '1' }, { key: 'vote/b', value: '1' }];
  const first = { rows, fetched_at: '2026-11-18T00:00:00.000Z' };
  const second = { rows, fetched_at: '2026-11-18T03:41:00.000Z' };
  assert.equal(recordDigest(first), recordDigest(second));
  assert.match(recordDigest(first), /^sha256:[0-9a-f]{64}$/);

  // A vote landing, a comment being hidden, an account ageing out of the window: any of these must
  // change the digest, or the copy would never be rewritten and the site would freeze on old rows.
  assert.notEqual(recordDigest({ rows: [...rows, { key: 'vote/c' }], fetched_at: first.fetched_at }), recordDigest(first));
  assert.notEqual(recordDigest({ rows: [{ key: 'vote/a', value: '0' }], fetched_at: first.fetched_at }), recordDigest(first));
  assert.notEqual(recordDigest({ items: [], fetched_at: first.fetched_at }), recordDigest(first));

  // The `items` copy (projects, participants) is digested the same way, and is not confused with a
  // `rows` copy that happens to hold the same values.
  assert.equal(recordDigest({ items: rows }), recordDigest({ items: rows, fetched_at: second.fetched_at }));
  assert.notEqual(recordDigest({ items: rows }), recordDigest({ rows }));
});

test('the read-at stamp lives beside the copy, and the honest age is the later of the two', () => {
  const key = snapshotKey('votes');
  assert.equal(snapshotReadAtKey(key), 'nearhunt:snapshot:votes:v1:read-at');
  assert.notEqual(snapshotReadAtKey(key), key);

  const changedAt = '2026-11-18T00:00:00.000Z';
  const readAt = '2026-11-18T04:00:00.000Z';
  // Rows last changed at midnight, read again at 04:00: the copy is four hours old *as data* is
  // not true — those rows were read a minute ago. The later time is the honest one.
  assert.equal(laterFetchedAt(changedAt, readAt), readAt);
  assert.equal(laterFetchedAt(readAt, changedAt), readAt);
  // A stamp can be missing (copy written before this change, or the store refused the write).
  assert.equal(laterFetchedAt(changedAt, null), changedAt);
  assert.equal(laterFetchedAt(null, readAt), readAt);
  assert.equal(laterFetchedAt(undefined, ''), null);
  // Garbage is ignored rather than treated as "now", which would understate a copy's age.
  assert.equal(laterFetchedAt(changedAt, 'not a date'), changedAt);
  assert.equal(laterFetchedAt('nonsense', ' '), null);
});
