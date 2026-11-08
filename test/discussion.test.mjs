import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parsePostRef, isPostId, postApiUrl, repliesApiUrl, txApiUrl, threadUrl, displayText,
  normalisePost, normaliseReplies, fetchThread, fetchReplyCounts, SOCIAL_API,
} from '../lib/discussion.mjs';

// Recorded from api2.near.social on 8 Nov 2026 (see test/fixtures/discussion/):
//   GET /v1/posts/yawrd.near/1793501920777           -> post-yawrd.near-1793501920777.json
//   GET /v1/posts/yawrd.near/1793501920777/replies   -> replies-yawrd.near-1793501920777.json
//   GET /v1/posts/inzuria.near/1793818815123/replies -> replies-empty.json (a post with 0 replies)
//   GET /v1/posts/yawrd.near/1/replies               -> replies-404.json (HTTP 404)
//   POST /v1/posts/batch {keys:[yawrd.near/1793501920777, yawrd.near/1, inzuria.near/1793818815123]}
const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/discussion/${name}`, import.meta.url), 'utf8'));
const POST = fx('post-yawrd.near-1793501920777.json');
const REPLIES = fx('replies-yawrd.near-1793501920777.json');
const EMPTY = fx('replies-empty.json');
const NOT_FOUND = fx('replies-404.json');
const BATCH = fx('posts-batch.json');
const ROOT = 'yawrd.near/1793501920777';

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('parsePostRef accepts {account}/{post_id} and rejects everything else', () => {
  assert.deepEqual(parsePostRef('nearhunt.near/1794122153750'), {
    account_id: 'nearhunt.near', post_id: '1794122153750', key: 'nearhunt.near/1794122153750',
  });
  const implicit = 'a49635eb54df0a248578ffc31a36562ae05b73cc5e13fdfe681b6766eb514672';
  assert.equal(parsePostRef(`${implicit}/1794072058887`)?.account_id, implicit);
  for (const bad of [
    '', 'nearhunt.near', 'nearhunt.near/', '/123', 'nearhunt.near/0123', 'nearhunt.near/0',
    'nearhunt.near/12a', 'NearHunt.near/1', 'nearhunt.near/9007199254740992', 'a/b/1', null, 42, {},
  ]) {
    assert.equal(parsePostRef(bad), null, String(bad));
  }
  assert.ok(isPostId('9007199254740991'));
  assert.ok(!isPostId('9007199254740992'));
});

test('api and web urls', () => {
  assert.equal(postApiUrl(ROOT), `${SOCIAL_API}/v1/posts/yawrd.near/1793501920777`);
  assert.equal(repliesApiUrl(ROOT, { limit: 10 }), `${SOCIAL_API}/v1/posts/yawrd.near/1793501920777/replies?limit=10`);
  assert.equal(repliesApiUrl(ROOT, { cursor: 'abc' }), `${SOCIAL_API}/v1/posts/yawrd.near/1793501920777/replies?limit=50&cursor=abc`);
  assert.equal(threadUrl(ROOT), 'https://near.social/yawrd.near/post/1793501920777');
  assert.throws(() => postApiUrl('not a ref'), TypeError);
  assert.equal(txApiUrl('8rX5McjBeiitsRAhQsY7sqWbTQ9nXXHBDYwCJyQuGhfk'), `${SOCIAL_API}/v1/tx/8rX5McjBeiitsRAhQsY7sqWbTQ9nXXHBDYwCJyQuGhfk`);
  assert.throws(() => txApiUrl('../../v1/status'), TypeError);
});

test('normaliseReplies on the recorded response', () => {
  const { items, next_cursor } = normaliseReplies(REPLIES, { parentKey: ROOT });
  assert.equal(next_cursor, null);
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.equal(a.key, 'vandal.near/1793512990355');
  assert.equal(a.author.account_id, 'vandal.near');
  assert.equal(a.author.name, 'Rare Vandal');
  assert.match(a.author.avatar_url, /^https:\/\/main\.fastfs\.io\/vandal\.near\//);
  assert.equal(a.text, "Let's go!!!");
  assert.equal(a.created_at, 1793512991688);
  assert.equal(a.reply_to, ROOT);
  assert.equal(a.root, ROOT);
  assert.equal(a.url, 'https://near.social/vandal.near/post/1793512990355');
  assert.deepEqual(a.counts, { replies: 0, likes: 1, reposts: 0, quotes: 0 });
  assert.equal(b.author.account_id, 'bebekxbt.near');
  assert.deepEqual(normaliseReplies(EMPTY), { items: [], next_cursor: null });
});

test('normaliseReplies drops malformed, duplicate, repost and off-thread items', () => {
  const good = REPLIES.items[0];
  const json = {
    items: [
      good,
      good, // duplicate
      { ...good, type: 'repost' },
      { ...good, post: { ...good.post, author: { account_id: 'Not Valid' } } },
      { ...good, post: { ...good.post, id: '0123', key: 'vandal.near/0123' } },
      { ...good, post: { ...good.post, key: 'mallory.near/1793512990355' } }, // key/author mismatch
      { ...good, post: { ...good.post, id: '5', key: 'vandal.near/5', text: '   ' } }, // empty post
      { ...good, post: { ...good.post, id: '6', key: 'vandal.near/6', reply_to: { key: 'x.near/1' } } },
      null,
    ],
    next_cursor: 'c2',
  };
  const { items, next_cursor } = normaliseReplies(json, { parentKey: ROOT });
  assert.deepEqual(items.map((p) => p.key), ['vandal.near/1793512990355']);
  assert.equal(next_cursor, 'c2');
  assert.throws(() => normaliseReplies(NOT_FOUND), TypeError);
  assert.throws(() => normaliseReplies(null), TypeError);
});

test('post text stays plain text: controls and bidi overrides removed, newlines kept, cut long', () => {
  const p = normalisePost({
    ...REPLIES.items[0].post,
    text: 'line one\r\n\n\n\n<b>two</b>‮evil\u0007',
    author: { account_id: 'vandal.near', name: ' Rare​  Vandal ', avatar_url: 'http://insecure/x.png' },
  });
  assert.equal(p.text, 'line one\n\n<b>two</b>evil');
  assert.equal(p.author.name, 'Rare Vandal');
  assert.equal(p.author.avatar_url, null);
  const long = displayText('x'.repeat(5000), 100);
  assert.equal(long.truncated, true);
  assert.equal(Array.from(long.text).length, 101);
  const emoji = displayText('😀'.repeat(10), 5);
  assert.equal(emoji.text, '😀😀😀😀😀…');
});

test('normalisePost reads the recorded root post and its reply count', () => {
  const p = normalisePost(POST.post);
  assert.equal(p.key, ROOT);
  assert.equal(p.counts.replies, 2);
  assert.equal(p.media_count, 1);
  assert.equal(p.reply_to, null);
  assert.equal(p.root, null);
});

test('fetchThread: ok, empty, not found, error, timeout — never throws', async () => {
  const calls = [];
  const fetchOk = async (url, init) => {
    calls.push({ url, init });
    return url.includes('/replies') ? res(200, REPLIES) : res(200, POST);
  };
  const ok = await fetchThread(ROOT, { fetchImpl: fetchOk });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.replies.length, 2);
  assert.equal(ok.reply_count, 2);
  assert.equal(ok.root.key, ROOT);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.next.revalidate, 30);

  const empty = await fetchThread('inzuria.near/1793818815123', {
    fetchImpl: async (url) => (url.includes('/replies') ? res(200, EMPTY) : res(200, { post: { ...POST.post, key: 'inzuria.near/1793818815123', id: '1793818815123', author: { account_id: 'inzuria.near' }, counts: { replies: 0 } } })),
  });
  assert.equal(empty.status, 'ok');
  assert.equal(empty.replies.length, 0);
  assert.equal(empty.reply_count, 0);

  const nf = await fetchThread('yawrd.near/1', { fetchImpl: async () => res(404, NOT_FOUND) });
  assert.deepEqual(nf, { status: 'not_found' });

  const err = await fetchThread(ROOT, { fetchImpl: async () => res(502, {}) });
  assert.deepEqual(err, { status: 'error', reason: 'HTTP 502' });

  const down = await fetchThread(ROOT, { fetchImpl: async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); } });
  assert.deepEqual(down, { status: 'error', reason: 'timeout' });

  // The root read failing does not hide the replies.
  const partial = await fetchThread(ROOT, { fetchImpl: async (url) => (url.includes('/replies') ? res(200, REPLIES) : res(500, {})) });
  assert.equal(partial.status, 'ok');
  assert.equal(partial.root, null);
  assert.equal(partial.reply_count, 2);

  assert.deepEqual(await fetchThread(null), { status: 'invalid' });
  assert.deepEqual(await fetchThread('garbage'), { status: 'invalid' });
});

test('fetchReplyCounts asks only about projects with a social_post, in one batch', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return res(200, BATCH);
  };
  const items = [
    { submission_id: 'a', social_post: 'yawrd.near/1793501920777' },
    { submission_id: 'b', social_post: 'yawrd.near/1' }, // unknown to the api -> absent
    { submission_id: 'c', social_post: 'inzuria.near/1793818815123' },
    { submission_id: 'd' },
    { submission_id: 'e', social_post: null },
    { submission_id: 'f', social_post: 'not a ref' },
  ];
  const out = await fetchReplyCounts(items, { fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${SOCIAL_API}/v1/posts/batch`);
  assert.deepEqual(calls[0].body.keys, ['yawrd.near/1793501920777', 'yawrd.near/1', 'inzuria.near/1793818815123']);
  assert.deepEqual(out, { counts: { a: 2, c: 0 }, available: true, asked: 3 });
});

test('fetchReplyCounts: no posts means no request; failures mean unavailable', async () => {
  let called = 0;
  const none = await fetchReplyCounts([{ submission_id: 'x' }], { fetchImpl: async () => { called += 1; return res(200, BATCH); } });
  assert.equal(called, 0);
  assert.deepEqual(none, { counts: {}, available: true, asked: 0 });

  const down = await fetchReplyCounts([{ submission_id: 'a', social_post: ROOT }], { fetchImpl: async () => res(503, {}) });
  assert.deepEqual(down, { counts: {}, available: false, asked: 1 });
});

test('fetchReplyCounts splits into batches of 100 with bounded concurrency', async () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ submission_id: `p${i}`, social_post: `nearhunt.near/${1000 + i}` }));
  let inFlight = 0;
  let peak = 0;
  const sizes = [];
  const fetchImpl = async (_url, init) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    const { keys } = JSON.parse(init.body);
    sizes.push(keys.length);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return res(200, { items: keys.map((k) => ({ key: k, id: k.split('/')[1], author: { account_id: 'nearhunt.near' }, counts: { replies: 1 } })) });
  };
  const out = await fetchReplyCounts(items, { fetchImpl, concurrency: 2 });
  assert.deepEqual(sizes.sort((a, b) => b - a), [100, 100, 50]);
  assert.ok(peak <= 2);
  assert.equal(Object.keys(out.counts).length, 250);
});
