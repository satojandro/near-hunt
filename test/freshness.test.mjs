import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageText, staleNotice } from '../lib/freshness.mjs';

const T0 = Date.parse('2026-11-08T12:00:00.000Z');
const at = (ms) => new Date(T0 - ms).toISOString();
const MIN = 60_000;

test('ageText rounds down and pluralises', () => {
  assert.equal(ageText(at(0), T0), 'less than a minute ago');
  assert.equal(ageText(at(59_999), T0), 'less than a minute ago');
  assert.equal(ageText(at(MIN), T0), '1 minute ago');
  assert.equal(ageText(at(4 * MIN + 59_000), T0), '4 minutes ago');
  assert.equal(ageText(at(59 * MIN), T0), '59 minutes ago');
  assert.equal(ageText(at(60 * MIN), T0), '1 hour ago');
  assert.equal(ageText(at(47 * 60 * MIN), T0), '47 hours ago');
  assert.equal(ageText(at(48 * 60 * MIN), T0), '2 days ago');
});

test('ageText treats a future time as just now and rejects garbage', () => {
  assert.equal(ageText(at(-5 * MIN), T0), 'less than a minute ago');
  assert.equal(ageText('not a date', T0), null);
  assert.equal(ageText(at(0), Number.NaN), null);
});

test('ageText accepts a Date or epoch ms', () => {
  assert.equal(ageText(new Date(T0 - 2 * MIN), T0), '2 minutes ago');
  assert.equal(ageText(T0 - 3 * MIN, T0), '3 minutes ago');
});

test('staleNotice is null while reads succeed, however old the copy', () => {
  assert.equal(staleNotice({ fetchedAt: at(30 * MIN), now: T0, readFailing: false }), null);
});

test('staleNotice names the age of the copy when the last read failed', () => {
  const n = staleNotice({ fetchedAt: at(4 * MIN), now: T0, readFailing: true });
  assert.equal(n.headline, 'Showing data from 4 minutes ago.');
  assert.equal(n.age, '4 minutes ago');
  assert.match(n.body, /NEAR indexer is slow to respond/);
  assert.match(n.body, /safe on chain/);
});

test('staleNotice still warns when the copy has no readable time', () => {
  const n = staleNotice({ fetchedAt: 'bogus', now: T0, readFailing: true });
  assert.equal(n.headline, 'Showing an earlier copy of the data.');
});
