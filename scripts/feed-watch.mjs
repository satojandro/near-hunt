// Periodic feed check for the scheduler. Runs the importer in dry-run mode and prints one line
// only when the feed has records the chain does not.
//
//   node scripts/feed-watch.mjs
//
// Read-only: the importer's dry run signs nothing. Empty stdout means "nothing new", which is what
// the cron job's no-agent watchdog mode uses to stay silent.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseImportOutput, pendingMessage } from '../lib/feed-watch.mjs';

const execFileAsync = promisify(execFile);
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const { stdout } = await execFileAsync(process.execPath, [join(repo, 'scripts', 'import.mjs')], {
    cwd: repo,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = parseImportOutput(stdout);
  if (!parsed) {
    console.log('NEAR Hunt feed check: could not parse the importer output.');
    process.exit(0);
  }
  const message = pendingMessage(parsed);
  if (message) console.log(message);
} catch (err) {
  const detail = String(err?.stderr || err?.message || err).split('\n').slice(-3).join(' ');
  console.log(`NEAR Hunt feed check failed: ${detail}`);
}
