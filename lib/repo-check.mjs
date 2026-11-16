/**
 * Repository liveness checks for the enrichment proposal.
 *
 * A GitHub URL in a tweet is a claim, not proof the repository exists. This module answers
 * "does this public repo answer right now?" with `git ls-remote`, which needs no token, has no
 * hourly API quota, and fails for private or deleted repositories.
 *
 * One repository (NathanOyewole/sentinel) taught the difference between "not public" and "GitHub's
 * git endpoint refuses it": its page, raw README and REST metadata all served it while every clone
 * returned `403 Repository is disabled. Please ask the owner to check their account`. A gate that
 * only speaks git therefore called a live, public, README-bearing repository dead and told its
 * builder so eight times. So the git answer is the first word, not the only one: when git refuses,
 * the public REST metadata decides — `private:false` and `disabled:false` means the link resolves
 * for a reader in a browser, which is what the listing promises.
 *
 * `run` and `fetchJson` are injectable so tests never touch the network.
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

async function defaultFetchJson(url) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'near-hunt-repo-check' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Is this URL a public repository a reader can open?
 *
 * @param {string} url
 * @param {{run?: (url: string) => Promise<void>, fetchJson?: (url: string) => Promise<object>}} deps
 * @returns {Promise<boolean>}
 */
export async function repoIsPublic(url, { run = defaultRun, fetchJson = defaultFetchJson } = {}) {
  try {
    await run(url);
    return true;
  } catch {
    const slug = githubSlug(url);
    if (!slug) return false;
    try {
      const meta = await fetchJson(`https://api.github.com/repos/${slug}`);
      return meta?.private === false && meta?.disabled === false && Boolean(meta?.default_branch);
    } catch {
      return false;
    }
  }
}

/**
 * Check every URL, at most `concurrency` at a time.
 * @param {string[]} urls
 * @returns {Promise<Map<string, boolean>>} url -> reachable (true) / missing or private (false)
 */
export async function verifyRepos(urls, { run = defaultRun, fetchJson = defaultFetchJson, concurrency = 8 } = {}) {
  const unique = [...new Set(urls.filter(Boolean))];
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < unique.length) {
      const url = unique[next++];
      results.set(url, await repoIsPublic(url, { run, fetchJson }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return results;
}
