import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureThread,
  isXPostUrl,
  postFromPayload,
  resolveLinks,
  resolveTco,
  tcoUrlsFromText,
  noteFromPage,
  needsCapture,
  CAPTURE_VERSION,
} from '../scripts/capture-threads.mjs';

/**
 * A deleted or protected post answers 404 on the syndication endpoint. That used to throw out of
 * `captureThread` and abort the crawl half-way through the project list (see the run on
 * 12 Nov 2026, which died at 310/356 with `FAILED: status 404`). It is an outcome the proposal
 * already understands, not a crash.
 */
test('a 404 on the submitted post is post-unavailable, not a crash', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return new Response('not found', { status: 404 });
  };

  const result = await captureThread('1900000000000000000');
  assert.equal(result.status, 'post-unavailable');
  assert.deepEqual(result.posts, []);
  // One request, then it stops: no status page, no syndication calls for replies.
  assert.equal(asked.length, 1);
});

test('a network failure on the submitted post is post-unavailable too', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND cdn.syndication.twimg.com');
  };

  const result = await captureThread('1900000000000000001');
  assert.equal(result.status, 'post-unavailable');
});

// --- t.co recovery (12 Nov 2026) -------------------------------------------------------------
// The syndication endpoint stopped filling `entities.urls` for most posts (null on 17 of 23
// sampled), so a repository typed into the submitted post was invisible to enrichment. The link
// survives only as a `t.co` shortlink in the post text.

test('tcoUrlsFromText extracts shortlinks in order and de-duplicates them', () => {
  const text = 'Code: https://t.co/aaaa1111 and demo https://t.co/bbbb2222 again https://t.co/aaaa1111';
  assert.deepEqual(tcoUrlsFromText(text), ['https://t.co/aaaa1111', 'https://t.co/bbbb2222']);
  assert.deepEqual(tcoUrlsFromText(''), []);
  assert.deepEqual(tcoUrlsFromText(null), []);
});

test('resolveTco reads the Location header without following the redirect', async () => {
  const asked = [];
  const fetchImpl = async (url, opts) => {
    asked.push({ url, redirect: opts?.redirect });
    return new Response(null, { status: 301, headers: { location: 'https://github.com/acme/veto' } });
  };
  assert.equal(await resolveTco('https://t.co/x1', { fetchImpl }), 'https://github.com/acme/veto');
  assert.equal(asked[0].redirect, 'manual');
});

test('resolveTco normalises twitter.com to x.com and returns null when there is no Location', async () => {
  const media = async () => new Response(null, { status: 301, headers: { location: 'https://twitter.com/u/status/1/video/1' } });
  assert.equal(await resolveTco('https://t.co/x2', { fetchImpl: media }), 'https://x.com/u/status/1/video/1');

  const bare = async () => new Response(null, { status: 200 });
  assert.equal(await resolveTco('https://t.co/x3', { fetchImpl: bare }), null);

  const broken = async () => {
    throw new Error('ENOTFOUND t.co');
  };
  assert.equal(await resolveTco('https://t.co/x4', { fetchImpl: broken }), null);
});

test('resolveLinks unions entities.urls with resolved t.co and drops X-internal links', async () => {
  const fetchImpl = async (url) => {
    const map = {
      'https://t.co/repo01': 'https://github.com/acme/veto',
      'https://t.co/vid001': 'https://twitter.com/u/status/9/video/1',
    };
    return new Response(null, { status: 301, headers: { location: map[url] ?? '' } });
  };
  const payload = {
    text: 'Built at #NEARHackathon https://t.co/repo01 demo https://t.co/vid001',
    // This is the real shape: null, not an empty array.
    entities: { urls: null },
  };
  assert.deepEqual(await resolveLinks(payload, { fetchImpl }), ['https://github.com/acme/veto']);
});

test('resolveLinks keeps entities.urls when the payload still has them', async () => {
  const fetchImpl = async () => new Response(null, { status: 200 });
  const payload = {
    text: 'no shortlink here',
    entities: { urls: [{ expanded_url: 'https://veto.app' }] },
  };
  assert.deepEqual(await resolveLinks(payload, { fetchImpl }), ['https://veto.app']);
});

test('isXPostUrl matches x.com and twitter.com but not a project site', () => {
  assert.equal(isXPostUrl('https://x.com/u/status/1'), true);
  assert.equal(isXPostUrl('https://twitter.com/u/status/1'), true);
  assert.equal(isXPostUrl('https://github.com/acme/veto'), false);
  assert.equal(isXPostUrl('https://notx.com/u/status/1'), false);
});

test('postFromPayload merges resolved shortlinks into a reply post', () => {
  const post = postFromPayload(
    { id_str: '2', user: { screen_name: 'u' }, text: 'Code: https://t.co/abc', entities: { urls: null } },
    { extraLinks: ['https://github.com/acme/veto'] },
  );
  assert.deepEqual(post.links, ['https://github.com/acme/veto']);
});

test('the submitted post\'s own repository reaches the capture even when the reply crawl fails', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/tweet-result')) {
      return new Response(
        JSON.stringify({
          id_str: '1900000000000000002',
          user: { screen_name: 'builder' },
          text: 'Introducing Veto, built at NEAR HACKATHON. Code: https://t.co/repo01',
          entities: { urls: null },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.startsWith('https://t.co/')) {
      return new Response(null, { status: 301, headers: { location: 'https://github.com/acme/veto' } });
    }
    // The status page is unreachable: the reply crawl fails, the submitted post's links survive.
    throw new Error('getaddrinfo ENOTFOUND x.com');
  };

  const result = await captureThread('1900000000000000002');
  assert.match(result.status, /^page-failed:/);
  assert.deepEqual(result.posts, []);
  assert.deepEqual(result.links, ['https://github.com/acme/veto']);
});

test('a post whose only link is its own media records no links', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/tweet-result')) {
      return new Response(
        JSON.stringify({
          id_str: '1900000000000000003',
          user: { screen_name: 'builder' },
          text: 'Demo video https://t.co/vid001',
          entities: { urls: null },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.startsWith('https://t.co/')) {
      return new Response(null, { status: 301, headers: { location: 'https://twitter.com/builder/status/9/video/1' } });
    }
    throw new Error('offline');
  };

  const result = await captureThread('1900000000000000003');
  assert.deepEqual(result.links, []);
});

test('a long-form post keeps the links and body X only puts in the status page', () => {
  // Shape taken from @AvbNear's submission: the syndication payload carries a 280-char stub and
  // `note_tweet: {id}`; the real body and its entity set live in the page's embedded JSON.
  const html = `x<script>{"__typename":"NoteTweet","entity_set":{"hashtags":[{"text":"NEARhackathon"}],
    "urls":[{"display_url":"nearhunt.xyz","expanded_url":"http://nearhunt.xyz"},
            {"display_url":"github.com/satojandro/nea…","expanded_url":"https://github.com/satojandro/near-hunt"}]},
    "id":"Tm90ZVR3ZWV0OjE=","text":"I'm officially throwing my hat in the ring with NEAR Hunt.\\n\\nRepo: https://t.co/zs4DwaSJ8p"}</script>`;
  const note = noteFromPage(html);
  assert.deepEqual(note.urls.sort(), ['http://nearhunt.xyz', 'https://github.com/satojandro/near-hunt']);
  assert.match(note.text, /throwing my hat in the ring/);
  assert.ok(note.text.length > 'NEARhackathon'.length, 'the note body wins over a hashtag label');
});

test('a page with no NoteTweet yields nothing rather than a guess', () => {
  assert.deepEqual(noteFromPage('<html><body>a short post</body></html>'), { text: null, urls: [] });
  assert.deepEqual(noteFromPage(null), { text: null, urls: [] });
});

/**
 * A parsing fix must reach the captures already on file. `MAX_AGE_MS` reused a capture for 7 days,
 * so the long-form `NoteTweet` fix of 16 Nov 2026 could not see the records it was written for:
 * `Taply.` (`project/e0770ba5`) still had no repository on 17 Nov because its capture was dated
 * 12 Nov and was skipped as "captured recently".
 */
test('needsCapture re-reads a capture an older parser took, and keeps a current one', () => {
  const now = Date.parse('2026-11-17T10:00:00Z');
  const fresh = { crawled_at: '2026-11-17T09:00:00Z', capture_version: CAPTURE_VERSION };
  assert.equal(needsCapture(fresh, { now }), 'fresh');
  // No entry at all: the record has never been crawled.
  assert.equal(needsCapture(undefined, { now }), 'missing');
  // Old parser, recent crawl: the entry predates the parse bump, so its data may be missing.
  assert.equal(needsCapture({ crawled_at: '2026-11-12T09:22:36.170Z' }, { now }), 'stale');
  // Unstamped but taken after the last parse fix: nothing to gain from crawling it again.
  assert.equal(needsCapture({ crawled_at: '2026-11-16T12:00:00Z' }, { now }), 'fresh');
  // Older than the reuse window, whatever the stamp says.
  assert.equal(needsCapture({ crawled_at: '2026-11-01T00:00:00Z', capture_version: CAPTURE_VERSION }, { now }), 'stale');
  // A stamp from a future version is not "fresh" either: this code cannot read it.
  assert.equal(needsCapture({ crawled_at: '2026-11-17T09:00:00Z', capture_version: CAPTURE_VERSION + 1 }, { now }), 'stale');
  // An unusable timestamp is not evidence of a recent crawl.
  assert.equal(needsCapture({ crawled_at: 'not-a-date', capture_version: CAPTURE_VERSION }, { now }), 'stale');
});
