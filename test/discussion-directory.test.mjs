import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortItems, parseParams, directoryView, buildHref } from '../lib/directory.mjs';

// NH-43 "Most discussed". Same shape as the directory test feed.
const item = (id, name, block_height, tracks = ['ai']) => ({ submission_id: id, name, block_height, tracks });
const FEED = [item('a', 'Alpha', 10), item('b', 'Bravo', 30), item('c', 'Charlie', 20), item('d', 'Delta', 40)];
const ids = (xs) => xs.map((i) => i.submission_id);

test('discussed: most replies first; posted projects with 0 replies before projects with no post', () => {
  assert.deepEqual(ids(sortItems(FEED, 'discussed', {}, { a: 3, c: 0, b: 3 })), ['b', 'a', 'c', 'd']);
});

test('discussed with no posts anywhere (today) is exactly the newest order', () => {
  assert.deepEqual(ids(sortItems(FEED, 'discussed', {}, {})), ids(sortItems(FEED, 'newest')));
  assert.deepEqual(ids(sortItems(FEED, 'discussed')), ids(sortItems(FEED, 'newest')));
});

test('?sort=discussed parses, round-trips, and reaches directoryView', () => {
  assert.equal(parseParams({ sort: 'discussed' }).sort, 'discussed');
  assert.equal(buildHref({ q: '', track: null, sort: 'discussed' }), '/?sort=discussed');
  const view = directoryView(FEED, { sort: 'discussed' }, {}, { c: 1 });
  assert.deepEqual(ids(view.results), ['c', 'd', 'b', 'a']);
});
