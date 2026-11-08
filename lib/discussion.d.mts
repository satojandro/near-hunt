export declare const SOCIAL_ACCOUNT: 'social';
export declare const SOCIAL_METHOD: '__fastdata_kv';
export declare const SOCIAL_GAS: string;
export declare const SOCIAL_DEPOSIT: '0';
export declare const MAX_POST_CHARS: number;
export declare const MAX_SHOWN_CHARS: number;
export declare const THREAD_TIMEOUT_MS: number;
export declare const THREAD_REVALIDATE_SECONDS: number;
export declare const REPLIES_LIMIT: number;
export declare const COUNTS_REVALIDATE_SECONDS: number;
export declare const BATCH_MAX: number;
export declare const HASHTAG: string;
export declare const SITE_ORIGIN: string;

export interface PostRef {
  account_id: string;
  post_id: string;
  /** `{account_id}/{post_id}` */
  key: string;
}

/** One near.social post, reduced to what the thread shows. `text` is plain text, never HTML. */
export interface ThreadPost {
  key: string;
  post_id: string;
  author: { account_id: string; name: string | null; avatar_url: string | null };
  text: string;
  truncated: boolean;
  media_count: number;
  has_quote: boolean;
  created_at: number | null;
  edited_at: number | null;
  block_height: number | null;
  reply_to: string | null;
  root: string | null;
  counts: { replies: number; likes: number; reposts: number; quotes: number };
  url: string;
}

export type ThreadResult =
  | { status: 'ok'; root: ThreadPost | null; replies: ThreadPost[]; reply_count: number; next_cursor: string | null }
  | { status: 'not_found' }
  | { status: 'invalid' }
  | { status: 'error'; reason: string };

export declare function isPostId(v: unknown): v is string;
export declare function parsePostRef(ref: unknown): PostRef | null;
export declare function postApiUrl(ref: string | PostRef, opts?: { base?: string }): string;
export declare function repliesApiUrl(
  ref: string | PostRef,
  opts?: { base?: string; limit?: number; cursor?: string | null },
): string;
export declare function txApiUrl(txHash: string, opts?: { base?: string }): string;
export declare function threadUrl(ref: string | PostRef): string;
export declare function hashtagPageUrl(tag?: string): string;
export declare function projectPageUrl(projectId: string): string;
export declare function displayText(text: unknown, max?: number): { text: string; truncated: boolean };
export declare function normalisePost(post: unknown): ThreadPost | null;
export declare function normaliseReplies(
  json: unknown,
  opts?: { parentKey?: string | null; limit?: number },
): { items: ThreadPost[]; next_cursor: string | null };
export declare function fetchThread(
  ref: string | null | undefined,
  opts?: {
    base?: string;
    limit?: number;
    timeoutMs?: number;
    revalidate?: number;
    cursor?: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<ThreadResult>;
export declare function fetchReplyCounts(
  items: Array<{ submission_id: string; social_post?: string | null }>,
  opts?: { base?: string; timeoutMs?: number; concurrency?: number; fetchImpl?: typeof fetch },
): Promise<{ counts: Record<string, number>; available: boolean; asked: number }>;

export declare function newPostId(now?: number, last?: number): string;
export declare function charCount(s: unknown): number;
export declare function replySuffix(projectId: string): string;
export declare function composeReplyText(
  draft: unknown,
  projectId: string,
): { ok: true; text: string } | { ok: false; error: 'empty' | 'too_long'; text?: string };
export declare function draftLimit(projectId: string): number;

export type ReplyArgs = Record<string, { text: string; reply_to: string; root: string } | Record<string, never>>;
export declare function replyArgs(opts: {
  parent: string | PostRef;
  parentRoot?: string | null;
  text: string;
  postId: string;
}): ReplyArgs;

export interface SocialAction {
  type: 'FunctionCall';
  params: { methodName: '__fastdata_kv'; args: Record<string, unknown>; gas: string; deposit: string };
}
export declare function socialAction(args: Record<string, unknown>): SocialAction;
export declare function replyTransaction(opts: {
  parent: string | PostRef;
  parentRoot?: string | null;
  text: string;
  postId: string;
}): { receiverId: 'social'; actions: SocialAction[] };

export type TxState = 'pending' | 'ok' | 'rate_limited' | 'invalid' | 'dropped' | 'error';
export declare function interpretTx(
  json: unknown,
  opts: { postKey: string; accountId?: string | null },
): { state: TxState; reason?: string | null };

interface PollOpts {
  base?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
}
export declare function confirmTx(
  opts: PollOpts & { txHash: string; postKey: string; accountId?: string | null },
): Promise<{ state: Exclude<TxState, 'pending'> | 'timeout'; reason?: string | null; attempts: number }>;
export declare function confirmPostExists(
  opts: PollOpts & { ref: string },
): Promise<{ state: 'ok' | 'timeout'; reason?: string | null; attempts: number }>;

export type ReplyOutcome = 'ok' | 'rate_limited' | 'invalid' | 'dropped' | 'rejected' | 'timeout' | 'error';
export interface ReplyResult {
  outcome: ReplyOutcome;
  reason: string | null;
  txHash: string | null;
  /** `{accountId}/{postId}` of the new reply. */
  postKey: string;
  text: string;
}
/** Anything shaped like NEAR Connect's `signAndSendTransaction`. */
export type SocialSignAndSend = (params: { receiverId: string; actions: SocialAction[] }) => Promise<unknown>;
export declare function submitReply(
  opts: PollOpts & {
    signAndSendTransaction: SocialSignAndSend;
    accountId: string;
    parent: string | PostRef;
    parentRoot?: string | null;
    text: string;
    postId?: string;
    onSent?: (sent: { kind: string; txHash: string | null; detail: string }) => void;
  },
): Promise<ReplyResult>;
export declare const SOCIAL_API: string;
