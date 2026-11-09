'use server';

import { revalidateTag } from 'next/cache';

/**
 * Called by the browser after the KV index has confirmed a comment or a deletion (NH-44). Expires
 * the cached `comment/` rows (lib/comments.ts, tag `comments`) so the next page view reads the new
 * list instead of a copy up to 15 s old.
 *
 * It takes no input and changes no data. Anyone can call it; the worst they can do is make the next
 * page view read the KV API directly, which is the cost of an empty cache.
 */
export async function commentsChanged(): Promise<void> {
  revalidateTag('comments', { expire: 0 });
}
