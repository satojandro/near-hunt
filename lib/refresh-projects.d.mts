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
};

export declare const PROJECTS_SNAPSHOT_KEY: string;
export declare const PROJECTS_MARKER_KEY: string;
export declare const PROJECTS_MEMORY_TTL_MS: number;
export declare const PROJECTS_STALE_AFTER_MS: number;

/** The stored listing plus when it was read. */
export interface ProjectsSnapshot {
  items: ListingItem[];
  fetched_at: string;
  account: string;
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
