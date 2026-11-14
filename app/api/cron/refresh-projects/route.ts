import type { NextRequest } from 'next/server';
import HIDDEN_PROJECTS from '@/data/hidden-projects.json';
import { CACHE } from '@/lib/api.mjs';
import { buildProjectsListing } from '@/lib/listing.mjs';
import { writeProjectsSnapshot } from '@/lib/projects-store';
import { walkProjects } from '@/lib/refresh-projects.mjs';
import { json } from '../../_lib/respond';

/**
 * The project listing's only walker (NH-122), run by Vercel Cron once a minute (vercel.json).
 *
 * Why a cron and not the request path: the listing is 1,680 records in nine sequential pages of
 * ~300 KB, and every Vercel region used to walk all of it whenever its own cache expired. A page
 * request must not be the thing that discovers the indexer is slow — measured 14 Nov, six walks
 * aborted at the 8 s page timeout in an eight-minute window, each turning the "indexer is slow"
 * banner on across the site.
 *
 * Read `lib/projects.ts` for the other half: every page now reads the copy this writes.
 *
 * Authorization: Vercel sends `Authorization: Bearer $CRON_SECRET` when the variable is set
 * (docs/README "Cron"). Without it the route refuses rather than running open, because it is a
 * read plus a store write that anyone could otherwise trigger.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(request: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: 'CRON_SECRET is not set, so the walker will not run unauthenticated.',
    };
  }
  if (request.headers.get('authorization') === `Bearer ${secret}`) return { ok: true };
  return { ok: false, status: 401, message: 'Unauthorized.' };
}

export async function GET(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) return json({ ok: false, error: 'unauthorized', message: auth.message }, CACHE.error, auth.status);

  const started = Date.now();
  try {
    const walk = await walkProjects();
    // One builder for this walker and the request-path fallback: hide list included, or the two
    // copies would disagree about which records exist (NH-108).
    const items = buildProjectsListing(walk.entries, HIDDEN_PROJECTS);
    const fetched_at = new Date().toISOString();
    const write = await writeProjectsSnapshot({ items, account: walk.account, fetchedAt: fetched_at });
    const body = {
      ok: write.marked,
      rows: items.length,
      pages: walk.pages,
      walk_ms: walk.ms,
      took_ms: Date.now() - started,
      fetched_at,
      snapshot: { changed: write.changed, stored: write.stored, marked: write.marked },
    };
    if (!write.marked) {
      console.error('[cron] project snapshot write failed:', JSON.stringify(body));
      return json(
        { ...body, error: 'store_write_failed', message: 'The listing was read but could not be stored.' },
        CACHE.error,
        502,
      );
    }
    console.log(
      `[cron] project listing: ${body.rows} rows, ${body.pages} pages, ${body.walk_ms} ms, ` +
        `${write.changed ? 'content changed' : 'unchanged'}`,
    );
    return json(body, CACHE.error);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron] project walk failed:', message);
    return json({ ok: false, error: 'walk_failed', message, took_ms: Date.now() - started }, CACHE.error, 502);
  }
}
