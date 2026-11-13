import 'server-only';
import { SNAPSHOT_TTL_SECONDS, decodeSnapshot, encodeSnapshot } from './snapshot.mjs';

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
export async function saveSnapshotValue(key: string, value: unknown, label = key): Promise<boolean> {
  if (!snapshotStoreConfigured) return false;
  try {
    const encoded = encodeSnapshot(value);
    await redis(['SET', key, encoded, 'EX', SNAPSHOT_TTL_SECONDS], 5000);
    return true;
  } catch (err) {
    console.error(`[snapshot] write failed for ${label}:`, err instanceof Error ? err.message : err);
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
    console.error(`[snapshot] read failed for ${label}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
