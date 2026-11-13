import 'server-only';
import { unstable_cache } from 'next/cache';
import { NETWORK, VOTE_ACCOUNT } from './network.mjs';
import { readVoteRows, tallyVotes, votersFor, votesFor } from './votes.mjs';
import { getProjects } from './projects';
import { loadSnapshotValue, saveSnapshotValue } from './snapshot-store';
import { isFreshnessRecord, snapshotKey } from './snapshot.mjs';
import type { KvEntry } from '../types/nearhunt';

/** Seconds a cached copy of the vote rows is served before the KV API is read again. */
export const VOTES_REVALIDATE_SECONDS = 20;
/** Per-request timeout for vote reads: a slow indexer must not hold the page. */
export const VOTES_TIMEOUT_MS = 5000;
/** How long a failed vote read stops new attempts, per instance (see lib/projects.ts). */
const VOTES_RETRY_BACKOFF_MS = 5000;

type VoteRow = Pick<KvEntry, 'predecessor_id' | 'key' | 'value' | 'block_height' | 'block_timestamp'>;

/** The stored shape: the rows plus when they were read. */
interface VoteRowsCopy {
  rows: VoteRow[];
  fetched_at: string;
}

const VOTES_SNAPSHOT_KEY = snapshotKey('votes');
const isVoteCopy = (value: unknown): boolean =>
  isFreshnessRecord(value, (rows) => Array.isArray(rows), 'rows');

interface VotesState {
  inflight: Promise<VoteRowsCopy> | null;
  lastFailedAt: number;
}

/**
 * Per-instance state, on `globalThis` for the same reason lib/projects.ts does it: Next builds this
 * module into both the route-handler and the RSC/SSR bundle, so module-level `let`s would silently
 * become two independent copies — two in-flight slots and two backoff clocks.
 */
const STATE_KEY = Symbol.for('nearhunt.votes.state');
const state: VotesState = ((globalThis as unknown as Record<symbol, VotesState>)[STATE_KEY] ??= {
  inflight: null,
  lastFailedAt: 0,
});

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(VOTES_TIMEOUT_MS) });

/**
 * Every latest `vote/` row under `VOTE_ACCOUNT` on `NETWORK` (one paginated prefix read, see
 * `readVoteRows`), trimmed to the fields the tally uses. Cached ~20 s under the `votes` tag so
 * NH-31 can `revalidateTag('votes')` after a confirmed write. Errors are not cached.
 *
 * Each success also leaves a durable copy behind, so an indexer timeout can keep showing the tally
 * it last saw instead of dropping every number on the page — labelled stale by the caller.
 */
const getVoteRows = unstable_cache(
  async (): Promise<VoteRowsCopy> => {
    try {
      const rows = await readVoteRows({ account: VOTE_ACCOUNT, network: NETWORK, fetchImpl: timedFetch });
      const copy: VoteRowsCopy = {
        rows: rows.map(({ predecessor_id, key, value, block_height, block_timestamp }) => ({
          predecessor_id, key, value, block_height, block_timestamp,
        })),
        fetched_at: new Date().toISOString(),
      };
      await saveSnapshotValue(VOTES_SNAPSHOT_KEY, copy, 'votes');
      return copy;
    } catch (err) {
      state.lastFailedAt = Date.now();
      throw err;
    }
  },
  ['nearhunt-votes-v2', NETWORK, VOTE_ACCOUNT],
  { revalidate: VOTES_REVALIDATE_SECONDS, tags: ['votes'] },
);

/** One read at a time per instance, so a burst of visitors does not each walk the KV API. */
function voteRowsOnce(): Promise<VoteRowsCopy> {
  if (!state.inflight) {
    state.inflight = getVoteRows().finally(() => {
      state.inflight = null;
    });
  }
  return state.inflight;
}

interface VoteRowSet {
  rows: VoteRow[];
  /** False when no rows could be read and no copy was stored: counts are then unknown, not zero. */
  available: boolean;
  /** True when `rows` is a stored copy rather than this minute's read. */
  stale: boolean;
  /** When `rows` were read. Null only when `available` is false. */
  fetched_at: string | null;
}

/**
 * The vote rows, falling back to the stored copy before giving up.
 *
 * The fallback is still reported as `stale: true`: a count from four minutes ago and a count from
 * four seconds ago are not the same claim — especially to somebody who has just cast a vote.
 */
async function safeVoteRows(): Promise<VoteRowSet> {
  const coolingDown = state.lastFailedAt > 0 && Date.now() - state.lastFailedAt < VOTES_RETRY_BACKOFF_MS;
  if (!coolingDown) {
    try {
      const copy = await voteRowsOnce();
      return { rows: copy.rows, available: true, stale: false, fetched_at: copy.fetched_at };
    } catch (err) {
      console.error('[votes] KV read failed:', err instanceof Error ? err.message : err);
    }
  }
  const stored = await loadSnapshotValue<VoteRowsCopy>(VOTES_SNAPSHOT_KEY, isVoteCopy, 'votes');
  if (stored && stored.rows.length > 0) {
    return { rows: stored.rows, available: true, stale: true, fetched_at: stored.fetched_at };
  }
  return { rows: [], available: false, stale: false, fetched_at: null };
}

export interface VoteCounts {
  /** submission_id -> count. Empty when `available` is false. */
  counts: Record<string, number>;
  /** True when counts are shown at all, whether read now or restored from a stored copy. */
  available: boolean;
  /** True when `counts` is a stored copy: label it as such, never as live. */
  stale: boolean;
  /** When the rows behind `counts` were read. Null when `available` is false. */
  fetched_at: string | null;
  network: 'mainnet' | 'testnet';
  account: string;
}

/** Per-project vote counts for every live project. Never throws on a votes read failure. */
export async function getVoteCounts(): Promise<VoteCounts> {
  const [{ items }, votes] = await Promise.all([getProjects(), safeVoteRows()]);
  return {
    counts: votes.available ? tallyVotes(votes.rows, items.map((p) => p.submission_id)) : {},
    available: votes.available,
    stale: votes.stale,
    fetched_at: votes.fetched_at,
    network: NETWORK,
    account: VOTE_ACCOUNT,
  };
}

export interface ProjectVoters {
  /** Voter accounts (row `predecessor_id`), latest vote first. */
  voters: string[];
  count: number;
  available: boolean;
  stale: boolean;
  fetched_at: string | null;
  network: 'mainnet' | 'testnet';
  account: string;
}

/**
 * Voters for one project. The caller must already know `id` is a live project (the project page
 * 404s otherwise), which is the "ignore ids with no record" rule for a single project.
 */
export async function getVoters(id: string): Promise<ProjectVoters> {
  const votes = await safeVoteRows();
  const voters = votes.available ? votersFor(votes.rows, id) : [];
  return {
    voters,
    count: voters.length,
    available: votes.available,
    stale: votes.stale,
    fetched_at: votes.fetched_at,
    network: NETWORK,
    account: VOTE_ACCOUNT,
  };
}

export interface ProjectVotes {
  /** Active votes, voter = row `predecessor_id`, latest vote first. Empty when `available` is false. */
  votes: Array<{ account_id: string; block_height: number }>;
  available: boolean;
  stale: boolean;
  fetched_at: string | null;
  network: 'mainnet' | 'testnet';
  account: string;
}

/** `getVoters` with each voter's block height (NH-60 API). Same caller contract: `id` is live. */
export async function getVotesWithHeights(id: string): Promise<ProjectVotes> {
  const rows = await safeVoteRows();
  return {
    votes: rows.available ? votesFor(rows.rows, id) : [],
    available: rows.available,
    stale: rows.stale,
    fetched_at: rows.fetched_at,
    network: NETWORK,
    account: VOTE_ACCOUNT,
  };
}
