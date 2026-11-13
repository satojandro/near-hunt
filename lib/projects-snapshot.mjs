/**
 * The durable copy of the project list: the last listing the KV API answered with, kept so a cold
 * server instance still has something to serve when the indexer times out.
 *
 * Why a copy on disk at all: `unstable_cache` and the per-instance `lastGood` in lib/projects.ts
 * only cover an instance that has already read the KV API successfully. A brand-new instance whose
 * first read times out has no copy, so `getProjects()` threw `ProjectsUnavailableError` and the
 * visitor got the "indexer not responding" page. A read that fails is not an outage: the records
 * are still on chain, we just could not fetch them this second.
 *
 * Encoding: the listing is ~1.2 MB of JSON and Upstash prices and limits by bytes, so it is gzipped
 * and base64'd (~314 KB) before it is stored. That is a pure transform, which is why it lives here
 * with no network: `test/projects-snapshot.test.mjs` covers the round trip and the rejections.
 */

import { gzipSync, gunzipSync } from 'node:zlib';

/** Redis key holding the encoded listing. Versioned so a shape change cannot read an old value. */
export const SNAPSHOT_KEY = 'nearhunt:projects-snapshot:v1';

/** A week. Long enough to ride out any indexer or deploy trouble, short enough to expire a bad copy. */
export const SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Ceiling on the decompressed size a stored value may produce (gzip-bomb guard). */
const MAX_PLAIN_BYTES = 16 * 1024 * 1024;

/**
 * @typedef {object} Snapshot
 * @property {Array<object>} items      listing items, exactly as `toListing` produced them
 * @property {string} fetched_at        ISO time the KV API was read for these items
 * @property {string} account           namespace account, `nearhunt.near`
 */

/**
 * Gzip + base64 a listing for storage.
 *
 * @param {Snapshot} snapshot
 * @returns {string} base64 of the gzipped JSON
 */
export function encodeSnapshot(snapshot) {
  if (!isSnapshot(snapshot)) throw new Error('encodeSnapshot: not a snapshot');
  return gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf8')).toString('base64');
}

/**
 * Read a stored value back. Returns `null` — never throws — for anything that is not a snapshot the
 * app can render: a deleted key, a value written by an older shape, a truncated write, or plain
 * garbage. A fallback that can itself throw is not a fallback.
 *
 * @param {unknown} stored the Redis `GET` result
 * @returns {Snapshot | null}
 */
export function decodeSnapshot(stored) {
  if (typeof stored !== 'string' || stored.length === 0) return null;
  try {
    const plain = gunzipSync(Buffer.from(stored, 'base64'), { maxOutputLength: MAX_PLAIN_BYTES });
    const parsed = JSON.parse(plain.toString('utf8'));
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Shape check. Deliberately shallow: the items were built by `toListing` and every consumer
 * already tolerates a partial record, so the point is to reject non-snapshots, not to re-validate
 * 813 records on every read.
 *
 * @param {unknown} value
 * @returns {value is Snapshot}
 */
export function isSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = /** @type {any} */ (value);
  return (
    Array.isArray(v.items) &&
    typeof v.fetched_at === 'string' &&
    v.fetched_at.length > 0 &&
    typeof v.account === 'string' &&
    v.account.length > 0
  );
}

/**
 * Which of two copies to serve: the newer `fetched_at` wins, so a server instance holding a fresh
 * list never hands out an older stored one, and a stored copy never overrides a live read.
 *
 * @template {Snapshot} T
 * @param {T | null} a
 * @param {T | null} b
 * @returns {T | null}
 */
export function newestSnapshot(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(b.fetched_at).getTime() > new Date(a.fetched_at).getTime() ? b : a;
}
