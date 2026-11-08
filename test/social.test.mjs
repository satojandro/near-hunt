import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseHashtagFeed, plainExcerpt, relativeTime, postUrl, hashtagUrl, hashtagFeedUrl,
  isAccountId, fetchHashtagFeed,
} from '../lib/social.mjs';

// Shaped like `GET https://api2.near.social/v1/hashtags/near?limit=40` as returned on 2026-11-08.
// The first two items are real (text shortened); the rest are crafted edge cases.
const IMPLICIT = 'cf847e7565b443ea0535ac21e14f042875d1be3d18b886077227d6f520d450a2';
const post = (over = {}) => ({
  key: 'yawrd.near/1793887202438', id: '1793887202438',
  author: {
    account_id: 'yawrd.near', name: 'YAWRD',
    avatar_url: 'https://main.fastfs.io/yawrd.near/social/media/39366d2ff65d9fe4b68d92a644d9859a8108fae19fbaa7bea1851f1710973b89.webp',
  },
  text: "🚢 Yawrd Is Live. Can Someone Join?\n\nEpisode 02 of our Building in Public series is here!\n\n#Yawrd #BuildInPublic #NEAR",
  media: [], created_at: 1793887203423, block_height: 223175412, edited_at: 1793887230884,
  reply_to: null, root: null, quote: null, mentions: [], hashtags: ['yawrd', 'buildinpublic', 'near'],
  counts: { replies: 1, reposts: 1, likes: 2, quotes: 0 }, link: null,
  ...over,
});
const item = (p, over = {}) => ({ type: 'post', post: p, reposted_by: null, reposted_at: null, cursor: '1', ...over });

const FIXTURE = {
  items: [
    item(post()),
    item(post({
      key: `${IMPLICIT}/1791919084772`, id: '1791919084772',
      author: { account_id: IMPLICIT, name: 'Rock Lover', avatar_url: null },
      text: 'Rock **on** with [NEAR docs](https://docs.near.org) ![img](https://x/y.png)', created_at: 1791919086161,
    })),
    // a repost of the first post: same key, must not appear twice
    item(post(), { type: 'repost', reposted_by: 'alice.near', reposted_at: 1793887300000 }),
    // malformed: bad account id, missing id, bad created_at, empty text, no post
    item(post({ key: 'x', id: '1', author: { account_id: 'Not An Account!' } })),
    item(post({ key: 'bob.near/', id: undefined, author: { account_id: 'bob.near' } })),
    item(post({ key: 'bob.near/2', id: '2', author: { account_id: 'bob.near' }, created_at: 'soon' })),
    item(post({ key: 'bob.near/3', id: '3', author: { account_id: 'bob.near' }, text: '   ' })),
    { type: 'post' },
    null,
    // unsafe content and an http avatar
    item(post({
      key: 'eve.near/4', id: '4', created_at: 1793000000000,
      author: { account_id: 'eve.near', name: 'Eve‮​', avatar_url: 'http://insecure.example/a.png' },
      text: '<script>alert(1)</script><b>hi</b> &amp; welcome',
    })),
  ],
  next_cursor: '232608784973824',
};

test('normaliseHashtagFeed keeps valid posts, drops malformed and repost duplicates', () => {
  const { items, next_cursor } = normaliseHashtagFeed(FIXTURE, { limit: 10 });
  assert.deepEqual(items.map((p) => p.key), ['yawrd.near/1793887202438', `${IMPLICIT}/1791919084772`, 'eve.near/4']);
  assert.equal(next_cursor, '232608784973824');
  const [first, second, third] = items;
  assert.equal(first.url, 'https://near.social/yawrd.near/post/1793887202438');
  assert.equal(first.author.name, 'YAWRD');
  assert.match(first.author.avatar_url, /^https:\/\/main\.fastfs\.io\//);
  assert.equal(first.created_at, 1793887203423);
  assert.equal(first.block_height, 223175412);
  assert.equal(first.excerpt, '🚢 Yawrd Is Live. Can Someone Join? Episode 02 of our Building in Public series is here! #Yawrd #BuildInPublic #NEAR');
  assert.equal(second.author.avatar_url, null);
  assert.equal(second.excerpt, 'Rock on with NEAR docs');
  assert.equal(third.author.avatar_url, null, 'http avatar dropped');
  assert.equal(third.author.name, 'Eve', 'bidi and zero-width characters removed');
  assert.ok(!/[<>]/.test(third.excerpt), third.excerpt);
});

test('normaliseHashtagFeed respects the limit and accepts the empty #nearhunt response', () => {
  assert.equal(normaliseHashtagFeed(FIXTURE, { limit: 1 }).items.length, 1);
  assert.deepEqual(normaliseHashtagFeed({ items: [], next_cursor: null }), { items: [], next_cursor: null });
});

test('normaliseHashtagFeed throws on a wrong envelope', () => {
  for (const bad of [null, 'x', [], {}, { items: 'no' }]) {
    assert.throws(() => normaliseHashtagFeed(bad), TypeError);
  }
});

test('plainExcerpt strips markdown and html, keeps hashtags, truncates on a word', () => {
  assert.equal(plainExcerpt('# Title\n\n> quote\n- one\n- two\n`code` and _it_ **b**'), 'Title quote one two code and it b');
  assert.equal(plainExcerpt('```js\nconst x = 1\n```\nafter'), 'after');
  assert.equal(plainExcerpt('#nearhunt is live'), '#nearhunt is live');
  assert.equal(plainExcerpt(null), '');
  const long = 'word '.repeat(100);
  const out = plainExcerpt(long, 40);
  assert.ok(out.length <= 41 && out.endsWith('…'), out);
  assert.ok(!out.includes('wor…'), 'cut on a word boundary');
  const emoji = '😀'.repeat(50);
  assert.equal(Array.from(plainExcerpt(emoji, 10)).length, 11, 'no split surrogate pairs');
});

test('relativeTime', () => {
  const now = Date.UTC(2026, 10, 8, 12, 0, 0);
  assert.equal(relativeTime(now - 10_000, now), 'just now');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5m ago');
  assert.equal(relativeTime(now - 3 * 3_600_000, now), '3h ago');
  assert.equal(relativeTime(now - 2 * 86_400_000, now), '2d ago');
  assert.equal(relativeTime(Date.UTC(2026, 9, 1), now), '1 Oct');
  assert.equal(relativeTime(Date.UTC(2025, 9, 1), now), '1 Oct 2025');
  assert.equal(relativeTime(now + 60_000, now), 'just now', 'clock skew');
});

test('urls and account ids', () => {
  assert.equal(postUrl('alice.near', '123'), 'https://near.social/alice.near/post/123');
  assert.equal(hashtagUrl('nearhunt'), 'https://near.social/hashtag/nearhunt');
  assert.equal(hashtagFeedUrl('nearhunt', { limit: 5 }), 'https://api2.near.social/v1/hashtags/nearhunt?limit=5');
  assert.ok(isAccountId(IMPLICIT));
  assert.ok(isAccountId('congos.tg'));
  assert.ok(!isAccountId('../etc'));
  assert.ok(!isAccountId('A.near'));
});

const fakeFetch = (impl) => async (url, init) => impl(url, init);
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('fetchHashtagFeed: ok, passes cache + timeout options', async () => {
  let seen;
  const r = await fetchHashtagFeed({
    hashtag: '#NearHunt',
    fetchImpl: fakeFetch((url, init) => { seen = { url, init }; return jsonResponse(FIXTURE); }),
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.hashtag, 'nearhunt');
  assert.equal(r.items.length, 3);
  assert.equal(seen.url, 'https://api2.near.social/v1/hashtags/nearhunt?limit=10');
  assert.deepEqual(seen.init.next, { revalidate: 60 });
  assert.ok(seen.init.signal instanceof AbortSignal);
});

test('fetchHashtagFeed never throws: HTTP error, bad json shape, network error, timeout, bad tag', async () => {
  assert.deepEqual(
    await fetchHashtagFeed({ fetchImpl: fakeFetch(() => jsonResponse({}, 503)) }),
    { status: 'error', reason: 'HTTP 503', hashtag: 'nearhunt' },
  );
  assert.equal((await fetchHashtagFeed({ fetchImpl: fakeFetch(() => jsonResponse({ nope: 1 })) })).status, 'error');
  assert.equal((await fetchHashtagFeed({ fetchImpl: fakeFetch(() => { throw new TypeError('fetch failed'); }) })).reason, 'fetch failed');
  // A server that never answers. The keep-alive timer stands in for the open socket
  // (AbortSignal.timeout's own timer does not hold the event loop open).
  const slow = fakeFetch((url, init) => new Promise((_, reject) => {
    const keepAlive = setTimeout(() => {}, 5000);
    init.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(init.signal.reason); });
  }));
  assert.deepEqual(await fetchHashtagFeed({ fetchImpl: slow, timeoutMs: 20 }), { status: 'error', reason: 'timeout', hashtag: 'nearhunt' });
  assert.equal((await fetchHashtagFeed({ hashtag: 'a/b', fetchImpl: () => assert.fail('no fetch') })).reason, 'invalid hashtag');
});
