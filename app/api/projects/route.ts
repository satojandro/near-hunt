import type { NextRequest } from 'next/server';
import { getProjects } from '@/lib/projects';
import { getVoteCounts } from '@/lib/votes';
import { getCommentCounts } from '@/lib/comments';
import { CACHE, parseProjectsQuery, projectsBody } from '@/lib/api.mjs';
import { handle, json, preflight } from '../_lib/respond';

/**
 * `GET /api/projects?track=&sort=&q=&cursor=&limit=` (NH-60): every live project record written
 * by nearhunt.near, with vote and comment counts, as `{items, next_cursor, meta}`. Read-only.
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return handle(async () => {
    const query = parseProjectsQuery(request.nextUrl.searchParams);
    const [list, votes] = await Promise.all([getProjects(), getVoteCounts()]);
    // NH-118: comment counts, for `comments` on each item and `sort=comments`. Never throws; when
    // the read fails the counts are null and `meta.comments_available` is false.
    const comments = await getCommentCounts(list.items.map((p) => p.submission_id));
    return json(projectsBody(list, votes, query, comments), CACHE.projects);
  });
}

export const OPTIONS = preflight;
