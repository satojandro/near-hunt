#!/usr/bin/env node
/**
 * The scheduled NEAR Hunt cycle (docs/runbooks/new-submissions.md steps 2–6), for a cron job.
 *
 *   node scripts/enrich-cycle.mjs            # capture replies → enrich → duplicates → dry run
 *   node scripts/enrich-cycle.mjs --force    # print a report even when nothing is pending
 *   node scripts/enrich-cycle.mjs --sign     # the same, then sign a batch that passes the guard
 *
 * Read-only unless `--sign` is passed. The plain run fetches public X pages and the hackathon feed,
 * runs `git ls-remote`, and writes only files under data/enrichment/. Its last step is the
 * importer's dry run, so a mainnet write still needs the owner's approval of those exact numbers
 * (AGENTS.md §1).
 *
 * With `--sign`, the owner's standing authorization (14 Nov 2026) covers one kind of write: **new
 * submissions and null-fills**. The plan is recomputed here with `planImport` and handed to
 * `signoff` (lib/auto-sign.mjs), which refuses on any overwrite of an existing value, any
 * tombstone, any `social_post`, any enrichment without sources, any link without a measured
 * verdict, or a batch above the key/transaction cap. On refusal nothing is signed: the batch stays
 * ready and the report names the guard that tripped, so the owner can approve by hand.
 *
 * Output is one short report, or nothing at all when the chain already matches the feed: an
 * empty stdout is what a scheduled job delivers silently.
 */
import { execFile } from 'node:child_process';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_ACCOUNT, readProjects } from '../lib/kv.mjs';
import { parseImportOutput } from '../lib/feed-watch.mjs';
import { planImport, toBatches } from '../lib/import-plan.mjs';
import { describeSignoff, insertPlanEntry, lastPlanNumber, planEntry, signoff } from '../lib/auto-sign.mjs';

const execFileAsync = promisify(execFile);
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const SIGN = process.argv.includes('--sign');
const FEED_API = 'https://nearhackathon.com/api/projects';
const PROPOSAL = 'data/enrichment/proposal.json';
const LOCK = join(repo, '.git', 'near-hunt-auto-sign.lock');
const GIT_AUTHOR = ['-c', 'user.name=crypto-builder', '-c', 'user.email=avbetancourt@protonmail.com'];
const KEY_OK = /permission:\s*FunctionCall\(nearhunt\.near,\s*__fastdata_kv\)/;

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

// ---------------------------------------------------------------------------
// One writer at a time
//
// The hazard that costs real keys is two cycles signing from two proposals. The lock is a file in
// .git/ so it never lands in a commit; a lock whose pid is gone is stale and gets taken over.
// ---------------------------------------------------------------------------

const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function takeLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK, 'wx');
      writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      closeSync(fd);
      return { ok: true };
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      let held = null;
      try {
        held = JSON.parse(readFileSync(LOCK, 'utf8'));
      } catch {
        // unreadable lock — treated as stale, once
      }
      if (held?.pid && pidAlive(held.pid)) return { ok: false, held };
      try {
        unlinkSync(LOCK);
      } catch {
        return { ok: false, held };
      }
    }
  }
  return { ok: false, held: null };
}

const releaseLock = () => {
  try {
    unlinkSync(LOCK);
  } catch {
    // already gone
  }
};

const git = async (args) => {
  const { stdout } = await execFileAsync('git', args, { cwd: repo, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
};

// ---------------------------------------------------------------------------
// Signing stage
// ---------------------------------------------------------------------------

const verifiedOf = (text) => {
  const m = text.match(/verified:\s*(\d+)\/(\d+)/);
  return m ? `${m[1]}/${m[2]}` : 'unknown';
};

const txsOf = (text) => {
  const m = text.match(/^txs:\s*(.+)$/m);
  return m ? m[1].split(',').map((t) => t.trim()).filter(Boolean) : [];
};

/** What the batch actually put on chain, read back from the indexer — not the importer's word. */
async function readbackOf(keys) {
  const rows = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  const live = rows.filter((r) => r.value);
  const byKey = new Map(live.map((r) => [r.key, r.value]));
  const written = keys.map((k) => byKey.get(k)).filter(Boolean);
  const count = (pred) => `${written.filter(pred).length}/${keys.length}`;
  return {
    rows: live.length,
    description: count((v) => Boolean(v.description)),
    media: count((v) => (v.media ?? []).length > 0),
    links: count((v) => (v.links ?? []).length > 0),
    repository: count((v) => Boolean(v.repository_url)),
  };
}

/**
 * Sign one batch if the guard allows it, then verify, validate, test, record and push — all in the
 * same run, so an unattended write is never left undocumented. Returns the report lines.
 */
async function signBatch({ proposal, rows }) {
  const lock = takeLock();
  if (!lock.ok) {
    const held = lock.held?.pid ? ` (pid ${lock.held.pid}, since ${lock.held.at})` : '';
    return [`auto-sign skipped: another cycle holds the signing lock${held}`];
  }
  try {
    const nowIso = new Date().toISOString();
    const enrichment = {};
    for (const item of proposal.results ?? []) if (item?.status === 'ok') enrichment[item.submission_id] = item;

    // The object the guard approves is the object the importer writes: same planner, same inputs.
    const feedSubmissions = await readFeed();
    const plan = planImport({ submissions: feedSubmissions, existing: rows, nowIso, enrichment });
    const prevByKey = new Map(rows.map((r) => [r.key, r.value]));
    const transactions = toBatches([...plan.create, ...plan.update]).length;

    const verdict = signoff(plan, { prevByKey, transactions });
    if (!verdict.ok) {
      const detail = verdict.blockers.slice(0, 5).map((b) => `  · ${b.code}: ${b.message}`);
      if (verdict.blockers.length > 5) detail.push(`  · … ${verdict.blockers.length - 5} more blocker(s)`);
      return [
        describeSignoff(verdict),
        ...detail,
        'Nothing was signed. Approve by hand: node scripts/import.mjs --enrichment data/enrichment/proposal.json --execute --yes',
      ];
    }

    // The key must still be the scoped one. A full-access key is a different decision, not this one.
    const keyCheck = await run('import.mjs', ['--check-key'], 120_000);
    if (!KEY_OK.test(keyCheck)) {
      return [
        describeSignoff(verdict),
        'auto-sign refused: the resolved key is not FunctionCall(nearhunt.near, __fastdata_kv)',
        keyCheck.trim().split('\n').slice(-3).join('\n'),
        'Nothing was signed.',
      ];
    }

    const executed = await run('import.mjs', ['--enrichment', PROPOSAL, '--execute', '--yes'], 900_000);
    const txs = txsOf(executed);
    const verified = verifiedOf(executed);
    const [sent, total] = verified.split('/').map(Number);

    const again = parseImportOutput(await run('import.mjs', ['--enrichment', PROPOSAL], 300_000));
    const schemaOut = await run('validate-schema.mjs', [], 600_000);
    const validLine = schemaOut.match(/valid:\s*(\d+)/)?.[1] ?? '?';
    const invalidLine = schemaOut.match(/invalid:\s*(\d+)/)?.[1] ?? '0';
    let tests = 'not run';
    try {
      const { stdout } = await execFileAsync('npm', ['test'], { cwd: repo, timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
      const pass = stdout.match(/ℹ pass (\d+)/)?.[1];
      const fail = stdout.match(/ℹ fail (\d+)/)?.[1];
      if (pass !== undefined) tests = `${pass}/${Number(pass) + Number(fail ?? 0)}`;
    } catch (err) {
      tests = `failed (${String(err?.message ?? err).split('\n')[0].slice(0, 80)})`;
    }

    const readback = await readbackOf(plan.create.map((w) => w.key));
    const lines = [
      describeSignoff(verdict),
      `${txs.length ? txs.join(', ') : 'no tx hash parsed'} — verified ${verified}`,
      `re-run: new ${again?.create ?? '?'} · changed ${again?.changed ?? '?'} · unchanged ${again?.unchanged ?? '?'}`,
      `validate:schema ${validLine} valid, ${invalidLine} invalid · npm test ${tests}`,
      `read back: ${readback.rows} rows; new records description ${readback.description}, media ${readback.media}, links ${readback.links}, repository ${readback.repository}`,
    ];
    if (!Number.isFinite(sent) || sent !== total) {
      lines.push(`! only ${verified} keys read back — treat the rest as a subset re-run next cycle, never retry the whole batch`);
    }
    if (invalidLine !== '0') lines.push(`! ${invalidLine} record(s) fail the schema — reported, not retried`);

    // Record it in the same run: the numbered entry human batches get, then data + docs, one push.
    try {
      const planPath = join(repo, 'docs/PLAN.md');
      const markdown = await readFile(planPath, 'utf8');
      const entry = planEntry({
        number: lastPlanNumber(markdown) + 1,
        date: nowIso.slice(0, 10),
        stats: verdict.stats,
        txs,
        verified,
        feed: `chain ${rows.length} → ${readback.rows}`,
        readback: { ...readback, valid: `${validLine}/${Number(validLine) + Number(invalidLine)}`, tests },
      });
      await writeFile(planPath, insertPlanEntry(markdown, entry));
      await git(['add', 'data/enrichment', 'docs/PLAN.md']);
      await git([
        ...GIT_AUTHOR, 'commit', '-q', '-m',
        `data(auto batch): ${verdict.stats.create} new + ${verdict.stats.update} null-fill, ${verdict.stats.keys} keys on mainnet\n\n` +
          "Signed by the scheduled cycle under the owner's standing authorization: creates and\n" +
          'null-fills only (lib/auto-sign.mjs guard passed, no existing value replaced).\n\n' +
          `txs: ${txs.join(', ')}\nverified: ${verified}\n` +
          `re-run: new ${again?.create ?? '?'}, changed ${again?.changed ?? '?'}\n` +
          `validate:schema ${validLine} valid, ${invalidLine} invalid; npm test ${tests}`,
      ]);
      await git(['push', 'origin', 'main']);
      lines.push('committed and pushed');
    } catch (err) {
      lines.push(`! the write landed but recording it failed: ${String(err?.stderr ?? err?.message ?? err).split('\n').slice(-2).join(' ')}`);
    }

    return lines;
  } finally {
    releaseLock();
  }
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

  if (SIGN) {
    lines.push(...(await signBatch({ proposal, rows })));
  } else {
    lines.push('Approve the numbers above, then: node scripts/import.mjs --enrichment data/enrichment/proposal.json --execute --yes');
  }
  console.log(lines.join('\n'));
}

main().catch((err) => {
  // A scheduled job reports the failure instead of dying silently.
  console.log(`NEAR Hunt enrich cycle failed: ${String(err?.stderr || err?.message || err).split('\n').slice(-3).join(' ')}`);
  process.exitCode = 0;
});
