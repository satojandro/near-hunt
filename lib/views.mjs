/**
 * Per-listing view counting (NH-113).
 *
 * Why a counter and not just the aggregate analytics: people open a project and leave without
 * voting or commenting, and that silence is a signal worth showing — next to a listing with 0
 * upvotes, "41 views" says something different from "0 views".
 *
 * What it stores: two integers per path, in Upstash Redis (the counter is inert until
 * UPSTASH_REDIS_REST_URL/TOKEN — or Vercel's KV_REST_API_* aliases — exist).
 *
 * What it does not store: no IP, no cookie, no identifier. The browser counts its own visit once
 * per session (sessionStorage), the server just adds one. The number is therefore approximate and
 * is labelled as such: it is a page-view counter, not a unique-visitor count.
 *
 * Rate limits (NH-118). Without an identifier the server cannot tell one visitor from another, so
 * the limits are on the counter, not on the caller: a path takes at most `perPathPerMinute` adds a
 * minute and `perPathPerDay` a day, and all paths together `globalPerMinute` a minute. Past a
 * limit the request is answered with the current number and nothing is added. That bounds what a
 * loop can do to a listing's number (to `perPathPerDay` a day) and how fast it can fill the
 * store; it does not make the number unforgeable, and the label still says so.
 */

/** See the header comment. Sized well above this site's real traffic on any one listing. */
export const VIEW_LIMITS = Object.freeze({ perPathPerMinute: 12, perPathPerDay: 2000, globalPerMinute: 240 });

/** Seconds the per-minute limiter keys live: the minute itself plus slack for clock skew. */
export const RATE_KEY_TTL_SECONDS = 120;

/** `YYYYMMDDHHMM` in UTC: the limiter's minute bucket. */
export function minuteKey(now = new Date()) {
  return now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

/** Limiter keys for one add: this path this minute, and every path this minute. */
export function rateKeys(path, now = new Date()) {
  const p = countablePath(path);
  if (!p) throw new Error(`not a countable path: ${String(path)}`);
  const m = minuteKey(now);
  return { path: `nh:views:rl:${m}:${p}`, global: `nh:views:rl:${m}:*` };
}

/**
 * Whether this add may be counted, given the limiter counters *after* this request was added to
 * them. A counter that could not be read (null) fails closed: nothing is counted.
 *
 * @param {{ pathMinute: number | null, globalMinute: number | null }} counters
 */
export function withinMinuteLimits({ pathMinute, globalMinute }) {
  if (!Number.isFinite(pathMinute) || !Number.isFinite(globalMinute)) return false;
  return pathMinute <= VIEW_LIMITS.perPathPerMinute && globalMinute <= VIEW_LIMITS.globalPerMinute;
}

/** Whether the day bucket, after this add, is still within the per-path daily limit. */
export function withinDayLimit(dayCount) {
  return Number.isFinite(dayCount) && dayCount <= VIEW_LIMITS.perPathPerDay;
}

/** `/p/{id}` -> `{id}`, or null for any other path. */
export function projectIdOfPath(path) {
  const m = /^\/p\/([0-9a-z-]{8,64})$/i.exec(countablePath(path) ?? '');
  return m ? m[1] : null;
}


/** Paths worth counting: a listing page or an account page. Nothing else reaches the store. */
const COUNTABLE = [/^\/p\/[0-9a-z-]{8,64}$/i, /^\/u\/[a-z0-9._-]{2,64}$/i];

/**
 * @param {unknown} path
 * @returns {string | null} the normalised path, or null when this path is not counted
 */
export function countablePath(path) {
  if (typeof path !== 'string') return null;
  const p = path.split('?')[0].split('#')[0];
  if (p.length > 200) return null;
  return COUNTABLE.some((re) => re.test(p)) ? p : null;
}

/** `YYYYMMDD` in UTC — the daily bucket key. */
export function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Redis keys for one path. Total first, then the day bucket. */
export function viewKeys(path, now = new Date()) {
  const p = countablePath(path);
  if (!p) throw new Error(`not a countable path: ${String(path)}`);
  return { total: `nh:views:${p}`, day: `nh:views:${dayKey(now)}:${p}` };
}

/**
 * Parse a Redis REST `INCR` reply (`{"result": 12}`), returning null when it is not a number.
 * @param {unknown} json
 */
export function parseIncr(json) {
  const v = json?.result;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
