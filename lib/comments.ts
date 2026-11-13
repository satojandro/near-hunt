import 'server-only';
import { createHash } from 'node:crypto';
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
import { loadSnapshotValue, saveSnapshotValue } from './snapshot-store';
import { isFreshnessRecord, snapshotKey } from './snapshot.mjs';
import { copyIsStale } from './freshness.mjs';
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

/** The stored shape for comment rows: the rows plus when they were read. */
interface CommentRowsCopy {
  rows: Array<Record<string, unknown>>;
  fetched_at: string;
}

const isCommentRowsCopy = (value: unknown): boolean =>
  isFreshnessRecord(value, (rows) => Array.isArray(rows), 'rows');

/**
 * Per-project copies get their own key so one thread's fallback never stands in for another's.
 * The id is hashed: a submission id may hold any character but `/` (lib/comments.mjs `isProjectId`),
 * and `snapshotKey` throws on anything outside `[a-z0-9-]`. Stripping characters instead would let
 * two ids share a key, and an uppercase id would throw on the fallback path.
 */
const commentsKey = (projectId: string) =>
  snapshotKey(`comments-${createHash('sha256').update(projectId).digest('hex').slice(0, 32)}`);

/** Key for the all-projects copy, which is what the directory's comment counts are built from. */
const ALL_COMMENTS_KEY = snapshotKey('comments-all');

/** How long a failed comment read stops new attempts, per instance (see lib/projects.ts). */
const COMMENTS_RETRY_BACKOFF_MS = 5000;

interface CommentsState {
  inflight: Map<string, Promise<CommentRowsCopy>>;
  lastFailedAt: number;
}

/** Shared across bundle copies of this module, like every other per-instance state here. */
const STATE_KEY = Symbol.for('nearhunt.comments.state');
const state: CommentsState = ((globalThis as unknown as Record<symbol, CommentsState>)[STATE_KEY] ??= {
  inflight: new Map(),
  lastFailedAt: 0,
});

const projectRows = unstable_cache(
  async (projectId: string): Promise<CommentRowsCopy> => {
    try {
      const rows = await readProjectCommentRows({ projectId, account: COMMENT_ACCOUNT, network: NETWORK, fetchImpl: timedFetch });
      const copy = { rows: rows as Array<Record<string, unknown>>, fetched_at: new Date().toISOString() };
      await saveSnapshotValue(commentsKey(projectId), copy, `comments ${projectId}`);
      return copy;
    } catch (err) {
      state.lastFailedAt = Date.now();
      throw err;
    }
  },
  // v2: the cached value became `{rows, fetched_at}`; the key changes with the shape.
  ['nearhunt-comments-v2', NETWORK, COMMENT_ACCOUNT],
  { revalidate: COMMENTS_REVALIDATE_SECONDS, tags: ['comments'] },
);

const allRows = unstable_cache(
  async (): Promise<CommentRowsCopy> => {
    try {
      const rows = await readAllCommentRows({ account: COMMENT_ACCOUNT, network: NETWORK, fetchImpl: timedFetch });
      const copy = { rows: rows as Array<Record<string, unknown>>, fetched_at: new Date().toISOString() };
      await saveSnapshotValue(ALL_COMMENTS_KEY, copy, 'comment counts');
      return copy;
    } catch (err) {
      state.lastFailedAt = Date.now();
      throw err;
    }
  },
  ['nearhunt-comment-counts-v2', NETWORK, COMMENT_ACCOUNT],
  { revalidate: COUNTS_REVALIDATE_SECONDS, tags: ['comments'] },
);

/**
 * One read at a time per key, so several components asking for the same thread during a cold start
 * do not each walk the KV API.
 */
function rowsOnce(key: string, read: () => Promise<CommentRowsCopy>): Promise<CommentRowsCopy> {
  const running = state.inflight.get(key);
  if (running) return running;
  const started = read().finally(() => {
    state.inflight.delete(key);
  });
  state.inflight.set(key, started);
  return started;
}

/**
 * A copy the cache handed back, checked before use: the cache is not trusted to hold the current
 * shape (an entry from another deploy), nor to be current (an expired entry is served while the
 * re-read runs, and stays when that re-read fails).
 */
function checked(copy: CommentRowsCopy): { copy: CommentRowsCopy; stale: boolean } {
  if (!isCommentRowsCopy(copy)) throw new Error('cached comment rows have an unexpected shape');
  return { copy, stale: copyIsStale({ fetchedAt: copy.fetched_at, now: Date.now(), lastFailedAt: state.lastFailedAt }) };
}

function isCoolingDown(): boolean {
  return state.lastFailedAt > 0 && Date.now() - state.lastFailedAt < COMMENTS_RETRY_BACKOFF_MS;
}

export interface ProjectComments {
  /** Visible comments, oldest first. Empty when `available` is false. */
  items: Comment[];
  count: number;
  /** True when the thread can be shown at all, whether read now or restored from a stored copy. */
  available: boolean;
  /** True when `items` is a stored copy: say so, never present it as this minute's thread. */
  stale: boolean;
  /** When the rows behind `items` were read. Null when `available` is false. */
  fetched_at: string | null;
  network: 'mainnet' | 'testnet';
  account: string;
}

/** One project's visible comments. Never throws on a KV failure. */
export async function getProjectComments(projectId: string): Promise<ProjectComments> {
  if (!isCoolingDown()) {
    try {
      const { copy, stale } = checked(await rowsOnce(`project:${projectId}`, () => projectRows(projectId)));
      const { items, count } = commentThread(copy.rows as never[], projectId, { hidden: HIDDEN });
      return { items, count, available: true, stale, fetched_at: copy.fetched_at, network: NETWORK, account: COMMENT_ACCOUNT };
    } catch (err) {
      console.error('[comments] KV read failed:', err instanceof Error ? err.message : err);
    }
  }
  // Fall back to the thread as it last read, then (if this thread was never read) to the
  // all-projects copy, which holds the same rows. Either way it is labelled stale, never live.
  const own = await loadSnapshotValue<CommentRowsCopy>(commentsKey(projectId), isCommentRowsCopy, `comments ${projectId}`);
  const any = own ?? (await loadSnapshotValue<CommentRowsCopy>(ALL_COMMENTS_KEY, isCommentRowsCopy, 'comment counts'));
  const rows = own ? own.rows : (any?.rows ?? []).filter((row) => String(row.key ?? '').startsWith(`comment/${projectId}/`));
  const fetchedAt = own?.fetched_at ?? any?.fetched_at ?? null;
  if (rows.length > 0 || fetchedAt) {
    const { items, count } = commentThread(rows as never[], projectId, { hidden: HIDDEN });
    return { items, count, available: true, stale: true, fetched_at: fetchedAt, network: NETWORK, account: COMMENT_ACCOUNT };
  }
  return { items: [], count: 0, available: false, stale: false, fetched_at: null, network: NETWORK, account: COMMENT_ACCOUNT };
}

export interface CommentCounts {
  /** submission_id -> visible comments. A project with none is absent. */
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

export interface CommentRowSet {
  rows: Array<Record<string, unknown>>;
  /** False when no rows could be read and no copy was stored. */
  available: boolean;
  /** True when `rows` is a saved copy rather than this minute's read. */
  stale: boolean;
  fetched_at: string | null;
}

/** Every `comment/` row, falling back to the stored copy before giving up. Never throws. */
export async function getAllCommentRows(): Promise<CommentRowSet> {
  if (!isCoolingDown()) {
    try {
      const { copy, stale } = checked(await rowsOnce('all', () => allRows()));
      return { rows: copy.rows, available: true, stale, fetched_at: copy.fetched_at };
    } catch (err) {
      console.error('[comments] KV count read failed:', err instanceof Error ? err.message : err);
    }
  }
  const stored = await loadSnapshotValue<CommentRowsCopy>(ALL_COMMENTS_KEY, isCommentRowsCopy, 'comment counts');
  if (stored) return { rows: stored.rows, available: true, stale: true, fetched_at: stored.fetched_at };
  return { rows: [], available: false, stale: false, fetched_at: null };
}

/** Visible comment counts for the given projects (NH-43 "Most discussed"). Never throws. */
export async function getCommentCounts(projectIds: string[]): Promise<CommentCounts> {
  const set = await getAllCommentRows();
  return {
    counts: set.available ? countComments(set.rows as never[], { hidden: HIDDEN, projectIds }) : {},
    available: set.available,
    stale: set.stale,
    fetched_at: set.fetched_at,
    network: NETWORK,
    account: COMMENT_ACCOUNT,
  };
}
