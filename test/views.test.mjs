// NH-113: the view counter's guard rails. The store must only ever see listing and account paths,
// so a stray caller cannot fill Redis with arbitrary keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countablePath, dayKey, parseIncr, viewKeys } from '../lib/views.mjs';

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
