import type { NextRequest } from 'next/server';
import { CACHE, badRequest, discussionBody, parsePage, unavailable } from '@/lib/api.mjs';
import { getProjectComments } from '@/lib/comments';
import { handle, json, preflight, requireProject } from '../../../_lib/respond';

/**
 * `GET /api/projects/{id}/discussion?cursor=&limit=` (NH-60, NH-44): the project's comments as
 * rows on `nearhunt.near`, oldest first, flat (`reply_to` links a reply to its parent).
 *
 * No comments is an empty list, not an error: every project takes comments. `503 unavailable`
 * when the comment rows cannot be read.
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const sp = request.nextUrl.searchParams;
    const page = parsePage(sp);
    const { id } = await params;
    await requireProject(id);

    const comments = await getProjectComments(id);
    if (!comments.available) throw unavailable('The comment rows cannot be read right now. Try again shortly.');

    return json(discussionBody(comments.items, comments, page), CACHE.discussion);
  });
}

export const OPTIONS = preflight;
