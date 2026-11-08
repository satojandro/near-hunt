/**
 * near.social discussion for a project (NH-41 read, NH-42 reply, NH-43 counts, NH-83 statuses).
 *
 * Every project's discussion is the reply thread under one post by `nearhunt.near` on
 * near.social; the record's `social_post` field holds its reference, `{account_id}/{post_id}`.
 * The conventions here follow https://near.social/skill.md and the social-kv/1 standard
 * (https://api2.near.social/standard.md, api.md), checked with curl on 8 Nov 2026:
 *
 *   read   GET  https://api2.near.social/v1/posts/{account}/{post_id}           -> {post, ancestors, parent_missing}
 *          GET  https://api2.near.social/v1/posts/{account}/{post_id}/replies   -> {items: FeedItem[], next_cursor}
 *          POST https://api2.near.social/v1/posts/batch {keys: [...≤100]}       -> {items: (Post|null)[]}
 *          A missing or deleted post answers 404 {"error":"not_found"}.
 *   write  FunctionCall `__fastdata_kv` on receiver `social` (mainnet), deposit 0, tiny gas, args
 *          {"post/{id}": {text, reply_to, root}, "reply/{parent_account}/{parent_id}/{id}": {}}
 *          The receipt always fails with CodeDoesNotExist (no contract on `social`); that is
 *          expected and is never retried.
 *   check  GET  https://api2.near.social/v1/tx/{hash} -> {indexed, predecessor_id, actions:[{kind,status,keys:[{key,status,reason?}]}]}
 *
 * Pure functions plus never-throwing fetchers (they return `{status: ...}`), so everything can be
 * unit-tested without the network. Post text is user content: it is kept as plain text and never
 * rendered as HTML or markdown (standard §5).
 */

import { SOCIAL_API, SOCIAL_WEB, isAccountId, postUrl } from './social.mjs';
import { classifySendResult } from './vote-client.mjs';

export { SOCIAL_API };

/** The near.social receiver on mainnet (standard §1). There is no testnet indexer. */
export const SOCIAL_ACCOUNT = 'social';
export const SOCIAL_METHOD = '__fastdata_kv';
/**
 * 1 Ggas, the same envelope votes and the importer use. skill.md: "as low as possible: `1` gas,
 * or `1 Ggas` in near-cli". The call runs no code, so this is a ceiling, not a cost.
 */
export const SOCIAL_GAS = '1000000000';
export const SOCIAL_DEPOSIT = '0';

/** Post text limit, in Unicode scalar values (standard §3.2). */
export const MAX_POST_CHARS = 25_000;
/** How much of a reply the page shows before cutting it (the full text is on near.social). */
export const MAX_SHOWN_CHARS = 4_000;

export const THREAD_TIMEOUT_MS = 4000;
export const THREAD_REVALIDATE_SECONDS = 30;
export const REPLIES_LIMIT = 50;
export const COUNTS_REVALIDATE_SECONDS = 120;
export const BATCH_MAX = 100;

export const HASHTAG = 'nearhunt';
export const SITE_ORIGIN = 'https://nearhunt.xyz';

const POST_ID_RE = /^[1-9][0-9]{0,15}$/;
const MAX_POST_ID = 9007199254740991; // 2^53 − 1

// ---------------------------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------------------------

export function isPostId(v) {
  return typeof v === 'string' && POST_ID_RE.test(v) && Number(v) <= MAX_POST_ID;
}

/**
 * `"nearhunt.near/1794122153750"` -> `{account_id, post_id, key}`; anything else -> null.
 * Follows the standard's rules: a valid NEAR account id, then a decimal post id without leading
 * zeros, at most 2^53 − 1.
 */
export function parsePostRef(ref) {
  if (typeof ref !== 'string') return null;
  const slash = ref.lastIndexOf('/');
  if (slash <= 0) return null;
  const account_id = ref.slice(0, slash);
  const post_id = ref.slice(slash + 1);
  if (!isAccountId(account_id) || !isPostId(post_id)) return null;
  return { account_id, post_id, key: `${account_id}/${post_id}` };
}

function refOrThrow(ref) {
  const r = typeof ref === 'string' ? parsePostRef(ref) : ref && parsePostRef(`${ref.account_id}/${ref.post_id}`);
  if (!r) throw new TypeError(`not a near.social post reference: ${JSON.stringify(ref)}`);
  return r;
}

export function postApiUrl(ref, { base = SOCIAL_API } = {}) {
  const r = refOrThrow(ref);
  return `${base}/v1/posts/${encodeURIComponent(r.account_id)}/${r.post_id}`;
}

export function repliesApiUrl(ref, { base = SOCIAL_API, limit = REPLIES_LIMIT, cursor = null } = {}) {
  const p = new URLSearchParams({ limit: String(limit) });
  if (cursor) p.set('cursor', cursor);
  return `${postApiUrl(ref, { base })}/replies?${p}`;
}

export function txApiUrl(txHash, { base = SOCIAL_API } = {}) {
  if (typeof txHash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(txHash)) {
    throw new TypeError(`not a transaction hash: ${JSON.stringify(txHash)}`);
  }
  return `${base}/v1/tx/${txHash}`;
}

/** near.social page of a thread: `https://near.social/{account}/post/{id}`. */
export function threadUrl(ref) {
  const r = refOrThrow(ref);
  return postUrl(r.account_id, r.post_id);
}

export function hashtagPageUrl(tag = HASHTAG) {
  return `${SOCIAL_WEB}/hashtag/${encodeURIComponent(tag)}`;
}

export function projectPageUrl(projectId) {
  return `${SITE_ORIGIN}/p/${encodeURIComponent(projectId)}`;
}

// ---------------------------------------------------------------------------------------------
// Reading a thread (NH-41)
// ---------------------------------------------------------------------------------------------

function httpsUrl(v) {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// C0 controls except \n and \t, DEL, zero-width and bidi overrides.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
  return s ? Array.from(s).slice(0, 64).join('') : null;
}

/**
 * Post text as plain text for display: line breaks kept (at most two blank lines in a row),
 * control and bidi-override characters removed, cut at `max` characters. Never HTML.
 * @returns {{text: string, truncated: boolean}}
 */
export function displayText(text, max = MAX_SHOWN_CHARS) {
  if (typeof text !== 'string') return { text: '', truncated: false };
  const s = text.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARS, '').replace(/\n{3,}/g, '\n\n').trim();
  const chars = Array.from(s);
  if (chars.length <= max) return { text: s, truncated: false };
  return { text: chars.slice(0, max).join('').trimEnd() + '…', truncated: true };
}

function count(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * One api2 Post object -> what the thread shows. Returns null when the author or id is invalid.
 * The author's account id comes from the post key's own author, which the indexer derives from
 * the writer (`predecessor_id`), never from anything the writer typed.
 */
export function normalisePost(post) {
  if (!post || typeof post !== 'object') return null;
  const author = post.author && typeof post.author === 'object' ? post.author : {};
  const accountId = author.account_id;
  const postId = typeof post.id === 'number' ? String(post.id) : post.id;
  if (!isAccountId(accountId) || !isPostId(postId)) return null;
  if (typeof post.key === 'string' && post.key !== `${accountId}/${postId}`) return null;
  const createdAt = Number(post.created_at);
  const { text, truncated } = displayText(post.text);
  const media = Array.isArray(post.media) ? post.media.length : 0;
  const counts = post.counts && typeof post.counts === 'object' ? post.counts : {};
  const replyTo = post.reply_to && typeof post.reply_to === 'object' ? post.reply_to.key : post.reply_to;
  return {
    key: `${accountId}/${postId}`,
    post_id: postId,
    author: { account_id: accountId, name: cleanName(author.name), avatar_url: httpsUrl(author.avatar_url) },
    text,
    truncated,
    media_count: media,
    has_quote: !!post.quote,
    created_at: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null,
    edited_at: Number.isFinite(Number(post.edited_at)) && Number(post.edited_at) > 0 ? Number(post.edited_at) : null,
    block_height: Number.isFinite(Number(post.block_height)) ? Number(post.block_height) : null,
    reply_to: typeof replyTo === 'string' && parsePostRef(replyTo) ? replyTo : null,
    root: typeof post.root === 'string' && parsePostRef(post.root) ? post.root : null,
    counts: { replies: count(counts.replies), likes: count(counts.likes), reposts: count(counts.reposts), quotes: count(counts.quotes) },
    url: postUrl(accountId, postId),
  };
}

/**
 * Validate one `/replies` response. Throws a TypeError if the envelope is wrong; drops items that
 * are malformed, duplicated, reposts, or not direct replies to `parentKey` (when given).
 */
export function normaliseReplies(json, { parentKey = null, limit = REPLIES_LIMIT } = {}) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.items)) {
    throw new TypeError('near.social replies: expected {items: [...]}');
  }
  const seen = new Set();
  const items = [];
  for (const raw of json.items) {
    if (items.length >= limit) break;
    if (!raw || typeof raw !== 'object' || (raw.type && raw.type !== 'post')) continue;
    const p = normalisePost(raw.post);
    if (!p || seen.has(p.key)) continue;
    if (parentKey && p.reply_to && p.reply_to !== parentKey) continue;
    // Empty text and no media or quote is an invalid post under the standard; skip it.
    if (!p.text && p.media_count === 0 && !p.has_quote) continue;
    seen.add(p.key);
    items.push(p);
  }
  const next = json.next_cursor;
  return { items, next_cursor: typeof next === 'string' && next ? next : null };
}

function failure(err) {
  return err && err.name === 'TimeoutError' ? 'timeout' : String((err && err.message) || err);
}

/**
 * The thread under `ref`: the root post (for its reply count) and its direct replies, oldest
 * first (the api's order: the author's own replies first, then everyone else's). Never throws.
 * `cursor` (near.social's own `next_cursor`) reads a later page of replies (NH-60 API).
 *
 * @returns {Promise<
 *   {status: 'ok', root: object|null, replies: object[], reply_count: number, next_cursor: string|null} |
 *   {status: 'not_found'} | {status: 'invalid'} | {status: 'error', reason: string}>}
 */
export async function fetchThread(ref, {
  base = SOCIAL_API,
  limit = REPLIES_LIMIT,
  timeoutMs = THREAD_TIMEOUT_MS,
  revalidate = THREAD_REVALIDATE_SECONDS,
  cursor = null,
  fetchImpl = fetch,
} = {}) {
  const r = parsePostRef(typeof ref === 'string' ? ref : '');
  if (!r) return { status: 'invalid' };
  const init = { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs), next: { revalidate } };
  try {
    const [postRes, repliesRes] = await Promise.all([
      fetchImpl(postApiUrl(r, { base }), init),
      fetchImpl(repliesApiUrl(r, { base, limit, cursor }), init),
    ]);
    if (postRes.status === 404 || repliesRes.status === 404) return { status: 'not_found' };
    if (!repliesRes.ok) return { status: 'error', reason: `HTTP ${repliesRes.status}` };
    const { items, next_cursor } = normaliseReplies(await repliesRes.json(), { parentKey: r.key, limit });
    // The root is only needed for its reply count; without it the thread still shows.
    let root = null;
    if (postRes.ok) {
      try {
        const body = await postRes.json();
        root = normalisePost(body && body.post);
        if (root && root.key !== r.key) root = null;
      } catch {
        root = null;
      }
    }
    const reply_count = root ? Math.max(root.counts.replies, items.length) : items.length;
    return { status: 'ok', root, replies: items, reply_count, next_cursor };
  } catch (err) {
    return { status: 'error', reason: failure(err) };
  }
}

// ---------------------------------------------------------------------------------------------
// Reply counts for the directory (NH-43)
// ---------------------------------------------------------------------------------------------

/**
 * Reply counts for the projects that have a `social_post`, from `POST /v1/posts/batch` (100 keys
 * per request, at most `concurrency` requests at once). Projects without a post are not asked
 * about and are absent from `counts` — the card shows nothing for them, not "0". A post the api
 * does not know (null in the batch) is absent too. Never throws.
 *
 * @param {Array<{submission_id: string, social_post?: string|null}>} items
 * @returns {Promise<{counts: Record<string, number>, available: boolean, asked: number}>}
 */
export async function fetchReplyCounts(items, {
  base = SOCIAL_API,
  timeoutMs = THREAD_TIMEOUT_MS,
  concurrency = 3,
  fetchImpl = fetch,
} = {}) {
  const byKey = new Map();
  for (const it of items ?? []) {
    const r = it && parsePostRef(it.social_post ?? '');
    if (!r) continue;
    const ids = byKey.get(r.key) ?? [];
    ids.push(it.submission_id);
    byKey.set(r.key, ids);
  }
  const keys = [...byKey.keys()];
  const counts = {};
  if (keys.length === 0) return { counts, available: true, asked: 0 };

  const chunks = [];
  for (let i = 0; i < keys.length; i += BATCH_MAX) chunks.push(keys.slice(i, i + BATCH_MAX));
  let failures = 0;
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      try {
        const res = await fetchImpl(`${base}/v1/posts/batch`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ keys: chunk }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const got = Array.isArray(json?.items) ? json.items : [];
        chunk.forEach((key, i) => {
          const p = normalisePost(got[i]);
          if (!p || p.key !== key) return;
          for (const id of byKey.get(key)) counts[id] = p.counts.replies;
        });
      } catch {
        failures += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return { counts, available: failures < chunks.length, asked: keys.length };
}

// ---------------------------------------------------------------------------------------------
// Writing a reply (NH-42)
// ---------------------------------------------------------------------------------------------

let lastPostId = 0;

/**
 * A new post id: the current Unix time in ms, bumped by one if it is not greater than the last id
 * this client used (standard §2 "Post IDs"). `now` and `last` are injectable for tests.
 */
export function newPostId(now = Date.now(), last = lastPostId) {
  const id = Math.max(Math.floor(now), last + 1);
  if (last === lastPostId) lastPostId = id;
  return String(id);
}

export function charCount(s) {
  return typeof s === 'string' ? Array.from(s).length : 0;
}

/** The suffix every reply made through NEAR Hunt carries (mockup board 2; schema/README.md). */
export function replySuffix(projectId) {
  return `#${HASHTAG} ${projectPageUrl(projectId)}`;
}

/**
 * The text that is actually posted: the draft, then `#nearhunt` and a link to the project page,
 * unless the draft already has them. Returns `{ok:false, error}` for an empty or too-long draft.
 */
export function composeReplyText(draft, projectId) {
  const body = typeof draft === 'string' ? draft.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARS, '').trim() : '';
  if (!body) return { ok: false, error: 'empty' };
  const url = projectPageUrl(projectId);
  const hasTag = new RegExp(`(^|[^\\p{L}\\p{N}_&#/])#${HASHTAG}(?![\\p{L}\\p{N}_])`, 'iu').test(body);
  const extra = [hasTag ? null : `#${HASHTAG}`, body.includes(url) ? null : url].filter(Boolean).join(' ');
  const text = extra ? `${body}\n\n${extra}` : body;
  if (charCount(text) > MAX_POST_CHARS) return { ok: false, error: 'too_long', text };
  return { ok: true, text };
}

/** Characters left for the draft once the suffix is added. */
export function draftLimit(projectId) {
  return MAX_POST_CHARS - charCount(replySuffix(projectId)) - 2;
}

/**
 * The `__fastdata_kv` args for a reply, exactly as skill.md documents them:
 *   {"post/{id}": {text, reply_to: parent, root}, "reply/{parent_account}/{parent_id}/{id}": {}}
 * `root` is the parent's own root, or the parent itself when the parent is a top-level post.
 */
export function replyArgs({ parent, parentRoot = null, text, postId }) {
  const p = refOrThrow(parent);
  if (!isPostId(postId)) throw new TypeError(`invalid post id: ${postId}`);
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('reply text is empty');
  if (charCount(text) > MAX_POST_CHARS) throw new RangeError('reply text is over 25,000 characters');
  const root = parentRoot ? refOrThrow(parentRoot).key : p.key;
  return {
    [`post/${postId}`]: { text, reply_to: p.key, root },
    [`reply/${p.account_id}/${p.post_id}/${postId}`]: {},
  };
}

/** The action in the wallet-selector / NEAR Connect shape (same as votes). */
export function socialAction(args) {
  return { type: 'FunctionCall', params: { methodName: SOCIAL_METHOD, args, gas: SOCIAL_GAS, deposit: SOCIAL_DEPOSIT } };
}

/** The whole transaction a wallet is asked to confirm. */
export function replyTransaction({ parent, parentRoot, text, postId }) {
  return { receiverId: SOCIAL_ACCOUNT, actions: [socialAction(replyArgs({ parent, parentRoot, text, postId }))] };
}

// ---------------------------------------------------------------------------------------------
// Confirming through /v1/tx (NH-42, NH-83)
// ---------------------------------------------------------------------------------------------

/**
 * What the indexer did with our write, from one `/v1/tx/{hash}` response.
 *
 *   pending      not indexed yet — poll again
 *   ok           the post key was accepted
 *   rate_limited over near.social's daily limits; nothing applied
 *   invalid      the value broke the standard (`reason` from the api), or the action was dropped
 *   dropped      key_too_long / value_too_large
 *   error        anything unexpected (wrong signer, post key missing)
 *
 * `reply/…` is reported `ignored` by the reference indexer (it derives threads from the post) —
 * that is expected and never treated as a failure.
 */
export function interpretTx(json, { postKey, accountId = null } = {}) {
  if (!json || typeof json !== 'object') return { state: 'error', reason: 'unreadable response' };
  if (json.indexed !== true) return { state: 'pending' };
  if (accountId && json.predecessor_id && json.predecessor_id !== accountId) {
    return { state: 'error', reason: `signed by ${json.predecessor_id}, not ${accountId}` };
  }
  const actions = Array.isArray(json.actions) ? json.actions : [];
  const kv = actions.filter((a) => a && (a.kind === undefined || a.kind === 'kv'));
  for (const a of kv) {
    if (a.status && a.status !== 'ok') return { state: 'invalid', reason: String(a.status) };
    const k = (Array.isArray(a.keys) ? a.keys : []).find((x) => x && x.key === postKey);
    if (!k) continue;
    switch (k.status) {
      case 'ok': return { state: 'ok' };
      case 'rate_limited': return { state: 'rate_limited', reason: k.reason ? String(k.reason) : null };
      case 'invalid': return { state: 'invalid', reason: k.reason ? String(k.reason) : null };
      case 'key_too_long':
      case 'value_too_large': return { state: 'dropped', reason: k.status };
      default: return { state: 'error', reason: `post key status: ${k.status}` };
    }
  }
  return { state: 'error', reason: `${postKey} is not in the transaction` };
}

/**
 * Poll `/v1/tx/{hash}` until it is indexed, or give up after `timeoutMs`. skill.md: poll every
 * 1–2 s; writes usually appear within about 3 s. Read failures are retried until the deadline.
 */
export async function confirmTx({
  txHash, postKey, accountId, base = SOCIAL_API, fetchImpl = fetch,
  now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = 30_000, intervalMs = 1_500,
}) {
  const url = txApiUrl(txHash, { base });
  const deadline = now() + timeoutMs;
  let attempts = 0;
  let lastError = null;
  for (;;) {
    attempts += 1;
    try {
      const res = await fetchImpl(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = interpretTx(await res.json(), { postKey, accountId });
      if (out.state !== 'pending') return { ...out, attempts };
      lastError = null;
    } catch (err) {
      lastError = failure(err);
    }
    if (now() + intervalMs > deadline) return { state: 'timeout', reason: lastError, attempts };
    await sleep(intervalMs);
  }
}

/**
 * When the wallet returns no transaction hash: wait for the post itself to appear in the api.
 * It cannot report `rate_limited` / `invalid` — a post that never shows up ends as `timeout`.
 */
export async function confirmPostExists({
  ref, base = SOCIAL_API, fetchImpl = fetch,
  now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = 30_000, intervalMs = 2_000,
}) {
  const url = postApiUrl(ref, { base });
  const deadline = now() + timeoutMs;
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      const res = await fetchImpl(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (res.ok) return { state: 'ok', attempts };
    } catch {
      // retry until the deadline
    }
    if (now() + intervalMs > deadline) return { state: 'timeout', reason: null, attempts };
    await sleep(intervalMs);
  }
}

/**
 * Send one reply through the wallet and confirm it. The wallet always reports the receipt as
 * failed (`CodeDoesNotExist`); that is classified as written and never resent.
 *
 * @returns {Promise<{outcome: 'ok'|'rate_limited'|'invalid'|'dropped'|'rejected'|'timeout'|'error',
 *   reason: string|null, txHash: string|null, postKey: string, text: string}>}
 */
export async function submitReply({
  signAndSendTransaction, accountId, parent, parentRoot = null, text, postId = newPostId(),
  base, fetchImpl, now, sleep, timeoutMs, intervalMs, onSent,
}) {
  if (!isAccountId(accountId)) throw new TypeError('sign in first');
  const postKey = `post/${postId}`;
  const ref = `${accountId}/${postId}`;
  const tx = replyTransaction({ parent, parentRoot, text, postId });
  let sent;
  try {
    sent = classifySendResult({ ok: await signAndSendTransaction(tx) });
  } catch (error) {
    sent = classifySendResult({ error });
  }
  const base_ = { txHash: sent.txHash, postKey: ref, text };
  if (sent.kind === 'rejected') return { ...base_, outcome: 'rejected', reason: null };
  if (sent.kind === 'key-missing' || sent.kind === 'no-allowance') return { ...base_, outcome: 'error', reason: sent.detail };
  onSent?.(sent);
  const opts = { base, fetchImpl, now, sleep, timeoutMs, intervalMs };
  for (const k of Object.keys(opts)) if (opts[k] === undefined) delete opts[k];
  const conf = sent.txHash
    ? await confirmTx({ txHash: sent.txHash, postKey, accountId, ...opts })
    : await confirmPostExists({ ref, ...opts });
  return { ...base_, outcome: conf.state, reason: conf.reason ?? (conf.state === 'timeout' ? sent.detail : null) };
}
