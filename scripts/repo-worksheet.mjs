#!/usr/bin/env node
/**
 * The owner's repository worksheet.
 *
 *   node scripts/repo-worksheet.mjs            # write data/enrichment/repo-worksheet.csv
 *   node scripts/repo-worksheet.mjs --apply    # read the filled sheet, check each URL with
 *                                              # `git ls-remote`, write proposal-manual.json
 *
 * Read-only: reads mainnet records and the hackathon feed, writes local files, never signs. The
 * write is the usual importer run on the file `--apply` prints (dry run, then owner approval).
 * An existing worksheet is never overwritten without --force, so typed URLs are not lost.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { DEFAULT_ACCOUNT, readProjects } from '../lib/kv.mjs';
import { verifyRepos } from '../lib/repo-check.mjs';
import { summarize } from '../lib/enrichment.mjs';
import { applyWorksheet, filledRows, parseCsv, toCsv, worksheetRows } from '../lib/repo-worksheet.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SHEET = value('--sheet', 'data/enrichment/repo-worksheet.csv');
const PROPOSAL = value('--proposal', 'data/enrichment/proposal.json');
const OUT = value('--out', 'data/enrichment/proposal-manual.json');
const FEED_API = 'https://nearhackathon.com/api/projects';

async function readFeed() {
  const seen = new Map();
  let total = Infinity;
  let read = 0;
  for (let page = 1; read < total; page++) {
    const res = await fetch(`${FEED_API}?page=${page}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`feed returned ${res.status} on page ${page}`);
    const body = await res.json();
    total = body.total;
    if (!body.projects?.length) break;
    for (const f of body.projects) seen.set(f.id, f);
    read += body.projects.length;
    await new Promise((r) => setTimeout(r, 400));
  }
  return [...seen.values()];
}

async function write() {
  if (!args.includes('--force')) {
    try {
      await access(SHEET);
      console.error(`${SHEET} exists. Fill it in, or pass --force to regenerate it (typed URLs are lost).`);
      process.exit(1);
    } catch {
      // no sheet yet
    }
  }
  const proposal = JSON.parse(await readFile(PROPOSAL, 'utf8'));
  const rows = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  const projects = rows
    .filter((r) => r.value && typeof r.value === 'object')
    .map((r) => ({ ...r.value, submission_id: r.key.slice('project/'.length), on_chain: true }));
  const onChain = new Set(projects.map((p) => p.submission_id));
  for (const f of await readFeed()) {
    if (!onChain.has(f.id)) projects.push({ submission_id: f.id, name: f.project_name, demo_url: f.demo_url ?? null, on_chain: false });
  }
  const sheet = worksheetRows(projects, proposal.results);
  await writeFile(SHEET, toCsv(sheet));
  console.log(`projects: ${projects.length} (${onChain.size} on chain, ${projects.length - onChain.size} pending in the feed)`);
  console.log(`without a repository on chain or in ${PROPOSAL}: ${sheet.length}`);
  console.log(`  with candidates: ${sheet.filter((r) => r.candidates).length}; with a site to look at: ${sheet.filter((r) => !r.candidates && r.site_links).length}; X post only: ${sheet.filter((r) => !r.candidates && !r.site_links).length}`);
  console.log(`\nwrote ${SHEET}. Fill the repository_url column, then: node scripts/repo-worksheet.mjs --apply\n`);
}

async function apply() {
  const proposal = JSON.parse(await readFile(PROPOSAL, 'utf8'));
  const { entries, rejected } = filledRows(parseCsv(await readFile(SHEET, 'utf8')));
  console.log(`${SHEET}: ${entries.length} repository URL(s) filled in, ${rejected.length} rejected`);
  for (const r of rejected) console.log(`  rejected ${r.submission_id || '(no id)'}: ${r.value} — ${r.reason}`);
  if (entries.length === 0) return;
  const answered = await verifyRepos(entries.map((e) => e.repository_url));
  const retrievedAt = new Date().toISOString();
  const { results, applied, skipped } = applyWorksheet(proposal.results, entries, { answered, retrievedAt });
  for (const s of skipped) console.log(`  skipped ${s.submission_id}: ${s.reason}`);
  await writeFile(OUT, `${JSON.stringify({ ...proposal, generated_at: retrievedAt, summary: summarize(results), results }, null, 2)}\n`);
  console.log(`\napplied ${applied.length}, skipped ${skipped.length}. wrote ${OUT} (nothing written on chain)`);
  console.log(`Next, the dry run: node scripts/import.mjs --enrichment ${OUT}\n`);
}

(args.includes('--apply') ? apply() : write()).catch((err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
