/**
 * NH-96d: a repository the builder links from their own demo site.
 *
 * The X thread is not the only place a builder publishes their repository: the demo page they
 * posted often links it ("GitHub" in the footer). `lib/link-probe.mjs` already downloads that page
 * for its title, so the links cost no extra request.
 *
 * A link on a page is a weaker claim than a link in the builder's own post, because the page may
 * not be theirs at all (a record that links `near.social` would inherit whatever repository
 * somebody posted there). So a page link alone is never published. It needs one of:
 *
 *  - `pages-owner`            the page is `{owner}.github.io` and the repository belongs to `{owner}`;
 *  - `readme-links-back`      the repository's README links the page's host (a two-way link);
 *  - `builder-post-candidate` the builder's own X posts already named this repository among
 *                             several, and the page says which one.
 *
 * Anything else stays in `repository_candidates` for a person to look at. Everything here is pure;
 * `fetchReadme` takes a fetch so tests need no network.
 */
import { githubRepoFromUrl } from './enrichment.mjs';

/** Link kinds whose page can be the project's own site. */
export const PAGE_KINDS = new Set(['demo', 'website', 'docs']);
export const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README'];
export const MAX_README_BYTES = 256 * 1024;
/** A page listing more repositories than this is a directory or a feed, not a project site. */
export const MAX_REPOS_PER_PAGE = 20;

const key = (repoUrl) => String(repoUrl).toLowerCase();

/** Lower-cased host of a URL, or null. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Every distinct GitHub repository linked in an HTML document, in document order. Reserved
 * GitHub paths (`/features`, `/sponsors`, …) are dropped by `githubRepoFromUrl`.
 * @returns {string[]} canonical `https://github.com/{owner}/{repo}` URLs
 */
export function reposInHtml(html) {
  const out = [];
  const seen = new Set();
  for (const m of String(html ?? '').matchAll(/https?:\/\/(?:www\.)?github\.com\/[^\s"'<>)\\]+/gi)) {
    const repo = githubRepoFromUrl(m[0].replace(/&amp;.*$/, ''));
    if (!repo || seen.has(key(repo))) continue;
    seen.add(key(repo));
    out.push(repo);
    if (out.length > MAX_REPOS_PER_PAGE) break;
  }
  return out;
}

/** Whether `pageUrl` is the GitHub Pages site of the account that owns `repoUrl`. */
export function pagesOwnerMatches(pageUrl, repoUrl) {
  const host = hostOf(pageUrl);
  const owner = hostOf(repoUrl) === 'github.com' ? new URL(repoUrl).pathname.split('/')[1] : null;
  if (!host || !owner || !host.endsWith('.github.io')) return false;
  return host.slice(0, -'.github.io'.length) === owner.toLowerCase();
}

/**
 * Whether a README links the page's host. The whole host is compared (`myapp.vercel.app`, never
 * `vercel.app`), and it must not run on into a longer name (`myapp.vercel.app.evil.io`).
 */
export function readmeLinksBack(readme, pageUrl) {
  const host = hostOf(pageUrl);
  if (!host || typeof readme !== 'string') return false;
  const text = readme.toLowerCase();
  for (let i = text.indexOf(host); i >= 0; i = text.indexOf(host, i + 1)) {
    const before = text[i - 1];
    const after = text[i + host.length];
    if (!(before && /[a-z0-9.-]/.test(before)) && !(after && /[a-z0-9.-]/.test(after))) return true;
  }
  return false;
}

/** The pages of one proposal row that may be read for a repository link. */
export function eligiblePages(result, probes) {
  const out = [];
  for (const l of Array.isArray(result?.links) ? result.links : []) {
    if (!PAGE_KINDS.has(l?.kind)) continue;
    const p = probes.get(l.url);
    if (!p || p.verdict !== 'live' || !Array.isArray(p.repos) || p.repos.length === 0) continue;
    // A page that redirected to another host is not the page the builder posted.
    if (p.final_url && hostOf(p.final_url) !== hostOf(l.url)) continue;
    // A page that lists many repositories is a directory or a feed.
    if (p.repos.length > MAX_REPOS_PER_PAGE) continue;
    out.push({ url: l.url, repos: p.repos });
  }
  return out;
}

/**
 * The repositories whose README is needed to settle the rows: page-linked, on a record with no
 * repository, and not already settled by the page's host or the builder's own posts.
 * @returns {string[]}
 */
export function readmesNeeded(results, probes) {
  const out = new Set();
  for (const r of results) {
    if (r?.status !== 'ok' || r.repository_url) continue;
    const named = new Set((r.repository_candidates ?? []).map(key));
    for (const page of eligiblePages(r, probes)) {
      for (const repo of page.repos) {
        if (!pagesOwnerMatches(page.url, repo) && !named.has(key(repo))) out.add(repo);
      }
    }
  }
  return [...out];
}

/**
 * Settle page-linked repositories in a proposal's results. Pure: the caller supplies the probe
 * rows (with `repos`), the READMEs it fetched and the `git ls-remote` answers.
 *
 * A record with no repository gets one when exactly one page-linked repository is corroborated
 * (see the file header) and answered `git ls-remote`. `repository_source` is the page that links
 * it, and that page joins `enrichment.sources`. Page-linked repositories that are not
 * corroborated, or several that are, are added to `repository_candidates` and nothing is chosen.
 *
 * @param {Array<object>} results proposal rows (`status: 'ok'` rows without a repository are touched)
 * @param {{ probes: Map<string, object>, readmes?: Map<string, string|null>, repos?: Map<string, boolean>, verifiedAt: string }} input
 * @returns {{ pages: number, found: number, promoted: number, candidates: number }}
 */
export function applyPageRepos(results, { probes, readmes = new Map(), repos = new Map(), verifiedAt }) {
  const stats = { pages: 0, found: 0, promoted: 0, candidates: 0 };
  for (const r of results) {
    if (r?.status !== 'ok' || r.repository_url) continue;
    const pages = eligiblePages(r, probes);
    if (pages.length === 0) continue;
    stats.pages += pages.length;
    const named = new Set((r.repository_candidates ?? []).map(key));

    /** @type {Map<string, {repo: string, page: string, basis: string[]}>} */
    const found = new Map();
    for (const page of pages) {
      for (const repo of page.repos) {
        const basis = [];
        if (pagesOwnerMatches(page.url, repo)) basis.push('pages-owner');
        if (readmeLinksBack(readmes.get(repo) ?? null, page.url)) basis.push('readme-links-back');
        if (named.has(key(repo))) basis.push('builder-post-candidate');
        const prev = found.get(key(repo));
        if (!prev || basis.length > prev.basis.length) found.set(key(repo), { repo, page: page.url, basis });
      }
    }
    stats.found += found.size;

    const corroborated = [...found.values()].filter((f) => f.basis.length > 0 && repos.get(f.repo) === true);
    if (corroborated.length === 1) {
      const pick = corroborated[0];
      r.repository_url = pick.repo;
      r.repository_source = pick.page;
      r.repository_basis = pick.basis;
      r.repository_verified = true;
      r.repository_verified_at = verifiedAt;
      delete r.repository_candidates;
      if (r.enrichment) r.enrichment.sources = [...new Set([...(r.enrichment.sources ?? []), pick.page])];
      stats.promoted++;
      continue;
    }
    const all = [...new Set([...(r.repository_candidates ?? []), ...[...found.values()].map((f) => f.repo)])];
    if (all.length) {
      r.repository_candidates = all;
      stats.candidates++;
    }
  }
  return stats;
}

/**
 * A repository's README from its default branch, or null when none of the usual names answers.
 * One small GET per name tried; no API, no token.
 * @param {string} repoUrl `https://github.com/{owner}/{repo}`
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<string|null>}
 */
export async function fetchReadme(repoUrl, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const repo = githubRepoFromUrl(repoUrl);
  if (!repo) return null;
  const [, owner, name] = new URL(repo).pathname.split('/');
  for (const file of README_NAMES) {
    try {
      const res = await fetchImpl(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/${file}`, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; nearhunt-enrich/1.0; +https://nearhunt.xyz)' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.text()).slice(0, MAX_README_BYTES);
      res.body?.cancel?.().catch?.(() => {});
    } catch {
      // try the next name; an unreachable README is "no corroboration", never an error
    }
  }
  return null;
}
