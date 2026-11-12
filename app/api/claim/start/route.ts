import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { claimsConfigured, githubClientId, GITHUB_WEB } from '@/lib/claims';
import {
  CLAIM_ACTIONS, CLAIM_COOKIE, CLAIM_STATE_TTL_SECONDS, authorizeUrl, claimableRepo, encodeState,
} from '@/lib/claims.mjs';
import type { ClaimAction } from '@/lib/claims.mjs';

/**
 * NH-119: start a GitHub-verified claim.
 *
 *   POST /api/claim/start   (form: id, action=claim|remove)  -> 303 to GitHub's sign-in
 *
 * POST from this site only, never a link: a GET would let anyone send a maker a URL that publishes
 * their claim with one click. The random `state` goes to GitHub and into an httpOnly cookie, with
 * the PKCE verifier; the callback finishes only if both come back in the same browser.
 */
export const dynamic = 'force-dynamic';

const back = (request: NextRequest, id: string, outcome: string) =>
  NextResponse.redirect(new URL(`/p/${encodeURIComponent(id)}?claim=${outcome}#claim`, request.nextUrl.origin), 303);

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'cross_origin' }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const id = form?.get('id');
  const action = (form?.get('action') ?? 'claim') as ClaimAction;
  if (typeof id !== 'string' || !CLAIM_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const project = await getProject(id).catch(() => null);
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!claimsConfigured) return back(request, project.submission_id, 'error');
  if (action === 'claim' && !claimableRepo(project)) return back(request, project.submission_id, 'not_claimable');

  const state = randomBytes(16).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  const res = NextResponse.redirect(
    authorizeUrl({
      base: GITHUB_WEB,
      clientId: githubClientId,
      redirectUri: `${request.nextUrl.origin}/api/claim/callback`,
      state,
      verifier,
    }),
    303,
  );
  res.cookies.set(CLAIM_COOKIE, encodeState({ state, action, id: project.submission_id, verifier }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    // Lax, not Strict: the cookie must come back on the top-level redirect from github.com.
    sameSite: 'lax',
    path: '/api/claim',
    maxAge: CLAIM_STATE_TTL_SECONDS,
  });
  return res;
}
