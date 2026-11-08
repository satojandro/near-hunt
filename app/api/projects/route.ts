import type { NextRequest } from 'next/server';
import { getProjects } from '@/lib/projects';
import { getVoteCounts } from '@/lib/votes';
import { CACHE, parseProjectsQuery, projectsBody } from '@/lib/api.mjs';
import { handle, json, preflight } from '../_lib/respond';

/**
 * `GET /api/projects?track=&sort=&q=&cursor=&limit=` (NH-60): every live project record written
 * by nearhunt.near, with vote counts, as `{items, next_cursor, meta}`. Read-only.
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return handle(async () => {
    const query = parseProjectsQuery(request.nextUrl.searchParams);
    const [list, votes] = await Promise.all([getProjects(), getVoteCounts()]);
    return json(projectsBody(list, votes, query), CACHE.projects);
  });
}

export const OPTIONS = preflight;
