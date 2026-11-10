#!/usr/bin/env node
/**
 * The scheduled enrichment cycle (docs/runbooks/new-submissions.md steps 2–5), for a cron job.
 *
 *   node scripts/enrich-cycle.mjs            # capture replies → enrich → duplicates → dry run
 *   node scripts/enrich-cycle.mjs --force    # print a report even when nothing is pending
 *
 * Read-only: it fetches public X pages and the hackathon feed, runs `git ls-remote`, and writes
 * only files under data/enrichment/. It never signs and never writes on chain — the import it
 * ends with is the importer's dry run, and a mainnet write still needs the owner's approval of
 * those exact numbers (AGENTS.md §1).
 *
 * Output is one short report, or nothing at all when the chain already matches the feed: an
 * empty stdout is what a scheduled job delivers silently.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_ACCOUNT, readProjects } from '../lib/kv.mjs';
import { parseImportOutput } from '../lib/feed-watch.mjs';

const execFileAsync = promisify(execFile);
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const FEED_API = 'https://nearhackathon.com/api/projects';
const PROPOSAL = 'data/enrichment/proposal.json';

const run = async (script, args = [], timeout = 1_800_000) => {
  const { stdout } = await execFileAsync(process.execPath, [join(repo, 'scripts', script), ...args], {
    cwd: repo,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
};

/** The feed, deduped on the source id (it grows mid-read). */
async function readFeed() {
  const seen = new Map();
  let total = Infinity;
  let read = 0;
  for (let page = 1; read < total; page++) {
    const res = await fetch(`${FEED_API}?page=${page}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; nearhunt-enrich/1.0)', accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
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

async function main() {
  const steps = [];
  steps.push(await run('capture-threads.mjs', ['--gaps-only', '--include-pending']));
  steps.push(await run('enrich.mjs', ['--threads', 'data/enrichment/threads.json']));
  steps.push(await run('enrich.mjs', ['--duplicates', '--proposal', PROPOSAL]));
  const dryRun = await run('import.mjs', ['--enrichment', PROPOSAL], 300_000);

  const parsed = parseImportOutput(dryRun);
  const proposal = JSON.parse(await readFile(join(repo, PROPOSAL), 'utf8'));
  const byId = new Map((proposal.results ?? []).map((r) => [r.submission_id, r]));
  const rows = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  const onChain = new Set(rows.filter((r) => r.value).map((r) => r.key.slice('project/'.length)));
  const pending = (await readFeed()).filter((f) => !onChain.has(f.id));

  const covered = (pred) => pending.filter((f) => pred(byId.get(f.id) ?? {})).length;
  const withMedia = covered((r) => (r.media ?? []).length > 0);
  const withRepo = covered((r) => Boolean(r.repository_url));
  const withDescription = covered((r) => Boolean(r.description));
  const ok = (proposal.results ?? []).filter((r) => r.status === 'ok');
  const noMedia = ok.filter((r) => !(r.media ?? []).length).length;
  const noRepo = ok.filter((r) => !r.repository_url).length;

  const writes = dryRun.match(/would write:\s*(\d+) keys,\s*(\d+) bytes,\s*(\d+) transaction/);
  const linkStats = steps[1].match(/links:\s*(\d+) carry a check;\s*(\d+) repository link\(s\) promoted/);
  let linkVerdicts = { live: 0, gone: 0, unverified: 0 };
  try {
    const links = JSON.parse(await readFile(join(repo, 'data/enrichment/links.json'), 'utf8'));
    for (const row of links.rows ?? []) linkVerdicts[row.verdict] = (linkVerdicts[row.verdict] ?? 0) + 1;
  } catch {
    // no link report yet
  }

  if (!parsed) {
    console.log('NEAR Hunt enrich cycle: could not parse the importer dry run. Check the run by hand.');
    return;
  }
  if (!FORCE && parsed.create + parsed.changed === 0) return; // silent tick: nothing to approve

  const lines = [
    `NEAR Hunt enrich cycle — ${new Date().toISOString()}`,
    `chain ${parsed.chain ?? '?'} · feed ${parsed.feed ?? '?'} · new ${parsed.create} · changed ${parsed.changed}`,
  ];
  if (pending.length) {
    lines.push(`pending records carry: description ${withDescription}/${pending.length}, media ${withMedia}/${pending.length}, repository ${withRepo}/${pending.length}`);
  }
  if (writes) lines.push(`dry run: would write ${writes[1]} keys, ${writes[2]} bytes, ${writes[3]} transaction(s)`);
  lines.push(`proposal gaps: ${noMedia} ok record(s) with no media, ${noRepo} with no repository`);
  if (linkStats) lines.push(`links: ${linkStats[1]} checked (${linkVerdicts.live ?? 0} live, ${linkVerdicts.gone ?? 0} gone, ${linkVerdicts.unverified ?? 0} unverified), ${linkStats[2]} repository link(s) promoted`);
  lines.push('Approve the numbers above, then: node scripts/import.mjs --enrichment data/enrichment/proposal.json --execute --yes');
  console.log(lines.join('\n'));
}

main().catch((err) => {
  // A scheduled job reports the failure instead of dying silently.
  console.log(`NEAR Hunt enrich cycle failed: ${String(err?.stderr || err?.message || err).split('\n').slice(-3).join(' ')}`);
  process.exitCode = 0;
});
