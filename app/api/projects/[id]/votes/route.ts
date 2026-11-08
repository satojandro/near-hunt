import type { NextRequest } from 'next/server';
import { getVotesWithHeights } from '@/lib/votes';
import { CACHE, parsePage, unavailable, votesBody } from '@/lib/api.mjs';
import { handle, json, preflight, requireProject } from '../../../_lib/respond';

/**
 * `GET /api/projects/{id}/votes?cursor=&limit=` (NH-60): active upvotes, latest first. The voter
 * is each row's `predecessor_id` (AGENTS.md §3). 503 when the vote rows cannot be read.
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const page = parsePage(request.nextUrl.searchParams);
    const { id } = await params;
    const project = await requireProject(id);
    const votes = await getVotesWithHeights(project.submission_id);
    if (!votes.available) throw unavailable('The vote rows could not be read from the FastData KV API. Try again shortly.');
    return json(votesBody(votes.votes, votes, page), CACHE.votes);
  });
}

export const OPTIONS = preflight;
