/**
 * NH-96 step 3: say what each builder link is, without a model and without guessing.
 *
 * Order of evidence, strongest first:
 *  1. `host`   the host settles it (youtube.com is a video, nearblocks.io an explorer, a
 *              bitbucket.org/{owner}/{repo} path a repository candidate).
 *  2. `builder` the builder labelled it in their own post: "Demo: …", "Live: …", "Docs: …".
 *  3. `url`     the URL says so: a `demo.`/`app.` subdomain, a `/demo` or `/app` path.
 *  4. `default` nothing above applied: "website".
 * Every label carries its basis, so a reader (or the owner) can see how weak it is.
 * A repository host only becomes `repository` after `git ls-remote` answers (scripts/enrich.mjs).
 */

export const KINDS = ['repository', 'demo', 'website', 'video', 'docs', 'article', 'explorer', 'community'];

const HOST_KINDS = [
  [/^(?:m\.)?youtube\.com$|^youtu\.be$|^(?:www\.)?loom\.com$|^vimeo\.com$/, 'video'],
  [/^t\.me$|^discord\.(?:gg|com)$|^gov\.near\.org$|^forum\.near\.org$/, 'community'],
  [/(?:^|\.)nearblocks\.io$|(?:^|\.)etherscan\.io$|^pikespeak\.ai$|^explorer\.(?:testnet\.)?near\.org$|^testnet\.nearblocks\.io$/, 'explorer'],
  [/^medium\.com$|\.medium\.com$|^dev\.to$|^mirror\.xyz$|\.substack\.com$|^paragraph\.(?:xyz|com)$|\.hashnode\.dev$/, 'article'],
  [/^docs\.|\.gitbook\.io$|\.readthedocs\.io$/, 'docs'],
];

/** Git hosts whose `/{owner}/{repo}` URLs can be checked with `git ls-remote`. */
const GIT_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']);

/** `https://bitbucket.org/o/r/src/main` -> `https://bitbucket.org/o/r`; null if not a repo URL. */
export function gitRepoUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (u.protocol !== 'https:' || !GIT_HOSTS.has(host)) return null;
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return `https://${host}/${owner}/${repo.replace(/\.git$/, '')}`;
}

// Words a builder puts right before a link, mapped to a kind. Checked nearest-first.
const CUES = [
  [/\b(?:live\s+demo|demo|try\s+it(?:\s+out)?|try|live|app|dapp|play(?:\s+it)?|playground|launch\s+app|testnet\s+app)\b/i, 'demo'],
  [/\b(?:docs|documentation|guide|whitepaper|spec)\b/i, 'docs'],
  [/\b(?:video|watch|walkthrough|demo\s+video|recording)\b/i, 'video'],
  [/\b(?:blog|article|write-?up|thread|read\s+more)\b/i, 'article'],
  [/\b(?:website|site|landing(?:\s+page)?|home\s*page)\b/i, 'website'],
];

/**
 * The builder's own label for a link: the cue word closest before where the link appears in
 * the post text, at most 40 characters back, with nothing but separators in between.
 * @param {string} text  post text
 * @param {number} at    index where the link starts in `text`
 * @returns {string|null} a kind, or null when the builder gave none
 */
export function cueBefore(text, at) {
  if (typeof text !== 'string' || !Number.isInteger(at) || at <= 0) return null;
  let window = text.slice(Math.max(0, at - 40), at);
  window = window.split(/https?:\/\/\S+|\b[\w-]+\.(?:com|xyz|app|dev|io|me|be|org|ai|sh|site|fun|net)\b\S*/i).pop() ?? '';
  let best = null;
  for (const [re, kind] of CUES) {
    const all = [...window.matchAll(new RegExp(re.source, 'gi'))];
    const last = all.at(-1);
    if (last && (!best || last.index + last[0].length > best.end)) best = { kind, end: last.index + last[0].length };
  }
  // The cue must be the last words before the link: only ':', arrows, emoji, spaces and at most
  // one line break between them ("Live demo 👇⏎link" counts, "a demo.⏎link" does not).
  if (!best) return null;
  const gap = window.slice(best.end);
  const separatorsOnly = /^[\s:→>\-–—|()[\]\p{Extended_Pictographic}️]*$/u.test(gap);
  return separatorsOnly && (gap.match(/\n/g) ?? []).length <= 1 ? best.kind : null;
}

/**
 * Where a link appears in a post: by entity indices when X gave them, else by its display form
 * (host + path without scheme or `www.`, which is how thread captures show links).
 */
export function linkIndex(tweet, url) {
  const text = typeof tweet?.text === 'string' ? tweet.text : '';
  if (!text) return -1;
  for (const e of tweet?.entities?.urls ?? []) {
    if ((e?.expanded_url === url || e?.url === url) && Array.isArray(e.indices) && Number.isInteger(e.indices[0])) {
      // X counts code points; JS strings index UTF-16 units, so an emoji earlier in the post
      // would otherwise shift the position left.
      return Array.from(text).slice(0, e.indices[0]).join('').length;
    }
  }
  let u;
  try {
    u = new URL(url);
  } catch {
    return -1;
  }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname.replace(/\/$/, '');
  const lower = text.toLowerCase();
  for (const form of [`${host}${path}${u.search}`, `${host}${path}`, host]) {
    const i = lower.indexOf(form.toLowerCase());
    if (i >= 0) {
      // Prefer the scheme's start when the text includes it.
      const scheme = lower.lastIndexOf('http', i);
      return scheme >= 0 && /^https?:\/\/(?:www\.)?$/.test(lower.slice(scheme, i)) ? scheme : i;
    }
  }
  return -1;
}

/**
 * The kind of one link and why.
 * @param {string} url
 * @param {{ cue?: string|null }} [opts] the builder's cue from `cueBefore`
 * @returns {{ kind: string, kind_basis: 'host'|'builder'|'url'|'default', repo?: string }}
 */
export function labelLink(url, { cue = null } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'website', kind_basis: 'default' };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const repo = gitRepoUrl(url);
  // A git host is only a candidate here; enrich.mjs promotes it after `git ls-remote` answers.
  if (repo) return { kind: 'website', kind_basis: 'host', repo };
  for (const [re, kind] of HOST_KINDS) if (re.test(host)) return { kind, kind_basis: 'host' };
  if (cue && KINDS.includes(cue) && cue !== 'repository') return { kind: cue, kind_basis: 'builder' };
  if (/^(?:demo|app|play|try|testnet)[.-]/.test(host) || /(?:^|[.-])demo(?:[.-]|$)/.test(host.split('.')[0]) || /^\/(?:demo|app|play|try)(?:[/.]|$)/i.test(u.pathname)) {
    return { kind: 'demo', kind_basis: 'url' };
  }
  if (/^\/docs?(?:\/|$)/i.test(u.pathname)) return { kind: 'docs', kind_basis: 'url' };
  return { kind: 'website', kind_basis: 'default' };
}

/** Display label for a kind (Links card). */
export function kindLabel(kind) {
  return {
    repository: 'Repository', demo: 'Demo', website: 'Website', video: 'Video', docs: 'Docs',
    article: 'Article', explorer: 'On-chain', community: 'Community',
  }[kind] ?? 'Link';
}

/**
 * Put each link's last check on it, and settle repository candidates, in a proposal's results.
 * Pure: the caller supplies the probe rows and the `git ls-remote` answers.
 *
 * - `check: { verdict, http_status, checked_at }` from the probe of that exact URL (step 2);
 *   a link with no probe row gets no `check`. `gone` links are kept, never dropped.
 * - A git-host link whose repo answered `git ls-remote` becomes `kind: 'repository'`; when the
 *   record has no `repository_url`, and exactly one such repo answered, it is proposed as the
 *   record's repository with the post that linked it as `repository_source`.
 *
 * @param {Array<object>} results proposal rows (`status: 'ok'` rows are touched)
 * @param {{ probes: Map<string, object>, repos: Map<string, boolean>, verifiedAt: string }} input
 * @returns {{ checked: number, repositories_promoted: number }}
 */
export function applyLinkChecks(results, { probes, repos, verifiedAt }) {
  let checked = 0;
  let promoted = 0;
  for (const r of results) {
    if (r?.status !== 'ok' || !Array.isArray(r.links)) continue;
    const answered = [];
    r.links = r.links.map((l) => {
      const { repo, ...link } = l;
      if (repo) {
        link.kind = 'repository';
        link.kind_basis = 'host';
        if (repos.get(repo) === true) answered.push({ repo, source_post_id: link.source_post_id });
      }
      const p = probes.get(link.url);
      if (p) {
        link.check = { verdict: p.verdict, http_status: p.http_status ?? null, checked_at: p.checked_at };
        checked++;
      }
      return link;
    });
    const unique = [...new Set(answered.map((a) => a.repo))];
    if (!r.repository_url && unique.length === 1) {
      const a = answered[0];
      r.repository_url = a.repo;
      r.repository_source = r.author && /^\d{1,20}$/.test(a.source_post_id ?? '')
        ? `https://x.com/${r.author}/status/${a.source_post_id}`
        : r.enrichment?.sources?.[0] ?? null;
      r.repository_verified = true;
      r.repository_verified_at = verifiedAt;
      promoted++;
    }
  }
  return { checked, repositories_promoted: promoted };
}
