import 'server-only';
import {
  SNAPSHOT_KEY,
  SNAPSHOT_TTL_SECONDS,
  decodeSnapshot,
  encodeSnapshot,
} from './projects-snapshot.mjs';
import type { Snapshot } from './projects-snapshot.mjs';

/**
 * The store half of the durable project-list copy: Upstash Redis over its REST API.
 *
 * Same three env spellings as the view counter (app/api/views/route.ts) and claims (lib/claims.ts),
 * because which names exist depends on how the database was created:
 * `UPSTASH_REDIS_REST_KV_REST_API_URL/_TOKEN` (Vercel Marketplace), `UPSTASH_REDIS_REST_URL/_TOKEN`
 * (Upstash console) and `KV_REST_API_URL/_TOKEN` (older Vercel KV).
 *
 * With none of them the store is simply unavailable and every function here degrades to a no-op or
 * `null`, which puts the app back on its previous behaviour: cache, then per-instance copy, then
 * the error page. A missing store must never be the reason a page fails.
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
 * Remember the listing that was just read from the KV API.
 *
 * Awaited rather than fired and forgotten: a serverless invocation can be frozen as soon as the
 * response is sent, and a snapshot write that never lands is not a snapshot. It costs one gzip plus
 * one Redis round trip on a revalidation, which happens at most every
 * `PROJECTS_REVALIDATE_SECONDS`.
 *
 * Never throws: the caller already has a good list in hand, and failing to store a spare copy is
 * not a reason to fail the read.
 *
 * @returns {Promise<boolean>} true when the copy was stored
 */
export async function saveSnapshot(snapshot: Snapshot): Promise<boolean> {
  if (!snapshotStoreConfigured) return false;
  // An empty listing is a failed read wearing a success's clothes; never let it overwrite a real one.
  if (!Array.isArray(snapshot.items) || snapshot.items.length === 0) return false;
  try {
    const value = encodeSnapshot(snapshot);
    await redis(['SET', SNAPSHOT_KEY, value, 'EX', SNAPSHOT_TTL_SECONDS], 5000);
    return true;
  } catch (err) {
    console.error('[projects] snapshot write failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * The stored listing, or null when there is none, the store is not configured, or the stored value
 * is unreadable. Never throws, for the same reason `decodeSnapshot` does not.
 */
export async function loadSnapshot(): Promise<Snapshot | null> {
  if (!snapshotStoreConfigured) return null;
  try {
    const body = (await redis(['GET', SNAPSHOT_KEY], 3000)) as { result?: unknown } | null;
    return decodeSnapshot(body?.result);
  } catch (err) {
    console.error('[projects] snapshot read failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
