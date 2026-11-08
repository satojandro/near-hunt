import 'server-only';
import { unstable_cache } from 'next/cache';
import { NETWORK, VOTE_ACCOUNT } from './network.mjs';
import { readVoteRows, tallyVotes, votersFor, votesFor } from './votes.mjs';
import { getProjects } from './projects';
import type { KvEntry } from '../types/nearhunt';

/** Seconds a cached copy of the vote rows is served before the KV API is read again. */
export const VOTES_REVALIDATE_SECONDS = 20;
/** Per-request timeout for vote reads: a slow indexer must not hold the page. */
export const VOTES_TIMEOUT_MS = 5000;

type VoteRow = Pick<KvEntry, 'predecessor_id' | 'key' | 'value' | 'block_height' | 'block_timestamp'>;

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(VOTES_TIMEOUT_MS) });

/**
 * Every latest `vote/` row under `VOTE_ACCOUNT` on `NETWORK` (one paginated prefix read, see
 * `readVoteRows`), trimmed to the fields the tally uses. Cached ~20 s under the `votes` tag so
 * NH-31 can `revalidateTag('votes')` after a confirmed write. Errors are not cached.
 */
const getVoteRows = unstable_cache(
  async (): Promise<VoteRow[]> => {
    const rows = await readVoteRows({ account: VOTE_ACCOUNT, network: NETWORK, fetchImpl: timedFetch });
    return rows.map(({ predecessor_id, key, value, block_height, block_timestamp }) => ({
      predecessor_id, key, value, block_height, block_timestamp,
    }));
  },
  ['nearhunt-votes-v2', NETWORK, VOTE_ACCOUNT],
  { revalidate: VOTES_REVALIDATE_SECONDS, tags: ['votes'] },
);

/** `ok: false` means the vote rows could not be read; counts are then empty, not zero. */
async function safeVoteRows(): Promise<{ ok: true; rows: VoteRow[] } | { ok: false; rows: [] }> {
  try {
    return { ok: true, rows: await getVoteRows() };
  } catch (err) {
    console.error('[votes] KV read failed:', err instanceof Error ? err.message : err);
    return { ok: false, rows: [] };
  }
}

export interface VoteCounts {
  /** submission_id -> count. Empty when `available` is false. */
  counts: Record<string, number>;
  /** False when the KV read failed: show "unavailable", not zeros. */
  available: boolean;
  network: 'mainnet' | 'testnet';
  account: string;
}

/** Per-project vote counts for every live project. Never throws on a votes read failure. */
export async function getVoteCounts(): Promise<VoteCounts> {
  const [{ items }, votes] = await Promise.all([getProjects(), safeVoteRows()]);
  return {
    counts: votes.ok ? tallyVotes(votes.rows, items.map((p) => p.submission_id)) : {},
    available: votes.ok,
    network: NETWORK,
    account: VOTE_ACCOUNT,
  };
}

export interface ProjectVoters {
  /** Voter accounts (row `predecessor_id`), latest vote first. */
  voters: string[];
  count: number;
  available: boolean;
  network: 'mainnet' | 'testnet';
  account: string;
}

/**
 * Voters for one project. The caller must already know `id` is a live project (the project page
 * 404s otherwise), which is the "ignore ids with no record" rule for a single project.
 */
export async function getVoters(id: string): Promise<ProjectVoters> {
  const votes = await safeVoteRows();
  const voters = votes.ok ? votersFor(votes.rows, id) : [];
  return { voters, count: voters.length, available: votes.ok, network: NETWORK, account: VOTE_ACCOUNT };
}

export interface ProjectVotes {
  /** Active votes, voter = row `predecessor_id`, latest vote first. Empty when `available` is false. */
  votes: Array<{ account_id: string; block_height: number }>;
  available: boolean;
  network: 'mainnet' | 'testnet';
  account: string;
}

/** `getVoters` with each voter's block height (NH-60 API). Same caller contract: `id` is live. */
export async function getVotesWithHeights(id: string): Promise<ProjectVotes> {
  const rows = await safeVoteRows();
  return { votes: rows.ok ? votesFor(rows.rows, id) : [], available: rows.ok, network: NETWORK, account: VOTE_ACCOUNT };
}
