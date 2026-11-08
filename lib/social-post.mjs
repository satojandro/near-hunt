/**
 * NH-40 (preparation only): the near.social root post NEAR Hunt would publish for a project, as
 * `nearhunt.near`, so people can reply to it (lib/discussion.mjs). Pure builders, no network, no
 * signing. `scripts/social-posts.mjs` prints a batch of these for a human to review; signing is
 * reserved for the operator after approval (AGENTS.md §1).
 *
 * Shape, per https://near.social/skill.md and the social-kv/1 standard:
 *   one FunctionCall `__fastdata_kv` on receiver `social`, deposit 0, args {"post/{ms}": {"text": "…"}}
 * Hashtags are derived from the text by the indexer ("There is no separate notify key"), so
 * `#nearhunt` in the text is all it takes to appear under /v1/hashtags/nearhunt: no `index/` keys
 * (that namespace is reserved in social-kv/1).
 */

import { SOCIAL_ACCOUNT, SOCIAL_GAS, SOCIAL_DEPOSIT, SOCIAL_METHOD, MAX_POST_CHARS, HASHTAG, isPostId, parsePostRef, projectPageUrl } from './discussion.mjs';

export const POSTER_ACCOUNT = 'nearhunt.near';
/** The plan's cap: a daily "spotlight" drip of at most 40, never all projects at once. */
export const MAX_BATCH = 40;
export const DESCRIPTION_MAX = 200;

const UNSAFE = /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

function oneLine(s, max) {
  if (typeof s !== 'string') return '';
  const t = s.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(t);
  if (chars.length <= max) return t;
  let cut = chars.slice(0, max).join('');
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s.,;:!?\-–—]+$/, '') + '…';
}

/**
 * The post text: name, the one-line description when the record has one, then the call to
 * discuss with `#nearhunt` and the project link (last, so near.social shows it as the link card).
 * Mentions are not added: `@` in a name or description is neutralised so the post notifies nobody.
 */
export function rootPostText(project) {
  if (!project || typeof project.name !== 'string' || !project.submission_id) throw new TypeError('project with name and submission_id required');
  const noMention = (s) => s.replace(/@/g, '@⁠'); // word joiner: no longer a mention token
  const name = noMention(oneLine(project.name, 120));
  const desc = noMention(oneLine(project.description ?? '', DESCRIPTION_MAX));
  const lines = [desc ? `${name}: ${desc}` : name, '', `Discuss and upvote it on NEAR Hunt #${HASHTAG}`, projectPageUrl(project.submission_id)];
  const text = lines.join('\n');
  if (Array.from(text).length > MAX_POST_CHARS) throw new RangeError('post text too long');
  return text;
}

export function rootPostArgs(project, postId) {
  if (!isPostId(postId)) throw new TypeError(`invalid post id: ${postId}`);
  return { [`post/${postId}`]: { text: rootPostText(project) } };
}

/** One project per transaction, so the operator can space them out and each has its own hash. */
export function rootPostTransaction(project, postId) {
  return {
    signerId: POSTER_ACCOUNT,
    receiverId: SOCIAL_ACCOUNT,
    actions: [{ type: 'FunctionCall', params: { methodName: SOCIAL_METHOD, args: rootPostArgs(project, postId), gas: SOCIAL_GAS, deposit: SOCIAL_DEPOSIT } }],
  };
}

/** Oldest record first (block height), then name, then id: the same batch on every run. */
export function selectBatch(items, limit = MAX_BATCH) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) throw new RangeError(`--limit must be 1..${MAX_BATCH}`);
  return items
    .filter((p) => p && !parsePostRef(p.social_post ?? null))
    .slice()
    .sort((a, b) => (a.block_height ?? 0) - (b.block_height ?? 0) || a.name.localeCompare(b.name) || a.submission_id.localeCompare(b.submission_id))
    .slice(0, limit);
}

/**
 * The whole dry-run plan. Post ids are `startMs`, `startMs + 1`, …; they are identifiers only
 * (standard §2), and the operator should regenerate the plan just before signing so the ids are
 * current Unix-ms times.
 */
export function planSocialPosts({ items, limit = MAX_BATCH, startMs }) {
  if (!Number.isInteger(startMs) || startMs < 1) throw new TypeError('startMs required');
  const already = items.filter((p) => parsePostRef(p.social_post ?? null)).length;
  const batch = selectBatch(items, limit);
  const posts = batch.map((p, i) => {
    const postId = String(startMs + i);
    const tx = rootPostTransaction(p, postId);
    return {
      submission_id: p.submission_id,
      name: p.name,
      post_ref: `${POSTER_ACCOUNT}/${postId}`,
      tx,
      bytes: Buffer.byteLength(JSON.stringify(tx.actions[0].params.args)),
    };
  });
  return {
    account: POSTER_ACCOUNT,
    receiver: SOCIAL_ACCOUNT,
    method: SOCIAL_METHOD,
    gas: SOCIAL_GAS,
    deposit: SOCIAL_DEPOSIT,
    candidates: items.length - already,
    already_posted: already,
    posts,
    transactions: posts.length,
    total_bytes: posts.reduce((n, p) => n + p.bytes, 0),
    /** What `data/social-posts.json` would hold once every post is confirmed by /v1/tx. */
    overlay: Object.fromEntries(posts.map((p) => [p.submission_id, p.post_ref])),
  };
}
