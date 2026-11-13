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
