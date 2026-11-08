import type { NextRequest } from 'next/server';
import { fetchThread, parsePostRef, threadUrl } from '@/lib/discussion.mjs';
import { CACHE, badRequest, decodeUpstreamCursor, discussionBody, parseLimit, unavailable } from '@/lib/api.mjs';
import { handle, json, preflight, requireProject } from '../../../_lib/respond';

/**
 * `GET /api/projects/{id}/discussion?cursor=&limit=` (NH-60): direct replies to the project's
 * near.social post, read from api2.near.social. `meta.root` is null and `items` empty when the
 * project has no `social_post` yet (or near.social no longer has the post).
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const sp = request.nextUrl.searchParams;
    const limit = parseLimit(sp.get('limit'));
    const cursor = decodeUpstreamCursor(sp.get('cursor'));
    const { id } = await params;
    const project = await requireProject(id);

    const ref = parsePostRef(project.social_post ?? null);
    if (!ref) return json(discussionBody(null, null), CACHE.discussion);

    const thread = await fetchThread(ref.key, { limit, cursor });
    if (thread.status === 'ok') return json(discussionBody(thread, threadUrl(ref)), CACHE.discussion);
    if (thread.status === 'not_found' || thread.status === 'invalid') {
      return json(discussionBody(null, threadUrl(ref)), CACHE.discussion);
    }
    // near.social rejected a cursor we passed through: the caller's cursor is the problem.
    if (cursor && /^HTTP 4\d\d$/.test(thread.reason)) throw badRequest('cursor is not valid; pass next_cursor back verbatim');
    throw unavailable('near.social is not responding right now. Try again shortly.');
  });
}

export const OPTIONS = preflight;
