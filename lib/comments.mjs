/**
 * Native comments for a project (NH-44, owner decision 9 Nov; docs/PLAN.md).
 *
 * A comment is a FastData KV row in the `nearhunt.near` namespace, written by the commenter from
 * their own account:
 *
 *   key    comment/{submission_id}/{ms}       ms = the writer's Unix time in ms
 *   value  { "text": "…", "reply_to": "{account_id}/{ms}"? }
 *          null = deleted (latest row per writer, so a deletion hides the comment)
 *
 * The author is the row's `predecessor_id`, exactly like a vote — never an account id inside the
 * key or the value (AGENTS.md §3). Only the author can delete, because only they can write their
 * own row.
 *
 * The write is a FunctionCall to `__fastdata_kv` with the login key: the receiver has no contract,
 * so the receipt always fails with `CodeDoesNotExist`. That means "written", it is never retried,
 * and the KV index decides whether the comment exists (same path as votes,
 * docs/spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md).
 *
 * Reading: one prefix read, `POST /v0/latest/nearhunt.near` with `key_prefix` `comment/{id}/`,
 * across writers. Text is plain text and is never rendered as HTML or markdown.
 *
 * Pure functions plus never-throwing readers, so everything is unit-testable without a network.
 */

import { KV_HOSTS, readLatest } from './kv.mjs';
import { isAccountId } from './social.mjs';
import { classifySendResult } from './vote-client.mjs';

export const COMMENT_PREFIX = 'comment/';
export const COMMENT_METHOD = '__fastdata_kv';
/**
 * 1 Ggas, the same envelope votes use. The call runs no code, so this is a ceiling, not a cost;
 * a function-call key pays gas from a limited allowance, so it stays small.
 */
export const COMMENT_GAS = '1000000000';
export const COMMENT_DEPOSIT = '0';

/** Plain text limit (owner decision, docs/PLAN.md NH-44). */
export const MAX_COMMENT_CHARS = 2000;
/** How much of a comment the page shows. The chain keeps the full text. */
export const MAX_SHOWN_CHARS = 2000;
/** Rows fetched per KV page. One project's comments fit in one page for a long time. */
export const COMMENTS_LIMIT = 200;
/** Comments the page and the API show, newest last. */
export const PAGE_LIMIT = 50;
export const COMMENTS_TIMEOUT_MS = 5000;
export const COMMENTS_REVALIDATE_SECONDS = 15;
export const COUNTS_REVALIDATE_SECONDS = 60;

export const SITE_ORIGIN = 'https://nearhunt.xyz';
export const POLICY_PATH = '/comment-policy';

const ID_RE = /^[1-9][0-9]{0,15}$/;
const MAX_ID = 9007199254740991; // 2^53 − 1

// C0 controls except \n and \t, DEL, zero-width and bidi overrides.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

// ---------------------------------------------------------------------------------------------
// Keys and references
// ---------------------------------------------------------------------------------------------

export function isCommentId(v) {
  return typeof v === 'string' && ID_RE.test(v) && Number(v) <= MAX_ID;
}

/** A submission id may be anything the record uses, but never a `/` (that would nest keys). */
export function isProjectId(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 128 && !v.includes('/') && !/[\u0000-\u001F]/.test(v);
}

/** `comment/{submission_id}/{ms}`. Throws on an id that no reader could parse back. */
export function commentKey(projectId, id) {
  if (!isProjectId(projectId)) throw new TypeError(`invalid submission id: ${JSON.stringify(projectId)}`);
  if (!isCommentId(id)) throw new TypeError(`invalid comment id: ${JSON.stringify(id)}`);
  return `${COMMENT_PREFIX}${projectId}/${id}`;
}

/** `"comment/{id}/{ms}"` -> `{project_id, id, key}`; anything else -> null. */
export function parseCommentKey(key) {
  if (typeof key !== 'string' || !key.startsWith(COMMENT_PREFIX)) return null;
  const rest = key.slice(COMMENT_PREFIX.length);
  const slash = rest.lastIndexOf('/');
  if (slash <= 0) return null;
  const project_id = rest.slice(0, slash);
  const id = rest.slice(slash + 1);
  if (!isProjectId(project_id) || !isCommentId(id)) return null;
  return { project_id, id, key: `${COMMENT_PREFIX}${project_id}/${id}` };
}

/** A comment author and id: `{account_id}/{ms}`. Used by `reply_to`. */
export function commentRef(accountId, id) {
  if (!isAccountId(accountId)) throw new TypeError(`invalid account id: ${JSON.stringify(accountId)}`);
  if (!isCommentId(id)) throw new TypeError(`invalid comment id: ${JSON.stringify(id)}`);
  return `${accountId}/${id}`;
}

export function parseCommentRef(ref) {
  if (typeof ref !== 'string') return null;
  const slash = ref.lastIndexOf('/');
  if (slash <= 0) return null;
  const account_id = ref.slice(0, slash);
  const id = ref.slice(slash + 1);
  if (!isAccountId(account_id) || !isCommentId(id)) return null;
  return { account_id, id, key: `${account_id}/${id}` };
}

/** Web page of a comment: the project page, anchored at the comment. */
export function commentUrl(projectId, accountId, id) {
  return `${SITE_ORIGIN}/p/${encodeURIComponent(projectId)}#c-${encodeURIComponent(accountId)}-${encodeURIComponent(id)}`;
}

export function policyUrl() {
  return `${SITE_ORIGIN}${POLICY_PATH}`;
}

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

export function charCount(s) {
  return Array.from(typeof s === 'string' ? s : '').length;
}

/** Line endings to `\n`, controls and bidi overrides out, at most two blank lines in a row. */
export function cleanCommentText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARS, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Validate a draft for writing.
 * @returns {{ok: true, text: string} | {ok: false, error: 'empty' | 'too_long', text: string}}
 */
export function validateCommentText(text) {
  const cleaned = cleanCommentText(text);
  if (!cleaned) return { ok: false, error: 'empty', text: '' };
  if (charCount(cleaned) > MAX_COMMENT_CHARS) return { ok: false, error: 'too_long', text: cleaned };
  return { ok: true, text: cleaned };
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

let lastCommentId = 0;

/**
 * A new comment id: Unix time in ms, bumped by one if it is not greater than the last id this
 * client used. Two comments from the same tab in the same millisecond therefore never share a key
 * (which would overwrite the first one, since the index keeps one row per writer per key).
 */
export function newCommentId(now = Date.now(), last = lastCommentId) {
  const id = Math.max(Math.floor(now), last + 1);
  if (last === lastCommentId) lastCommentId = id;
  return String(id);
}

/** `{"comment/{id}/{ms}": {text, reply_to?}}`. `replyTo` is `{account_id}/{ms}`. */
export function commentArgs({ projectId, id, text, replyTo = null }) {
  const valid = validateCommentText(text);
  if (!valid.ok) throw new TypeError(`comment text is ${valid.error}`);
  const value = { text: valid.text };
  if (replyTo != null) {
    const r = parseCommentRef(replyTo);
    if (!r) throw new TypeError(`not a comment reference: ${JSON.stringify(replyTo)}`);
    value.reply_to = r.key;
  }
  return { [commentKey(projectId, id)]: value };
}

/** Deleting writes `null` to your own row; the index keeps it as the latest value. */
export function deleteCommentArgs({ projectId, id }) {
  return { [commentKey(projectId, id)]: null };
}

export function commentAction(args, methodName = COMMENT_METHOD) {
  return {
    type: 'FunctionCall',
    params: { methodName, args, gas: COMMENT_GAS, deposit: COMMENT_DEPOSIT },
  };
}

/** The transaction a wallet (or the login key) signs: the write goes to the vote account. */
export function commentTransaction({ account, args, methodName }) {
  return { receiverId: account, actions: [commentAction(args, methodName)] };
}

/** The transaction that posts one comment. */
export function postCommentTransaction({ account, projectId, id, text, replyTo = null, methodName }) {
  return commentTransaction({ account, args: commentArgs({ projectId, id, text, replyTo }), methodName });
}

/** The transaction that deletes one of your comments. */
export function removeCommentTransaction({ account, projectId, id, methodName }) {
  return commentTransaction({ account, args: deleteCommentArgs({ projectId, id }), methodName });
}

// ---------------------------------------------------------------------------------------------
// Rows -> comments
// ---------------------------------------------------------------------------------------------

function count(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A row's `block_timestamp` (nanoseconds, decimal string or number) in ms; null when absent. */
export function blockTimeMs(v) {
  if (typeof v === 'string' && /^[0-9]{1,30}$/.test(v)) return Number(BigInt(v) / 1_000_000n);
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v / 1e6);
  return null;
}

/**
 * When a comment was written, as far as the chain can vouch for it.
 *
 * The `{ms}` in the key is chosen by the writer, so on its own it proves nothing: an id far in the
 * future would sort a comment after every real one (and past 8.64e15 it is not even a valid Date).
 * The block the row landed in is the ceiling, so the time is `min(id, block time)`. A slow client
 * clock still gets its own (earlier) time; a fast or forged one gets the block's. Without a block
 * time the time is unknown (null), which sorts first and shows no date.
 */
export function commentTime(id, blockTimestamp) {
  const blockMs = blockTimeMs(blockTimestamp);
  const idMs = Number(id);
  if (blockMs === null || !Number.isFinite(idMs) || idMs <= 0) return null;
  return Math.min(idMs, blockMs);
}

/**
 * One KV row -> a comment, or null when it is not a live comment of `projectId`.
 *
 * Null / non-object values are deletions; an empty text is not a comment; a row whose key does not
 * belong to `projectId` is not part of this discussion. `hidden` is the hide list: a comment is
 * hidden only when project, author and id all match, so nobody can hide another author's comment
 * by reusing their id.
 *
 * @param {object} row KV entry: `{predecessor_id, key, value, block_height}`
 * @param {{projectId?: string | null, hidden?: Array<{project_id: string, author: string, id: string}>}} [opts]
 * @returns {import('./comments.d.mts').Comment | null}
 */
export function commentFromRow(row, { projectId = null, hidden = [] } = {}) {
  if (!row || typeof row !== 'object') return null;
  const parsed = parseCommentKey(row.key);
  if (!parsed) return null;
  if (projectId != null && parsed.project_id !== projectId) return null;
  const author = row.predecessor_id;
  if (!isAccountId(author)) return null;
  const value = row.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  const cleaned = cleanCommentText(value.text);
  if (!cleaned) return null;
  const chars = Array.from(cleaned);
  const truncated = chars.length > MAX_SHOWN_CHARS;
  // The ellipsis counts towards the shown limit, so the page never shows more than MAX_SHOWN_CHARS.
  const text = truncated ? chars.slice(0, MAX_SHOWN_CHARS - 1).join('').trimEnd() + '…' : cleaned;

  const replyTo = value.reply_to == null ? null : parseCommentRef(value.reply_to);
  const comment = {
    key: parsed.key,
    id: parsed.id,
    ref: commentRef(author, parsed.id),
    project_id: parsed.project_id,
    author,
    text,
    truncated,
    created_at: commentTime(parsed.id, row.block_timestamp),
    block_height: count(row.block_height),
    reply_to: replyTo ? replyTo.key : null,
    url: commentUrl(parsed.project_id, author, parsed.id),
  };
  return isHidden(comment, hidden) ? null : comment;
}

/** True when the hide list names this exact comment (project, author and id). */
export function isHidden(comment, hidden = []) {
  return hidden.some(
    (h) =>
      h &&
      h.project_id === comment.project_id &&
      h.author === comment.author &&
      h.id === comment.id,
  );
}

/**
 * A hide list from the repo file (`data/hidden-comments.json`). Entries that do not name a real
 * project, author and id are dropped: a typo hides nothing rather than everything.
 *
 * @param {unknown} json `{comments: [{project_id, author, id, reason?, added_at?}]}`
 * @returns {Array<{project_id: string, author: string, id: string, reason: string|null, added_at: string|null}>}
 */
export function parseHideList(json) {
  const list = json && typeof json === 'object' && Array.isArray(json.comments) ? json.comments : [];
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    if (!isProjectId(raw.project_id) || !isAccountId(raw.author) || !isCommentId(raw.id)) continue;
    out.push({
      project_id: raw.project_id,
      author: raw.author,
      id: raw.id,
      reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 200) : null,
      added_at: typeof raw.added_at === 'string' ? raw.added_at.slice(0, 40) : null,
    });
  }
  return out;
}

/**
 * Keep the latest row per (writer, key) — the index already does this; a history read or a page
 * boundary must not turn one comment into two, or an undeleted one.
 */
export function latestRows(rows) {
  const best = new Map();
  for (const r of rows ?? []) {
    if (!r || typeof r !== 'object' || typeof r.key !== 'string') continue;
    const k = `${r.predecessor_id}\u0000${r.key}`;
    const prev = best.get(k);
    if (!prev || (Number(r.block_height) || 0) > (Number(prev.block_height) || 0)) best.set(k, r);
  }
  return [...best.values()];
}

/**
 * Every visible comment of `projectId`, oldest first (ties by author). Deleted rows, empty text,
 * other projects and hidden comments are dropped. `reply_to` is kept as written; see `threadView`
 * for nesting.
 *
 * @param {Array<object>} rows
 * @param {string} projectId
 * @param {{hidden?: Array<object>}} [opts]
 * @returns {{items: import('./comments.d.mts').Comment[], count: number}}
 */
export function commentThread(rows, projectId, { hidden = [] } = {}) {
  const items = [];
  for (const row of latestRows(rows)) {
    const c = commentFromRow(row, { projectId, hidden });
    if (c) items.push(c);
  }
  items.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0) || a.ref.localeCompare(b.ref));
  return { items, count: items.length };
}

/**
 * Comments nested one level: top-level comments in order, each with its direct replies. A reply
 * whose parent is missing (deleted, hidden or not in `items`) stays visible at the top level rather
 * than disappearing: hiding a bad parent must not silence the people answering it.
 *
 * @param {import('./comments.d.mts').Comment[]} items
 * @returns {Array<import('./comments.d.mts').Comment & {replies: import('./comments.d.mts').Comment[]}>}
 */
export function threadView(items) {
  const byRef = new Map(items.map((c) => [c.ref, c]));
  const roots = [];
  const children = new Map();
  for (const c of items) {
    const parent = c.reply_to ? byRef.get(c.reply_to) : null;
    if (!parent || parent.ref === c.ref) {
      roots.push(c);
      continue;
    }
    // One level only: an answer to an answer hangs under the same top-level comment.
    let top = parent;
    const seen = new Set([c.ref]);
    while (top.reply_to && byRef.has(top.reply_to) && !seen.has(top.ref)) {
      seen.add(top.ref);
      top = byRef.get(top.reply_to);
    }
    const list = children.get(top.ref) ?? [];
    list.push(c);
    children.set(top.ref, list);
  }
  return roots.map((c) => ({ ...c, replies: children.get(c.ref) ?? [] }));
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

/** Every row under `comment/{projectId}/`, across writers. Throws when the index cannot be read. */
export function readProjectCommentRows({ projectId, account, network = 'mainnet', fetchImpl }) {
  if (!isProjectId(projectId)) throw new TypeError(`invalid submission id: ${JSON.stringify(projectId)}`);
  return readLatest({
    account,
    keyPrefix: `${COMMENT_PREFIX}${projectId}/`,
    network,
    fetchImpl,
  });
}

/** Every row under `comment/`, across writers and projects (directory counts, NH-43). */
export function readAllCommentRows({ account, network = 'mainnet', fetchImpl }) {
  return readLatest({ account, keyPrefix: COMMENT_PREFIX, network, fetchImpl });
}

/** Per-project counts from all `comment/` rows. Missing project = no comments. */
export function countComments(rows, { hidden = [], projectIds = null } = {}) {
  const known = projectIds ? new Set(projectIds) : null;
  const counts = {};
  for (const row of latestRows(rows)) {
    const c = commentFromRow(row, { hidden });
    if (!c) continue;
    if (known && !known.has(c.project_id)) continue;
    counts[c.project_id] = (counts[c.project_id] ?? 0) + 1;
  }
  return counts;
}

/** `POST {host}/v0/latest/{account}/{accountId}` — one writer's rows in the comment namespace. */
export function accountCommentsUrl({ network, account, accountId }) {
  const host = KV_HOSTS[network];
  if (!host) throw new Error(`unknown network: ${network}`);
  if (!account || !accountId) throw new Error('account and accountId are required');
  return `${host}/v0/latest/${account}/${accountId}`;
}

/**
 * The writer's latest row at `comment/{projectId}/{id}`.
 * @returns {Promise<{exists: boolean, deleted: boolean, text: string|null, blockHeight: number|null}>}
 */
export async function readAccountComment({
  network,
  account,
  accountId,
  projectId,
  id,
  fetchImpl = fetch,
}) {
  const key = commentKey(projectId, id);
  const rows = await readLatest({ account, writer: accountId, key, network, fetchImpl });
  const row = rows.find((r) => r.key === key && r.predecessor_id === accountId);
  if (!row) return { exists: false, deleted: false, text: null, blockHeight: null };
  const deleted = row.value === null || typeof row.value !== 'object' || Array.isArray(row.value);
  return {
    exists: true,
    deleted,
    text: deleted ? null : cleanCommentText(row.value.text) || null,
    blockHeight: Number.isFinite(Number(row.block_height)) ? Number(row.block_height) : null,
  };
}

/**
 * Poll the index until the writer's row shows the state just written, or give up after
 * `timeoutMs`. Read failures are retried until the deadline: the write may still land.
 *
 * @returns {Promise<{confirmed: boolean, blockHeight: number|null, attempts: number, lastError: string|null}>}
 */
export async function confirmComment({
  network,
  account,
  accountId,
  projectId,
  id,
  text = null,
  deleted = false,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = 30_000,
  intervalMs = 1500,
}) {
  const deadline = now() + timeoutMs;
  const want = text === null ? null : cleanCommentText(text);
  let attempts = 0;
  let lastError = null;
  for (;;) {
    attempts += 1;
    try {
      const row = await readAccountComment({ network, account, accountId, projectId, id, fetchImpl });
      if (deleted) {
        if (row.exists && row.deleted) return { confirmed: true, blockHeight: row.blockHeight, attempts, lastError: null };
      } else if (row.exists && !row.deleted && (want === null || row.text === want)) {
        return { confirmed: true, blockHeight: row.blockHeight, attempts, lastError: null };
      }
      lastError = null;
    } catch (err) {
      lastError = err?.message ?? String(err);
    }
    if (now() + intervalMs > deadline) return { confirmed: false, blockHeight: null, attempts, lastError };
    await sleep(intervalMs);
  }
}

// ---------------------------------------------------------------------------------------------
// Sending — wallet-agnostic, same shape as castVote
// ---------------------------------------------------------------------------------------------

async function sendOnce({ signAndSendTransaction, transaction }) {
  try {
    return classifySendResult({ ok: await signAndSendTransaction(transaction) });
  } catch (error) {
    return classifySendResult({ error });
  }
}

/**
 * Send one comment write and confirm it against the KV index.
 *
 * `signAndSendTransaction` is any function shaped like NEAR Connect's `({receiverId, actions})`:
 * the login key plugin, a wallet, or a test double. On `key-missing` / `no-allowance`, `fallbackSend`
 * (when given) is asked once — the wallet, which can still sign the same transaction.
 *
 * `outcome`: `confirmed`, `timeout` (sent, the index has not shown it yet — never resent),
 * `rejected` (declined in the wallet, nothing sent), `failed` (nothing sent, e.g. key missing).
 *
 * @returns {Promise<{outcome: 'confirmed'|'timeout'|'rejected'|'failed', kind: string, txHash: string|null,
 *   detail: string, id: string, key: string, text: string|null, blockHeight: number|null, usedFallback: boolean}>}
 */
export async function submitComment({
  signAndSendTransaction,
  fallbackSend,
  network,
  account,
  accountId,
  projectId,
  id = newCommentId(),
  text = null,
  replyTo = null,
  methodName,
  deleted = false,
  fetchImpl,
  now,
  sleep,
  timeoutMs,
  intervalMs,
  onSent,
}) {
  if (!isAccountId(accountId)) throw new TypeError('sign in first');
  const transaction = deleted
    ? removeCommentTransaction({ account, projectId, id, methodName })
    : postCommentTransaction({ account, projectId, id, text, replyTo, methodName });
  const sentText = deleted ? null : validateCommentText(text).text;

  let usedFallback = false;
  let sent = await sendOnce({ signAndSendTransaction, transaction });
  if ((sent.kind === 'key-missing' || sent.kind === 'no-allowance') && fallbackSend) {
    usedFallback = true;
    const fallback = await fallbackSend(sent);
    if (fallback) sent = await sendOnce({ signAndSendTransaction: fallback, transaction });
  }

  const base = {
    kind: sent.kind,
    txHash: sent.txHash,
    detail: sent.detail,
    id,
    key: commentKey(projectId, id),
    text: sentText,
    usedFallback,
  };
  if (sent.kind === 'rejected') return { ...base, outcome: 'rejected', blockHeight: null };
  if (sent.kind === 'key-missing' || sent.kind === 'no-allowance') {
    return { ...base, outcome: 'failed', blockHeight: null };
  }

  onSent?.(sent);
  const conf = await confirmComment({
    network, account, accountId, projectId, id, text: sentText, deleted,
    fetchImpl, now, sleep, timeoutMs, intervalMs,
  });
  return {
    ...base,
    outcome: conf.confirmed ? 'confirmed' : 'timeout',
    blockHeight: conf.blockHeight,
  };
}
