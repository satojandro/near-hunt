import type { ListingItem } from './listing.mjs';

export type DirectorySort = 'upvoted' | 'newest';
export type SearchParamsRecord = Record<string, string | string[] | undefined>;
/** submission_id -> vote count (NH-33 tally; missing = 0). */
export type Votes = Record<string, number>;

export interface DirectoryState {
  q: string;
  track: string | null;
  sort: DirectorySort;
}

export interface TrackChip {
  /** null = "All". */
  track: string | null;
  count: number;
  active: boolean;
}

export interface DirectoryView {
  state: DirectoryState;
  total: number;
  results: ListingItem[];
  chips: TrackChip[];
}

export declare const SORTS: readonly DirectorySort[];
export declare const DEFAULT_SORT: 'newest';
export declare function normalizeText(s: unknown): string;
export declare function parseParams(params?: SearchParamsRecord, knownTracks?: string[]): DirectoryState;
export declare function searchItems<T extends { name: string }>(items: T[], q: string): T[];
export declare function filterByTrack<T extends { tracks: string[] }>(items: T[], track: string | null): T[];
export declare function sortItems<T extends ListingItem>(items: T[], sort: DirectorySort, votes?: Votes): T[];
export declare function trackChips(allItems: ListingItem[], searched: ListingItem[], activeTrack: string | null): TrackChip[];
export declare function buildHref(state: DirectoryState, overrides?: Partial<DirectoryState>): string;
export declare function hostOf(url: string | null | undefined): string | null;
export declare function formatFetchedUtc(iso: string): string | null;
export declare function directoryView(items: ListingItem[], params: SearchParamsRecord, votes?: Votes): DirectoryView;
