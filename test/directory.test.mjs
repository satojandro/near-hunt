import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText, parseParams, searchItems, filterByTrack, sortItems, trackChips, buildHref,
  hostOf, formatFetchedUtc, directoryView, DEFAULT_SORT,
} from '../lib/directory.mjs';

const item = (id, name, tracks, block_height, extra = {}) => ({
  schema: 'nearhunt/project/1', id: `nearhackathon-2026:${id}`, name, description: null, tracks,
  repository_url: null, demo_url: null, external_campaigns: [],
  source: { event: 'nearhackathon-2026', submission_id: id, url: 'https://nearhackathon.com/#submissions' },
  updated_at: '2026-11-08T07:15:21.835Z', submission_id: id, key: `project/${id}`, account: 'nearhunt.near',
  block_height, block_timestamp: null, ...extra,
});

const FEED = [
  item('a', 'Veto', ['security', 'agents'], 100),
  item('b', 'Café Swap', ['defi'], 300),
  item('c', 'SpendGuard   AI', ['security'], 200),
  item('d', 'Alpha', ['defi', 'security'], 300),
];

test('normalizeText lowercases, strips diacritics and collapses whitespace', () => {
  assert.equal(normalizeText('  Café   Bär\tÑ '), 'cafe bar n');
  assert.equal(normalizeText(null), '');
});

test('searchItems matches names case-, accent- and whitespace-insensitively', () => {
  assert.deepEqual(searchItems(FEED, 'cafe').map((i) => i.submission_id), ['b']);
  assert.deepEqual(searchItems(FEED, 'CAFÉ s').map((i) => i.submission_id), ['b']);
  assert.deepEqual(searchItems(FEED, 'guard ai').map((i) => i.submission_id), ['c']);
  assert.deepEqual(searchItems(FEED, '  ').length, 4);
  assert.deepEqual(searchItems(FEED, 'zzzz'), []);
});

test('searchItems ignores descriptions (names only)', () => {
  const feed = [item('x', 'Plain', ['open'], 1, { description: 'zebra' })];
  assert.deepEqual(searchItems(feed, 'zebra'), []);
});

test('filterByTrack is single-select; null means all', () => {
  assert.deepEqual(filterByTrack(FEED, 'defi').map((i) => i.submission_id), ['b', 'd']);
  assert.equal(filterByTrack(FEED, null).length, 4);
});

test('newest: highest block_height first, ties by name', () => {
  assert.deepEqual(sortItems(FEED, 'newest').map((i) => i.submission_id), ['d', 'b', 'c', 'a']);
});

test('upvoted: by vote count, ties broken by newest; missing votes count as 0', () => {
  assert.deepEqual(sortItems(FEED, 'upvoted', { a: 5, c: 5 }).map((i) => i.submission_id), ['c', 'a', 'd', 'b']);
  // With no votes (today) it is exactly the newest order.
  assert.deepEqual(sortItems(FEED, 'upvoted', {}).map((i) => i.submission_id), sortItems(FEED, 'newest').map((i) => i.submission_id));
});

test('sortItems does not mutate its input', () => {
  const copy = FEED.slice();
  sortItems(FEED, 'newest');
  assert.deepEqual(FEED, copy);
});

test('parseParams applies defaults and rejects unknown values', () => {
  assert.deepEqual(parseParams({}), { q: '', track: null, sort: DEFAULT_SORT });
  assert.equal(DEFAULT_SORT, 'newest');
  assert.deepEqual(parseParams({ q: '  a   b ', track: 'defi', sort: 'upvoted' }, ['defi']), { q: 'a b', track: 'defi', sort: 'upvoted' });
  assert.deepEqual(parseParams({ track: 'nope', sort: 'loudest' }, ['defi']), { q: '', track: null, sort: 'newest' });
  assert.deepEqual(parseParams({ q: ['x', 'y'], track: 'all' }), { q: 'x', track: null, sort: 'newest' });
});

test('trackChips: counts follow the search, order follows the feed, active kept', () => {
  const searched = searchItems(FEED, 'a'); // Café Swap, SpendGuard AI, Alpha
  assert.deepEqual(searched.map((i) => i.submission_id), ['b', 'c', 'd']);
  const chips = trackChips(FEED, searched, 'agents');
  assert.deepEqual(chips, [
    { track: null, count: 3, active: false },
    { track: 'security', count: 2, active: false },
    { track: 'defi', count: 2, active: false },
    { track: 'agents', count: 0, active: true },
  ]);
  assert.equal(trackChips(FEED, FEED, null)[0].active, true);
});

test('buildHref omits defaults and applies overrides', () => {
  const s = { q: 'veto', track: 'defi', sort: 'newest' };
  assert.equal(buildHref(s), '/?q=veto&track=defi');
  assert.equal(buildHref(s, { sort: 'upvoted' }), '/?q=veto&track=defi&sort=upvoted');
  assert.equal(buildHref(s, { q: '' , track: null }), '/');
  assert.equal(buildHref({ q: 'a b&c', track: null, sort: 'newest' }), '/?q=a+b%26c');
});

test('hostOf strips www and rejects non-http URLs', () => {
  assert.equal(hostOf('https://www.x.com/foo'), 'x.com');
  assert.equal(hostOf('http://demo.example.org'), 'demo.example.org');
  assert.equal(hostOf('javascript:alert(1)'), null);
  assert.equal(hostOf('not a url'), null);
  assert.equal(hostOf(null), null);
});

test('formatFetchedUtc renders HH:MM UTC', () => {
  assert.equal(formatFetchedUtc('2026-11-08T07:05:21.835Z'), '07:05 UTC');
  assert.equal(formatFetchedUtc('nonsense'), null);
});

test('directoryView combines search, track and sort', () => {
  const v = directoryView(FEED, { q: 'a', track: 'defi', sort: 'newest' });
  assert.deepEqual(v.state, { q: 'a', track: 'defi', sort: 'newest' });
  assert.equal(v.total, 4);
  assert.deepEqual(v.results.map((i) => i.submission_id), ['d', 'b']);
  assert.equal(v.chips[0].count, 3);
});
