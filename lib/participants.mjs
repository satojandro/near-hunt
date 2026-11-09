/**
 * Who has taken part in NEAR Hunt (NH-112).
 *
 * There is no login record to count: signing in with NEAR Connect happens in the browser and writes
 * nothing to the chain. What *is* on chain is every vote and every comment, each row carrying the
 * writer's account as `predecessor_id`. So the honest number is "people who signed a vote or a
 * comment", not "people who logged in" — and that is what the site says.
 *
 * Pure functions, no network, so `node --test` covers them.
 */

const VOTE_PREFIX = 'vote/';
const COMMENT_PREFIX = 'comment/';

/**
 * How far back "recently" reaches, in milliseconds. Seven days keeps the strip about the current
 * conversation (the hackathon runs 1–14 Nov) instead of everyone who ever clicked, so the number
 * can fall as well as rise, which is the honest behaviour for a "recently" claim.
 */
export const PARTICIPANT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** KV rows carry nanosecond `block_timestamp` as an exact decimal string. Milliseconds are plenty. */
function blockMs(row) {
  const ns = Number(row?.block_timestamp ?? 0);
  return Number.isFinite(ns) && ns > 0 ? ns / 1e6 : 0;
}

/**
 * Unique accounts with at least one live (non-deleted) vote or comment inside the window, most
 * recently active first.
 *
 * @param {Array<{predecessor_id?: string, key?: string, value?: unknown, block_height?: number, block_timestamp?: string}>} rows
 *   rows from `readLatest()` across every writer — the point is that other accounts wrote them
 * @param {{sinceMs?: number}} [opts] rows older than this are ignored; 0 means no window
 * @returns {Array<{account_id: string, votes: number, comments: number, last_block: number}>}
 */
export function participantsFrom(rows, { sinceMs = 0 } = {}) {
  const by = new Map();
  for (const r of rows ?? []) {
    if (!r || typeof r.predecessor_id !== 'string' || typeof r.key !== 'string') continue;
    const isVote = r.key.startsWith(VOTE_PREFIX);
    const isComment = r.key.startsWith(COMMENT_PREFIX);
    if (!isVote && !isComment) continue;
    // A deleted vote (`null`) or a deleted comment is not participation any more.
    if (r.value == null) continue;
    // Undated rows cannot be shown as recent, so they are left out once a window is set.
    if (sinceMs > 0) {
      const ms = blockMs(r);
      if (ms === 0 || ms < sinceMs) continue;
    }

    const entry = by.get(r.predecessor_id) ?? {
      account_id: r.predecessor_id,
      votes: 0,
      comments: 0,
      last_block: 0,
    };
    if (isVote) entry.votes += 1;
    else entry.comments += 1;
    entry.last_block = Math.max(entry.last_block, Number(r.block_height) || 0);
    by.set(r.predecessor_id, entry);
  }
  return [...by.values()].sort(
    (a, b) => b.last_block - a.last_block || a.account_id.localeCompare(b.account_id),
  );
}

/**
 * Wording for the strip. Kept here so the sentence and the number can be tested together, and so
 * the site never claims more than the chain proves.
 *
 * @param {number} count
 */
export function participantsLabel(count) {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? 'person has' : 'people have'} voted or commented recently`;
}
