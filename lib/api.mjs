/**
 * The public read API (NH-60, docs/api-contract-day4.md). Pure functions, no network: query
 * parsing, limit and cursor validation, filtering, sorting, pagination and the JSON bodies. The
 * route handlers under app/api/projects only read data (lib/projects.ts, lib/votes.ts,
 * lib/discussion.mjs) and hand it to these.
 *
 * Envelope: `{items, next_cursor, meta}` (the near.social list shape). Errors:
 * `{error, message}` with `not_found` (404), `bad_request` (400) or `unavailable` (503).
 */

import { DEFAULT_ACCOUNT, KV_HOSTS } from './kv.mjs';
import { normalizeText } from './directory.mjs';
import { projectPageUrl } from './discussion.mjs';
import { COMMENT_PREFIX, policyUrl } from './comments.mjs';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const API_SORTS = /** @type {const} */ (['newest', 'votes', 'name']);
export const DEFAULT_API_SORT = 'newest';
const MAX_Q_CHARS = 200;
const MAX_OFFSET = 1_000_000;

export const PROJECT_PREFIX = 'project/';
export const VOTE_PREFIX = 'vote/';

/** Cache-Control per route (seconds). Matches the server-side cache of each reader. */
export const CACHE = {
  projects: 'public, s-maxage=60, stale-while-revalidate=300',
  votes: 'public, s-maxage=20, stale-while-revalidate=60',
  discussion: 'public, s-maxage=30, stale-while-revalidate=120',
  error: 'no-store',
};

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

/** Response headers for a JSON answer: CORS plus the route's Cache-Control. */
export function apiHeaders(cacheControl) {
  return { ...CORS_HEADERS, 'cache-control': cacheControl };
}

/** A request error with an HTTP status and one of the contract's error codes. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {'not_found' | 'bad_request' | 'unavailable'} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new ApiError(400, 'bad_request', message);
export const notFound = (message) => new ApiError(404, 'not_found', message);
export const unavailable = (message) => new ApiError(503, 'unavailable', message);

/** `{error, message}`. Never carries a stack or an upstream error text. */
export function errorBody(code, message) {
  return { error: code, message };
}

// ---------------------------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------------------------

/** First value of a param from URLSearchParams or a plain record; '' and missing are null. */
function param(params, name) {
  let v;
  if (params && typeof params.get === 'function') v = params.get(name);
  else if (params && typeof params === 'object') v = Array.isArray(params[name]) ? params[name][0] : params[name];
  return typeof v === 'string' && v !== '' ? v : null;
}

/** `?limit=`: an integer 1–100, default 50. Anything else throws `bad_request`. */
export function parseLimit(raw) {
  if (raw == null || raw === '') return DEFAULT_LIMIT;
  if (typeof raw !== 'string' || !/^[0-9]{1,4}$/.test(raw)) {
    throw badRequest(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  const n = Number(raw);
  if (n < 1 || n > MAX_LIMIT) throw badRequest(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  return n;
}

const B64URL_RE = /^[A-Za-z0-9_-]{1,2048}$/;

function toB64url(s) {
  return Buffer.from(s, 'utf8').toString('base64url');
}

/** Decode a base64url cursor, or throw `bad_request` unless it re-encodes to the same text. */
function fromB64url(raw) {
  if (typeof raw !== 'string' || !B64URL_RE.test(raw)) throw badRequest('cursor is not valid; pass next_cursor back verbatim');
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  if (toB64url(text) !== raw) throw badRequest('cursor is not valid; pass next_cursor back verbatim');
  return text;
}

/** Opaque cursor for an offset into a list this server builds. */
export function encodeCursor(offset) {
  return toB64url(`o:${offset}`);
}

/** `?cursor=` of a list this server builds -> offset (0 when absent). Garbage throws `bad_request`. */
export function decodeCursor(raw) {
  if (raw == null || raw === '') return 0;
  const m = /^o:(0|[1-9][0-9]{0,6})$/.exec(fromB64url(raw));
  if (!m || Number(m[1]) > MAX_OFFSET) throw badRequest('cursor is not valid; pass next_cursor back verbatim');
  return Number(m[1]);
}

/** Opaque cursor wrapping an upstream (near.social) cursor. */
export function encodeUpstreamCursor(upstream) {
  return toB64url(`s:${upstream}`);
}

/** `?cursor=` of the discussion route -> the near.social cursor (null when absent). */
export function decodeUpstreamCursor(raw) {
  if (raw == null || raw === '') return null;
  const text = fromB64url(raw);
  if (!text.startsWith('s:') || text.length < 3 || /[\u0000-\u001f]/.test(text)) {
    throw badRequest('cursor is not valid; pass next_cursor back verbatim');
  }
  return text.slice(2);
}

/** `?cursor=&limit=` for a list paged by offset. */
export function parsePage(params) {
  return { limit: parseLimit(param(params, 'limit')), offset: decodeCursor(param(params, 'cursor')) };
}

/**
 * `?track=&sort=&q=&cursor=&limit=` for `/api/projects`. An unknown sort, limit or cursor throws
 * `bad_request`; an unknown track simply matches nothing.
 */
export function parseProjectsQuery(params) {
  const sort = param(params, 'sort') ?? DEFAULT_API_SORT;
  if (!API_SORTS.includes(sort)) throw badRequest(`sort must be one of: ${API_SORTS.join(', ')}`);
  const rawQ = param(params, 'q');
  const q = rawQ ? rawQ.replace(/\s+/g, ' ').trim().slice(0, MAX_Q_CHARS) : '';
  return { track: param(params, 'track'), sort, q, ...parsePage(params) };
}

// ---------------------------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------------------------

/** Exact track slug; null keeps everything. */
export function filterTrack(items, track) {
  return track ? items.filter((it) => Array.isArray(it.tracks) && it.tracks.includes(track)) : items.slice();
}

/** Case- (and diacritic-) insensitive substring on name and description. */
export function searchProjects(items, q) {
  const needle = normalizeText(q);
  if (!needle) return items.slice();
  return items.filter((it) => normalizeText(it.name).includes(needle) || normalizeText(it.description).includes(needle));
}

function byNewest(a, b) {
  return (b.block_height ?? 0) - (a.block_height ?? 0) || byName(a, b);
}

function byName(a, b) {
  return a.name.localeCompare(b.name) || a.submission_id.localeCompare(b.submission_id);
}

/**
 * Sort a copy. `newest`: block height desc, then name. `votes`: count desc (null/missing = 0),
 * then newest. `name`: by name, then submission id.
 *
 * @param {Record<string, number> | null} [counts]
 */
export function sortProjects(items, sort, counts = null) {
  const out = items.slice();
  if (sort === 'votes') {
    const n = (it) => (counts && counts[it.submission_id]) || 0;
    out.sort((a, b) => n(b) - n(a) || byNewest(a, b));
  } else if (sort === 'name') {
    out.sort(byName);
  } else {
    out.sort(byNewest);
  }
  return out;
}

/** One page: `{items, next_cursor}`; next_cursor is null on the last page. */
export function paginate(items, offset, limit) {
  const page = items.slice(offset, offset + limit);
  const end = offset + page.length;
  return { items: page, next_cursor: end < items.length ? encodeCursor(end) : null };
}

/** ListingItem -> ProjectSummary: adds `votes` (null when the vote read failed) and `url`. */
export function toSummary(item, counts) {
  return {
    ...item,
    votes: counts ? counts[item.submission_id] ?? 0 : null,
    url: projectPageUrl(item.submission_id),
  };
}

/** The KV single-key URL for a project record, writer-scoped to nearhunt.near. */
export function recordUrl(submissionId, account = DEFAULT_ACCOUNT) {
  return `${KV_HOSTS.mainnet}/v0/latest/${account}/${account}/${PROJECT_PREFIX}${encodeURIComponent(submissionId)}`;
}

/** ListingItem -> Project: the summary plus `record_url`. `votes` is a count or null. */
export function toProject(item, votes) {
  return {
    ...item,
    votes: typeof votes === 'number' ? votes : null,
    url: projectPageUrl(item.submission_id),
    record_url: recordUrl(item.submission_id, item.account || DEFAULT_ACCOUNT),
  };
}

/**
 * The `/api/projects` body.
 *
 * @param {{items: object[], fetched_at: string, read_failing: boolean, account?: string}} list
 * @param {{counts: Record<string, number>, available: boolean}} votes
 * @param {{track: string|null, sort: string, q: string, limit: number, offset: number}} query
 */
export function projectsBody(list, votes, query) {
  const counts = votes && votes.available ? votes.counts : null;
  const matched = sortProjects(searchProjects(filterTrack(list.items, query.track), query.q), query.sort, counts);
  const page = paginate(matched, query.offset, query.limit);
  return {
    items: page.items.map((it) => toSummary(it, counts)),
    next_cursor: page.next_cursor,
    meta: {
      total: matched.length,
      fetched_at: list.fetched_at,
      stale: Boolean(list.read_failing),
      votes_available: Boolean(counts),
      source: { account: list.account || DEFAULT_ACCOUNT, prefix: PROJECT_PREFIX, network: 'mainnet' },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------------------------

/**
 * The `/api/projects/{id}/votes` body. `voters` is already latest-first
 * (`votesFor` in lib/votes.mjs); the order is re-applied here so the body never depends on it.
 *
 * @param {Array<{account_id: string, block_height: number}>} voters
 * @param {{account: string, network: string}} source
 * @param {{limit: number, offset: number}} page
 */
export function votesBody(voters, source, page) {
  const sorted = voters
    .map(({ account_id, block_height }) => ({ account_id, block_height }))
    .sort((a, b) => b.block_height - a.block_height || a.account_id.localeCompare(b.account_id));
  const p = paginate(sorted, page.offset, page.limit);
  return {
    items: p.items,
    next_cursor: p.next_cursor,
    meta: {
      total: sorted.length,
      source: { account: source.account, prefix: VOTE_PREFIX, network: source.network },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------------------------------------

/**
 * The `/api/projects/{id}/discussion` body (NH-44): comments on `nearhunt.near`, oldest first,
 * flat. A reply carries `reply_to` = `{author}/{id}` of the comment it answers; consumers nest
 * one level. Cursors are offsets into this list, like the other lists this server builds.
 *
 * @param {import('./comments.d.mts').Comment[]} comments oldest first, already hidden-filtered
 * @param {{account: string, network: string}} source
 * @param {{limit: number, offset: number}} page
 */
export function discussionBody(comments, source, page) {
  const all = comments.slice();
  const p = paginate(all, page.offset, page.limit);
  return {
    items: p.items.map((c) => ({
      key: c.key,
      id: c.id,
      ref: c.ref,
      author: c.author,
      text: c.text,
      truncated: c.truncated,
      created_at: c.created_at,
      block_height: c.block_height,
      reply_to: c.reply_to,
      url: c.url,
    })),
    next_cursor: p.next_cursor,
    meta: {
      total: all.length,
      source: { account: source.account, prefix: COMMENT_PREFIX, network: source.network },
      policy_url: policyUrl(),
    },
  };
}
