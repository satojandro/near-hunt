// NH-108: the project hide list. Hiding must never touch the chain and must match on the record's
// own submission_id, so a renamed project cannot be hidden by accident.
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHidden } from '../lib/listing.mjs';

const items = [
  { submission_id: 'a-1', name: 'Keep' },
  { submission_id: 'b-2', name: 'Hidden' },
  { submission_id: 'c-3', name: 'Also keep' },
];

test('filterHidden drops exactly the listed submission ids', () => {
  const out = filterHidden(items, { projects: [{ submission_id: 'b-2' }] });
  assert.deepEqual(out.map((i) => i.submission_id), ['a-1', 'c-3']);
});

test('filterHidden returns the same array when the list is empty', () => {
  assert.equal(filterHidden(items, { projects: [] }), items);
  assert.equal(filterHidden(items, {}), items);
});

test('filterHidden accepts bare ids and ignores entries without an id', () => {
  const out = filterHidden(items, ['b-2', { name: 'no id here' }, { submission_id: 42 }]);
  assert.deepEqual(out.map((i) => i.submission_id), ['a-1', 'c-3']);
});

test('filterHidden never matches on the display name', () => {
  const out = filterHidden(items, { projects: [{ submission_id: 'x-9', name: 'Hidden' }] });
  assert.deepEqual(out.map((i) => i.submission_id), ['a-1', 'b-2', 'c-3']);
});

test('the committed hide list is well formed', async () => {
  const { default: hidden } = await import('../data/hidden-projects.json', { with: { type: 'json' } });
  assert.ok(Array.isArray(hidden.projects), 'projects must be an array');
  for (const entry of hidden.projects) {
    assert.match(entry.submission_id, /^[0-9a-f-]{36}$/i, `bad id: ${entry.submission_id}`);
    assert.equal(typeof entry.reason, 'string');
    assert.ok(entry.reason.length > 10, 'every hidden project carries a readable reason');
  }
});
