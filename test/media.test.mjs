import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeMediaUrl, mediaFromPost, mediaFromChain, formatDuration, mediaView, MAX_MEDIA } from '../lib/media.mjs';
import { buildEnrichment } from '../lib/enrichment.mjs';
import { enrichmentFragment } from '../lib/import-plan.mjs';

// Shape of X's syndication payload (`cdn.syndication.twimg.com/tweet-result`), trimmed to the
// fields lib/media.mjs reads; values copied from a real cached post on 9 Nov 2026.
const video = {
  type: 'video',
  media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/2096285232802693120/img/YB39qVS1ZAYiLP_3.jpg',
  ext_media_availability: { status: 'Available' },
  original_info: { width: 1920, height: 1080 },
  video_info: { duration_millis: 35033, variants: [{ url: 'https://video.twimg.com/x.mp4' }] },
};
const photo = (n, extra = {}) => ({
  type: 'photo', media_url_https: `https://pbs.twimg.com/media/P${n}.jpg`,
  ext_media_availability: { status: 'Available' }, original_info: { width: 1200, height: 675 }, ...extra,
});
const post = (id, mediaDetails, extra = {}) => ({
  id_str: id, text: 'I built Thing, a demo for NEAR agents with a long enough pitch', user: { screen_name: 'builder' }, mediaDetails, ...extra,
});

test('safeMediaUrl allows only pbs.twimg.com image paths and strips the query', () => {
  assert.equal(safeMediaUrl('https://pbs.twimg.com/media/abc.jpg?name=small'), 'https://pbs.twimg.com/media/abc.jpg');
  assert.equal(safeMediaUrl(video.media_url_https), video.media_url_https);
  assert.equal(safeMediaUrl('https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg'), 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg');
  assert.equal(safeMediaUrl('http://pbs.twimg.com/media/abc.jpg'), null);
  assert.equal(safeMediaUrl('https://evil.example/media/abc.jpg'), null);
  assert.equal(safeMediaUrl('https://pbs.twimg.com.evil.example/media/a.jpg'), null);
  assert.equal(safeMediaUrl('https://u:p@pbs.twimg.com/media/a.jpg'), null);
  assert.equal(safeMediaUrl('https://pbs.twimg.com/profile_images/1/a.jpg'), null);
  assert.equal(safeMediaUrl('https://video.twimg.com/amplify_video/1/vid/a.mp4'), null);
  assert.equal(safeMediaUrl(null), null);
});

test('mediaFromPost keeps a video as its poster plus the post URL, never the video file', () => {
  const [v] = mediaFromPost(post('2096285372875686246', [video]));
  assert.deepEqual(v, {
    type: 'video', url: video.media_url_https, width: 1920, height: 1080, duration_ms: 35033,
    post_url: 'https://x.com/builder/status/2096285372875686246',
  });
  assert.ok(!JSON.stringify(v).includes('video.twimg.com'));
});

test('mediaFromPost: photos keep alt text, unavailable media and bad hosts are dropped, capped', () => {
  const items = mediaFromPost(post('1', [
    photo(1, { ext_alt_text: '  Dashboard screenshot ' }),
    photo(2, { ext_media_availability: { status: 'Unavailable' } }),
    { type: 'photo', media_url_https: 'https://evil.example/media/x.jpg' },
    photo(3), photo(4), photo(5), photo(6),
  ]));
  assert.equal(items.length, MAX_MEDIA);
  assert.equal(items[0].alt, 'Dashboard screenshot');
  assert.equal(items[1].url, 'https://pbs.twimg.com/media/P3.jpg');
  assert.equal(items[1].alt, null);
});

test('mediaFromPost refuses a post without a valid author or id', () => {
  assert.deepEqual(mediaFromPost(post('1', [photo(1)], { user: { screen_name: 'bad name!' } })), []);
  assert.deepEqual(mediaFromPost(post('abc', [photo(1)])), []);
  assert.deepEqual(mediaFromPost(null), []);
  assert.deepEqual(mediaFromPost(post('1', undefined)), []);
});

test('mediaFromChain puts the submitted (last) post first and de-duplicates', () => {
  const root = post('1', [photo(1), photo(2)]);
  const focal = post('2', [photo(2), video]);
  const items = mediaFromChain([root, focal]);
  assert.deepEqual(items.map((m) => m.url), [
    'https://pbs.twimg.com/media/P2.jpg', video.media_url_https, 'https://pbs.twimg.com/media/P1.jpg',
  ]);
  assert.equal(items[0].post_url, 'https://x.com/builder/status/2');
  assert.equal(items[2].post_url, 'https://x.com/builder/status/1');
});

test('mediaFromChain keeps the submitted post first, then the author\'s reply media in thread order', () => {
  const root = post('1', [photo(1)]);
  const focal = post('2', [photo(2)]);
  const reply1 = { ...post('3', [photo(3)]), reply: true };
  const reply2 = { ...post('4', [video, photo(3)]), reply: true };
  const items = mediaFromChain([root, focal, reply1, reply2]);
  assert.deepEqual(items.map((m) => m.url), [
    'https://pbs.twimg.com/media/P2.jpg',
    'https://pbs.twimg.com/media/P3.jpg',
    video.media_url_https,
    'https://pbs.twimg.com/media/P1.jpg',
  ]);
  // A reply's media is cited by the reply's own post, so the card can link to it.
  assert.equal(items[1].post_url, 'https://x.com/builder/status/3');
});

test('mediaFromChain still puts the last post first when nothing is marked as a reply', () => {
  assert.deepEqual(mediaFromChain([post('1', [photo(1)]), post('2', [photo(2)])]).map((m) => m.url), [
    'https://pbs.twimg.com/media/P2.jpg',
    'https://pbs.twimg.com/media/P1.jpg',
  ]);
});

test('formatDuration', () => {
  assert.equal(formatDuration(35033), '0:35');
  assert.equal(formatDuration(125000), '2:05');
  assert.equal(formatDuration(3_725_000), '1:02:05');
  assert.equal(formatDuration(0), null);
  assert.equal(formatDuration('35'), null);
});

test('mediaView validates every item from the record before rendering', () => {
  const good = { type: 'video', url: video.media_url_https, width: 1920, height: 1080, duration_ms: 35033, post_url: 'https://x.com/builder/status/2' };
  const view = mediaView({
    media: [
      good,
      { ...good, url: 'https://evil.example/media/a.jpg' },
      { ...good, post_url: 'https://evil.example/status/1' },
      { ...good, type: 'iframe' },
      { type: 'photo', url: 'https://pbs.twimg.com/media/P1.jpg', post_url: 'https://x.com/builder/status/2', width: -1 },
      null,
    ],
  });
  assert.equal(view.length, 2);
  assert.deepEqual(view[0], {
    type: 'video', src: `${video.media_url_https}?name=small`, full: `${video.media_url_https}?name=large`,
    width: 1920, height: 1080, alt: "Video poster from the builder's post on X", duration: '0:35',
    postUrl: 'https://x.com/builder/status/2',
    embedUrl: 'https://platform.twitter.com/embed/Tweet.html?id=2&dnt=true&theme=light&conversation=none',
  });
  assert.equal(view[1].width, null);
  assert.equal(view[1].alt, "Image from the builder's post on X");
  assert.equal(view[1].embedUrl, null); // NH-96b: a photo has no player
  assert.deepEqual(mediaView({}), []);
  assert.deepEqual(mediaView({ media: 'nope' }), []);
  assert.deepEqual(mediaView(null), []);
});

test('buildEnrichment proposes media, cites the post, and keeps a media-only post', () => {
  const project = { submission_id: 's1', name: 'Thing', demo_url: 'https://x.com/builder/status/2' };
  const r = buildEnrichment(project, { chain: [post('2', [video], { text: 'gm' })], retrieved_at: '2026-11-09T00:00:00.000Z' });
  assert.equal(r.status, 'ok');
  assert.equal(r.description, null);
  assert.equal(r.media.length, 1);
  assert.ok(r.enrichment.sources.includes('https://x.com/builder/status/2'));
});

test('importer fills media once, never replaces it, and keeps earlier provenance', () => {
  const media = [{ type: 'video', url: video.media_url_https, post_url: 'https://x.com/builder/status/2' }];
  const prev = {
    description: 'Builder text', media: null,
    enrichment: { method: 'x-thread', sources: ['https://x.com/builder/status/1'], retrieved_at: 'old', fields: ['description'] },
  };
  const item = { status: 'ok', description: 'Builder text', media, enrichment: { method: 'x-thread', sources: ['https://x.com/builder/status/2'], retrieved_at: 'new' } };
  const f = enrichmentFragment(prev, item);
  assert.deepEqual(f.media, media);
  assert.equal(f.description, undefined);
  assert.deepEqual(f.enrichment.fields, ['description', 'media']);
  assert.deepEqual(f.enrichment.sources, ['https://x.com/builder/status/1', 'https://x.com/builder/status/2']);

  // Second run: already applied, nothing to write.
  assert.deepEqual(enrichmentFragment({ ...prev, ...f }, item), {});
  // A media value without enrichment provenance (owner-written) is never replaced.
  const owner = { ...prev, media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/O.jpg', post_url: 'https://x.com/o/status/9' }] };
  assert.deepEqual(enrichmentFragment(owner, item, { refreshEnriched: true }), {});
});
