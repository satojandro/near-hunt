import type { KvEntry } from '../types/nearhunt';
import type { SocialProfile } from './social.mjs';

export declare const ABOUT_MAX: number;

export interface AccountProfile extends SocialProfile {
  has_profile: boolean;
  /** Plain text, one line, truncated. Never HTML. */
  about: string | null;
  followers: number | null;
  posts: number | null;
}

export declare function normaliseAccountProfile(json: unknown, accountId: string): AccountProfile;
export declare function fetchAccountProfile(
  accountId: string,
  opts?: { base?: string; timeoutMs?: number; revalidate?: number; fetchImpl?: typeof fetch },
): Promise<{ status: 'ok' | 'error'; profile: AccountProfile }>;

export declare function readAccountVoteRows(opts: {
  accountId: string;
  account?: string;
  network?: 'mainnet' | 'testnet';
  fetchImpl?: typeof fetch;
}): Promise<KvEntry[]>;

export interface AccountUpvote<P> {
  id: string;
  block_height: number;
  /** Nanoseconds since epoch, or null. */
  block_timestamp: number | null;
  project: P;
}
export declare function accountUpvotes<P extends { submission_id: string }>(
  rows: ReadonlyArray<Partial<KvEntry>> | null | undefined,
  accountId: string,
  projects: Iterable<P> | null | undefined,
): AccountUpvote<P>[];

export declare function nsToMs(ns: unknown): number | null;
