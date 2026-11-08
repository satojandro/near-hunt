/**
 * Upvote tally (NH-33). Pure functions plus two thin KV readers.
 *
 * Storage (schema/README.md, "Upvotes"): key `vote/{submission_id}` in the `VOTE_ACCOUNT`
 * namespace, written by the voter from their own account. Value: any JSON object (`{}`) = active
 * upvote, `null` = withdrawn. The voter is the row's `predecessor_id` — never an account id found
 * inside a key or a value (AGENTS.md §3).
 *
 * The FastData index keeps one latest row per (writer, key), so an account holds at most one vote
 * per project however many times it writes. `latestPerWriter` re-applies that rule defensively,
 * in case a reader ever sees history rows or a page boundary duplicates a row.
 */

import { readLatest } from './kv.mjs';
import { NETWORK, VOTE_ACCOUNT } from './network.mjs';
import { isAccountId } from './social.mjs';

export const VOTE_PREFIX = 'vote/';

/** `"vote/abc"` -> `"abc"`; anything else (including `"vote/"` and nested keys) -> null. */
export function idFromVoteKey(key) {
  if (typeof key !== 'string' || !key.startsWith(VOTE_PREFIX)) return null;
  const id = key.slice(VOTE_PREFIX.length);
  return id && !id.includes('/') ? id : null;
}

/** Active vote: a plain JSON object. `null` (withdrawn), arrays, strings, numbers are not. */
export function isActiveVote(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Keep the latest row per (predecessor_id, key): highest block_height, then block_timestamp.
 * Rows without a valid writer account are dropped.
 */
export function latestPerWriter(rows) {
  const best = new Map();
  for (const r of rows ?? []) {
    if (!r || typeof r !== 'object' || !isAccountId(r.predecessor_id) || typeof r.key !== 'string') continue;
    const k = `${r.predecessor_id}\u0000${r.key}`;
    const prev = best.get(k);
    if (!prev || newer(r, prev)) best.set(k, r);
  }
  return [...best.values()];
}

function newer(a, b) {
  const ha = Number(a.block_height) || 0;
  const hb = Number(b.block_height) || 0;
  if (ha !== hb) return ha > hb;
  return nsBigInt(a.block_timestamp) > nsBigInt(b.block_timestamp);
}

/** Exact comparison of nanosecond timestamps (decimal strings from lib/kv.mjs, or numbers). */
function nsBigInt(v) {
  if (typeof v === 'string' && /^\d{1,30}$/.test(v)) return BigInt(v);
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return BigInt(Math.trunc(v));
  return 0n;
}

/** Active vote rows, one per (voter, project), restricted to `projectIds` when given. */
function activeVotes(rows, projectIds) {
  const known = projectIds ? new Set(projectIds) : null;
  const out = [];
  for (const r of latestPerWriter(rows)) {
    const id = idFromVoteKey(r.key);
    if (!id || (known && !known.has(id)) || !isActiveVote(r.value)) continue;
    out.push({ id, voter: r.predecessor_id, block_height: Number(r.block_height) || 0 });
  }
  return out;
}

/**
 * Votes per project. Every id in `projectIds` is present (0 when nobody voted); votes for ids
 * with no project record, withdrawn votes and non-object values are ignored.
 *
 * @param {Array<object>} rows KV rows under `vote/`, any writers
 * @param {Iterable<string>} projectIds submission ids that have a live project record
 * @returns {Record<string, number>}
 */
export function tallyVotes(rows, projectIds) {
  const ids = [...projectIds];
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const v of activeVotes(rows, ids)) counts[v.id] += 1;
  return counts;
}

/**
 * Accounts with an active vote on `id`, latest vote first (ties by account id). The caller is
 * responsible for checking that `id` is a real project.
 *
 * @returns {string[]}
 */
export function votersFor(rows, id) {
  return votesFor(rows, id).map((v) => v.account_id);
}

/**
 * Active votes on `id` with the block height of each voter's latest write, in the same order as
 * `votersFor` (latest first, ties by account id). Used by the public API (NH-60).
 *
 * @returns {Array<{account_id: string, block_height: number}>}
 */
export function votesFor(rows, id) {
  return activeVotes(rows)
    .filter((v) => v.id === id)
    .sort((a, b) => b.block_height - a.block_height || a.voter.localeCompare(b.voter))
    .map((v) => ({ account_id: v.voter, block_height: v.block_height }));
}

/**
 * Every latest `vote/` row in the namespace, across all writers, following page tokens.
 *
 * One paginated `{"key_prefix":"vote/"}` read is equivalent to the per-project exact-key query in
 * docs/PLAN.md (NH-33) and schema/README.md: both return the latest row per (writer, key) under
 * the same unscoped `/v0/latest/{account}` endpoint; the prefix read just returns all projects'
 * rows at once (a handful of pages) instead of 277 requests. Counting, null-skipping and
 * unknown-id filtering happen in `tallyVotes`.
 */
export function readVoteRows({ account = VOTE_ACCOUNT, network = NETWORK, fetchImpl } = {}) {
  return readLatest({ account, keyPrefix: VOTE_PREFIX, network, fetchImpl });
}

/**
 * The exact-key form for one project, `{"key":"vote/{id}"}`: what the docs show for a manual
 * check, and what NH-31 can use to confirm a just-written vote against the indexer.
 */
export function readProjectVoteRows(id, { account = VOTE_ACCOUNT, network = NETWORK, fetchImpl } = {}) {
  if (typeof id !== 'string' || !id || id.includes('/')) throw new Error(`invalid submission id: ${id}`);
  return readLatest({ account, key: `${VOTE_PREFIX}${id}`, network, fetchImpl });
}
