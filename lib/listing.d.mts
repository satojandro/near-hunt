import type { KvEntry, Project } from '../types/nearhunt';

export declare const PROJECT_SCHEMA: 'nearhunt/project/1';

/** A project record plus where it lives on chain. */
export interface ListingItem extends Project {
  submission_id: string;
  /** Storage key, `project/{submission_id}`. */
  key: string;
  /** Namespace account, `nearhunt.near`. */
  account: string;
  block_height: number;
  /** Nanoseconds since epoch as an exact decimal string (the KV API's digits), or null. */
  block_timestamp: string | null;
}

export declare function toListing(entries: KvEntry[]): ListingItem[];
/**
 * Drop listings named in the owner's hide list (data/hidden-projects.json, NH-108). Matches on
 * `submission_id` only; hides for display, never tombstones the record on chain.
 */
export declare function filterHidden(
  items: ListingItem[],
  hidden: { projects?: Array<{ submission_id?: string } | string> } | Array<string | { submission_id?: string }>,
): ListingItem[];
export declare function trackCounts(items: ListingItem[]): Array<{ track: string; count: number }>;

/**
 * KV rows -> the listing the app serves: `toListing` then the owner's hide list. Used by both the
 * cron walker and the request-path fallback, so both produce the same copy.
 */
export declare function buildProjectsListing(
  entries: KvEntry[],
  hidden: { projects?: Array<{ submission_id?: string } | string> } | Array<string | { submission_id?: string }>,
): ListingItem[];
