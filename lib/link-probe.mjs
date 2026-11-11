/**
 * NH-96 step 2: visit a builder's link once and record what answered.
 *
 * Read-only. One GET per link (redirects followed by hand, each hop checked), at most
 * MAX_BYTES of the body read, HTML only parsed for `<title>`, `og:image` and the GitHub
 * repositories it links (`repos`, NH-96d: lib/page-repos.mjs decides whether one is the project's).
 * Nothing here decides what a link *is*; labelling is step 3. `probeLink` takes a fetch so tests
 * need no network.
 */
import { reposInHtml } from './page-repos.mjs';

export const MAX_REDIRECTS = 5;
export const MAX_BYTES = 512 * 1024;
export const TIMEOUT_MS = 15_000;
export const USER_AGENT = 'Mozilla/5.0 (compatible; nearhunt-linkcheck/1.0; +https://nearhunt.xyz)';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the HTML entities that show up in titles (named basics plus numeric). */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s, max) => {
  const t = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Attributes of one tag as a lower-cased-name map. */
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return out;
}

/** An absolute https URL resolved against `base`, else null. */
export function resolveHttps(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(decodeEntities(value.trim()), base);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * `<title>` (falling back to og:title) and og:image (falling back to twitter:image) from an
 * HTML document. Relative image URLs are resolved against `baseUrl`; non-https images are dropped.
 * @returns {{ title: string|null, og_image: string|null }}
 */
export function parseHead(html, baseUrl) {
  const head = String(html ?? '').slice(0, MAX_BYTES);
  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? clean(titleMatch[1], 200) : null;
  const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? '').toLowerCase();
    if (key && a.content != null && !(key in meta)) meta[key] = a.content;
  }
  if (!title && meta['og:title']) title = clean(meta['og:title'], 200);
  const og_image = resolveHttps(meta['og:image'] ?? meta['og:image:url'] ?? meta['og:image:secure_url'] ?? meta['twitter:image'] ?? meta['twitter:image:src'], baseUrl);
  return { title, og_image };
}

/**
 * Whether a URL may be visited at all: https, a DNS name (no IP literal, no localhost or
 * single-label host), default port. Builder-supplied URLs must not make the operator's machine
 * call its own network.
 * @returns {string|null} a reason it is refused, or null when it may be visited
 */
export function refuseReason(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'not a URL';
  }
  if (u.protocol !== 'https:') return 'not https';
  if (u.username || u.password) return 'credentials in URL';
  if (u.port && u.port !== '443') return 'non-default port';
  const h = u.hostname.toLowerCase();
  if (h.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return 'IP address';
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return 'local host name';
  return null;
}

/**
 * X shortens long URLs in visible text and some builders paste that: `github.com/Owner/Gide…`.
 * enrichment.mjs strips the ellipsis, so the stored URL may be a truncated path.
 */
export function looksTruncated(url) {
  return /(…|\.\.\.|%E2%80%A6)$/i.test(String(url));
}

async function readCapped(res, max = MAX_BYTES) {
  if (!res.body || typeof res.body.getReader !== 'function') return (await res.text()).slice(0, max);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks).subarray(0, max));
}

/**
 * Visit one URL. Result `status`:
 *  - `ok`          final response 2xx
 *  - `http-error`  final response 4xx/5xx (`http_status` says which)
 *  - `unreachable` DNS, TLS, timeout or connection failure (`error` says which)
 *  - `refused`     not visited: see `error` (refuseReason, or a redirect to such a URL)
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export async function probeLink(url, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const row = { url, status: null, http_status: null, final_url: null, redirects: 0, content_type: null, title: null, og_image: null };
  const reason = refuseReason(url);
  if (reason) return { ...row, status: 'refused', error: reason };

  let current = url;
  try {
    for (let hop = 0; ; hop++) {
      const res = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        res.body?.cancel?.().catch?.(() => {});
        if (hop >= MAX_REDIRECTS) return { ...row, status: 'unreachable', redirects: hop, final_url: current, error: 'too many redirects' };
        let next;
        try {
          next = new URL(res.headers.get('location'), current).href;
        } catch {
          return { ...row, status: 'unreachable', redirects: hop, final_url: current, error: 'bad redirect' };
        }
        const why = refuseReason(next);
        if (why) return { ...row, status: 'refused', redirects: hop + 1, final_url: next, error: `redirect: ${why}` };
        current = next;
        continue;
      }
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() || null;
      const out = { ...row, http_status: res.status, final_url: current, redirects: hop, content_type: type };
      if (res.status < 200 || res.status >= 300) {
        res.body?.cancel?.().catch?.(() => {});
        return { ...out, status: 'http-error' };
      }
      if (type === 'text/html' || type === 'application/xhtml+xml') {
        const html = await readCapped(res);
        Object.assign(out, parseHead(html, current), { repos: reposInHtml(html) });
      } else {
        res.body?.cancel?.().catch?.(() => {});
      }
      return { ...out, status: 'ok' };
    }
  } catch (err) {
    const cause = err?.cause?.code ?? err?.cause?.message ?? err?.name ?? 'error';
    return { ...row, status: 'unreachable', final_url: current, error: String(err?.name === 'TimeoutError' ? 'timeout' : cause).slice(0, 200) };
  }
}

/**
 * What a probe result says about the link, for people:
 *  - `live`        it answered 2xx
 *  - `gone`        404/410, or the host does not resolve: the link is broken as published
 *  - `unverified`  we could not tell: crawler blocked (401/403/429, a google.com/sorry page),
 *                  server error (5xx, may be a sleeping free-tier host), timeout, or refused
 * Only `gone` is evidence that a link is broken. `unverified` must never be reported as dead.
 */
export function verdictOf(r) {
  if (r.status === 'ok') {
    try {
      if (new URL(r.final_url).hostname === 'www.google.com' && new URL(r.final_url).pathname.startsWith('/sorry')) return 'unverified';
    } catch {
      // fall through
    }
    return 'live';
  }
  if (r.status === 'http-error' && (r.http_status === 404 || r.http_status === 410)) return 'gone';
  if (r.status === 'unreachable' && /ENOTFOUND|EAI_NONAME/.test(r.error ?? '')) return 'gone';
  return 'unverified';
}

/**
 * The links one record asks us to check, de-duplicated: every `links` entry, plus `demo_url`
 * when it is not an X post (X posts are read through the syndication endpoint instead).
 * @returns {Array<{ url: string, field: 'links'|'demo_url', truncated: boolean }>}
 */
export function linksToCheck(project, isXPost) {
  const out = [];
  const seen = new Set();
  const add = (url, field) => {
    if (typeof url !== 'string' || !url.trim() || seen.has(url)) return;
    seen.add(url);
    out.push({ url, field, truncated: looksTruncated(url) });
  };
  if (project?.demo_url && !isXPost(project.demo_url)) add(project.demo_url, 'demo_url');
  for (const l of Array.isArray(project?.links) ? project.links : []) add(typeof l === 'string' ? l : l?.url, 'links');
  return out;
}

/** Counts for the CLI and the proposal header. */
export function summarizeProbes(rows) {
  const by_status = {};
  const by_verdict = {};
  let with_title = 0;
  let with_og_image = 0;
  let redirected_host = 0;
  for (const r of rows) {
    by_status[r.status] = (by_status[r.status] ?? 0) + 1;
    const v = r.verdict ?? verdictOf(r);
    by_verdict[v] = (by_verdict[v] ?? 0) + 1;
    if (r.title) with_title++;
    if (r.og_image) with_og_image++;
    try {
      if (r.final_url && new URL(r.final_url).hostname !== new URL(r.url).hostname) redirected_host++;
    } catch {
      // unparseable: counted under its status only
    }
  }
  return { links: rows.length, by_verdict, by_status, with_title, with_og_image, redirected_to_other_host: redirected_host };
}
