export declare const SOCIAL_API: string;
export declare const SOCIAL_WEB: string;
export declare const DEFAULT_HASHTAG: string;
export declare const FEED_LIMIT: number;
export declare const FEED_TIMEOUT_MS: number;
export declare const FEED_REVALIDATE_SECONDS: number;
export declare const EXCERPT_MAX: number;

/** One post from a near.social hashtag feed, reduced to what the sidebar shows. */
export interface SocialPost {
  /** `{account_id}/{post_id}` */
  key: string;
  post_id: string;
  author: {
    account_id: string;
    name: string | null;
    /** https only, or null. */
    avatar_url: string | null;
  };
  /** Plain text, single line, truncated. Never HTML. */
  excerpt: string;
  /** Milliseconds since epoch. */
  created_at: number;
  block_height: number | null;
  reposted_by: string | null;
  /** `https://near.social/{account_id}/post/{post_id}` */
  url: string;
}

export type HashtagFeedResult =
  | { status: 'ok'; items: SocialPost[]; hashtag: string }
  | { status: 'error'; reason: string; hashtag: string };

export declare function isAccountId(v: unknown): v is string;
export declare function postUrl(accountId: string, postId: string): string;
export declare function hashtagUrl(tag: string): string;
export declare function hashtagFeedUrl(tag: string, opts?: { limit?: number; base?: string }): string;
export declare function plainExcerpt(text: unknown, max?: number): string;
export declare function normaliseHashtagFeed(
  json: unknown,
  opts?: { limit?: number },
): { items: SocialPost[]; next_cursor: string | null };
export declare function relativeTime(ms: number, now: number): string;
export declare const PROFILE_TIMEOUT_MS: number;
export declare const PROFILE_REVALIDATE_SECONDS: number;

/** A near.social profile, reduced to what an avatar list shows. */
export interface SocialProfile {
  account_id: string;
  name: string | null;
  /** https only, or null. */
  avatar_url: string | null;
}

export declare function profileApiUrl(accountId: string, opts?: { base?: string }): string;
export declare function profileUrl(accountId: string): string;
export declare function normaliseProfile(json: unknown, accountId: string): SocialProfile;
export declare function fetchProfiles(
  accountIds: string[],
  opts?: { base?: string; timeoutMs?: number; revalidate?: number; fetchImpl?: typeof fetch },
): Promise<{ status: 'ok' | 'error'; profiles: SocialProfile[] }>;

export declare function fetchHashtagFeed(opts?: {
  hashtag?: string;
  limit?: number;
  base?: string;
  timeoutMs?: number;
  revalidate?: number;
  fetchImpl?: typeof fetch;
}): Promise<HashtagFeedResult>;
