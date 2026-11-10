#!/usr/bin/env node
/**
 * Capture the builder's own reply thread for a project, so enrichment can see what they posted
 * *after* the submitted post (NH-96c).
 *
 * Why this exists: `cdn.syndication.twimg.com/tweet-result` gives one post plus its ancestors
 * (`parent`), so `scripts/enrich.mjs` can walk **up** a thread but never **down** into replies.
 * Builders put the repository in the first reply ("Code: github.com/…") far more often than in the
 * submitted post, which is why 223 of 336 records had no repository on 9 Nov 2026.
 *
 * How: a status page fetched with an honest user agent is server-rendered and lists the
 * conversation, so the reply ids come out of the HTML with no API key and no browser. Each id is
 * then read through the public syndication endpoint, which yields the expanded URL behind a
 * `t.co` shortlink — display text alone cannot be trusted for a repository name.
 *
 * Read-only: fetches public pages, writes a local capture file, never touches the chain.
 *
 * Usage:
 *   node scripts/capture-threads.mjs                         # every project with an X post
 *   node scripts/capture-threads.mjs --only <submission_id>
 *   node scripts/capture-threads.mjs --missing-repo-only      # records with no repository_url
 *   node scripts/capture-threads.mjs --include-pending        # + feed submissions not yet on chain
 *   node scripts/capture-threads.mjs --max-age-days 7         # reuse a capture younger than this
 *   node scripts/capture-threads.mjs --out data/enrichment/threads.json --refresh
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tweetIdFromUrl } from '../lib/enrichment.mjs';
import { readProjects, DEFAULT_ACCOUNT } from '../lib/kv.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);

const OUT = value('--out', 'data/enrichment/threads.json');
const ONLY = value('--only', null);
const REFRESH = flag('--refresh');
const MISSING_REPO_ONLY = args.includes('--missing-repo-only');
// A record that has a repository but no media may still have the builder's screenshots in a
// follow-up reply, so the scheduled run looks at both gaps.
const GAPS_ONLY = args.includes('--gaps-only');
const INCLUDE_PENDING = args.includes('--include-pending');
const LIMIT = Number(value('--limit', '0')) || 0;
const FEED_API = 'https://nearhackathon.com/api/projects';
// A capture is reused for this long, including a capture that found no author reply: a scheduled
// run must not re-crawl 400 threads every cycle to learn the same "no replies".
const MAX_AGE_MS = (Number(value('--max-age-days', '7')) || 7) * 86_400_000;

/** Identify ourselves: this is a crawler, and the page is public. */
const USER_AGENT = 'Mozilla/5.0 (compatible; nearhunt-enrich/1.0; +https://nearhunt.xyz)';
const STATUS = (id) => `https://x.com/i/status/${id}`;
const SYNDICATION = 'https://cdn.syndication.twimg.com/tweet-result';
/** The status page lists the whole conversation; more than this is not the builder's thread. */
const MAX_REPLIES = 15;
const DELAY_MS = 350;

const CACHE_DIR = 'data/enrichment/x-threads';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Every submission in the hackathon feed, `{ id, project_name, demo_url }`. Same loop as
 * scripts/enrich.mjs: 8 per page, deduped on the source id because the feed grows mid-read.
 */
async function readFeed() {
  const seen = new Map();
  let total = Infinity;
  let read = 0;
  for (let page = 1; read < total; page++) {
    const res = await fetch(`${FEED_API}?page=${page}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`feed returned ${res.status} on page ${page}`);
    const body = await res.json();
    total = body.total;
    if (!body.projects?.length) break;
    for (const f of body.projects) seen.set(f.id, f);
    read += body.projects.length;
    await delay(400);
  }
  return [...seen.values()];
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

/** Cached status page, so a re-run does not re-fetch the whole conversation. */
async function statusPage(postId, { refresh = false } = {}) {
  const file = join(CACHE_DIR, `${postId}.html`);
  if (!refresh) {
    try {
      return await readFile(file, 'utf8');
    } catch {
      // not cached
    }
  }
  const html = await fetchText(STATUS(postId));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
  return html;
}

/**
 * Post ids that appear in the rendered conversation, minus the focal one. `x.com/i/status/<id>`
 * also links the author's profile and a few unrelated ids; the author filter happens after each
 * post is read, so a stray id costs one request and is dropped.
 */
export function replyIdsFromPage(html, focalId) {
  const ids = [];
  for (const m of String(html ?? '').matchAll(/\/status\/(\d{15,20})/g)) {
    if (m[1] !== focalId && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids.slice(0, MAX_REPLIES);
}

/**
 * One author post, shaped for `scripts/enrich.mjs`'s `mergeThread`.
 *
 * `media` carries what `lib/media.mjs:mediaFromPost` reads, trimmed to those fields: builders put
 * screenshots and demo videos in the replies, and the syndication payload already has them.
 */
export function postFromPayload(payload) {
  const id = payload?.id_str;
  const author = payload?.user?.screen_name;
  if (!id || !author) return null;
  const links = [...new Set((payload.entities?.urls ?? []).map((u) => u?.expanded_url).filter(Boolean))];
  const media = (Array.isArray(payload.mediaDetails) ? payload.mediaDetails : []).map((m) => ({
    type: m?.type,
    media_url_https: m?.media_url_https,
    original_info: m?.original_info,
    ext_alt_text: m?.ext_alt_text,
    video_info: m?.video_info,
    ext_media_availability: m?.ext_media_availability,
  }));
  // An image-only post has no text; it is still the builder's own post and its media is worth keeping.
  if (!payload.text && media.length === 0 && links.length === 0) return null;
  const post = { id, author, text: payload.text ?? '', links };
  if (media.length) post.media = media;
  return post;
}

/**
 * The builder's own follow-ups under the submitted post, in thread order.
 *
 * Kept: posts by the same author that are not the submitted post itself. A reply from another
 * account is somebody else's claim and never carries the project's repository.
 */
export async function captureThread(postId, { refresh = false, log = () => {} } = {}) {
  const focal = await fetchJson(`${SYNDICATION}?id=${postId}&lang=en&token=a`);
  const author = focal?.user?.screen_name;
  if (!author) return { status: 'post-unavailable', posts: [] };

  let html;
  try {
    html = await statusPage(postId, { refresh });
  } catch (err) {
    return { status: `page-failed:${err.message}`, author, posts: [] };
  }

  const ids = replyIdsFromPage(html, postId);
  const posts = [];
  for (const id of ids) {
    try {
      const payload = await fetchJson(`${SYNDICATION}?id=${id}&lang=en&token=a`);
      const post = postFromPayload(payload);
      if (post && post.author === author) posts.push(post);
    } catch (err) {
      log(`    ${id}: ${err.message}`);
    }
    await delay(DELAY_MS);
  }
  // Thread order: the reply chain, as X lists it.
  posts.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  return { status: posts.length ? 'ok' : 'no-author-replies', author, posts };
}

async function main() {
  const rows = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  let projects = rows
    .filter((r) => r.value && typeof r.value === 'object')
    .map((r) => ({ ...r.value, submission_id: r.key.slice('project/'.length) }))
    .filter((p) => (ONLY ? p.submission_id === ONLY : true))
    .filter((p) => {
      if (GAPS_ONLY) return !p.repository_url || !(p.media ?? []).length;
      return MISSING_REPO_ONLY ? !p.repository_url : true;
    });

  // A submission that is in the feed but not on chain yet is the one most in need of its replies:
  // the import will create it, and a repository in the builder's first reply is the usual place.
  if (INCLUDE_PENDING) {
    const onChain = new Set(rows.filter((r) => r.value).map((r) => r.key.slice('project/'.length)));
    const pending = (await readFeed())
      .filter((f) => !onChain.has(f.id) && (ONLY ? f.id === ONLY : true))
      .map((f) => ({ submission_id: f.id, name: f.project_name, demo_url: f.demo_url ?? null }));
    console.log(`feed: ${pending.length} submission(s) not on chain yet, included`);
    projects.push(...pending);
  }
  if (LIMIT) projects = projects.slice(0, LIMIT);

  let threads = {};
  try {
    threads = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    // first run
  }

  console.log(`capturing ${projects.length} project thread(s) from mainnet records`);
  const counts = {};
  let done = 0;
  for (const p of projects) {
    const postId = tweetIdFromUrl(p.demo_url);
    if (!postId) {
      counts['not-an-x-post'] = (counts['not-an-x-post'] ?? 0) + 1;
      continue;
    }
    const prev = threads[p.submission_id];
    const age = prev?.crawled_at ? Date.now() - Date.parse(prev.crawled_at) : Infinity;
    if (!REFRESH && age < MAX_AGE_MS) {
      counts['captured recently'] = (counts['captured recently'] ?? 0) + 1;
      continue;
    }
    const result = await captureThread(postId, { refresh: REFRESH, log: (m) => console.log(m) });
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    // A capture that found no author reply is recorded too, so the next scheduled run can skip it
    // instead of crawling the same page again.
    threads[p.submission_id] = {
      author: result.author,
      status: result.status,
      crawled_at: new Date().toISOString(),
      posts: result.posts,
      links: [],
    };
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(threads, null, 2)}\n`);
    if (++done % 10 === 0) console.log(`  ...${done}/${projects.length} ${JSON.stringify(counts)}`);
    await delay(DELAY_MS);
  }

  const withPosts = Object.values(threads).filter((t) => t?.posts?.length).length;
  console.log(`\n${JSON.stringify(counts, null, 1)}`);
  console.log(`threads file: ${OUT} (${withPosts} project(s) with captured posts)`);
  console.log('\nNext: npm run enrich  (then a dry run; nothing is written on chain here)\n');
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
