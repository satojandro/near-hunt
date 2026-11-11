// NH-113: the view counter's guard rails. The store must only ever see listing and account paths,
// so a stray caller cannot fill Redis with arbitrary keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countablePath, dayKey, parseIncr, viewKeys, minuteKey, rateKeys, withinMinuteLimits, withinDayLimit,
  projectIdOfPath, VIEW_LIMITS,
} from '../lib/views.mjs';

test('listing and account paths are countable', () => {
  assert.equal(countablePath('/p/81245941-74f3-49b1-a897-4524fec4f0bf'), '/p/81245941-74f3-49b1-a897-4524fec4f0bf');
  assert.equal(countablePath('/u/alejandro.near'), '/u/alejandro.near');
});

test('query strings and fragments do not create extra keys', () => {
  assert.equal(countablePath('/p/81245941-74f3-49b1-a897-4524fec4f0bf?utm_source=x'), '/p/81245941-74f3-49b1-a897-4524fec4f0bf');
  assert.equal(countablePath('/u/alejandro.near#c-1'), '/u/alejandro.near');
});

test('everything else is refused', () => {
  for (const bad of ['/', '/api/projects', '/p/', '/p/../etc', '/p/abc', '/u/', 'https://evil.tld/p/x', '', null, 42, undefined]) {
    assert.equal(countablePath(bad), null, `should refuse: ${String(bad)}`);
  }
});

test('keys are namespaced per path and per UTC day', () => {
  const keys = viewKeys('/p/81245941-74f3-49b1-a897-4524fec4f0bf', new Date('2026-11-09T23:59:59Z'));
  assert.equal(keys.total, 'nh:views:/p/81245941-74f3-49b1-a897-4524fec4f0bf');
  assert.equal(keys.day, 'nh:views:20261109:/p/81245941-74f3-49b1-a897-4524fec4f0bf');
});

test('dayKey is the UTC date, not local time', () => {
  assert.equal(dayKey(new Date('2026-01-01T00:30:00Z')), '20260101');
  assert.equal(dayKey(new Date('2026-01-01T23:30:00Z')), '20260101');
});

test('INCR replies parse, junk does not', () => {
  assert.equal(parseIncr({ result: 7 }), 7);
  assert.equal(parseIncr({ result: '7' }), 7);
  assert.equal(parseIncr({ result: 'not a number' }), null);
  assert.equal(parseIncr({}), null);
});

// NH-118: limits on the counter.
test('rateKeys: one key per path per UTC minute, one for all paths', () => {
  const now = new Date('2026-11-11T09:07:59.900Z');
  assert.equal(minuteKey(now), '202611110907');
  assert.deepEqual(rateKeys('/p/81245941-74f3-49b1-a897-4524fec4f0bf?x=1', now), {
    path: 'nh:views:rl:202611110907:/p/81245941-74f3-49b1-a897-4524fec4f0bf',
    global: 'nh:views:rl:202611110907:*',
  });
  assert.throws(() => rateKeys('/open-data', now));
});

test('withinMinuteLimits: counts up to the limit, refuses past it, and fails closed', () => {
  const { perPathPerMinute: p, globalPerMinute: g } = VIEW_LIMITS;
  assert.equal(withinMinuteLimits({ pathMinute: 1, globalMinute: 1 }), true);
  assert.equal(withinMinuteLimits({ pathMinute: p, globalMinute: g }), true);
  assert.equal(withinMinuteLimits({ pathMinute: p + 1, globalMinute: 1 }), false);
  assert.equal(withinMinuteLimits({ pathMinute: 1, globalMinute: g + 1 }), false);
  assert.equal(withinMinuteLimits({ pathMinute: null, globalMinute: 1 }), false);
  assert.equal(withinMinuteLimits({ pathMinute: 1, globalMinute: null }), false);
});

test('withinDayLimit: the day bucket carries the per-path daily limit', () => {
  assert.equal(withinDayLimit(VIEW_LIMITS.perPathPerDay), true);
  assert.equal(withinDayLimit(VIEW_LIMITS.perPathPerDay + 1), false);
  assert.equal(withinDayLimit(null), false);
});

test('projectIdOfPath: only listing pages have a project id', () => {
  assert.equal(projectIdOfPath('/p/81245941-74f3-49b1-a897-4524fec4f0bf'), '81245941-74f3-49b1-a897-4524fec4f0bf');
  assert.equal(projectIdOfPath('/u/alice.near'), null);
  assert.equal(projectIdOfPath('/open-data'), null);
});
