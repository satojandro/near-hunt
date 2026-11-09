export declare const COMMENT_PREFIX: 'comment/';
export declare const COMMENT_METHOD: '__fastdata_kv';
export declare const COMMENT_GAS: string;
export declare const COMMENT_DEPOSIT: '0';
export declare const MAX_COMMENT_CHARS: number;
export declare const MAX_SHOWN_CHARS: number;
export declare const COMMENTS_LIMIT: number;
export declare const PAGE_LIMIT: number;
export declare const COMMENTS_TIMEOUT_MS: number;
export declare const COMMENTS_REVALIDATE_SECONDS: number;
export declare const COUNTS_REVALIDATE_SECONDS: number;
export declare const SITE_ORIGIN: string;
export declare const POLICY_PATH: string;

/** One visible comment. `text` is plain text, never HTML or markdown. */
export interface Comment {
  /** `comment/{project_id}/{id}` */
  key: string;
  /** The writer's Unix time in ms, as a decimal string. */
  id: string;
  /** `{author}/{id}` — what `reply_to` points at. */
  ref: string;
  project_id: string;
  /** The row's `predecessor_id`. Never read from the key or the value. */
  author: string;
  text: string;
  truncated: boolean;
  created_at: number | null;
  block_height: number | null;
  reply_to: string | null;
  url: string;
}

export interface CommentNode extends Comment {
  replies: Comment[];
}

export interface HideEntry {
  project_id: string;
  author: string;
  id: string;
  reason: string | null;
  added_at: string | null;
}

export declare function isCommentId(v: unknown): v is string;
export declare function isProjectId(v: unknown): v is string;
export declare function commentKey(projectId: string, id: string): string;
export declare function parseCommentKey(key: unknown): { project_id: string; id: string; key: string } | null;
export declare function commentRef(accountId: string, id: string): string;
export declare function parseCommentRef(ref: unknown): { account_id: string; id: string; key: string } | null;
export declare function commentUrl(projectId: string, accountId: string, id: string): string;
export declare function policyUrl(): string;

export declare function charCount(s: unknown): number;
export declare function cleanCommentText(text: unknown): string;
export declare function validateCommentText(
  text: unknown,
): { ok: true; text: string } | { ok: false; error: 'empty' | 'too_long'; text: string };

export declare function newCommentId(now?: number, last?: number): string;
export declare function commentArgs(opts: {
  projectId: string;
  id: string;
  text: string;
  replyTo?: string | null;
}): Record<string, { text: string; reply_to?: string }>;
export declare function deleteCommentArgs(opts: { projectId: string; id: string }): Record<string, null>;
export declare function commentAction(
  args: Record<string, unknown>,
  methodName?: string,
): { type: 'FunctionCall'; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } };
export declare function commentTransaction(opts: {
  account: string;
  args: Record<string, unknown>;
  methodName?: string;
}): { receiverId: string; actions: Array<{ type: 'FunctionCall'; params: Record<string, unknown> }> };
export declare function postCommentTransaction(opts: {
  account: string;
  projectId: string;
  id: string;
  text: string;
  replyTo?: string | null;
  methodName?: string;
}): { receiverId: string; actions: Array<{ type: 'FunctionCall'; params: Record<string, unknown> }> };
export declare function removeCommentTransaction(opts: {
  account: string;
  projectId: string;
  id: string;
  methodName?: string;
}): { receiverId: string; actions: Array<{ type: 'FunctionCall'; params: Record<string, unknown> }> };

export declare function commentFromRow(
  row: unknown,
  opts?: { projectId?: string | null; hidden?: HideEntry[] },
): Comment | null;
export declare function isHidden(comment: Pick<Comment, 'project_id' | 'author' | 'id'>, hidden?: HideEntry[]): boolean;
export declare function parseHideList(json: unknown): HideEntry[];
export declare function latestRows<T extends object>(rows: T[] | null | undefined): T[];
export declare function commentThread(
  rows: unknown[],
  projectId: string,
  opts?: { hidden?: HideEntry[] },
): { items: Comment[]; count: number };
export declare function threadView(items: Comment[]): CommentNode[];

export declare function readProjectCommentRows(opts: {
  projectId: string;
  account: string;
  network?: 'mainnet' | 'testnet';
  fetchImpl?: typeof fetch;
}): Promise<Array<{ predecessor_id: string; key: string; value: unknown; block_height: number }>>;
export declare function readAllCommentRows(opts: {
  account: string;
  network?: 'mainnet' | 'testnet';
  fetchImpl?: typeof fetch;
}): Promise<Array<{ predecessor_id: string; key: string; value: unknown; block_height: number }>>;
export declare function countComments(
  rows: unknown[],
  opts?: { hidden?: HideEntry[]; projectIds?: Iterable<string> | null },
): Record<string, number>;
export declare function accountCommentsUrl(opts: { network: string; account: string; accountId: string }): string;
export declare function readAccountComment(opts: {
  network: 'mainnet' | 'testnet';
  account: string;
  accountId: string;
  projectId: string;
  id: string;
  fetchImpl?: typeof fetch;
}): Promise<{ exists: boolean; deleted: boolean; text: string | null; blockHeight: number | null }>;
export declare function confirmComment(opts: {
  network: 'mainnet' | 'testnet';
  account: string;
  accountId: string;
  projectId: string;
  id: string;
  text?: string | null;
  deleted?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ confirmed: boolean; blockHeight: number | null; attempts: number; lastError: string | null }>;

export interface SubmitCommentResult {
  outcome: 'confirmed' | 'timeout' | 'rejected' | 'failed';
  kind: string;
  txHash: string | null;
  detail: string;
  id: string;
  key: string;
  text: string | null;
  blockHeight: number | null;
  usedFallback: boolean;
}

export declare function submitComment(opts: {
  signAndSendTransaction: (tx: unknown) => Promise<unknown>;
  fallbackSend?: (sent: unknown) => unknown | Promise<unknown>;
  network: 'mainnet' | 'testnet';
  account: string;
  accountId: string;
  projectId: string;
  id?: string;
  text?: string | null;
  replyTo?: string | null;
  methodName?: string;
  deleted?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
  timeoutMs?: number;
  intervalMs?: number;
  onSent?: (sent: unknown) => void;
}): Promise<SubmitCommentResult>;
