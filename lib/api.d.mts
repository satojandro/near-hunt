import type { ListingItem } from './listing.mjs';
import type { ThreadPost } from './discussion.mjs';

export declare const DEFAULT_LIMIT: 50;
export declare const MAX_LIMIT: 100;
export type ApiSort = 'newest' | 'votes' | 'comments' | 'name';
export declare const SORT_ALIASES: { readonly upvoted: 'votes'; readonly discussed: 'comments' };
export declare const API_SORTS: readonly ApiSort[];
export declare const DEFAULT_API_SORT: 'newest';
export declare const PROJECT_PREFIX: 'project/';
export declare const VOTE_PREFIX: 'vote/';
export declare const CACHE: { projects: string; votes: string; discussion: string; error: string };
export declare const CORS_HEADERS: Record<string, string>;
export declare function apiHeaders(cacheControl: string): Record<string, string>;

export type ApiErrorCode = 'not_found' | 'bad_request' | 'unavailable';
export declare class ApiError extends Error {
  constructor(status: number, code: ApiErrorCode, message: string);
  status: number;
  code: ApiErrorCode;
}
export declare function badRequest(message: string): ApiError;
export declare function notFound(message: string): ApiError;
export declare function unavailable(message: string): ApiError;
export declare function errorBody(code: ApiErrorCode, message: string): { error: ApiErrorCode; message: string };

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

export declare function parseLimit(raw: string | null | undefined): number;
export declare function encodeCursor(offset: number): string;
export declare function decodeCursor(raw: string | null | undefined): number;
export declare function encodeUpstreamCursor(upstream: string): string;
export declare function decodeUpstreamCursor(raw: string | null | undefined): string | null;
export interface Page { limit: number; offset: number }
export declare function parsePage(params: Params): Page;
export interface ProjectsQuery extends Page { track: string | null; sort: ApiSort; q: string }
export declare function parseProjectsQuery(params: Params): ProjectsQuery;

export declare function filterTrack<T extends { tracks: string[] }>(items: T[], track: string | null): T[];
export declare function searchProjects<T extends { name: string; description: string | null }>(items: T[], q: string): T[];
export declare function sortProjects<T extends ListingItem>(items: T[], sort: ApiSort, counts?: Record<string, number> | null, commentCounts?: Record<string, number> | null): T[];
export declare function paginate<T>(items: T[], offset: number, limit: number): { items: T[]; next_cursor: string | null };

export interface ProjectSummary extends ListingItem {
  votes: number | null;
  url: string;
}
export interface ApiProject extends ProjectSummary {
  record_url: string;
}
export declare function toSummary(item: ListingItem, counts: Record<string, number> | null): ProjectSummary;
export declare function recordUrl(submissionId: string, account?: string): string;
export declare function toProject(item: ListingItem, votes: number | null): ApiProject;

export interface ProjectsBody {
  /** `comments` is present when the caller passed comment counts; null when their read failed. */
  items: Array<ProjectSummary & { comments?: number | null }>;
  next_cursor: string | null;
  meta: {
    total: number;
    fetched_at: string;
    stale: boolean;
    votes_available: boolean;
    /** True when the vote counts are a saved copy, read at `votes_fetched_at`. */
    votes_stale: boolean;
    votes_fetched_at: string | null;
    comments_available?: boolean;
    comments_stale?: boolean;
    comments_fetched_at?: string | null;
    source: { account: string; prefix: 'project/'; network: 'mainnet' };
  };
}
export declare function projectsBody(
  list: { items: ListingItem[]; fetched_at: string; read_failing: boolean; account?: string },
  votes: { counts: Record<string, number>; available: boolean; stale?: boolean; fetched_at?: string | null },
  query: ProjectsQuery,
  comments?: { counts: Record<string, number>; available: boolean; stale?: boolean; fetched_at?: string | null },
): ProjectsBody;

export interface VoteItem { account_id: string; block_height: number }
export interface VotesBody {
  items: VoteItem[];
  next_cursor: string | null;
  meta: { total: number; stale: boolean; fetched_at: string | null; source: { account: string; prefix: 'vote/'; network: string } };
}
export declare function votesBody(voters: VoteItem[], source: { account: string; network: string; stale?: boolean; fetched_at?: string | null }, page: Page): VotesBody;

export interface DiscussionItem {
  key: string;
  id: string;
  ref: string;
  author: string;
  text: string;
  truncated: boolean;
  created_at: number | null;
  block_height: number | null;
  reply_to: string | null;
  url: string;
}
export interface DiscussionBody {
  items: DiscussionItem[];
  next_cursor: string | null;
  meta: {
    total: number;
    stale: boolean;
    fetched_at: string | null;
    source: { account: string; prefix: 'comment/'; network: string };
    policy_url: string;
  };
}
export declare function discussionBody(
  comments: import('./comments.d.mts').Comment[],
  source: { account: string; network: string; stale?: boolean; fetched_at?: string | null },
  page: Page,
): DiscussionBody;
