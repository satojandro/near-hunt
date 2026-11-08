/**
 * Repository liveness checks for the enrichment proposal.
 *
 * A GitHub URL in a tweet is a claim, not proof the repository exists. This module answers
 * "does this public repo answer right now?" with `git ls-remote`, which needs no token, has no
 * hourly API quota, and fails for private or deleted repositories.
 *
 * `run` is injectable so tests never touch the network.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** `https://github.com/Owner/Repo` -> `Owner/Repo`, or null for anything else. */
export function githubSlug(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase().replace(/^www\./, '') !== 'github.com') return null;
    const [owner, repo] = u.pathname.split('/').filter(Boolean);
    if (!owner || !repo) return null;
    return `${owner}/${repo.replace(/\.git$/, '')}`;
  } catch {
    return null;
  }
}

async function defaultRun(url) {
  await execFileAsync('git', ['ls-remote', '--exit-code', url], {
    timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

/**
 * Check every URL, at most `concurrency` at a time.
 * @param {string[]} urls
 * @returns {Promise<Map<string, boolean>>} url -> reachable (true) / missing or private (false)
 */
export async function verifyRepos(urls, { run = defaultRun, concurrency = 8 } = {}) {
  const unique = [...new Set(urls.filter(Boolean))];
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < unique.length) {
      const url = unique[next++];
      try {
        await run(url);
        results.set(url, true);
      } catch {
        results.set(url, false);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return results;
}
