import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { countablePath, parseIncr, viewKeys } from '@/lib/views.mjs';

/**
 * Per-listing view counts (NH-113).
 *
 *   GET  /api/views?path=/p/{id}     -> { views, available }
 *   POST /api/views  { path }        -> { views, available }   (adds one)
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
    // Two counters: all-time and today's bucket. The all-time INCR reply is the number shown.
    const total = await redis(['INCR', keys.total]);
    await redis(['INCR', keys.day]);
    const n = parseIncr(total);
    return NextResponse.json(
      { views: n ?? 0, available: true },
      { status: 200, headers: { ...CORS, 'cache-control': 'no-store' } },
    );
  } catch (err) {
    console.error('[views] increment failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ views: null, available: false }, { status: 200, headers: CORS });
  }
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });
