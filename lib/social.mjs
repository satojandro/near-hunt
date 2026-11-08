// near.social reads for the "Live on near.social" sidebar (NH-15).
//
// Source: the near.social indexer API, `GET https://api2.near.social/v1/hashtags/{tag}`, the
// endpoint near.social's own client and https://near.social/skill.md use. It indexes posts
// written through the current `social` account path. Responses use the `{items, next_cursor}`
// envelope; each item is `{type, post, reposted_by, reposted_at, cursor}`.
//
// Everything here is read-only. Post text is user content: it is reduced to plain text and
// never rendered as HTML or markdown.

export const SOCIAL_API = 'https://api2.near.social';
export const SOCIAL_WEB = 'https://near.social';
export const DEFAULT_HASHTAG = 'nearhunt';
export const FEED_LIMIT = 5;
export const FEED_TIMEOUT_MS = 4000;
export const FEED_REVALIDATE_SECONDS = 60;
export const EXCERPT_MAX = 160;

// NEAR account ids: 2–64 chars of lowercase letters, digits and `-_.` separators
// (named accounts and 64-hex implicit accounts both match).
const ACCOUNT_RE = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const POST_ID_RE = /^\d{1,20}$/;
const HASHTAG_RE = /^[a-z0-9_]{1,64}$/;

export function isAccountId(v) {
  return typeof v === 'string' && ACCOUNT_RE.test(v);
}

/** Web page for one post on near.social: `https://near.social/{account_id}/post/{post_id}`. */
export function postUrl(accountId, postId) {
  return `${SOCIAL_WEB}/${encodeURIComponent(accountId)}/post/${encodeURIComponent(postId)}`;
}

/** Web page for a hashtag on near.social: `https://near.social/hashtag/{tag}`. */
export function hashtagUrl(tag) {
  return `${SOCIAL_WEB}/hashtag/${encodeURIComponent(tag)}`;
}

export function hashtagFeedUrl(tag, { limit = FEED_LIMIT, base = SOCIAL_API } = {}) {
  return `${base}/v1/hashtags/${encodeURIComponent(tag)}?limit=${limit}`;
}

/**
 * Markdown/HTML-ish post text → one line of plain text, cut at a word boundary.
 * Hashtags and mentions are kept as written; links keep their label, images and code blocks go.
 */
export function plainExcerpt(text, max = EXCERPT_MAX) {
  if (typeof text !== 'string') return '';
  let s = text
    .replace(/```[\s\S]*?(```|$)/g, ' ') // fenced code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → label
    .replace(/<[^>]*>/g, ' ') // tags
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, e) => ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e])
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings (not hashtags: those have no space)
    .replace(/^\s{0,3}>\s?/gm, '') // blockquotes
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '') // list markers
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2') // bold / strike
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,!?:;]|$)/g, '$1$2') // italics
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '') // control / bidi
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  const chars = Array.from(s); // do not split surrogate pairs (emoji)
  if (chars.length <= max) return s;
  let cut = chars.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  if (space > max * 0.6) cut = cut.slice(0, space);
  return cut.replace(/[\s.,;:!?\-–—]+$/, '') + '…';
}

function httpsUrl(v) {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  return s ? Array.from(s).slice(0, 64).join('') : null;
}

/**
 * Validate and normalise one `/v1/hashtags/{tag}` response.
 * Throws a TypeError when the envelope itself is wrong; drops individual items that are malformed,
 * or duplicated (a post and its reposts). Pure: no network, no clock.
 *
 * @returns {{ items: import('./social.d.mts').SocialPost[], next_cursor: string | null }}
 */
export function normaliseHashtagFeed(json, { limit = FEED_LIMIT } = {}) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.items)) {
    throw new TypeError('near.social hashtag feed: expected {items: [...]}');
  }
  const seen = new Set();
  const items = [];
  for (const raw of json.items) {
    if (items.length >= limit) break;
    const post = raw && typeof raw === 'object' ? raw.post : null;
    if (!post || typeof post !== 'object') continue;
    const author = post.author && typeof post.author === 'object' ? post.author : {};
    const accountId = author.account_id;
    const postId = typeof post.id === 'number' ? String(post.id) : post.id;
    if (!isAccountId(accountId) || typeof postId !== 'string' || !POST_ID_RE.test(postId)) continue;
    const key = `${accountId}/${postId}`;
    if (seen.has(key)) continue;
    const createdAt = Number(post.created_at);
    if (!Number.isFinite(createdAt) || createdAt <= 0) continue;
    const excerpt = plainExcerpt(post.text);
    if (!excerpt) continue;
    seen.add(key);
    items.push({
      key,
      post_id: postId,
      author: {
        account_id: accountId,
        name: cleanName(author.name),
        avatar_url: httpsUrl(author.avatar_url),
      },
      excerpt,
      created_at: createdAt,
      block_height: Number.isFinite(Number(post.block_height)) ? Number(post.block_height) : null,
      reposted_by: isAccountId(raw.reposted_by) ? raw.reposted_by : null,
      url: postUrl(accountId, postId),
    });
  }
  const next = json.next_cursor;
  return { items, next_cursor: typeof next === 'string' && next ? next : null };
}

/** "just now", "5m ago", "3h ago", "2d ago", then "8 Nov" / "8 Nov 2025". Pure; `now` in ms. */
export function relativeTime(ms, now) {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const date = new Date(ms);
  const sameYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
  });
}

/**
 * Fetch and normalise a hashtag feed. Never throws: returns `{status: 'ok', items}` or
 * `{status: 'error', reason}`. In Next.js the `next.revalidate` option caches the response.
 */
export async function fetchHashtagFeed({
  hashtag = DEFAULT_HASHTAG,
  limit = FEED_LIMIT,
  base = SOCIAL_API,
  timeoutMs = FEED_TIMEOUT_MS,
  revalidate = FEED_REVALIDATE_SECONDS,
  fetchImpl = fetch,
} = {}) {
  const tag = String(hashtag).replace(/^#/, '').toLowerCase();
  if (!HASHTAG_RE.test(tag)) return { status: 'error', reason: 'invalid hashtag', hashtag: tag };
  try {
    // Ask for a few extra: malformed items and repost duplicates are dropped after the fetch.
    const res = await fetchImpl(hashtagFeedUrl(tag, { limit: Math.min(limit * 2, 100), base }), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate },
    });
    if (!res.ok) return { status: 'error', reason: `HTTP ${res.status}`, hashtag: tag };
    const { items } = normaliseHashtagFeed(await res.json(), { limit });
    return { status: 'ok', items, hashtag: tag };
  } catch (err) {
    const reason = err && err.name === 'TimeoutError' ? 'timeout' : String((err && err.message) || err);
    return { status: 'error', reason, hashtag: tag };
  }
}

// ---------------------------------------------------------------------------------------------
// Profiles (NH-22 "Upvoted by").
//
// Source: `GET https://api2.near.social/v1/accounts/{account_id}` (listed in
// https://near.social/skill.md). Checked 8 Nov 2026 with curl: it answers 200 for any account,
// with `has_profile:false` and null fields when there is no profile, and gives `avatar_url` as a
// ready https URL (e.g. `https://main.fastfs.io/mob.near/social/media/….webp`). There is no batch
// endpoint (`/v1/accounts?ids=` and `POST /v1/accounts` both 404), so callers fetch a bounded
// number of profiles in parallel.

export const PROFILE_TIMEOUT_MS = 3000;
export const PROFILE_REVALIDATE_SECONDS = 600;

export function profileApiUrl(accountId, { base = SOCIAL_API } = {}) {
  return `${base}/v1/accounts/${encodeURIComponent(accountId)}`;
}

/** Profile page on near.social: `https://near.social/{account_id}`. */
export function profileUrl(accountId) {
  return `${SOCIAL_WEB}/${encodeURIComponent(accountId)}`;
}

/**
 * Reduce a `/v1/accounts/{id}` response to `{account_id, name, avatar_url}`. The account id is
 * always the one we asked for, never one read from the response. Pure.
 */
export function normaliseProfile(json, accountId) {
  const o = json && typeof json === 'object' ? json : {};
  return { account_id: accountId, name: cleanName(o.name), avatar_url: httpsUrl(o.avatar_url) };
}

/**
 * Fetch profiles for `accountIds` in parallel, in the given order. Never throws. Every valid
 * requested account is in `profiles`; one whose fetch failed has `name: null, avatar_url: null`.
 * `status` is 'error' only when every fetch failed (near.social down), so the UI can say so.
 */
export async function fetchProfiles(accountIds, {
  base = SOCIAL_API,
  timeoutMs = PROFILE_TIMEOUT_MS,
  revalidate = PROFILE_REVALIDATE_SECONDS,
  fetchImpl = fetch,
} = {}) {
  const ids = [...new Set((accountIds ?? []).filter(isAccountId))];
  let failures = 0;
  const profiles = await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetchImpl(profileApiUrl(id, { base }), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        next: { revalidate },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normaliseProfile(await res.json(), id);
    } catch {
      failures += 1;
      return normaliseProfile(null, id);
    }
  }));
  return { status: ids.length > 0 && failures === ids.length ? 'error' : 'ok', profiles };
}
