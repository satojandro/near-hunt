import type { ListingItem } from './listing.mjs';

export type DirectorySort = 'upvoted' | 'newest' | 'discussed';
export type SearchParamsRecord = Record<string, string | string[] | undefined>;
/** submission_id -> vote count (NH-33 tally; missing = 0). */
export type Votes = Record<string, number>;
/** submission_id -> visible comment count (NH-43, from `comment/` rows). */
export type Replies = Record<string, number>;

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
  visible: ListingItem[];
  more: { count: number; remaining: number; href: string } | null;
  chips: TrackChip[];
}

export declare const SORTS: readonly DirectorySort[];
export declare const DEFAULT_SORT: 'upvoted';
export declare const PAGE_SIZE: number;
export declare function parseShow(params?: SearchParamsRecord): number;
export declare function normalizeText(s: unknown): string;
export declare function parseParams(params?: SearchParamsRecord, knownTracks?: string[]): DirectoryState;
export declare function searchItems<T extends { name: string }>(items: T[], q: string): T[];
export declare function filterByTrack<T extends { tracks: string[] }>(items: T[], track: string | null): T[];
export declare function sortItems<T extends ListingItem>(items: T[], sort: DirectorySort, votes?: Votes, replies?: Replies): T[];
export declare function trackChips(allItems: ListingItem[], searched: ListingItem[], activeTrack: string | null): TrackChip[];
export declare function buildHref(state: DirectoryState, overrides?: Partial<DirectoryState> & { show?: number }): string;
export declare function hostOf(url: string | null | undefined): string | null;
export declare function formatFetchedUtc(iso: string): string | null;
/** NH-43: `0` when the read succeeded and the project has none; `undefined` when the count is unknown. */
export declare function cardCommentCount(
  counts: Record<string, number> | null | undefined,
  id: string,
  available?: boolean,
): number | undefined;
export declare function directoryView(items: ListingItem[], params: SearchParamsRecord, votes?: Votes, replies?: Replies): DirectoryView;
