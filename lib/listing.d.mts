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
export declare function trackCounts(items: ListingItem[]): Array<{ track: string; count: number }>;
