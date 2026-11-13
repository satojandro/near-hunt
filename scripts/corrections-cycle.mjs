#!/usr/bin/env node
/**
 * Sign one corrections batch — builder issues — under the owner's second, narrower authorization
 * (14 Nov 2026): **links and repository only**, every change traceable to an issue and corroborated.
 *
 *   node scripts/corrections-cycle.mjs            # dry run: what the guard would sign, and why not
 *   node scripts/corrections-cycle.mjs --sign     # sign it, comment + close the issues it landed
 *
 * The file is `data/enrichment/corrections-issues.json` (same shape as an enrichment proposal, plus
 * `issue`, `repository_source`, `repository_verified`, `repository_verified_at` per result). It is
 * per-batch: overwrite it. Writing it is judgement work — done by an agent reading the issues
 * (see docs/runbooks/new-submissions.md, "Applying builder correction issues"); *signing* it is not:
 * `signoffCorrections` in lib/auto-sign.mjs decides, and it refuses the whole batch on anything
 * outside links + repository, any uncorroborated repository, any link the issue did not ask for,
 * any create, any tombstone, any description/media change, or a batch above the caps.
 *
 * Description and media text is never signed here. A correction of that kind waits for the owner.
 */
import { execFile } from 'node:child_process';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_ACCOUNT, readProjects } from '../lib/kv.mjs';
import { planImport, toBatches } from '../lib/import-plan.mjs';
import {
  describeCorrections, insertPlanEntry, lastPlanNumber, planEntryCorrections, signoffCorrections,
} from '../lib/auto-sign.mjs';

const execFileAsync = promisify(execFile);
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIGN = process.argv.includes('--sign');
const FILE = (() => {
  const i = process.argv.indexOf('--file');
  return i > -1 ? process.argv[i + 1] : 'data/enrichment/corrections-issues.json';
})();
const GIT_AUTHOR = ['-c', 'user.name=crypto-builder', '-c', 'user.email=avbetancourt@protonmail.com'];
// The same lock the import cycle takes: import and corrections must never sign at the same time,
// because both compute a plan from the same chain state and would otherwise overwrite each other's
// assumptions. A lock whose pid is gone is stale and gets taken over.
const LOCK = join(repo, '.git', 'near-hunt-auto-sign.lock');
const KEY_OK = /permission:\s*FunctionCall\(nearhunt\.near,\s*__fastdata_kv\)/;
const FEED_API = 'https://nearhackathon.com/api/projects';

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
      writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), cycle: 'corrections' }));
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

const run = async (bin, args, timeout = 900_000) => {
  const { stdout } = await execFileAsync(bin, args, { cwd: repo, timeout, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
};
const node = (script, args = [], timeout = 900_000) => run(process.execPath, [join(repo, 'scripts', script), ...args], timeout);
const git = (args) => run('git', args, 300_000);

/** The feed, deduped on the source id — the importer computes its plan from this, so the guard must too. */
async function readFeed() {
  const seen = new Map();
  let total = Infinity;
  for (let page = 1, read = 0; read < total; page++) {
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

const txsOf = (text) => {
  const m = text.match(/^txs:\s*(.+)$/m);
  return m ? m[1].split(',').map((t) => t.trim()).filter(Boolean) : [];
};
const verifiedOf = (text) => text.match(/verified:\s*(\d+\/\d+)/)?.[1] ?? 'unknown';

async function main() {
  // The lock is taken BEFORE the batch file is read, and the file is snapshotted before anything is
  // computed. Both exist because of a real bug: an in-flight run that reads the file, then lets the
  // importer re-read it minutes later, signs whatever is on disk at that moment — so a rewritten
  // batch (a new set of records) gets signed while the guard approved the previous one. What the
  // guard judges must be the bytes that are signed, or the approval means nothing.
  const lock = takeLock();
  if (!lock.ok) {
    const held = lock.held?.pid ? ` (pid ${lock.held.pid}, since ${lock.held.at}, ${lock.held.cycle ?? 'cycle'})` : '';
    console.log(`corrections cycle: another cycle holds the signing lock${held} — nothing done.`);
    return;
  }
  const finish = (lines) => {
    console.log(lines.join('\n'));
    releaseLock();
  };

  let proposal;
  try {
    proposal = JSON.parse(await readFile(join(repo, FILE), 'utf8'));
  } catch (err) {
    finish([`corrections cycle: cannot read ${FILE} — ${String(err?.message ?? err)}`]);
    return;
  }
  const results = (proposal.results ?? []).filter((r) => r?.status === 'ok');
  if (!results.length) {
    finish(['corrections cycle: no corrections entries — nothing to do.']);
    return;
  }

  // The signed bytes: a snapshot nobody can edit while this run is in flight.
  const batchPath = join(repo, '.git', 'corrections-signing.json');
  await writeFile(batchPath, JSON.stringify(proposal, null, 2));

  const corrections = new Map(results.map((r) => [r.submission_id, r]));
  const numbersOf = (r) => (r.issue_numbers ?? (r.issue_number ? [r.issue_number] : [])).filter(Boolean);
  const issues = [...new Set(results.flatMap(numbersOf))];

  const rows = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  const prevByKey = new Map(rows.map((r) => [r.key, r.value]));
  const enrichment = Object.fromEntries(corrections);
  const nowIso = new Date().toISOString();

  // Mirror the importer exactly: same feed, same proposal, --refresh-enriched, then drop the creates
  // that --updates-only would drop. What the guard judges is then what the importer writes.
  const feed = await readFeed();
  const full = planImport({ submissions: feed, existing: rows, nowIso, enrichment, refreshEnriched: true });
  const plan = { ...full, create: [] };
  const transactions = toBatches(plan.update).length;
  const verdict = signoffCorrections(plan, { prevByKey, transactions, corrections });

  const lines = [
    `NEAR Hunt corrections cycle — ${nowIso}`,
    `${results.length} correction(s) for issue(s) ${issues.map((n) => `#${n}`).join(', ') || '(none named)'}`,
    `chain ${rows.length} rows · plan touches ${plan.update.length} record(s), ${transactions} transaction(s)`,
    describeCorrections(verdict),
  ];
  for (const w of plan.update) {
    lines.push(`  ~ ${w.key.split('/')[1].slice(0, 8)} — ${w.changes.join(', ')}`);
  }
  for (const b of verdict.blockers.slice(0, 8)) lines.push(`  · ${b.code}: ${b.message}`);
  if (verdict.blockers.length > 8) lines.push(`  · … ${verdict.blockers.length - 8} more blocker(s)`);

  if (!verdict.ok || plan.update.length === 0) {
    lines.push(verdict.ok ? 'Nothing to write: the chain already matches these corrections.' : 'Nothing was signed.');
    finish(lines);
    return;
  }
  if (!SIGN) {
    lines.push('Dry run. Sign with: node scripts/corrections-cycle.mjs --sign');
    finish(lines);
    return;
  }

  const keyCheck = await node('import.mjs', ['--check-key'], 120_000);
  if (!KEY_OK.test(keyCheck)) {
    finish([...lines, 'auto-sign refused: the resolved key is not FunctionCall(nearhunt.near, __fastdata_kv)', 'Nothing was signed.']);
    return;
  }

  const executed = await node('import.mjs', ['--enrichment', batchPath, '--updates-only', '--refresh-enriched', '--execute', '--yes'], 900_000);
  const txs = txsOf(executed);
  const verified = verifiedOf(executed);
  // The importer re-reads the file it is given; the snapshot makes that the same bytes the guard
  // judged. Belt and braces: if the numbers disagree anyway, say so instead of recording a lie.
  const wroteKeys = Number(executed.match(/would write:\s*(\d+) keys/)?.[1] ?? NaN);
  const keyMismatch = Number.isFinite(wroteKeys) && wroteKeys !== plan.update.length;
  const again = await node('import.mjs', ['--enrichment', batchPath, '--updates-only', '--refresh-enriched'], 300_000);
  const residue = /Nothing to write/.test(again) ? 'new 0, changed 0' : (again.match(/new:\s*\d+[\s\S]{0,60}?changed:\s*\d+/)?.[0]?.replace(/\s+/g, ' ') ?? 'changed (see live)');
  const schemaOut = await node('validate-schema.mjs', [], 600_000);
  const valid = schemaOut.match(/valid:\s*(\d+)/)?.[1] ?? '?';
  const invalid = schemaOut.match(/invalid:\s*(\d+)/)?.[1] ?? '0';
  let tests = 'not run';
  try {
    const out = await run('npm', ['test'], 600_000);
    const pass = out.match(/ℹ pass (\d+)/)?.[1];
    const fail = out.match(/ℹ fail (\d+)/)?.[1];
    if (pass !== undefined) tests = `${pass}/${Number(pass) + Number(fail ?? 0)}`;
  } catch (err) {
    tests = `failed (${String(err?.message ?? err).split('\n')[0].slice(0, 60)})`;
  }

  // Read the corrected records back from the indexer, not from the importer's word.
  const after = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
  const byKey = new Map(after.map((r) => [r.key, r.value]));
  const corrected = plan.update.map((w) => byKey.get(w.key)).filter(Boolean);
  const readback = {
    rows: after.filter((r) => r.value).length,
    repository: `${corrected.filter((v) => v.repository_url).length}/${corrected.length}`,
    links: `${corrected.filter((v) => (v.links ?? []).length).length}/${corrected.length}`,
    valid: `${valid}/${Number(valid) + Number(invalid)}`,
    tests,
  };

  lines.push(`txs: ${txs.join(', ') || '(none parsed)'} — verified ${verified}`, `residue: ${residue}`, `validate ${readback.valid} · test ${tests}`, `read back: repository ${readback.repository}, links ${readback.links}`);
  if (keyMismatch) {
    lines.push(`! the importer wrote ${wroteKeys} key(s) but the guard approved ${plan.update.length}: the batch file changed under this run, so treat this batch's record with suspicion`);
  }

  // Answer the builders on the issues that landed. This is the part they actually see.
  for (const entry of results) {
    const entryIssues = numbersOf(entry);
    if (!entryIssues.length) continue;
    const key = `project/${entry.submission_id}`;
    if (!plan.update.some((w) => w.key === key)) continue;
    const url = `https://nearhunt.xyz/p/${entry.submission_id}`;
    const what = [entry.repository_url && 'the repository', entry.links?.length && 'the links'].filter(Boolean).join(' and ');
    const body = `Landed on chain — ${what || 'the correction'} is now live at ${url} (tx \`${txs[0] ?? 'see commit'}\`). ` +
      'The listing reads from `nearhunt.near` on mainnet; the page picks it up within about a minute.';
    for (const n of entryIssues) {
      try {
        await run('gh', ['issue', 'comment', String(n), '--body', body], 120_000);
        await run('gh', ['issue', 'close', String(n), '--reason', 'completed'], 120_000);
        lines.push(`  ✓ #${n} answered and closed`);
      } catch (err) {
        lines.push(`  ! #${n} landed but the issue could not be updated: ${String(err?.message ?? err).split('\n')[0].slice(0, 80)}`);
      }
    }
  }

  // Record it: a numbered PLAN entry, then the corrections file + docs in one commit and push.
  try {
    const planPath = join(repo, 'docs/PLAN.md');
    const markdown = await readFile(planPath, 'utf8');
    const entry = planEntryCorrections({
      number: lastPlanNumber(markdown) + 1,
      date: nowIso.slice(0, 10),
      stats: verdict.stats,
      issues,
      txs,
      verified,
      readback,
    });
    await writeFile(planPath, insertPlanEntry(markdown, entry));
    await git(['add', FILE, 'docs/PLAN.md']);
    await git([
      ...GIT_AUTHOR, 'commit', '-q', '-m',
      `data(corrections, auto): ${verdict.stats.update} record(s) from issue(s) ${issues.map((n) => `#${n}`).join(', ') || '(unnamed)'}\n\n` +
        'Signed by the issues cycle under the owner\'s second authorization (14 Nov 2026):\n' +
        'links and repository only, each corroborated and traceable to its issue. No\n' +
        'description or media text was signed unattended.\n\n' +
        `txs: ${txs.join(', ')}\nverified: ${verified}\nresidue: ${residue}\n` +
        `validate:schema ${readback.valid}; npm test ${tests}`,
    ]);
    await git(['push', 'origin', 'main']);
    lines.push('committed and pushed');
  } catch (err) {
    lines.push(`! the write landed but recording it failed: ${String(err?.stderr ?? err?.message ?? err).split('\n').slice(-2).join(' ')}`);
  }

  console.log(lines.join('\n'));
  releaseLock();
}

main().catch((err) => {
  releaseLock();
  console.log(`NEAR Hunt corrections cycle failed: ${String(err?.stderr || err?.message || err).split('\n').slice(-3).join(' ')}`);
  process.exitCode = 0;
});
