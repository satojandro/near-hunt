/**
 * The one reader that walks the FastData KV API for the project listing (NH-122).
 *
 * Why not `readProjects()` for this: `readLatest` in lib/kv.mjs paginates without retrying, and on
 * the request path a single slow page failed the whole walk. Measured in production on 14 Nov
 * (Vercel runtime logs, 18:25–18:33 UTC): six walks aborted at the 8 s `AbortSignal`, in cdg1,
 * arn1, bom1, syd1 and fra1, each one failing all seven cached chunks at once and turning the
 * "indexer is slow" banner on. With ~18 regions each walking nine 300 KB pages every two minutes,
 * the site was asking the same question dozens of times a minute and blaming the indexer for the
 * one answer that arrived late.
 *
 * This module walks once, for the cron route (`app/api/cron/refresh-projects`), retries a page
 * instead of failing the walk, and waits 15 s a page rather than 8 s. The rows it returns are
 * turned into the listing and stored by lib/projects-store.ts; every page then reads that copy.
 *
 * Pure apart from `fetch`/`AbortSignal`, so the walk can be unit-tested with a `fetchImpl`
 * (test/refresh-projects.test.mjs).
 */

import { createHash } from 'node:crypto';
import { DEFAULT_ACCOUNT, KV_HOSTS, fastnearAuthHeaders, parseKvJson } from './kv.mjs';
import { isFreshnessRecord, snapshotKey } from './snapshot.mjs';

/** Storage prefix for project records on `nearhunt.near` (docs/PLAN.md, schema/README.md). */
export const PROJECT_KEY_PREFIX = 'project/';

/**
 * The walk's policy.
 *
 * `limit` is 200 because the API clamps anything larger to 200 rows a page (measured 14 Nov:
 * `limit` 300, 1000 and 2000 all returned 200 rows), so the listing is nine pages at today's
 * 1,680 records and the walk is necessarily sequential — `page_token` is opaque and has to come
 * from the page before it. `attemptsPerPage` 2 turns one slow page into one extra request instead
 * of a failed walk; `perPageTimeoutMs` 15 s is ~35x the 0.4 s a page measures from a healthy
 * network, so it is a stall detector rather than a budget.
 *
 * `walkBudgetMs` is the budget: the whole walk, retries and delays included, gives up after 50 s.
 * Without it the per-page limits allow ~270 s (9 pages x 2 attempts x 15 s), and the cron route's
 * `maxDuration` is 60 s, so a slow-but-answering indexer had the function killed by the platform
 * before the route could log why or answer 502. 50 s leaves the route ~10 s for the store writes.
 */
export const REFRESH = Object.freeze({
  limit: 200,
  attemptsPerPage: 2,
  perPageTimeoutMs: 15_000,
  retryDelayMs: 300,
  walkBudgetMs: 50_000,
  /** A guard against a `page_token` loop, not an expected ceiling (nine pages today). */
  maxPages: 60,
});

/**
 * Where the listing lives between walks, and how old a copy may be before it is labelled.
 *
 * Two keys, deliberately. The heavy one holds the ~1.2 MB of items and is written only when the
 * row set actually changes (a few times a day, when an import batch lands); the marker is ~120
 * bytes and is written on every successful walk, so "when did we last see the chain" costs one
 * small Redis read instead of a 314 KB write a minute.
 */
export const PROJECTS_SNAPSHOT_KEY = snapshotKey('projects');
export const PROJECTS_MARKER_KEY = snapshotKey('projects-read-at');

/**
 * How long one server instance may serve its in-memory copy before re-asking the store. The
 * walker runs every minute, so this is the smallest value that keeps an instance within one walk
 * of the chain without a Redis round trip per request.
 */
export const PROJECTS_MEMORY_TTL_MS = 60_000;

/**
 * Age past which the copy is shown with the "indexer is slow" banner. Three walk intervals: a
 * single missed minute is normal (a walk that lands at 60 s, plus a deploy or a cold start), two
 * in a row is not, and the banner must not appear over a copy a visitor would call current.
 */
export const PROJECTS_STALE_AFTER_MS = 180_000;

/**
 * How long, per instance, a failed request-path walk stops the next one when there is no copy to
 * serve. A page render asks for the listing several times (route, metadata, components); without a
 * pause each of those, and every visitor after them, would start another nine-page walk that can
 * only fail, all against an indexer that is already struggling. Five seconds is longer than one
 * render and short enough that a recovered indexer is picked up promptly. (Was
 * `PROJECTS_RETRY_BACKOFF_MS` in lib/projects.ts before NH-122; restored.)
 */
export const PROJECTS_RETRY_BACKOFF_MS = 5_000;

/**
 * Whether a request-path walk is still cooling down after a failure.
 *
 * @param {object} opts
 * @param {number} opts.lastFailedAt epoch ms of this instance's last failed live walk (0 = never)
 * @param {number} opts.now epoch ms
 * @returns {boolean}
 */
export function liveWalkCoolingDown({ lastFailedAt, now }) {
  return lastFailedAt > 0 && now - lastFailedAt < PROJECTS_RETRY_BACKOFF_MS;
}

/** The stored items plus the time they were read. */
export function isProjectsSnapshot(value) {
  return isFreshnessRecord(value, (items) => Array.isArray(items)) && typeof value.account === 'string';
}

/**
 * The marker: when the listing was last read successfully, what it hashed to, and how many rows
 * were in it. `digest` is what lets the walker skip the 314 KB write, `rows` is for the log line.
 */
export function isProjectsMarker(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = /** @type {any} */ (value);
  if (typeof v.fetched_at !== 'string' || Number.isNaN(new Date(v.fetched_at).getTime())) return false;
  return typeof v.digest === 'string' && typeof v.rows === 'number';
}

/**
 * What identifies the listing's content: the rows in the order the API returns them, as the
 * listing carries them. Two walks that see the same records hash the same, so the stored copy is
 * only rewritten when something was actually written to chain.
 *
 * @param {Array<object>} items
 * @returns {string} e.g. "sha256:3f2a…"
 */
export function listingDigest(items) {
  return `sha256:${createHash('sha256').update(JSON.stringify(items)).digest('hex')}`;
}

/**
 * The copy to serve, from the heavy stored items plus the marker written by the last good walk.
 *
 * `fetched_at` is the marker's time when it is the newer of the two: an unchanged byte-for-byte
 * listing read from chain a minute ago *is* current as of a minute ago, and the heavy value's own
 * `fetched_at` can be hours old because the write is skipped when nothing changed. Falling back to
 * the copy's own time keeps this working for a value written before the marker existed.
 *
 * @param {{items: Array<object>, account: string, fetched_at: string} | null} copy
 * @param {{fetched_at: string} | null} marker
 * @returns {{items: Array<object>, account: string, fetched_at: string} | null}
 */
export function resolveProjectsSnapshot(copy, marker) {
  if (!copy) return null;
  const times = [copy.fetched_at, marker?.fetched_at]
    .map((t) => (typeof t === 'string' ? new Date(t).getTime() : Number.NaN))
    .filter((t) => Number.isFinite(t));
  const fetched_at = times.length > 0 ? new Date(Math.max(...times)).toISOString() : copy.fetched_at;
  const resolved = { items: copy.items, account: copy.account, fetched_at };
  // Carried so an instance can later tell "same rows, newer walk" from "new rows" by the marker alone.
  if (typeof copy.digest === 'string') resolved.digest = copy.digest;
  return resolved;
}

/**
 * What the marker says about the copy already in memory, without downloading the heavy value.
 *
 * The walker moves the marker's `fetched_at` every minute even when nothing changed, so comparing
 * times alone would re-download the ~685 KB copy on every instance every minute. The digest is what
 * says whether the rows changed:
 *   - marker not newer than memory -> the memory copy as it is;
 *   - same digest, newer marker -> the memory copy with the marker's `fetched_at` (same rows, read
 *     again more recently);
 *   - anything else (no memory, no marker, different or unknown digest) -> null: read the copy.
 *
 * @param {{items: Array<object>, account: string, fetched_at: string, digest?: string} | null} memory
 * @param {{fetched_at: string, digest: string} | null} marker
 * @returns {{items: Array<object>, account: string, fetched_at: string, digest?: string} | null}
 */
export function advanceFromMarker(memory, marker) {
  if (!memory || !marker) return null;
  const markerAt = new Date(marker.fetched_at).getTime();
  if (!Number.isFinite(markerAt)) return null;
  const memoryAt = new Date(memory.fetched_at).getTime();
  if (Number.isFinite(memoryAt) && markerAt <= memoryAt) return memory;
  if (typeof memory.digest === 'string' && memory.digest === marker.digest) {
    return { ...memory, fetched_at: new Date(markerAt).toISOString() };
  }
  return null;
}

/**
 * Whether a request should walk the KV API itself even though a copy is in memory.
 *
 * Only when the store did not answer with a marker on the last check — no store configured, store
 * unreachable, or no walker has written one — because then nothing else will ever refresh this
 * instance's copy. With a working store the walker owns freshness and an old copy is labelled, not
 * re-walked per request. At most one attempt per `PROJECTS_MEMORY_TTL_MS` per instance, so a down
 * indexer is not walked once per visitor.
 *
 * @param {object} opts
 * @param {{fetched_at: string} | null} opts.snapshot the copy in memory
 * @param {boolean} opts.storeAnswered the last store check returned a marker
 * @param {number} opts.lastAttemptAt epoch ms of this instance's last live walk (0 = never)
 * @param {number} opts.now epoch ms
 * @returns {boolean}
 */
export function liveRefreshDue({ snapshot, storeAnswered, lastAttemptAt, now }) {
  if (!snapshot || storeAnswered) return false;
  if (now - lastAttemptAt < PROJECTS_MEMORY_TTL_MS) return false;
  const readAt = new Date(snapshot.fetched_at).getTime();
  return !Number.isFinite(readAt) || now - readAt >= PROJECTS_MEMORY_TTL_MS;
}

/**
 * Every latest `project/` row written by `account`, following page tokens, with one retry per page.
 *
 * Returns raw rows (tombstones included) so `toListing` stays the single place that decides what a
 * usable record is. Rows from another writer are dropped even if the scoped endpoint returns them
 * (AGENTS.md §3: only rows `nearhunt.near` wrote are data).
 *
 * @param {object} [opts]
 * @param {string} [opts.account]
 * @param {'mainnet'|'testnet'} [opts.network]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {Partial<typeof REFRESH>} [opts.limits] overrides, for the request-path fallback
 * @returns {Promise<{entries: Array<object>, pages: number, ms: number, account: string, network: string}>}
 */
export async function walkProjects({
  account = DEFAULT_ACCOUNT,
  network = 'mainnet',
  fetchImpl = fetch,
  limits = {},
} = {}) {
  const host = KV_HOSTS[network];
  if (!host) throw new Error(`unknown network: ${network}`);
  if (!account) throw new Error('account is required');
  const cfg = { ...REFRESH, ...limits };
  const url = `${host}/v0/latest/${account}/${account}`;
  const started = Date.now();
  const deadline = started + cfg.walkBudgetMs;

  const entries = [];
  let pageToken = null;
  let pages = 0;
  do {
    const body = /** @type {Record<string, unknown>} */ ({ limit: cfg.limit, key_prefix: PROJECT_KEY_PREFIX });
    if (pageToken) body.page_token = pageToken;
    const page = await readPage({ url, body, pageIndex: pages, fetchImpl, cfg, deadline });
    entries.push(...page.entries);
    pageToken = page.pageToken;
    pages += 1;
    if (pageToken && pages >= cfg.maxPages) {
      throw new Error(`KV walk stopped after ${pages} pages with a page token still open`);
    }
  } while (pageToken);

  return {
    entries: entries.filter(
      (e) => e && e.predecessor_id === account && typeof e.key === 'string' && e.key.startsWith(PROJECT_KEY_PREFIX),
    ),
    pages,
    ms: Date.now() - started,
    account,
    network,
  };
}

/**
 * One page, retried.
 *
 * A 4xx other than a timeout is retried too: a walk that fails costs the whole listing, and one
 * extra request a minute is cheaper than that. The error names the page number so a log line says
 * where the walk died.
 *
 * Every attempt is also cut to what is left of the walk's budget (`deadline`), and a retry is not
 * started once the budget is spent, so the walk fails by itself, with a message, before the
 * platform kills the function.
 */
async function readPage({ url, body, pageIndex, fetchImpl, cfg, deadline }) {
  let lastError = null;
  for (let attempt = 1; attempt <= cfg.attemptsPerPage; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const why = lastError instanceof Error ? ` (last error: ${lastError.message})` : '';
      throw new Error(`KV walk ran out of its ${cfg.walkBudgetMs} ms budget at page ${pageIndex + 1}${why}`);
    }
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...fastnearAuthHeaders() },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(cfg.perPageTimeoutMs, remaining)),
      });
      if (!res.ok) throw new Error(`KV API returned ${res.status}`);
      const json = parseKvJson(await res.text());
      return { entries: (json.entries ?? []).map(exactTimestamp), pageToken: json.page_token ?? null };
    } catch (err) {
      // Next's build-time prerender marker is not a page failure, retrying cannot help, and
      // wrapping it would turn "this route is dynamic" into a scary log line and a retry.
      if (isDynamicUsageError(err)) throw err;
      lastError = err;
      if (attempt < cfg.attemptsPerPage && deadline - Date.now() > cfg.retryDelayMs) await delay(cfg.retryDelayMs);
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`KV page ${pageIndex + 1} failed after ${cfg.attemptsPerPage} attempts: ${reason}`);
}

/**
 * Next marks a build-time prerender attempt with this digest on any fetch that opts out of caching
 * (`cache: 'no-store'`, `revalidate: 0`). It says "this route cannot be static", not "the indexer
 * is down", and it must reach Next untouched.
 */
function isDynamicUsageError(err) {
  return Boolean(err) && typeof err === 'object' && err.digest === 'DYNAMIC_SERVER_USAGE';
}

/**
 * `block_timestamp` as an exact decimal string of nanoseconds (lib/kv.mjs `parseKvJson` already
 * keeps the digits on the way in; a stub or an older runtime may hand back a rounded number).
 */
function exactTimestamp(e) {
  if (e && typeof e === 'object' && typeof e.block_timestamp === 'number' && Number.isFinite(e.block_timestamp)) {
    return { ...e, block_timestamp: BigInt(Math.trunc(e.block_timestamp)).toString() };
  }
  return e;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
