import type { KvEntry } from '../types/nearhunt';

export declare const VOTE_PREFIX: 'vote/';
export declare function idFromVoteKey(key: unknown): string | null;
export declare function isActiveVote(value: unknown): value is Record<string, unknown>;
export declare function latestPerWriter<T extends Partial<KvEntry>>(rows: T[] | null | undefined): T[];
/** submission_id -> active vote count; every id in `projectIds` is present. */
export declare function tallyVotes(rows: Partial<KvEntry>[], projectIds: Iterable<string>): Record<string, number>;
/** Voter account ids (row `predecessor_id`), latest vote first. */
export declare function votersFor(rows: Partial<KvEntry>[], id: string): string[];
/** Active votes on `id` with each voter's block height, latest first. */
export declare function votesFor(
  rows: Partial<KvEntry>[],
  id: string,
): Array<{ account_id: string; block_height: number }>;

interface VoteReadOpts {
  account?: string;
  network?: 'mainnet' | 'testnet';
  fetchImpl?: typeof fetch;
}
export declare function readVoteRows(opts?: VoteReadOpts): Promise<KvEntry[]>;
export declare function readProjectVoteRows(id: string, opts?: VoteReadOpts): Promise<KvEntry[]>;
