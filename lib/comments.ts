import 'server-only';
import { unstable_cache } from 'next/cache';
import { NETWORK, VOTE_ACCOUNT } from './network.mjs';
import {
  COMMENTS_REVALIDATE_SECONDS,
  COMMENTS_TIMEOUT_MS,
  COUNTS_REVALIDATE_SECONDS,
  commentThread,
  countComments,
  parseHideList,
  readAllCommentRows,
  readProjectCommentRows,
} from './comments.mjs';
import type { Comment, HideEntry } from './comments.mjs';
import hiddenFile from '../data/hidden-comments.json';

/**
 * Server-side comment reads (NH-44).
 *
 * Comments live in the `nearhunt.near` namespace, written by each commenter, so every read is
 * across writers. The hide list is the repo file `data/hidden-comments.json`: it is code, so hiding
 * a comment is a reviewed change (AGENTS.md §3), and it is applied on read — the chain keeps the
 * row, the site does not show it.
 */

/** Comments are read from the same namespace as votes on the active network. */
export const COMMENT_ACCOUNT = VOTE_ACCOUNT;

const HIDDEN: HideEntry[] = parseHideList(hiddenFile);

/** The reviewed hide list, for the account page's "my comments" read (NH-52). */
export const HIDDEN_COMMENTS: HideEntry[] = HIDDEN;

/** A slow indexer must not hold the page. */
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(COMMENTS_TIMEOUT_MS) });

const projectRows = unstable_cache(
  async (projectId: string) =>
    readProjectCommentRows({ projectId, account: COMMENT_ACCOUNT, network: NETWORK, fetchImpl: timedFetch }),
  ['nearhunt-comments-v1', NETWORK, COMMENT_ACCOUNT],
  { revalidate: COMMENTS_REVALIDATE_SECONDS, tags: ['comments'] },
);

const allRows = unstable_cache(
  async () => readAllCommentRows({ account: COMMENT_ACCOUNT, network: NETWORK, fetchImpl: timedFetch }),
  ['nearhunt-comment-counts-v1', NETWORK, COMMENT_ACCOUNT],
  { revalidate: COUNTS_REVALIDATE_SECONDS, tags: ['comments'] },
);

export interface ProjectComments {
  /** Visible comments, oldest first. Empty when `available` is false. */
  items: Comment[];
  count: number;
  /** False when the KV read failed: say so rather than "no comments". */
  available: boolean;
  network: 'mainnet' | 'testnet';
  account: string;
}

/** One project's visible comments. Never throws on a KV failure. */
export async function getProjectComments(projectId: string): Promise<ProjectComments> {
  try {
    const rows = await projectRows(projectId);
    const { items, count } = commentThread(rows, projectId, { hidden: HIDDEN });
    return { items, count, available: true, network: NETWORK, account: COMMENT_ACCOUNT };
  } catch (err) {
    console.error('[comments] KV read failed:', err instanceof Error ? err.message : err);
    return { items: [], count: 0, available: false, network: NETWORK, account: COMMENT_ACCOUNT };
  }
}

export interface CommentCounts {
  /** submission_id -> visible comments. A project with none is absent. */
  counts: Record<string, number>;
  /** False when the KV read failed: show "unavailable", not zeros. */
  available: boolean;
  network: 'mainnet' | 'testnet';
  account: string;
}

/** Visible comment counts for the given projects (NH-43 "Most discussed"). Never throws. */
export async function getCommentCounts(projectIds: string[]): Promise<CommentCounts> {
  try {
    const rows = await allRows();
    return {
      counts: countComments(rows, { hidden: HIDDEN, projectIds }),
      available: true,
      network: NETWORK,
      account: COMMENT_ACCOUNT,
    };
  } catch (err) {
    console.error('[comments] KV count read failed:', err instanceof Error ? err.message : err);
    return { counts: {}, available: false, network: NETWORK, account: COMMENT_ACCOUNT };
  }
}
