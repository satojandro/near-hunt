import 'server-only';
import {
  SNAPSHOT_TTL_SECONDS,
  decodeSnapshot,
  encodeSnapshot,
  laterFetchedAt,
  recordDigest,
  snapshotReadAtKey,
} from './snapshot.mjs';

/**
 * The store half of the durable copies: Upstash Redis over its REST API.
 *
 * Same three env spellings as the view counter (app/api/views/route.ts) and claims (lib/claims.ts),
 * because which names exist depends on how the database was created:
 * `UPSTASH_REDIS_REST_KV_REST_API_URL/_TOKEN` (Vercel Marketplace), `UPSTASH_REDIS_REST_URL/_TOKEN`
 * (Upstash console) and `KV_REST_API_URL/_TOKEN` (older Vercel KV).
 *
 * With none of them every function here degrades to a no-op or `null`, which puts the app back on
 * its previous behaviour: cache, then an explicit "unavailable". A missing store must never be the
 * reason a page fails.
 */

const REST_URL =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ??
  process.env.UPSTASH_REDIS_REST_URL ??
  process.env.KV_REST_API_URL;
const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  process.env.KV_REST_API_TOKEN;

/** Whether a durable copy can be read or written. */
export const snapshotStoreConfigured = Boolean(REST_URL && REST_TOKEN);

async function redis(command: (string | number)[], timeoutMs: number): Promise<unknown> {
  const res = await fetch(REST_URL as string, {
    method: 'POST',
    headers: { authorization: `Bearer ${REST_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return res.json();
}

/**
 * Next marks a build-time prerender attempt with this digest on any fetch that opts out of
 * caching. It means "this route is dynamic", not "the store is broken": logging it on every build
 * trains people to ignore the log, and it is caught here so the caller simply sees "no copy".
 */
function isDynamicUsageError(err: unknown): boolean {
  return (err as { digest?: string } | null)?.digest === 'DYNAMIC_SERVER_USAGE';
}

/**
 * Push a stored value's expiry out by another `SNAPSHOT_TTL_SECONDS` without rewriting it.
 *
 * For a value that is deliberately not rewritten while its content is unchanged (the project
 * listing, NH-122): without this its TTL runs out after a quiet week and the copy vanishes.
 *
 * Never throws. @returns true when the key exists and its TTL was reset; false when it is missing
 * (expired, evicted, never written), the store is not configured, or the call failed — in each of
 * those the caller should write the value again.
 */
export async function touchSnapshotValue(key: string, label = key): Promise<boolean> {
  if (!snapshotStoreConfigured) return false;
  try {
    const body = (await redis(['EXPIRE', key, SNAPSHOT_TTL_SECONDS], 3000)) as { result?: unknown } | null;
    return body?.result === 1;
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      console.error(`[snapshot] expire failed for ${label}:`, err instanceof Error ? err.message : err);
    }
    return false;
  }
}

/**
 * Store the value that was just read.
 *
 * Awaited rather than fired and forgotten: a serverless invocation can be frozen as soon as the
 * response is sent, and a snapshot write that never lands is not a snapshot. It costs one gzip plus
 * one Redis round trip per successful read of that kind.
 *
 * Never throws: the caller already has good data in hand, and failing to store a spare copy is not
 * a reason to fail the read.
 *
 * @returns true when the copy was stored
 */
export async function saveSnapshotValue(
  key: string,
  value: unknown,
  label = key,
  { onlyIfAbsent = false }: { onlyIfAbsent?: boolean } = {},
): Promise<boolean> {
  if (!snapshotStoreConfigured) return false;
  try {
    const encoded = encodeSnapshot(value);
    // `onlyIfAbsent` (SET NX): seed an empty key without overwriting what another writer stored.
    // Redis answers "OK" when it wrote and null when the key already existed.
    const command = onlyIfAbsent
      ? ['SET', key, encoded, 'NX', 'EX', SNAPSHOT_TTL_SECONDS]
      : ['SET', key, encoded, 'EX', SNAPSHOT_TTL_SECONDS];
    const body = (await redis(command, 5000)) as { result?: unknown } | null;
    return onlyIfAbsent ? body?.result === 'OK' : true;
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      console.error(`[snapshot] write failed for ${label}:`, err instanceof Error ? err.message : err);
    }
    return false;
  }
}

/**
 * The stored value, or null when there is none, the store is not configured, or the stored value is
 * unreadable. Never throws, for the same reason `decodeSnapshot` does not.
 *
 * @param key Redis key (lib/snapshot.mjs `snapshotKey`)
 * @param isValid shape check for this kind of copy
 */
export async function loadSnapshotValue<T>(
  key: string,
  isValid: (value: unknown) => boolean,
  label = key,
): Promise<T | null> {
  if (!snapshotStoreConfigured) return null;
  try {
    const body = (await redis(['GET', key], 3000)) as { result?: unknown } | null;
    return decodeSnapshot(body?.result, isValid) as T | null;
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      console.error(`[snapshot] read failed for ${label}:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

/**
 * Per-instance memory of "what content did we last store under this key", so an unchanged read can
 * skip the write entirely (NH-125). On `globalThis` for the same reason every other per-instance
 * state here is: Next builds these modules into more than one bundle.
 *
 * Per instance, not shared, and that is enough: an instance that has never written falls through to
 * a write, and a second instance writing the same content costs one write, not a thousand. Redis is
 * not consulted for "is it still the same" — that read would be cheaper than the write but it would
 * still be a round trip on every revalidation of every cached read.
 */
const DIGESTS_KEY = Symbol.for('nearhunt.snapshot.digests');
const storedDigests: Map<string, string> = ((
  globalThis as unknown as Record<symbol, Map<string, string>>
)[DIGESTS_KEY] ??= new Map<string, string>());

/**
 * Refresh the copy's expiry and record when its rows were read, in one round trip.
 *
 * One `EVAL`, not `EXPIRE` + `SET`, because this runs on every revalidation of every cached read and
 * the plan's command allowance is a real ceiling (the free tier is 500 K commands a month). The
 * script is deliberately trivial: `EXPIRE` returning 1 means the copy is still there, so the read
 * stamp can be updated; returning 0 means it expired or was evicted and the caller must write the
 * whole value again rather than believing it is stored.
 *
 * @returns true when the copy was still present and was stamped
 */
async function stampReadAt(key: string, fetchedAt: string): Promise<boolean> {
  const script =
    "if redis.call('EXPIRE', KEYS[1], ARGV[2]) == 1 then " +
    "redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2]); return 1 else return 0 end";
  const body = (await redis(
    ['EVAL', script, 2, key, snapshotReadAtKey(key), fetchedAt, SNAPSHOT_TTL_SECONDS],
    3000,
  )) as { result?: unknown } | null;
  return Number(body?.result) === 1;
}

/**
 * Store a copy only when its content changed (NH-125).
 *
 * The problem it solves: a copy is re-stored every time the KV read behind it revalidates, whether
 * or not anything moved. Measured on 18 Nov 2026 (real row counts, real encoded sizes): the vote
 * copy is 73,704 B stored and revalidated every 20 s, so one warm instance wrote **4,320 copies a
 * day — 318 MB — of unchanged data**, plus the comment-count copy (40,268 B / 60 s) and the
 * participant list (~25 KB / 60 s). Together that is ~413 MB/day ≈ 12.4 GB per 30 days per
 * instance, which is the entire Upstash free plan's monthly bandwidth (10 GB) for one instance.
 *
 * Behaviour: if this instance already stored identical content, the heavy value is not rewritten —
 * only its expiry is pushed out and its read time is stamped (one small command). Anything else
 * writes the full value, as before. A write that fails is not remembered, so the next read tries
 * again.
 *
 * @returns true when the value was written; false when it was already stored unchanged, the store is
 *   not configured, or the write failed
 */
export async function saveSnapshotValueIfChanged(
  key: string,
  value: unknown,
  label = key,
): Promise<boolean> {
  if (!snapshotStoreConfigured) return false;
  const digest = recordDigest(value);
  const fetchedAt =
    (value as { fetched_at?: unknown })?.fetched_at ?? new Date().toISOString();
  const at = typeof fetchedAt === 'string' && fetchedAt ? fetchedAt : new Date().toISOString();
  try {
    if (storedDigests.get(key) === digest) {
      if (await stampReadAt(key, at)) return false;
      // The copy is gone (expired, evicted, or the store answered oddly): write it again.
      storedDigests.delete(key);
    }
    const stored = await saveSnapshotValue(key, value, label);
    if (stored) storedDigests.set(key, digest);
    return stored;
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      console.error(`[snapshot] write failed for ${label}:`, err instanceof Error ? err.message : err);
    }
    return false;
  }
}

/**
 * When the rows behind a stored copy were last read, from the small `:read-at` stamp.
 *
 * Used only on the fallback path (a live read failed and the copy is being served), where reporting
 * an honest age matters: the copy's own `fetched_at` dates the last content *change*, while this
 * dates the last successful *read* of the same rows. `laterFetchedAt` picks the later one.
 *
 * Never throws. @returns the ISO time, or null when there is no stamp (older copy, store down)
 */
export async function loadSnapshotReadAt(key: string, label = key): Promise<string | null> {
  if (!snapshotStoreConfigured) return null;
  try {
    const body = (await redis(['GET', snapshotReadAtKey(key)], 3000)) as { result?: unknown } | null;
    return typeof body?.result === 'string' && body.result ? body.result : null;
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      console.error(`[snapshot] read-at failed for ${label}:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

/**
 * A stored copy's honest age: the later of its own `fetched_at` and its `:read-at` stamp.
 *
 * @param key the copy's key
 * @param copy the decoded copy (its `fetched_at` is the content's time)
 */
export async function storedFetchedAt(
  key: string,
  copy: { fetched_at?: unknown } | null,
  label = key,
): Promise<string | null> {
  const own = typeof copy?.fetched_at === 'string' ? copy.fetched_at : null;
  const stamped = await loadSnapshotReadAt(key, label);
  return laterFetchedAt(own, stamped);
}
