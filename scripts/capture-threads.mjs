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
const LIMIT = Number(value('--limit', '0')) || 0;

/** Identify ourselves: this is a crawler, and the page is public. */
const USER_AGENT = 'Mozilla/5.0 (compatible; nearhunt-enrich/1.0; +https://nearhunt.xyz)';
const STATUS = (id) => `https://x.com/i/status/${id}`;
const SYNDICATION = 'https://cdn.syndication.twimg.com/tweet-result';
/** The status page lists the whole conversation; more than this is not the builder's thread. */
const MAX_REPLIES = 15;
const DELAY_MS = 350;

const CACHE_DIR = 'data/enrichment/x-threads';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** One author post, shaped for `scripts/enrich.mjs`'s `mergeThread`. */
export function postFromPayload(payload) {
  const id = payload?.id_str;
  const author = payload?.user?.screen_name;
  if (!id || !author || !payload.text) return null;
  const links = [...new Set((payload.entities?.urls ?? []).map((u) => u?.expanded_url).filter(Boolean))];
  return { id, author, text: payload.text, links };
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
    .filter((p) => (MISSING_REPO_ONLY ? !p.repository_url : true));
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
    if (!REFRESH && threads[p.submission_id]?.posts?.length) {
      counts['already captured'] = (counts['already captured'] ?? 0) + 1;
      continue;
    }
    const result = await captureThread(postId, { refresh: REFRESH, log: (m) => console.log(m) });
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    if (result.posts.length) {
      threads[p.submission_id] = {
        author: result.author,
        crawled_at: new Date().toISOString(),
        posts: result.posts,
        links: [],
      };
      // Persist per item: a long crawl must be resumable.
      await mkdir(dirname(OUT), { recursive: true });
      await writeFile(OUT, `${JSON.stringify(threads, null, 2)}\n`);
    }
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
