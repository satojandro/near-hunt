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
 */

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
