/** Pure helpers for scripts/capture-threads.mjs (NH-96c), kept here so tests can import them. */

/**
 * What a capture found. "The builder did not reply" is only known when the page listed other
 * posts and they could be read; the other two outcomes say the crawler saw nothing, which is not
 * evidence about the builder.
 *  - `ok`                 at least one follow-up by the author
 *  - `no-author-replies`  other posts were listed and read, none by the author
 *  - `no-replies-listed`  the page listed no other post (X shows a logged-out reader very few)
 *  - `replies-unreadable` posts were listed but none could be read (rate limit, deleted)
 */
export function captureStatus({ listed, read, own }) {
  if (own > 0) return 'ok';
  if (listed === 0) return 'no-replies-listed';
  if (read === 0) return 'replies-unreadable';
  return 'no-author-replies';
}
