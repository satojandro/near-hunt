/**
 * Project media (NH-96): the images and video posters a builder attached to their own X post.
 *
 * Policy (same as NH-95): only what the builder published, referenced by URL and never copied.
 * A video is stored as its poster image plus the post URL; it plays on X, so NEAR Hunt neither
 * hotlinks video files nor loads X's embed script. Pure functions, no network.
 */

/** X's image CDN. The only host media URLs may point at. */
export const MEDIA_HOST = 'pbs.twimg.com';
export const MAX_MEDIA = 4;

const POST_URL_RE = /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{1,20}$/;

/** `https://pbs.twimg.com/...` without credentials, query or hash; else null. */
export function safeMediaUrl(url) {
  if (typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== MEDIA_HOST || u.username || u.password || u.port) return null;
  if (!/^\/(?:media|amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\//.test(u.pathname)) return null;
  return `https://${MEDIA_HOST}${u.pathname}`;
}

const posInt = (n) => (Number.isSafeInteger(n) && n > 0 ? n : undefined);

/**
 * Media items from one post as returned by X's syndication endpoint (`tweet-result`), in post
 * order. Photos keep their alt text when the author wrote one. Animated GIFs count as video.
 *
 * @param {object} tweet syndication payload
 * @returns {Array<{type:'photo'|'video', url:string, width?:number, height?:number, alt?:string|null, duration_ms?:number, post_url:string}>}
 */
export function mediaFromPost(tweet) {
  const author = tweet?.user?.screen_name;
  const id = tweet?.id_str;
  const postUrl = `https://x.com/${author}/status/${id}`;
  if (!POST_URL_RE.test(postUrl)) return [];
  const out = [];
  for (const m of Array.isArray(tweet.mediaDetails) ? tweet.mediaDetails : []) {
    if (m?.ext_media_availability?.status && m.ext_media_availability.status !== 'Available') continue;
    const url = safeMediaUrl(m?.media_url_https);
    if (!url) continue;
    const type = m.type === 'photo' ? 'photo' : 'video';
    const item = {
      type,
      url,
      width: posInt(m.original_info?.width),
      height: posInt(m.original_info?.height),
      post_url: postUrl,
    };
    if (type === 'photo') item.alt = typeof m.ext_alt_text === 'string' && m.ext_alt_text.trim() ? m.ext_alt_text.trim() : null;
    if (type === 'video') item.duration_ms = posInt(m.video_info?.duration_millis);
    for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k];
    out.push(item);
    if (out.length >= MAX_MEDIA) break;
  }
  return out;
}

/**
 * Media from the builder's own posts, focal (submitted) post first, then the rest of the chain,
 * de-duplicated by URL and capped at MAX_MEDIA.
 * @param {Array<object>} chain the author's posts, root first (as in lib/enrichment.mjs)
 */
export function mediaFromChain(chain) {
  const ordered = Array.isArray(chain) ? [...chain].reverse() : [];
  const seen = new Set();
  const out = [];
  for (const t of ordered) {
    for (const m of mediaFromPost(t)) {
      if (seen.has(m.url)) continue;
      seen.add(m.url);
      out.push(m);
      if (out.length >= MAX_MEDIA) return out;
    }
  }
  return out;
}

/** `35033` -> `0:35`; null when unusable. */
export function formatDuration(ms) {
  if (!Number.isSafeInteger(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * What the project page renders from a record's `media` field. Anything that fails validation
 * is dropped, so a malformed record can never inject a URL to another host.
 *
 * @returns {Array<{type:'photo'|'video', src:string, full:string, width:number|null, height:number|null, alt:string, duration:string|null, postUrl:string}>}
 */
export function mediaView(project) {
  const items = Array.isArray(project?.media) ? project.media : [];
  const out = [];
  for (const m of items) {
    const url = safeMediaUrl(m?.url);
    if (!url || (m.type !== 'photo' && m.type !== 'video') || typeof m.post_url !== 'string' || !POST_URL_RE.test(m.post_url)) continue;
    const width = posInt(m.width) ?? null;
    const height = posInt(m.height) ?? null;
    const alt = typeof m.alt === 'string' && m.alt.trim()
      ? m.alt.trim().slice(0, 1000)
      : m.type === 'video'
        ? `Video poster from the builder's post on X`
        : `Image from the builder's post on X`;
    out.push({
      type: m.type,
      // pbs.twimg.com serves sized renditions with `?name=`; `small` is 680 px wide.
      src: `${url}?name=small`,
      full: `${url}?name=large`,
      width,
      height,
      alt,
      duration: m.type === 'video' ? formatDuration(m.duration_ms) : null,
      postUrl: m.post_url,
    });
    if (out.length >= MAX_MEDIA) break;
  }
  return out;
}
