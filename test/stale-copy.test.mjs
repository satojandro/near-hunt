import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageText, staleCopyText } from '../lib/freshness.mjs';

/**
 * A stored copy is never presented as current. These are the two halves of that rule: the wording
 * ("as of 4 minutes ago") and the fallback when the time is missing or unparseable.
 */

const T0 = Date.parse('2026-11-13T12:00:00.000Z');
const MIN = 60_000;

test('staleCopyText names the age of the copy', () => {
  assert.equal(staleCopyText(new Date(T0 - 4 * MIN).toISOString(), T0), 'as of 4 minutes ago');
  assert.equal(staleCopyText(T0 - 90 * MIN, T0), 'as of 1 hour ago');
  assert.equal(staleCopyText(new Date(T0 - 2 * 24 * 60 * MIN), T0), 'as of 2 days ago');
});

test('staleCopyText never says "just now" about a copy', () => {
  // A copy read seconds ago is still a copy: "as of less than a minute ago" is honest, "just now"
  // is not. This is the one place the wording may look repetitive; that is deliberate.
  assert.equal(staleCopyText(new Date(T0 - 5_000).toISOString(), T0), 'as of less than a minute ago');
});

test('staleCopyText falls back when there is no usable time', () => {
  for (const value of [null, undefined, '', 'not a date', Number.NaN]) {
    assert.equal(staleCopyText(value, T0), 'from an earlier read');
  }
});

test('staleCopyText agrees with ageText, so the two cannot drift', () => {
  const fetchedAt = new Date(T0 - 7 * MIN).toISOString();
  assert.equal(staleCopyText(fetchedAt, T0), `as of ${ageText(fetchedAt, T0)}`);
});

// The warm-instance case: Next's cache answers with an expired entry and re-reads in the
// background; when that re-read fails the old entry keeps being served. "The cache answered" is
// therefore not "this was just read", and `copyIsStale` is what tells the two apart.
test('copyIsStale: a copy read before the last failed read is a saved copy', async () => {
  const { copyIsStale } = await import('../lib/freshness.mjs');
  const readAt = new Date(T0 - 30_000).toISOString();
  // no failure: a 30 s old copy is current
  assert.equal(copyIsStale({ fetchedAt: readAt, now: T0, lastFailedAt: 0 }), false);
  // the re-read failed 10 s ago, after this copy was read: it is a saved copy
  assert.equal(copyIsStale({ fetchedAt: readAt, now: T0, lastFailedAt: T0 - 10_000 }), true);
  // a copy read after the failure (by this or another instance) proves the indexer answered since
  assert.equal(copyIsStale({ fetchedAt: new Date(T0 - 5_000).toISOString(), now: T0, lastFailedAt: T0 - 10_000 }), false);
});

test('copyIsStale: an old copy is labelled even when no read has failed here', async () => {
  const { copyIsStale, STALE_COPY_AFTER_MS } = await import('../lib/freshness.mjs');
  assert.equal(copyIsStale({ fetchedAt: T0 - STALE_COPY_AFTER_MS, now: T0 }), false);
  assert.equal(copyIsStale({ fetchedAt: T0 - STALE_COPY_AFTER_MS - 1, now: T0 }), true);
  assert.equal(copyIsStale({ fetchedAt: T0 - 2 * MIN, now: T0, maxAgeMs: MIN }), true);
});

test('copyIsStale: a copy with no usable time is never called current', async () => {
  const { copyIsStale } = await import('../lib/freshness.mjs');
  for (const value of [null, undefined, '', 'not a date', Number.NaN]) {
    assert.equal(copyIsStale({ fetchedAt: value, now: T0 }), true);
  }
});
