import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toListing, trackCounts } from '../lib/listing.mjs';

const rec = (id, extra = {}) => ({
  schema: 'nearhunt/project/1', id: `nearhackathon-2026:${id}`, name: `P ${id}`, description: null,
  tracks: ['agents'], repository_url: null, demo_url: null, external_campaigns: [],
  source: { event: 'nearhackathon-2026', submission_id: id, url: 'https://nearhackathon.com/#submissions' },
  updated_at: '2026-11-08T07:15:21.835Z', ...extra,
});
const row = (key, value, block_height = 1) => ({
  predecessor_id: 'nearhunt.near', current_account_id: 'nearhunt.near', block_height, block_timestamp: 5, key, value,
});

test('toListing keeps live records and attaches provenance', () => {
  const [item] = toListing([row('project/a', rec('a'), 42)]);
  assert.equal(item.submission_id, 'a');
  assert.equal(item.key, 'project/a');
  assert.equal(item.account, 'nearhunt.near');
  assert.equal(item.block_height, 42);
  assert.equal(item.name, 'P a');
});

test('toListing drops tombstones, wrong schema, non-objects and key mismatches', () => {
  const out = toListing([
    row('project/a', null),
    row('project/b', rec('b', { schema: 'other/1' })),
    row('project/c', 'string'),
    row('project/d', rec('not-d')),
    row('vote/e', rec('e')),
    row('project/f', rec('f')),
  ]);
  assert.deepEqual(out.map((p) => p.submission_id), ['f']);
});

test('trackCounts sorts by count then slug', () => {
  const items = toListing([
    row('project/a', rec('a', { tracks: ['defi', 'agents'] })),
    row('project/b', rec('b', { tracks: ['agents'] })),
    row('project/c', rec('c', { tracks: ['nfts'] })),
  ]);
  assert.deepEqual(trackCounts(items), [
    { track: 'agents', count: 2 }, { track: 'defi', count: 1 }, { track: 'nfts', count: 1 },
  ]);
});
