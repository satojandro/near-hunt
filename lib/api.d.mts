import type { ListingItem } from './listing.mjs';
import type { ThreadPost } from './discussion.mjs';

export declare const DEFAULT_LIMIT: 50;
export declare const MAX_LIMIT: 100;
export type ApiSort = 'newest' | 'votes' | 'name';
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
export declare function sortProjects<T extends ListingItem>(items: T[], sort: ApiSort, counts?: Record<string, number> | null): T[];
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
  items: ProjectSummary[];
  next_cursor: string | null;
  meta: {
    total: number;
    fetched_at: string;
    stale: boolean;
    votes_available: boolean;
    source: { account: string; prefix: 'project/'; network: 'mainnet' };
  };
}
export declare function projectsBody(
  list: { items: ListingItem[]; fetched_at: string; read_failing: boolean; account?: string },
  votes: { counts: Record<string, number>; available: boolean },
  query: ProjectsQuery,
): ProjectsBody;

export interface VoteItem { account_id: string; block_height: number }
export interface VotesBody {
  items: VoteItem[];
  next_cursor: string | null;
  meta: { total: number; source: { account: string; prefix: 'vote/'; network: string } };
}
export declare function votesBody(voters: VoteItem[], source: { account: string; network: string }, page: Page): VotesBody;

export interface DiscussionBody {
  items: ThreadPost[];
  next_cursor: string | null;
  meta: { root: ThreadPost | null; thread_url: string | null };
}
export declare function discussionBody(
  thread: { root: ThreadPost | null; replies: ThreadPost[]; next_cursor: string | null } | null,
  threadUrl: string | null,
): DiscussionBody;
