import 'server-only';
import { unstable_cache } from 'next/cache';
import { COUNTS_REVALIDATE_SECONDS, fetchReplyCounts, parsePostRef } from '@/lib/discussion.mjs';

/**
 * NH-43: reply counts for the directory, keyed by submission_id. Only projects with a
 * `social_post` are asked about, in `POST /v1/posts/batch` requests of 100 keys (so 277 posted
 * projects would be 3 requests), cached for two minutes. With no posted projects — the state on
 * 8 Nov — it makes no request at all.
 */
const cached = unstable_cache(
  async (pairs: Array<[string, string]>) =>
    fetchReplyCounts(pairs.map(([submission_id, social_post]) => ({ submission_id, social_post }))),
  ['nearhunt-reply-counts-v1'],
  { revalidate: COUNTS_REVALIDATE_SECONDS, tags: ['reply-counts'] },
);

export async function getReplyCounts(
  items: Array<{ submission_id: string; social_post?: string | null }>,
): Promise<{ counts: Record<string, number>; available: boolean; asked: number }> {
  const pairs = items
    .filter((it) => parsePostRef(it.social_post ?? null))
    .map((it): [string, string] => [it.submission_id, it.social_post as string])
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (pairs.length === 0) return { counts: {}, available: true, asked: 0 };
  return cached(pairs);
}
