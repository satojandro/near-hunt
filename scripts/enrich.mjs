// Build an enrichment proposal for the project records from the builders' own X posts.
//
//   node scripts/enrich.mjs                     # fetch/refresh the cache, write data/enrichment/proposal.json
//   node scripts/enrich.mjs --limit 20          # a sample first
//   node scripts/enrich.mjs --only <submission_id>
//   node scripts/enrich.mjs --threads data/enrichment/threads.json
//   node scripts/enrich.mjs --refresh           # ignore cached posts and re-fetch
//
// Read-only: it reads records from mainnet and posts from X's public syndication endpoint, and
// writes only local files. It never signs or writes anything on chain. Applying the proposal is
// a separate, human-approved importer run.
//
// What it reads from X: the submitted post, plus its `parent` chain (the root pitch), because
// the hackathon feed links whichever post the builder submitted. Follow-up replies in a thread
// are not exposed by the syndication endpoint; when a browser crawl has captured them, pass
// --threads with `{ "<submission_id>": [{ text, links, author, id }] }` and they are merged in.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DEFAULT_ACCOUNT, readProjects } from '../lib/kv.mjs';
import { buildEnrichment, summarize, tweetIdFromUrl } from '../lib/enrichment.mjs';
import { verifyRepos } from '../lib/repo-check.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const LIMIT = Number(value('--limit', '0')) || 0;
const ONLY = value('--only');
const REFRESH = flag('--refresh');
const DELAY_MS = Number(value('--delay', '300'));
const CACHE_DIR = value('--cache', 'data/enrichment/x-posts');
const THREADS_FILE = value('--threads', null);
const OUT = value('--out', 'data/enrichment/proposal.json');
// A repository link is only published when it answers `git ls-remote` at proposal time.
const CHECK_REPOS = !args.includes('--no-check-repos');

const SYNDICATION = 'https://cdn.syndication.twimg.com/tweet-result';
const MAX_PARENTS = 6;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { attempts = 3 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; nearhunt-enrich/1.0)', accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        await delay(5000 * (i + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await delay(1000 * (i + 1));
    }
  }
  return null;
}

async function fetchTweet(id, { refresh = false } = {}) {
  const file = join(CACHE_DIR, `${id}.json`);
  if (!refresh) {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      // not cached yet
    }
  }
  const json = await getJson(`${SYNDICATION}?id=${id}&lang=en&token=a`);
  if (json) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(json));
  }
  return json;
}

/** Focal tweet plus its ancestors, root first. Each parent id is fetched for one more hop. */
async function fetchChain(postId, opts) {
  const chain = [];
  let id = postId;
  const seen = new Set();
  for (let depth = 0; depth < MAX_PARENTS && id && !seen.has(id); depth++) {
    seen.add(id);
    const tweet = await fetchTweet(id, opts);
    if (!tweet || tweet.__typename === 'TweetTombstone') break;
    chain.unshift(tweet);
    id = tweet.parent?.id_str || tweet.in_reply_to_status_id_str || null;
    if (depth > 0) await delay(DELAY_MS);
  }
  return chain;
}

/**
 * Merge a browser-captured thread. Accepted shapes:
 *   { [submission_id]: [{ id?, text, links?, author? }] }
 *   { [submission_id]: { posts: [{ id?, text }], links: [url], crawled_at } }
 * Captured posts are appended after the syndication chain; the root stays first, so the
 * description still comes from the builder's root pitch.
 */
function mergeThread(chain, captured) {
  const focal = chain[chain.length - 1];
  const author = focal?.user?.screen_name;
  const posts = Array.isArray(captured) ? captured : captured?.posts ?? [];
  const links = Array.isArray(captured) ? [] : captured?.links ?? [];
  const synthetic = [];
  posts.forEach((p, i) => {
    synthetic.push({
      id_str: String(p.id ?? `thread-${i + 1}`),
      text: p.text ?? '',
      user: { screen_name: p.author || author },
      entities: { urls: (p.links ?? []).map((url) => ({ expanded_url: url })) },
    });
  });
  if (links.length) {
    synthetic.push({
      id_str: 'thread-links',
      text: '',
      user: { screen_name: author },
      entities: { urls: links.map((expanded_url) => ({ expanded_url })) },
    });
  }
  const seen = new Set(chain.map((t) => t.id_str));
  return [...chain, ...synthetic.filter((t) => !seen.has(t.id_str))];
}

async function main() {
  const rows = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  const projects = rows
    .filter((r) => r.value && typeof r.value === 'object')
    .map((r) => ({ ...r.value, submission_id: r.key.slice('project/'.length) }))
    .filter((p) => (ONLY ? p.submission_id === ONLY : true))
    .slice(0, LIMIT || undefined);

  const threads = THREADS_FILE ? JSON.parse(await readFile(THREADS_FILE, 'utf8')) : {};
  const results = [];
  let fetched = 0;

  for (const project of projects) {
    const postId = tweetIdFromUrl(project.demo_url);
    if (!postId) {
      results.push({ submission_id: project.submission_id, status: 'not-an-x-post' });
      continue;
    }
    const chain = await fetchChain(postId, { refresh: REFRESH });
    if (chain.length === 0) {
      results.push({ submission_id: project.submission_id, status: 'post-unavailable', post_id: postId });
      continue;
    }
    const captured = threads[project.submission_id];
    const hasCaptured = Array.isArray(captured) ? captured.length > 0 : (captured?.posts?.length ?? 0) > 0;
    const merged = hasCaptured ? mergeThread(chain, captured) : chain;
    results.push(
      buildEnrichment(project, { chain: merged, retrieved_at: new Date().toISOString() }),
    );
    fetched++;
    if (fetched % 25 === 0) console.log(`  ...${fetched} posts`);
    if (!threads[project.submission_id]) await delay(DELAY_MS);
  }

  if (CHECK_REPOS) {
    const urls = results.map((r) => r.repository_url).filter(Boolean);
    if (urls.length) {
      process.stdout.write(`\nchecking ${urls.length} repositories with git ls-remote…`);
      const reachable = await verifyRepos(urls);
      const checkedAt = new Date().toISOString();
      let dropped = 0;
      for (const r of results) {
        if (!r.repository_url) continue;
        if (reachable.get(r.repository_url)) {
          r.repository_verified = true;
          r.repository_verified_at = checkedAt;
        } else {
          r.repository_unverified = r.repository_url;
          r.repository_url = null;
          r.repository_source = null;
          dropped += 1;
          if (!r.description && !r.links?.length) r.status = 'nothing-recoverable';
        }
      }
      console.log(` ${urls.length - dropped}/${urls.length} answered, ${dropped} dropped.`);
    }
  }

  const summary = summarize(results);
  const proposal = { generated_at: new Date().toISOString(), account: DEFAULT_ACCOUNT, summary, results };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(proposal, null, 2)}\n`);

  console.log(`\nprojects:            ${summary.projects}`);
  console.log(`recoverable (ok):    ${summary.ok}`);
  console.log(`with description:    ${summary.with_description}`);
  console.log(`with repository:     ${summary.with_repository}`);
  console.log(`with extra links:    ${summary.with_links}`);
  console.log(`with media:          ${summary.with_media}`);
  console.log(`by status:           ${JSON.stringify(summary.by_status)}`);
  console.log(`\nwrote ${OUT} (nothing written on chain)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
