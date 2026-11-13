/**
 * Durable copies of the reads NEAR Hunt makes from the FastNear KV API.
 *
 * Why this exists: the indexer times out often enough that a page render regularly cannot read it
 * (`TimeoutError`, measured in Vercel runtime logs across every region). Records are still on
 * chain in those moments — we simply could not fetch them — so losing the whole page, or blanking
 * a number, is a worse answer than showing the last copy we managed to read, *labelled as such*.
 *
 * Two rules hold the honesty of this module:
 *   1. A copy is never presented as current. Every consumer carries `fetched_at` and `stale`
 *      through to its UI, so "unavailable right now" becomes "as of 4 minutes ago", not a number
 *      the reader is meant to mistake for live.
 *   2. Nothing here throws. A fallback that can itself throw is not a fallback: `decodeSnapshot`
 *      returns `null` for a deleted key, a truncated write, an older shape or plain garbage.
 *
 * Encoding: the project listing is ~1.2 MB of JSON, so values are gzipped and base64'd before
 * storage (~314 KB). Pure functions only — the network half is lib/snapshot-store.ts.
 */

import { gzipSync, gunzipSync } from 'node:zlib';

/** How long a stored copy may live: long enough to ride out trouble, short enough to expire bad data. */
export const SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Ceiling on the decompressed size a stored value may produce (gzip-bomb guard). */
const MAX_PLAIN_BYTES = 16 * 1024 * 1024;

/**
 * Redis key for one kind of copy. Namespaced and versioned so a shape change cannot read an old
 * value; the version goes up when the stored shape changes.
 *
 * @param {string} name e.g. "projects", "votes"
 * @param {number} [version]
 */
export function snapshotKey(name, version = 1) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`snapshotKey: bad name ${JSON.stringify(name)}`);
  }
  return `nearhunt:snapshot:${name}:v${version}`;
}

/**
 * Gzip + base64 a value for storage.
 *
 * @param {unknown} value must be JSON-serialisable
 * @returns {string} base64 of the gzipped JSON
 */
export function encodeSnapshot(value) {
  if (value === undefined || value === null) throw new Error('encodeSnapshot: nothing to encode');
  const json = JSON.stringify(value);
  if (typeof json !== 'string') throw new Error('encodeSnapshot: value is not serialisable');
  return gzipSync(Buffer.from(json, 'utf8')).toString('base64');
}

/**
 * Read a stored value back.
 *
 * @param {unknown} stored the Redis `GET` result
 * @param {(value: unknown) => boolean} isValid shape check for this kind of copy
 * @returns {unknown} the value, or `null` when it cannot be trusted
 */
export function decodeSnapshot(stored, isValid = isPlainRecord) {
  if (typeof stored !== 'string' || stored.length === 0) return null;
  try {
    const plain = gunzipSync(Buffer.from(stored, 'base64'), { maxOutputLength: MAX_PLAIN_BYTES });
    const parsed = JSON.parse(plain.toString('utf8'));
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Default shape check: any object that is not an array. */
export function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A stored copy with the time it was read. Every consumer stores this shape, so `fetched_at`
 * reaches the UI without each consumer inventing its own field name.
 *
 * `field` names the payload property, because the copies are not all called `items`: the project
 * list and the participant list carry `items`, the vote and comment copies carry `rows`. Hard-coding
 * `items` here silently invalidated those two copies on read — the fallback fired, the store
 * answered, and the validator threw the answer away.
 *
 * @param {unknown} value
 * @param {(payload: unknown) => boolean} isPayload
 * @param {string} [field] property holding the payload
 */
export function isFreshnessRecord(value, isPayload, field = 'items') {
  if (!isPlainRecord(value)) return false;
  const v = /** @type {any} */ (value);
  return (
    typeof v.fetched_at === 'string' &&
    v.fetched_at.length > 0 &&
    !Number.isNaN(new Date(v.fetched_at).getTime()) &&
    isPayload(v[field])
  );
}

/**
 * Which of two copies to serve: the newer `fetched_at` wins, so a server holding a fresh read never
 * hands out an older stored one, and a stored copy never overrides a live read.
 *
 * @template T
 * @param {T | null} a
 * @param {T | null} b
 * @returns {T | null}
 */
export function newestSnapshot(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(/** @type {any} */ (b).fetched_at).getTime() >
    new Date(/** @type {any} */ (a).fetched_at).getTime()
    ? b
    : a;
}
