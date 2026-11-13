import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError, CACHE, DEFAULT_LIMIT, MAX_LIMIT, apiHeaders, decodeCursor, discussionBody,
  encodeCursor, errorBody, notFound, paginate, parseLimit, parsePage, parseProjectsQuery,
  projectsBody, recordUrl, toProject, votesBody,
} from '../lib/api.mjs';
import { votesFor, votersFor } from '../lib/votes.mjs';

const item = (submission_id, name, block_height, extra = {}) => ({
  schema: 'nearhunt/project/1', id: `ev:${submission_id}`, source: { event: 'ev', submission_id, url: 'https://x' },
  name, description: null, tracks: ['open'], repository_url: null, demo_url: null, external_campaigns: [],
  updated_at: '2026-11-08T00:00:00Z', submission_id, key: `project/${submission_id}`, account: 'nearhunt.near',
  block_height, block_timestamp: block_height * 1e9, ...extra,
});

const ITEMS = [
  item('a', 'Alpha', 100, { tracks: ['defi'], description: 'A lending market' }),
  item('b', 'Bravo', 300, { tracks: ['agents', 'defi'] }),
  item('c', 'Charlie', 200, { tracks: ['agents'], description: 'Agent swarms for DeFi' }),
  item('d', 'Delta', 300, { tracks: ['games'] }),
];
const LIST = { items: ITEMS, fetched_at: '2026-11-08T10:00:00.000Z', read_failing: false, account: 'nearhunt.near' };
const VOTES = { counts: { a: 5, b: 1, c: 5, d: 0 }, available: true };
const q = (s) => parseProjectsQuery(new URLSearchParams(s));
const throwsCode = (fn, code, status) => assert.throws(fn, (e) => e instanceof ApiError && e.code === code && e.status === status);

test('projects envelope: items, next_cursor and meta, nothing else', () => {
  const body = projectsBody(LIST, VOTES, q(''));
  assert.deepEqual(Object.keys(body), ['items', 'next_cursor', 'meta']);
  assert.equal(body.next_cursor, null);
  assert.deepEqual(body.meta, {
    total: 4, fetched_at: LIST.fetched_at, stale: false, votes_available: true,
    votes_stale: false, votes_fetched_at: null,
    source: { account: 'nearhunt.near', prefix: 'project/', network: 'mainnet' },
  });
  const a = body.items.find((p) => p.submission_id === 'a');
  assert.equal(a.votes, 5);
  assert.equal(a.url, 'https://nearhunt.xyz/p/a');
  assert.equal(a.key, 'project/a');
  assert.equal(a.block_height, 100);
  assert.equal('record_url' in a, false);
});

test('meta.stale follows read_failing', () => {
  assert.equal(projectsBody({ ...LIST, read_failing: true }, VOTES, q('')).meta.stale, true);
});

test('votes are null, not 0, when the vote read failed', () => {
  const body = projectsBody(LIST, { counts: {}, available: false }, q(''));
  assert.equal(body.meta.votes_available, false);
  assert.ok(body.items.every((p) => p.votes === null));
  assert.equal(toProject(ITEMS[0], null).votes, null);
});

test('limit: default 50, bounds 1..100, garbage is bad_request', () => {
  assert.equal(parseLimit(null), DEFAULT_LIMIT);
  assert.equal(parseLimit(''), DEFAULT_LIMIT);
  assert.equal(parseLimit('1'), 1);
  assert.equal(parseLimit(String(MAX_LIMIT)), 100);
  for (const bad of ['0', '101', '-1', '1.5', 'abc', ' 5', '1e2', '99999']) throwsCode(() => parseLimit(bad), 'bad_request', 400);
});

test('cursor round-trips and pages through the list', () => {
  assert.equal(decodeCursor(encodeCursor(0)), 0);
  assert.equal(decodeCursor(encodeCursor(150)), 150);
  assert.equal(decodeCursor(null), 0);

  const p1 = projectsBody(LIST, VOTES, q('limit=2'));
  assert.deepEqual(p1.items.map((p) => p.submission_id), ['b', 'd']);
  assert.equal(typeof p1.next_cursor, 'string');
  assert.match(p1.next_cursor, /^[A-Za-z0-9_-]+$/);
  const p2 = projectsBody(LIST, VOTES, q(`limit=2&cursor=${p1.next_cursor}`));
  assert.deepEqual(p2.items.map((p) => p.submission_id), ['c', 'a']);
  assert.equal(p2.next_cursor, null);
  assert.equal(p2.meta.total, 4);
});

test('past the end is an empty page, not an error', () => {
  assert.deepEqual(paginate([1, 2], 5, 10), { items: [], next_cursor: null });
});

test('bad cursors are bad_request', () => {
  const bads = ['!!', 'not base64', Buffer.from('o:-1').toString('base64url'), Buffer.from('o:01').toString('base64url'),
    Buffer.from('x:5').toString('base64url'), Buffer.from('o:99999999').toString('base64url'), 'bzo1=', 'a'.repeat(3000)];
  for (const bad of bads) throwsCode(() => decodeCursor(bad), 'bad_request', 400);
  throwsCode(() => q('cursor=%%%'), 'bad_request', 400);
  // Discussion pages by list offset now (NH-44); an `s:` payload is not a list cursor.
  throwsCode(() => decodeCursor(Buffer.from('s:abc').toString('base64url')), 'bad_request', 400);
});

test('sort: newest (default), votes, name; unknown is bad_request', () => {
  const ids = (s) => projectsBody(LIST, VOTES, q(s)).items.map((p) => p.submission_id);
  assert.deepEqual(ids(''), ['b', 'd', 'c', 'a']); // height desc, then name
  assert.deepEqual(ids('sort=newest'), ['b', 'd', 'c', 'a']);
  assert.deepEqual(ids('sort=votes'), ['c', 'a', 'b', 'd']); // 5,5 (newer first), 1, 0
  assert.deepEqual(ids('sort=name'), ['a', 'b', 'c', 'd']);
  throwsCode(() => q('sort=loudest'), 'bad_request', 400);
  // NH-118: the directory's own names are accepted and mean the same thing.
  assert.equal(q('sort=upvoted').sort, 'votes');
  assert.equal(q('sort=discussed').sort, 'comments');
  assert.deepEqual(ids('sort=upvoted'), ids('sort=votes'));
  // Votes unavailable: sort=votes degrades to newest, with votes null.
  assert.deepEqual(projectsBody(LIST, { counts: {}, available: false }, q('sort=votes')).items.map((p) => p.submission_id),
    ['b', 'd', 'c', 'a']);
});

test('track is an exact slug; q matches name and description case-insensitively', () => {
  const ids = (s) => projectsBody(LIST, VOTES, q(s)).items.map((p) => p.submission_id);
  assert.deepEqual(ids('track=agents'), ['b', 'c']);
  assert.deepEqual(ids('track=agent'), []);
  assert.deepEqual(ids('q=BRAV'), ['b']);
  assert.deepEqual(ids('q=defi'), ['c']); // description only
  assert.deepEqual(ids('q=lending'), ['a']);
  assert.deepEqual(ids('track=defi&q=swarms'), []);
  assert.equal(projectsBody(LIST, VOTES, q('track=agents')).meta.total, 2);
});

test('single project: summary plus record_url', () => {
  const p = toProject(ITEMS[1], 3);
  assert.equal(p.votes, 3);
  assert.equal(p.url, 'https://nearhunt.xyz/p/b');
  assert.equal(p.record_url, 'https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/b');
  assert.equal(recordUrl('a b'), 'https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/a%20b');
});

test('404 and other errors have the {error, message} shape', () => {
  const e = notFound('No live project record with id "zzz".');
  assert.equal(e.status, 404);
  assert.deepEqual(errorBody(e.code, e.message), { error: 'not_found', message: 'No live project record with id "zzz".' });
  assert.deepEqual(Object.keys(errorBody('bad_request', 'x')), ['error', 'message']);
});

test('headers: CORS * and the route cache', () => {
  const h = apiHeaders(CACHE.projects);
  assert.equal(h['access-control-allow-origin'], '*');
  assert.match(h['cache-control'], /^public, s-maxage=\d+, stale-while-revalidate=\d+$/);
  assert.match(CACHE.votes, /^public, s-maxage=\d+, stale-while-revalidate=\d+$/);
  assert.match(CACHE.discussion, /^public, s-maxage=\d+, stale-while-revalidate=\d+$/);
});

const vote = (voter, id, block_height, value = {}) => ({
  predecessor_id: voter, current_account_id: 'nearhunt.near', block_height, block_timestamp: block_height * 1e9,
  key: `vote/${id}`, value,
});

test('votesFor: heights, latest first, voter = predecessor_id; votersFor unchanged', () => {
  const rows = [
    vote('bob.near', 'x', 10), vote('alice.near', 'x', 30), vote('carol.near', 'x', 30),
    vote('dave.near', 'x', 40, null), vote('erin.near', 'y', 50),
    vote('bob.near', 'x', 5, null), // older withdrawal: the 10 write wins
    { ...vote('mallory.near', 'x', 60), value: { voter: 'someone.else' } },
  ];
  assert.deepEqual(votesFor(rows, 'x'), [
    { account_id: 'mallory.near', block_height: 60 },
    { account_id: 'alice.near', block_height: 30 },
    { account_id: 'carol.near', block_height: 30 },
    { account_id: 'bob.near', block_height: 10 },
  ]);
  assert.deepEqual(votersFor(rows, 'x'), ['mallory.near', 'alice.near', 'carol.near', 'bob.near']);
});

test('votes body: envelope, ordering, paging and meta', () => {
  const voters = [
    { account_id: 'b.near', block_height: 10 }, { account_id: 'a.near', block_height: 30 }, { account_id: 'c.near', block_height: 20 },
  ];
  const src = { account: 'nearhunt.near', network: 'mainnet' };
  const p1 = votesBody(voters, src, parsePage(new URLSearchParams('limit=2')));
  assert.deepEqual(Object.keys(p1), ['items', 'next_cursor', 'meta']);
  assert.deepEqual(p1.items, [{ account_id: 'a.near', block_height: 30 }, { account_id: 'c.near', block_height: 20 }]);
  assert.deepEqual(p1.meta, { total: 3, stale: false, fetched_at: null, source: { account: 'nearhunt.near', prefix: 'vote/', network: 'mainnet' } });
  const p2 = votesBody(voters, src, parsePage(new URLSearchParams(`limit=2&cursor=${p1.next_cursor}`)));
  assert.deepEqual(p2.items, [{ account_id: 'b.near', block_height: 10 }]);
  assert.equal(p2.next_cursor, null);
});

test('discussion body: flat comments with reply_to, offset paging and comment meta', () => {
  const src = { account: 'nearhunt.near', network: 'mainnet' };
  const c = (id, author, extra = {}) => ({
    key: `comment/p1/${id}`, id, ref: `${author}/${id}`, project_id: 'p1', author,
    text: `comment ${id}`, truncated: false, created_at: Number(id), block_height: 100,
    reply_to: null, url: `https://nearhunt.xyz/p/p1#c-${author}-${id}`, ...extra,
  });
  assert.deepEqual(discussionBody([], src, parsePage(new URLSearchParams(''))), {
    items: [],
    next_cursor: null,
    meta: {
      total: 0,
      stale: false,
      fetched_at: null,
      source: { account: 'nearhunt.near', prefix: 'comment/', network: 'mainnet' },
      policy_url: 'https://nearhunt.xyz/comment-policy',
    },
  });
  const comments = [c('10', 'a.near'), c('11', 'b.near', { reply_to: 'a.near/10' }), c('12', 'c.near')];
  const p1 = discussionBody(comments, src, parsePage(new URLSearchParams('limit=2')));
  assert.deepEqual(p1.items.map((x) => x.id), ['10', '11']);
  assert.equal(p1.items[1].reply_to, 'a.near/10');
  assert.equal(p1.meta.total, 3);
  const p2 = discussionBody(comments, src, parsePage(new URLSearchParams(`limit=2&cursor=${p1.next_cursor}`)));
  assert.deepEqual(p2.items.map((x) => x.id), ['12']);
  assert.equal(p2.next_cursor, null);
});

test('fetchThread passes a near.social cursor through to /replies', async () => {
  const { fetchThread } = await import('../lib/discussion.mjs');
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => (String(url).includes('/replies') ? { items: [], next_cursor: null } : { post: null }) };
  };
  const r = await fetchThread('nearhunt.near/1794122153750', { cursor: 'UP CUR', limit: 7, fetchImpl });
  assert.equal(r.status, 'ok');
  const replies = urls.find((u) => u.includes('/replies'));
  assert.match(replies, /limit=7/);
  assert.match(replies, /cursor=UP\+CUR/);
});

// NH-118: comment counts on the list, and sort=comments.
test('comments: counts on each item, sort=comments, and the read-failed case', () => {
  const COMMENTS = { counts: { d: 3, a: 1 }, available: true };
  const body = projectsBody(LIST, VOTES, q('sort=comments'), COMMENTS);
  assert.deepEqual(body.items.map((p) => p.submission_id), ['d', 'a', 'b', 'c']); // 3, 1, then newest
  assert.deepEqual(body.items.map((p) => p.comments), [3, 1, 0, 0]);
  assert.equal(body.meta.comments_available, true);
  assert.deepEqual(projectsBody(LIST, VOTES, q('sort=discussed'), COMMENTS).items, body.items);

  // Comment read failed: null counts, the flag is false, and the order is newest.
  const failed = projectsBody(LIST, VOTES, q('sort=comments'), { counts: {}, available: false });
  assert.deepEqual(failed.items.map((p) => p.comments), [null, null, null, null]);
  assert.equal(failed.meta.comments_available, false);
  assert.deepEqual(failed.items.map((p) => p.submission_id), ['b', 'd', 'c', 'a']);

  // A caller that passes no comment counts gets the body as it was before.
  const plain = projectsBody(LIST, VOTES, q(''));
  assert.equal('comments' in plain.items[0], false);
  assert.equal('comments_available' in plain.meta, false);
});

// A saved copy is never presented as current: the API says so too, not only the pages.
test('saved copies are flagged in every meta, with the time they were read', () => {
  const AT = '2026-11-13T03:00:00.000Z';
  const body = projectsBody(
    LIST,
    { ...VOTES, stale: true, fetched_at: AT },
    q(''),
    { counts: { a: 1 }, available: true, stale: true, fetched_at: AT },
  );
  assert.equal(body.meta.votes_stale, true);
  assert.equal(body.meta.votes_fetched_at, AT);
  assert.equal(body.meta.comments_stale, true);
  assert.equal(body.meta.comments_fetched_at, AT);

  // A failed read is "unavailable", not "stale": there is no copy to date.
  const failed = projectsBody(LIST, { counts: {}, available: false, stale: true, fetched_at: AT }, q(''));
  assert.equal(failed.meta.votes_stale, false);
  assert.equal(failed.meta.votes_fetched_at, null);

  const src = { account: 'nearhunt.near', network: 'mainnet', stale: true, fetched_at: AT };
  const page = parsePage(new URLSearchParams(''));
  assert.deepEqual([votesBody([], src, page).meta.stale, votesBody([], src, page).meta.fetched_at], [true, AT]);
  assert.deepEqual([discussionBody([], src, page).meta.stale, discussionBody([], src, page).meta.fetched_at], [true, AT]);
});
