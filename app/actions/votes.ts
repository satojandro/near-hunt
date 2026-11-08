'use server';

import { revalidateTag } from 'next/cache';

/**
 * Called by the browser after the KV index has confirmed a vote or a removal (WalletProvider
 * `cast`, outcome `confirmed`). Expires the cached `vote/` rows (lib/votes.ts, tag `votes`) so the
 * next page view re-reads them instead of serving counts up to 20 s old.
 *
 * `{ expire: 0 }`: the next request blocks on a fresh read rather than getting one more stale
 * copy (the `'max'` profile would show the old count once more).
 *
 * It takes no input and changes no data. Anyone can call it, but the worst they can do is make the
 * next page view read the KV API directly, the same cost as the cache being empty. There is no
 * throttle on purpose: one would drop the refresh for a second voter in the same window.
 */
export async function votesChanged(): Promise<void> {
  revalidateTag('votes', { expire: 0 });
}
