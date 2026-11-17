#!/usr/bin/env node
/**
 * Loops House as a repository source (owner request, 17 Nov 2026).
 *
 * Hackathon submissions are mirrored on <https://www.loops.house>, which publishes, per project, a
 * `Repository URL` **and** the `Demo URL` the builder submitted — and that demo URL is usually the
 * same X post NEAR Hunt already stores as `demo_url`. So the two datasets join on the post id,
 * which is the same submission's own claim: no name guessing is needed (though it is offered as a
 * weaker fallback).
 *
 * Why this matters: the X crawl is exhausted — of 1102 records without a repository, 1068 already
 * had their thread captured and only 12 captures held a GitHub link the record lacked. The builder
 * simply did not put the repository in the post. Loops House has it anyway.
 *
 * Read-only: fetches public pages, writes local files, never touches the chain.
 *
 * Usage:
 *   node scripts/loops-repos.mjs                 # crawl (cached 7 days) + join + write the worksheet
 *   node scripts/loops-repos.mjs --refresh       # re-fetch every page
 *   node scripts/loops-repos.mjs --crawl-only    # just the loops-projects.json file
 *   node scripts/loops-repos.mjs --join-only     # re-join against chain state, no crawling
 *   node scripts/loops-repos.mjs --event "NEAR HACKATHON"   # default; "" for every event
 *   node scripts/loops-repos.mjs --limit 20      # first N pages, for a smoke test
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = 'https://www.loops.house';
const CACHE_DIR = 'data/enrichment/loops';
const OUT = 'data/enrichment/loops-projects.json';
const SHEET = 'data/enrichment/loops-worksheet.csv';
const SITEMAP = `${SITE}/sitemap.xml`;
const USER_AGENT = 'Mozilla/5.0 (compatible; nearhunt-enrich/1.0; +https://nearhunt.xyz)';
const MAX_AGE_MS = 7 * 86_400_000;
const CONCURRENCY = 6;
const DELAY_MS = 120;

/** URLs of every project page, from the site's own sitemap. */
export function projectUrlsFromSitemap(xml) {
  const out = [];
  for (const m of String(xml ?? '').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1].trim();
    if (/\/explore-projects\/[^/?#]+$/.test(url)) out.push(url);
  }
  return [...new Set(out)];
}

/** The `@type` batch of a page's JSON-LD blocks, parsed; unparsable blocks are skipped. */
export function jsonLdBlocks(html) {
  const out = [];
  for (const m of String(html ?? '').matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(m[1]);
      for (const block of Array.isArray(parsed) ? parsed : [parsed]) if (block && typeof block === 'object') out.push(block);
    } catch {
      // A malformed block is not a page-level failure; the rest of the page still parses.
    }
  }
  return out;
}

const GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/)?$/i;
const X_POST = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(\d{10,25})/i;

/**
 * One project page -> `{ slug, name, event, repository_url, demo_url, links[], submitted_at }`.
 *
 * The structured data is preferred over the rendered markup: `sameAs` lists the builder's own links
 * (a repository and the submitted demo), and the breadcrumb names the event. Class names on this
 * site are a build artefact; `sameAs` is schema.org.
 */
export function parseProjectPage(html, { url = '' } = {}) {
  const blocks = jsonLdBlocks(html);
  const work = blocks.find((b) => !b['@type'] || String(b['@type']).includes('CreativeWork')) ?? null;
  const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList') ?? null;
  const sameAs = (work?.sameAs ?? []).filter((u) => typeof u === 'string');
  const github = sameAs.map((u) => u.trim()).find((u) => GITHUB.test(u)) ?? null;
  const xPost = sameAs.map((u) => u.trim()).find((u) => X_POST.test(u)) ?? null;
  // Any other link the builder listed (their own site) — never the repository or the post.
  const other = sameAs.filter((u) => u !== github && u !== xPost && /^https?:\/\//i.test(u));
  const eventItem = (crumbs?.itemListElement ?? []).find((i) => Number(i?.position) === 2);
  const slug = (url.match(/\/explore-projects\/([^/?#]+)/) ?? [, ''])[1];
  const name = typeof work?.name === 'string' && work.name.trim() ? work.name.trim() : null;
  if (!name) return null;
  return {
    slug,
    url: url || work?.url || null,
    name,
    event: typeof eventItem?.name === 'string' ? eventItem.name.trim() : null,
    repository_url: github ? github.replace(/\/$/, '') : null,
    demo_url: xPost ?? other[0] ?? null,
    links: other,
    submitted_at: typeof work?.datePublished === 'string' ? work.datePublished : null,
  };
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { timeout = 20000 } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.text();
}

/** Cached page, so a re-run costs nothing while the sitemap and pages stay stable. */
async function page(url, slug, { refresh = false } = {}) {
  const file = join(CACHE_DIR, `${slug || encodeURIComponent(url)}.html`);
  if (!refresh) {
    try {
      if (Date.now() - (await stat(file)).mtimeMs < MAX_AGE_MS) return await readFile(file, 'utf8');
    } catch {
      // not cached
    }
  }
  const html = await fetchText(url);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
  return html;
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function crawl({ refresh = false, limit = 0 }) {
  const urls = projectUrlsFromSitemap(await fetchText(SITEMAP));
  const todo = limit ? urls.slice(0, limit) : urls;
  console.log(`loops.house: ${urls.length} project page(s) in the sitemap, reading ${todo.length}`);
  const rows = [];
  let done = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const parsed = await Promise.all(
      batch.map(async (url) => {
        try {
          const slug = (url.match(/\/explore-projects\/([^/?#]+)/) ?? [, ''])[1];
          return parseProjectPage(await page(url, slug, { refresh }), { url });
        } catch (err) {
          console.error(`  ${url}: ${err instanceof Error ? err.message : err}`);
          return null;
        }
      }),
    );
    for (const p of parsed) if (p) rows.push(p);
    done += batch.length;
    if (done % 180 === 0 || done === todo.length) console.log(`  ...${done}/${todo.length}`);
    await delay(DELAY_MS);
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ source: `${SITEMAP} (${done} page(s) read)`, generated_at: new Date().toISOString(), projects: rows }, null, 2)}\n`);
  const withRepo = rows.filter((r) => r.repository_url).length;
  console.log(`\nwrote ${OUT}: ${rows.length} project(s), ${withRepo} with a repository (${((100 * withRepo) / (rows.length || 1)).toFixed(1)}%)`);
  return rows;
}

/**
 * Join Loops House rows to chain records that have no repository.
 *
 * Tiers, strongest first:
 *  - `same-post`     the loop's demo is the record's `demo_url` (the same submission's own X post)
 *  - `same-demo`     the loop's demo URL is the record's `demo_url` (a site, not a post)
 *  - `same-name`     normalised names are equal *and* unique on both sides — a guess, held for the
 *                    owner; `scripts/repo-worksheet.mjs --apply` takes the ticked`[x]` lines only.
 */
export function joinRows(loops, records) {
  const byPost = new Map();
  const byDemo = new Map();
  const loopsByName = new Map();
  for (const l of loops) {
    const post = (String(l.demo_url ?? '').match(X_POST) ?? [])[1];
    if (post) byPost.set(post, l);
    if (l.demo_url) byDemo.set(l.demo_url.replace(/\/$/, ''), l);
    const key = norm(l.name);
    if (!key) continue;
    loopsByName.set(key, loopsByName.has(key) ? null : l); // null = more than one project with that name
  }
  const recordsByName = new Map();
  for (const r of records) {
    const key = norm(r.name);
    if (!key) continue;
    recordsByName.set(key, recordsByName.has(key) ? null : r);
  }

  const out = [];
  const seen = new Set();
  for (const r of records) {
    if (r.repository_url) continue;
    const post = (String(r.demo_url ?? '').match(X_POST) ?? [])[1];
    let l = post ? byPost.get(post) : null;
    let basis = l ? 'same-post' : null;
    if (!l && r.demo_url) {
      l = byDemo.get(String(r.demo_url).replace(/\/$/, '')) ?? null;
      if (l) basis = 'same-demo';
    }
    if (!l) {
      const key = norm(r.name);
      const candidate = key ? loopsByName.get(key) : null;
      // Only when the name is unique on both sides: a shared name is not an identity.
      if (candidate && recordsByName.get(key) === r) {
        l = candidate;
        basis = 'same-name';
      }
    }
    if (!l || !l.repository_url) continue;
    if (seen.has(r.submission_id)) continue;
    seen.add(r.submission_id);
    out.push({ record: r, loop: l, basis });
  }
  return out;
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The `repo-worksheet.mjs` sheet shape, with the join basis in the unused `candidates` column. */
export function toWorksheetCsv(matches) {
  const columns = ['repository_url', 'name', 'page', 'x_post', 'x_author', 'site_links', 'candidates', 'submission_id'];
  const lines = matches.map(({ record, loop, basis }) => {
    const isX = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(String(record.demo_url ?? ''));
    return [
      loop.repository_url,
      record.name ?? '',
      `https://nearhunt.xyz/p/${record.submission_id}`,
      isX ? record.demo_url : '',
      '',
      record.demo_url && !isX ? record.demo_url : '',
      basis,
      record.submission_id,
    ].map(csvCell).join(',');
  });
  return `${[columns.join(','), ...lines].join('\n')}\n`;
}

async function joinToChain(loops) {
  const { readProjects, DEFAULT_ACCOUNT } = await import('../lib/kv.mjs');
  const records = (await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' }))
    .filter((r) => r.value && typeof r.value === 'object')
    .map((r) => ({ ...r.value, submission_id: r.key.slice('project/'.length) }));
  const matches = joinRows(loops, records);
  const byBasis = matches.reduce((acc, m) => ((acc[m.basis] = (acc[m.basis] ?? 0) + 1), acc), {});
  const noRepo = records.filter((r) => !r.repository_url).length;
  console.log(`\nchain: ${records.length} record(s), ${noRepo} without a repository`);
  console.log(`loops join: ${matches.length} match(es) by basis ${JSON.stringify(byBasis)}`);
  return { matches, byBasis, records, noRepo };
}

/** A join basis strong enough to publish without a human: the same submission's own demo link. */
export const SIGN_BASES = new Set(['same-post', 'same-demo']);

/**
 * Merge the strongest matches straight into an enrichment proposal, so the ordinary import writes
 * them as null-fills (`repository_url` empty -> value) under the owner's standing authorization.
 *
 * A name match is never merged: it is a guess, and it waits on the owner's ticked worksheet. Every
 * URL is checked with `git ls-remote` first — the same rule the X path applies — and a repository
 * that does not answer is reported, not published.
 */
async function writeProposal(matches, proposalPath) {
  const { verifyRepos } = await import('../lib/repo-check.mjs');
  const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
  const byId = new Map((proposal.results ?? []).map((r) => [r.submission_id, r]));
  const candidates = matches.filter((m) => SIGN_BASES.has(m.basis));
  const reachable = candidates.length ? await verifyRepos(candidates.map((m) => m.loop.repository_url)) : new Map();
  const nowIso = new Date().toISOString();
  let applied = 0;
  const dead = [];
  for (const { record, loop, basis } of candidates) {
    if (!reachable.get(loop.repository_url)) {
      dead.push(loop.repository_url);
      continue;
    }
    const row = byId.get(record.submission_id);
    if (!row || row.repository_url) continue; // the X path already found one: it wins
    row.repository_url = loop.repository_url;
    row.repository_source = loop.url;
    row.repository_verified = true;
    row.repository_verified_at = nowIso;
    row.repository_basis = ['loops-house', basis];
    // Provenance is part of the claim: a record with no enrichment yet gets one, so the value can
    // be traced to the page it came from.
    row.enrichment ??= { method: 'loops-house', sources: [], retrieved_at: nowIso, fields: [] };
    row.enrichment.sources = [...new Set([...(row.enrichment.sources ?? []), loop.url, loop.repository_url])];
    row.enrichment.fields = [...new Set([...(row.enrichment.fields ?? []), 'repository_url'])];
    applied += 1;
  }
  await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
  console.log(`\nproposal ${proposalPath}: ${applied} record(s) gain a repository (loops-house, same-post/same-demo)`);
  if (dead.length) console.log(`  ${dead.length} repository URL(s) did not answer git ls-remote and were not published: ${dead.slice(0, 5).join(' ')}`);
  return applied;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback = null) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
  };
  const refresh = args.includes('--refresh');
  const crawlOnly = args.includes('--crawl-only');
  const joinOnly = args.includes('--join-only');
  const limit = Number(value('--limit', '0')) || 0;
  const event = value('--event', 'NEAR HACKATHON');

  let rows;
  if (joinOnly) {
    rows = JSON.parse(await readFile(OUT, 'utf8')).projects ?? [];
  } else {
    rows = await crawl({ refresh, limit });
  }
  if (event) {
    const before = rows.length;
    rows = rows.filter((r) => norm(r.event) === norm(event));
    console.log(`event filter "${event}": ${rows.length} of ${before} project(s)`);
  }
  if (crawlOnly) return;

  const { matches, byBasis, noRepo } = await joinToChain(rows);
  const proposalPath = value('--write-proposal');
  if (proposalPath) {
    await writeProposal(matches, proposalPath);
    // The name matches still need the owner: keep the sheet current for the ones not published.
    const leftovers = matches.filter((m) => !SIGN_BASES.has(m.basis));
    await writeFile(SHEET, toWorksheetCsv(leftovers));
    console.log(`wrote ${SHEET} for the ${leftovers.length} name match(es) that need a tick`);
    console.log(`\nchain: ${noRepo} record(s) without a repository before this step`);
    void byBasis;
  } else {
    await writeFile(SHEET, toWorksheetCsv(matches));
    console.log(`wrote ${SHEET}`);
    console.log('\nNext: node scripts/repo-worksheet.mjs --apply --sheet data/enrichment/loops-worksheet.csv --out <proposal.json>');
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
