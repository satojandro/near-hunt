import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  countablePath, parseIncr, projectIdOfPath, rateKeys, viewKeys, withinDayLimit, withinMinuteLimits,
  RATE_KEY_TTL_SECONDS,
} from '@/lib/views.mjs';
import { getProjects } from '@/lib/projects';

/**
 * Per-listing view counts (NH-113).
 *
 *   GET  /api/views?path=/p/{id}     -> { views, available }
 *   POST /api/views  { path }        -> { views, available, counted }   (adds one, within limits)
 *
 * Limits (NH-118, lib/views.mjs): per path per minute and per day, and across all paths per
 * minute. A POST past a limit, or for a `/p/{id}` that is not a listed project, is answered with
 * the current number and `counted: false`; nothing is written to the totals.
 *
 * Storage is Upstash Redis over its REST API. Which names exist depends on how the database was
 * created, so all three spellings are read: `UPSTASH_REDIS_REST_KV_REST_API_URL/_TOKEN` (what the
 * Vercel Marketplace integration injects), `UPSTASH_REDIS_REST_URL/_TOKEN` (the Upstash console)
 * and `KV_REST_API_URL/_TOKEN` (older Vercel KV). With none of them the endpoint reports
 * `available: false` and the page shows nothing — no fake numbers, no broken layout.
 *
 * Privacy: the store holds two integers per path. No IP, no cookie, no identifier. The browser
 * counts its own visit once per session; the server just adds one, so the number is a page-view
 * counter, not a unique-visitor count, and the UI labels it that way.
 */
export const dynamic = 'force-dynamic';

const REST_URL =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ??
  process.env.UPSTASH_REDIS_REST_URL ??
  process.env.KV_REST_API_URL;
const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  process.env.KV_REST_API_TOKEN;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function unavailable() {
  return NextResponse.json(
    { views: null, available: false, note: 'View counting is not configured on this deployment.' },
    { status: 200, headers: CORS },
  );
}

async function redis(command: (string | number)[]) {
  const res = await fetch(REST_URL as string, {
    method: 'POST',
    headers: { authorization: `Bearer ${REST_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return res.json();
}

export async function GET(request: NextRequest) {
  const path = countablePath(request.nextUrl.searchParams.get('path'));
  if (!path) return NextResponse.json({ error: 'bad_path' }, { status: 400, headers: CORS });
  if (!REST_URL || !REST_TOKEN) return unavailable();

  try {
    const keys = viewKeys(path);
    const json = await redis(['GET', keys.total]);
    const n = json?.result == null ? 0 : parseIncr(json);
    return NextResponse.json(
      { views: n ?? 0, available: true },
      { status: 200, headers: { ...CORS, 'cache-control': 'no-store' } },
    );
  } catch (err) {
    console.error('[views] read failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ views: null, available: false }, { status: 200, headers: CORS });
  }
}

export async function POST(request: NextRequest) {
  if (!REST_URL || !REST_TOKEN) return unavailable();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400, headers: CORS });
  }
  const path = countablePath((body as { path?: unknown } | null)?.path);
  if (!path) return NextResponse.json({ error: 'bad_path' }, { status: 400, headers: CORS });

  try {
    const keys = viewKeys(path);
    const headers = { ...CORS, 'cache-control': 'no-store' };
    // Not counted: answer with the number as it stands.
    const current = async () => {
      const json = await redis(['GET', keys.total]);
      const n = json?.result == null ? 0 : parseIncr(json);
      return NextResponse.json({ views: n ?? 0, available: true, counted: false }, { status: 200, headers });
    };

    // A listing page is counted only for a project that is listed. Anything else would let a loop
    // over made-up ids fill the store. If the list cannot be read, nothing is counted.
    const projectId = projectIdOfPath(path);
    if (projectId) {
      const listed = await getProjects()
        .then(({ items }) => items.some((p) => p.submission_id.toLowerCase() === projectId.toLowerCase()))
        .catch(() => false);
      if (!listed) return current();
    }

    // The limiter: this path this minute, and all paths this minute. The keys expire on their own.
    const rl = rateKeys(path);
    const [pathHit, globalHit] = await Promise.all([redis(['INCR', rl.path]), redis(['INCR', rl.global])]);
    const pathMinute = parseIncr(pathHit);
    const globalMinute = parseIncr(globalHit);
    await Promise.all([
      pathMinute === 1 ? redis(['EXPIRE', rl.path, RATE_KEY_TTL_SECONDS]) : null,
      globalMinute === 1 ? redis(['EXPIRE', rl.global, RATE_KEY_TTL_SECONDS]) : null,
    ]);
    if (!withinMinuteLimits({ pathMinute, globalMinute })) return current();

    // Two counters: today's bucket, which also carries the daily limit, then all-time. The
    // all-time INCR reply is the number shown.
    const day = parseIncr(await redis(['INCR', keys.day]));
    if (!withinDayLimit(day)) return current();
    const total = await redis(['INCR', keys.total]);
    const n = parseIncr(total);
    return NextResponse.json({ views: n ?? 0, available: true, counted: true }, { status: 200, headers });
  } catch (err) {
    console.error('[views] increment failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ views: null, available: false }, { status: 200, headers: CORS });
  }
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });
