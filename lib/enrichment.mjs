/**
 * Turning an X post (and the thread around it) into NEAR Hunt record fields.
 *
 * Pure functions only: no network, no clock. `scripts/enrich.mjs` fetches, caches and calls
 * these; `test/enrichment.test.mjs` pins the extraction rules.
 *
 * Design rule: enrichment records what the builder published, and nothing else. No repository
 * is ever guessed from a project name, no description is written by a model here, and every
 * field carries the URL it came from.
 */

import { mediaFromChain } from './media.mjs';
import { cueBefore, labelLink, linkIndex } from './link-label.mjs';

export const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
export const MAX_DESCRIPTION = 1000;

// Owners that are GitHub product pages, not repositories.
const RESERVED_OWNERS = new Set([
  'about', 'apps', 'collections', 'contact', 'customer-stories', 'enterprise', 'events',
  'explore', 'features', 'issues', 'join', 'login', 'marketplace', 'new', 'notifications',
  'orgs', 'pricing', 'pulls', 'search', 'security', 'settings', 'site', 'sponsors', 'topics',
  'trending', 'users',
]);

/** Post id from an x.com/twitter.com status URL, or null. */
export function tweetIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (!X_HOSTS.has(u.hostname.toLowerCase())) return null;
    const m = u.pathname.match(/\/status(?:es)?\/(\d{1,20})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Canonical web URL for a post id on the author's timeline, or null when the id is not a real
 * post id (browser-captured thread posts can lack one; a made-up URL is worse than none).
 */
export function postUrl(handle, id) {
  if (!/^\d{1,20}$/.test(String(id ?? ''))) return null;
  return `https://x.com/${handle || 'i'}/status/${id}`;
}

// X shortens long links in visible text: `github.com/Owner/Gide…`. What precedes the ellipsis is
// a prefix, not a repository name.
const TRUNCATED = /^(?:…|\.\.\.)/;

/**
 * `https://github.com/Owner/Repo/…` -> `https://github.com/Owner/Repo`, or null when the URL is
 * not a repository (a GitHub product page, an issue, a gist, a non-GitHub host).
 */
export function githubRepoFromUrl(url) {
  if (typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  // A GitHub Pages site names its repository in the hostname: `owner.github.io/repo` is always
  // served from `github.com/owner/repo` (that is how Pages resolves it), so no crawl is needed.
  // Builders link the demo far more often than the source: 57 of 229 captured posts on 12 Nov
  // 2026 linked a page and none linked `github.com` directly.
  const pages = host.match(/^([a-z0-9_.-]+)\.github\.io$/);
  if (pages && !RESERVED_OWNERS.has(pages[1])) {
    const [first] = u.pathname.split('/').filter(Boolean);
    // `owner.github.io` with no path is the owner's user-site repo, `owner.github.io`.
    const repo = first ?? `${pages[1]}.github.io`;
    return /^[A-Za-z0-9_.-]+$/.test(repo) ? `https://github.com/${pages[1]}/${repo}` : null;
  }
  if (host !== 'github.com') return null;
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  if (!owner || !repo) return null;
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return `https://github.com/${owner}/${repo.replace(/\.git$/, '')}`;
}

/**
 * Tweet text as a human-readable line: drop t.co shortlinks and leading @mentions, collapse
 * whitespace, unescape the common HTML entities X emits. No summarising, no truncation here.
 */
export function cleanTweetText(text) {
  if (typeof text !== 'string') return '';
  let s = text
    .replace(/https?:\/\/t\.co\/\w+/g, ' ')
    .replace(/^\s*(?:@[A-Za-z0-9_]{1,15}\s*)+/, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  // Removing a t.co link can leave the label that introduced it ("… Repo: ", "Demo: Code:").
  // Strip trailing labels only when they carry a separator, so "open source on GitHub" survives.
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/\s*\b(?:repo|repository|code|link|demo|github)\s*[:→]\s*$/i, '').trimEnd();
    if (next === s) break;
    s = next;
  }
  return s.replace(/[\s,;:–—-]+$/, '').trim();
}

/**
 * Every URL a tweet points at, from `entities.urls[].expanded_url` first (X expands t.co there)
 * and the visible text second. De-duplicated, order preserved.
 */
export function tweetUrls(tweet) {
  const out = [];
  for (const u of tweet?.entities?.urls ?? []) {
    const v = u?.expanded_url || u?.url;
    if (typeof v === 'string' && v) out.push(v);
  }
  const text = typeof tweet?.text === 'string' ? tweet.text : '';
  for (const m of text.matchAll(/https?:\/\/(?:t\.co|github\.com|[\w.-]+)\/[^\s)]+/g)) {
    if (/…|\.\.\.$/.test(m[0])) continue; // visibly truncated by X
    out.push(m[0]);
  }
  return [...new Set(out)];
}

/**
 * The author's own posts from root to focal. X's syndication payload embeds one `parent`; the
 * script follows the chain and passes it in order. Posts by other accounts are kept out of the
 * description and repo extraction — a reply from a stranger is not the builder's claim.
 *
 * @param {Array<object>} chain tweets, any order
 * @param {string} author screen name of the submitted post's author
 */
export function authorChain(chain, author) {
  const handle = String(author || '').toLowerCase();
  return (chain ?? []).filter(
    (t) => t && typeof t === 'object' && String(t.user?.screen_name || '').toLowerCase() === handle,
  );
}

/**
 * First repository named in a tweet's text, including X's link-card form (`GitHub - Owner/Repo`).
 * A name X cut short (`github.com/Owner/Gide…`) is skipped: it is a prefix, not a repository.
 */
export function repoFromText(text) {
  if (typeof text !== 'string') return null;
  for (const re of [
    /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/g,
    /GitHub\s*[-–]\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/g,
  ]) {
    for (const m of text.matchAll(re)) {
      if (TRUNCATED.test(text.slice(m.index + m[0].length))) continue;
      const repo = githubRepoFromUrl(`https://github.com/${m[1]}/${m[2].replace(/\.git$/, '')}`);
      if (repo) return repo;
    }
  }
  return null;
}

/**
 * Every distinct repository the author linked, in thread order. A tweet's URLs win over its text
 * because X expands t.co there; card titles and plain text are the fallback.
 *
 * @returns {Array<{repository_url: string, source_post_id: string, source_url: string, cue: boolean}>}
 */
export function reposFromChain(chain) {
  const out = [];
  const seen = new Set();
  for (const t of chain) {
    const found = [];
    for (const url of tweetUrls(t)) {
      const repo = githubRepoFromUrl(url);
      if (repo) found.push(repo);
    }
    if (found.length === 0) {
      const repo = repoFromText(t.text);
      if (repo) found.push(repo);
    }
    const cue = /\brepo(sitory)?\b/i.test(String(t.text || ''));
    for (const repo of found) {
      if (seen.has(repo)) continue;
      seen.add(repo);
      out.push({
        repository_url: repo,
        source_post_id: t.id_str,
        source_url: postUrl(t.user?.screen_name, t.id_str),
        cue,
      });
    }
  }
  return out;
}

/**
 * Which repository to publish. An explicit "repo/repository" cue wins; a single candidate is
 * unambiguous; several unrelated repos are not — the record keeps them as candidates and
 * `repository_url` stays null rather than picking one by guesswork.
 */
export function chooseRepo(candidates) {
  if (!candidates || candidates.length === 0) return null;
  const cued = candidates.find((c) => c.cue);
  if (cued) return { ...cued, ambiguous: false };
  if (candidates.length === 1) return { ...candidates[0], ambiguous: false };
  return { ...candidates[0], ambiguous: true, candidates: candidates.map((c) => c.repository_url) };
}

/** Convenience wrapper: the repo to publish, or a null with candidates attached. */
export function repoFromChain(chain) {
  const pick = chooseRepo(reposFromChain(chain));
  return pick ?? null;
}

/** Query parameters that only track the click; everything else in a query is kept. */
const TRACKING_PARAM = /^(utm_[a-z_]+|ref|si|feature|fbclid|gclid|igshid|ref_src|ref_url|s|t_src|sharedUserId)$/i;

/**
 * Non-GitHub, non-X destinations the author linked (a live demo, a docs site). Returned as
 * `{ url, source_post_id }`, de-duplicated by URL host+path.
 */
export function linksFromChain(chain) {
  const seen = new Set();
  const out = [];
  for (const t of chain) {
    for (const url of tweetUrls(t)) {
      let u;
      try {
        u = new URL(url);
      } catch {
        continue;
      }
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      if (host === 'github.com' || host === 't.co' || X_HOSTS.has(host) || host.endsWith('twimg.com')) continue;
      // Keep the query (a YouTube link is nothing without `?v=`); drop only tracking parameters.
      for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
      const search = u.searchParams.toString();
      const key = `${host}${u.pathname.replace(/\/$/, '')}${search ? `?${search}` : ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const path = search ? u.pathname : u.pathname.replace(/\/$/, '');
      const clean = `${u.protocol}//${u.hostname}${path}${search ? `?${search}` : ''}`;
      // NH-96 step 3: what the link is, from its host, the builder's own words, or its URL.
      const cue = cueBefore(t.text, linkIndex(t, url));
      out.push({ url: clean, source_post_id: t.id_str, ...labelLink(clean, { cue }) });
    }
  }
  return out;
}

/**
 * The builder's own pitch: the first author post in the chain with usable text (the root when
 * the chain is complete). Falls back to null — an honest "unknown", never an invented blurb.
 */
export function descriptionFromChain(chain) {
  for (const t of chain) {
    const text = cleanTweetText(t.text);
    if (text.length >= 20) {
      return {
        description: text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : text,
        source_url: postUrl(t.user?.screen_name, t.id_str),
        source_post_id: t.id_str,
      };
    }
  }
  return null;
}

/**
 * Everything enrichment would add to one project record, or a reason it adds nothing.
 *
 * @param {{submission_id: string, name: string, demo_url?: string|null}} project
 * @param {{chain: Array<object>, retrieved_at: string, method?: string}} input
 */
export function buildEnrichment(project, { chain, retrieved_at, method = 'x-thread' }) {
  const postId = tweetIdFromUrl(project?.demo_url);
  if (!postId) return { submission_id: project?.submission_id, status: 'not-an-x-post' };
  const focal = chain?.[chain.length - 1];
  const author = focal?.user?.screen_name;
  const own = authorChain(chain, author);
  if (own.length === 0) return { submission_id: project?.submission_id, status: 'no-author-posts', post_id: postId };

  const description = descriptionFromChain(own);
  const repo = repoFromChain(own);
  const links = linksFromChain(own);
  const media = mediaFromChain(own);
  const unambiguousRepo = repo && !repo.ambiguous ? repo.repository_url : null;
  if (!description && !unambiguousRepo && media.length === 0) {
    return {
      submission_id: project?.submission_id,
      status: repo?.ambiguous ? 'ambiguous-repository' : 'nothing-recoverable',
      post_id: postId,
      author,
      posts: own.length,
      repository_candidates: repo?.ambiguous ? repo.candidates : undefined,
    };
  }

  // A captured thread post without a real id is cited by the submitted post, which is where the
  // thread can be read.
  const submitted = postUrl(author, postId);
  const cite = (url) => url ?? submitted;
  const sources = [
    ...new Set(
      [
        description && cite(description.source_url),
        repo && cite(repo.source_url),
        ...links.map((l) => cite(postUrl(author, l.source_post_id))),
        ...media.map((m) => m.post_url),
      ].filter(Boolean),
    ),
  ];
  return {
    submission_id: project.submission_id,
    status: 'ok',
    post_id: postId,
    author,
    posts: own.length,
    description: description?.description ?? null,
    description_source: description ? cite(description.source_url) : null,
    repository_url: unambiguousRepo,
    repository_source: unambiguousRepo ? cite(repo.source_url) : null,
    repository_candidates: repo?.ambiguous ? repo.candidates : undefined,
    // Same rule as the sources: a captured post without a real id is cited by the submitted post.
    links: links.map((l) => ({ ...l, source_post_id: /^\d{1,20}$/.test(l.source_post_id) ? l.source_post_id : postId })),
    // NH-96: images and video posters from the builder's own posts, by URL (lib/media.mjs).
    media,
    enrichment: { method, sources, retrieved_at },
  };
}

/** Compact counts for the CLI summary. */
export function summarize(results) {
  const out = { projects: results.length, ok: 0, with_description: 0, with_repository: 0, with_links: 0, with_media: 0, by_status: {} };
  for (const r of results) {
    out.by_status[r.status] = (out.by_status[r.status] ?? 0) + 1;
    if (r.status !== 'ok') continue;
    out.ok++;
    if (r.description) out.with_description++;
    if (r.repository_url) out.with_repository++;
    if (r.links?.length) out.with_links++;
    if (r.media?.length) out.with_media++;
  }
  return out;
}
