/**
 * Account page (Board 3: NH-50 profile header, NH-51 upvotes list). Pure functions plus two thin
 * readers, so the joins and the failure handling can be unit-tested without the network.
 *
 * Profile: `GET https://api2.near.social/v1/accounts/{id}` (the same endpoint NH-22 uses; see
 * lib/social.mjs). It answers 200 for any account, with `has_profile:false` and null fields when
 * the account has no profile. `about` is user text: reduced to one plain-text line, never HTML.
 *
 * Upvotes: `POST {kv}/v0/latest/{VOTE_ACCOUNT}/{accountId}` with `{key_prefix:"vote/"}`
 * (docs/PLAN.md NH-51) — the account's own rows in the vote namespace. The voter is the row's
 * `predecessor_id` (AGENTS.md §3); the writer-scoped read and `accountUpvotes` both enforce it.
 * Key parsing and "is this an active vote" are the tally's own rules from lib/votes.mjs, so this
 * page and the counts on the directory can never disagree about what a vote is.
 */

import { readLatest } from './kv.mjs';
import { NETWORK, VOTE_ACCOUNT } from './network.mjs';
import {
  SOCIAL_API,
  PROFILE_TIMEOUT_MS,
  PROFILE_REVALIDATE_SECONDS,
  isAccountId,
  normaliseProfile,
  plainExcerpt,
  profileApiUrl,
} from './social.mjs';
import { VOTE_PREFIX, idFromVoteKey, isActiveVote, latestPerWriter } from './votes.mjs';

/** Characters of `about` shown in the header before it is cut at a word boundary. */
export const ABOUT_MAX = 280;

function count(v) {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Reduce a `/v1/accounts/{id}` response to what the header shows. The account id is always the
 * one asked for, never one read from the response. Avatar must be https (normaliseProfile).
 * Counts are null when absent or not numbers. Pure.
 *
 * @returns {import('./account.d.mts').AccountProfile}
 */
export function normaliseAccountProfile(json, accountId) {
  const o = json && typeof json === 'object' ? json : {};
  const base = normaliseProfile(o, accountId);
  const counts = o.counts && typeof o.counts === 'object' ? o.counts : {};
  return {
    ...base,
    has_profile: o.has_profile === true,
    about: plainExcerpt(o.about, ABOUT_MAX) || null,
    followers: count(counts.followers),
    posts: count(counts.posts),
  };
}

/**
 * Fetch one account's near.social profile. Never throws: on any failure returns
 * `{status: 'error', profile}` with an empty profile, so the header still shows the account id.
 */
export async function fetchAccountProfile(accountId, {
  base = SOCIAL_API,
  timeoutMs = PROFILE_TIMEOUT_MS,
  revalidate = PROFILE_REVALIDATE_SECONDS,
  fetchImpl = fetch,
} = {}) {
  if (!isAccountId(accountId)) throw new Error(`invalid account id: ${accountId}`);
  try {
    const res = await fetchImpl(profileApiUrl(accountId, { base }), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'ok', profile: normaliseAccountProfile(await res.json(), accountId) };
  } catch {
    return { status: 'error', profile: normaliseAccountProfile(null, accountId) };
  }
}

/** `predecessor_id`-scoped `vote/` rows written by `accountId` in the vote namespace. */
export function readAccountVoteRows({ accountId, account = VOTE_ACCOUNT, network = NETWORK, fetchImpl } = {}) {
  if (!isAccountId(accountId)) throw new Error(`invalid account id: ${accountId}`);
  return readLatest({ account, writer: accountId, keyPrefix: VOTE_PREFIX, network, fetchImpl });
}

/**
 * The account's active upvotes on live projects, newest first (block height, then key).
 *
 * Rows written by anyone but `accountId` are ignored whatever their key or value says; withdrawn
 * votes (`null`), non-object values, malformed keys and ids with no live project are dropped. Pure.
 *
 * @template {{submission_id: string}} P
 * @param {Array<object>} rows   KV rows under `vote/`
 * @param {string} accountId     the page's account
 * @param {Iterable<P>} projects live project records
 * @returns {Array<{id: string, block_height: number, block_timestamp: number|null, project: P}>}
 */
export function accountUpvotes(rows, accountId, projects) {
  const byId = new Map();
  for (const p of projects ?? []) if (p && typeof p.submission_id === 'string') byId.set(p.submission_id, p);
  const out = [];
  for (const r of latestPerWriter((rows ?? []).filter((r) => r && r.predecessor_id === accountId))) {
    const id = idFromVoteKey(r.key);
    if (id === null || !isActiveVote(r.value)) continue;
    const project = byId.get(id);
    if (!project) continue;
    const ts = Number(r.block_timestamp);
    out.push({
      id,
      block_height: Number(r.block_height) || 0,
      block_timestamp: Number.isFinite(ts) && ts > 0 ? ts : null,
      project,
    });
  }
  return out.sort((a, b) => b.block_height - a.block_height || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** KV block timestamps are nanoseconds; `relativeTime` takes milliseconds. */
export function nsToMs(ns) {
  const n = Number(ns);
  return Number.isFinite(n) && n > 0 ? Math.floor(n / 1e6) : null;
}
