import type { KvEntry } from '../types/nearhunt';
import type { ListingItem } from './listing.mjs';

/** Storage prefix for project records on `nearhunt.near`. */
export declare const PROJECT_KEY_PREFIX: 'project/';

/** The walk's policy: page size, retries, timeouts. See the module doc. */
export declare const REFRESH: {
  readonly limit: number;
  readonly attemptsPerPage: number;
  readonly perPageTimeoutMs: number;
  readonly retryDelayMs: number;
  readonly maxPages: number;
  /** The whole walk, retries included, gives up after this long. */
  readonly walkBudgetMs: number;
};

export declare const PROJECTS_SNAPSHOT_KEY: string;
export declare const PROJECTS_MARKER_KEY: string;
export declare const PROJECTS_MEMORY_TTL_MS: number;
export declare const PROJECTS_STALE_AFTER_MS: number;
export declare const PROJECTS_RETRY_BACKOFF_MS: number;

/** Whether a request-path walk is still in its pause after a failure (no copy to serve). */
export declare function liveWalkCoolingDown(opts: { lastFailedAt: number; now: number }): boolean;

/** The stored listing plus when it was read. */
export interface ProjectsSnapshot {
  items: ListingItem[];
  fetched_at: string;
  account: string;
  /** `listingDigest(items)`, when known: lets the marker alone say the rows are unchanged. */
  digest?: string;
}

/** When the listing was last read successfully, what it hashed to, and how many rows it held. */
export interface ProjectsMarker {
  fetched_at: string;
  digest: string;
  rows: number;
}

export declare function isProjectsSnapshot(value: unknown): boolean;
export declare function isProjectsMarker(value: unknown): boolean;

/** Content identity of a listing, so an unchanged walk does not rewrite the stored copy. */
export declare function listingDigest(items: Array<object>): string;

/**
 * The copy to serve from the stored items plus the marker of the last good walk: `fetched_at` is
 * the newer of the two, so an unchanged listing read a minute ago reads as a minute old.
 */
export declare function resolveProjectsSnapshot(
  copy: ProjectsSnapshot | null,
  marker: ProjectsMarker | null,
): ProjectsSnapshot | null;

/**
 * The memory copy advanced by the marker when the rows are unchanged (same digest), the memory
 * copy as is when the marker is not newer, or null when the heavy copy has to be read.
 */
export declare function advanceFromMarker(
  memory: ProjectsSnapshot | null,
  marker: ProjectsMarker | null,
): ProjectsSnapshot | null;

/** Whether a request should walk live: only when the store gave no marker, at most once a minute. */
export declare function liveRefreshDue(opts: {
  snapshot: { fetched_at: string } | null;
  storeAnswered: boolean;
  lastAttemptAt: number;
  now: number;
}): boolean;

export declare function walkProjects(opts?: {
  account?: string;
  network?: 'mainnet' | 'testnet';
  fetchImpl?: typeof fetch;
  limits?: Partial<typeof REFRESH>;
}): Promise<{
  entries: KvEntry[];
  pages: number;
  ms: number;
  account: string;
  network: string;
}>;
