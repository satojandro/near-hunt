import 'server-only';
import { NextResponse } from 'next/server';
import { ProjectsUnavailableError, getProject } from '@/lib/projects';
import { ApiError, CACHE, apiHeaders, errorBody, notFound, unavailable } from '@/lib/api.mjs';
import type { ListingItem } from '@/lib/listing.mjs';

// Shared plumbing for the NH-60 read API (docs/api-contract-day4.md). Everything that decides
// what a body contains lives in lib/api.mjs; this file only turns it into a Response.

export function json(body: unknown, cacheControl: string, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: apiHeaders(cacheControl) });
}

/** CORS preflight: no body, same headers as a GET. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: apiHeaders(CACHE.projects) });
}

/**
 * Run a handler and map failures to the contract's `{error, message}`. A stack trace or an
 * upstream error text never reaches the client; unexpected errors are logged and answered 503.
 */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    let e: ApiError;
    if (err instanceof ApiError) e = err;
    else if (err instanceof ProjectsUnavailableError) {
      e = unavailable('The NEAR indexer (FastData KV API) is not responding and there is no earlier copy.');
    } else {
      console.error('[api] unexpected error:', err instanceof Error ? err.message : err);
      e = unavailable('The data source could not be read. Try again shortly.');
    }
    return json(errorBody(e.code, e.message), CACHE.error, e.status);
  }
}

/** The live project `id`, or a `not_found` ApiError. */
export async function requireProject(id: string): Promise<ListingItem> {
  const project = await getProject(id);
  if (!project) throw notFound(`No live project record with id ${JSON.stringify(id)}.`);
  return project;
}
