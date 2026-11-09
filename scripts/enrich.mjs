// Build an enrichment proposal for the project records from the builders' own X posts.
//
//   node scripts/enrich.mjs                     # fetch/refresh the cache, write data/enrichment/proposal.json
//   node scripts/enrich.mjs --limit 20          # a sample first
//   node scripts/enrich.mjs --only <submission_id>
//   node scripts/enrich.mjs --threads data/enrichment/threads.json
//   node scripts/enrich.mjs --refresh           # ignore cached posts and re-fetch
//   node scripts/enrich.mjs --chain-only        # skip feed submissions that are not on chain yet
//   node scripts/enrich.mjs --links             # NH-96 step 2: visit every link once, write
//                                               # data/enrichment/links.json (status, <title>, og:image)
//   node scripts/enrich.mjs --duplicates        # NH-96 step 4: submissions sharing a repo, X post
//                                               # or demo, written to data/enrichment/duplicates.json
//
// Read-only: it reads records from mainnet and posts from X's public syndication endpoint, and
// writes only local files. It never signs or writes anything on chain. Applying the proposal is
// a separate, human-approved importer run.
//
// What it reads from X: the submitted post, plus its `parent` chain (the root pitch), because
// the hackathon feed links whichever post the builder submitted. Follow-up replies in a thread
// are not exposed by the syndication endpoint; when a browser crawl has captured them, pass
// --threads with `{ "<submission_id>": [{ text, links, author, id }] }` and they are merged in.
//
// By default the proposal also covers submissions that are in the hackathon feed but not on
// chain yet, so the importer can create them already enriched: one approval per batch, not two.
// The runbook is docs/runbooks/new-submissions.md.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DEFAULT_ACCOUNT, readProjects } from '../lib/kv.mjs';
import { buildEnrichment, summarize, tweetIdFromUrl } from '../lib/enrichment.mjs';
import { verifyRepos } from '../lib/repo-check.mjs';
import { linksToCheck, probeLink, summarizeProbes, verdictOf } from '../lib/link-probe.mjs';
import { applyLinkChecks } from '../lib/link-label.mjs';
import { clusters, findDuplicates, weakSignals } from '../lib/duplicates.mjs';
import { isXPost } from '../lib/project-view.mjs';

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
// NH-96 step 3: every proposed link carries its last check. Results already in this file are
// reused (one visit per URL); anything missing is visited now.
const LINK_CHECKS = value('--link-checks', 'data/enrichment/links.json');
const CHECK_LINKS = !args.includes('--no-check-links');
const CHAIN_ONLY = flag('--chain-only');
const FEED_API = 'https://nearhackathon.com/api/projects';

/**
 * Every submission in the hackathon feed, `{ id, project_name, tracks, demo_url }`. Same loop
 * as scripts/import.mjs: 8 per page, deduped on the source id because the feed grows mid-read.
 */
async function readFeed() {
  const seen = new Map();
  let total = Infinity;
  let read = 0;
  for (let page = 1; read < total; page++) {
    const res = await fetch(`${FEED_API}?page=${page}`);
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
    .filter((p) => (ONLY ? p.submission_id === ONLY : true));
  if (!CHAIN_ONLY) {
    const onChain = new Set(projects.map((p) => p.submission_id));
    const pending = (await readFeed())
      .filter((f) => !onChain.has(f.id) && (ONLY ? f.id === ONLY : true))
      .map((f) => ({ submission_id: f.id, name: f.project_name, demo_url: f.demo_url ?? null }));
    console.log(`feed: ${pending.length} submission(s) not on chain yet, included`);
    projects.push(...pending);
  }
  projects.splice(LIMIT || projects.length);

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

  // NH-96 step 3: repository candidates among the links (non-GitHub git hosts), then the check
  // result for every link. Reuses the step-2 report; visits only URLs it does not have.
  const candidates = results.flatMap((r) => (r.status === 'ok' ? r.links ?? [] : []).map((l) => l.repo)).filter(Boolean);
  const repoAnswers = CHECK_REPOS && candidates.length ? await verifyRepos(candidates) : new Map();
  const probes = new Map();
  if (CHECK_LINKS) {
    try {
      const report = JSON.parse(await readFile(LINK_CHECKS, 'utf8'));
      for (const row of report.rows ?? []) {
        if (row?.url && row.verdict) probes.set(row.url, { ...row, checked_at: report.generated_at });
      }
    } catch {
      // no earlier report: everything is visited below
    }
    const missing = [...new Set(results.flatMap((r) => (r.status === 'ok' ? r.links ?? [] : []).map((l) => l.url)))]
      .filter((u) => !probes.has(u));
    if (missing.length) process.stdout.write(`\nvisiting ${missing.length} link(s) not in ${LINK_CHECKS}…`);
    for (const url of missing) {
      const row = await probeLink(url);
      probes.set(url, { ...row, verdict: verdictOf(row), checked_at: new Date().toISOString() });
      await delay(DELAY_MS);
    }
  }
  const linkStats = applyLinkChecks(results, { probes, repos: repoAnswers, verifiedAt: new Date().toISOString() });
  console.log(`\nlinks: ${linkStats.checked} carry a check; ${linkStats.repositories_promoted} repository link(s) promoted after git ls-remote`);

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

/**
 * NH-96 step 2. One GET per distinct URL across all records (a URL shared by two records is
 * visited once and reported for both), a few at a time. Writes a local report only.
 */
async function checkLinks() {
  const out = value('--out', 'data/enrichment/links.json');
  const concurrency = Math.max(1, Number(value('--concurrency', '4')) || 4);
  const rows = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  const projects = rows
    .filter((r) => r.value && typeof r.value === 'object')
    .map((r) => ({ ...r.value, submission_id: r.key.slice('project/'.length) }))
    .filter((p) => (ONLY ? p.submission_id === ONLY : true))
    .slice(0, LIMIT || undefined);

  const wanted = projects.flatMap((p) =>
    linksToCheck(p, isXPost).map((l) => ({ submission_id: p.submission_id, name: p.name, ...l })),
  );
  const urls = [...new Set(wanted.map((w) => w.url))];
  console.log(`records: ${projects.length}; links to check: ${wanted.length} (${urls.length} distinct URLs)`);

  const results = new Map();
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      results.set(url, await probeLink(url));
      if (++done % 25 === 0) console.log(`  ...${done}/${urls.length}`);
      await delay(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));

  const checked_at = new Date().toISOString();
  const report = wanted.map((w) => {
    const { url, ...probe } = results.get(w.url);
    return { submission_id: w.submission_id, name: w.name, field: w.field, url, verdict: verdictOf(results.get(w.url)), truncated: w.truncated, ...probe };
  });
  const summary = summarizeProbes(report);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ generated_at: checked_at, account: DEFAULT_ACCOUNT, summary, rows: report }, null, 2)}\n`);
  console.log(`\n${JSON.stringify(summary, null, 2)}`);
  console.log(`\nwrote ${out} (nothing written on chain)\n`);
}

/**
 * NH-96 step 4. Reads the chain records, the proposal (repositories and links not on chain yet)
 * and the hackathon feed (submissions not imported yet), and lists groups that share an
 * identifying URL. Flag only: nothing is merged, hidden or written on chain.
 */
async function checkDuplicates() {
  const out = value('--out', 'data/enrichment/duplicates.json');
  const proposalFile = value('--proposal', 'data/enrichment/proposal-nh96.json');
  const rows = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  const records = rows.filter((r) => r.value && typeof r.value === 'object').map((r) => r.value);
  let proposal = {};
  try {
    for (const r of JSON.parse(await readFile(proposalFile, 'utf8')).results ?? []) proposal[r.submission_id] = r;
  } catch {
    console.log(`(no ${proposalFile}: chain values only)`);
  }

  const subs = new Map();
  for (const v of records) {
    const id = v.source?.submission_id;
    const p = proposal[id] ?? {};
    const urls = [
      { field: 'demo_url', url: v.demo_url },
      { field: 'repository_url', url: v.repository_url ?? p.repository_url },
      ...[...(v.links ?? []), ...(p.links ?? [])].map((l) => ({ field: 'links', url: l?.url })),
    ];
    subs.set(id, { submission_id: id, name: v.name, on_chain: true, urls });
  }

  for (const f of await readFeed()) {
    if (!subs.has(f.id)) subs.set(f.id, { submission_id: f.id, name: f.project_name, on_chain: false, urls: [{ field: 'demo_url', url: f.demo_url }] });
  }

  const all = [...subs.values()];
  const groups = findDuplicates(all);
  const grouped = clusters(groups);
  const weak = weakSignals(all);
  const summary = {
    submissions: all.length,
    on_chain: all.filter((s) => s.on_chain).length,
    pending: all.filter((s) => !s.on_chain).length,
    shared_urls: groups.length,
    by_kind: groups.reduce((a, g) => ({ ...a, [g.kind]: (a[g.kind] ?? 0) + 1 }), {}),
    clusters: grouped.length,
    submissions_flagged: grouped.reduce((n, c) => n + c.submissions.length, 0),
    same_name_groups: weak.same_name.length,
    same_x_account_groups: weak.same_x_account.length,
  };
  const report = { generated_at: new Date().toISOString(), account: DEFAULT_ACCOUNT, note: 'Flags only. Nothing is merged, hidden or written. `clusters`/`groups` share an identifying URL (possible duplicates). `weak_signals` share only a name or an X account and are usually different projects.', summary, clusters: grouped, groups, weak_signals: weak };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nwrote ${out} (nothing written on chain)\n`);
}

(flag('--duplicates') ? checkDuplicates() : flag('--links') ? checkLinks() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
