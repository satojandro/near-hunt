import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { claimsConfigured, githubIdentity, issueLink, removeClaim, saveClaim } from '@/lib/claims';
import { LINK_COOKIE, LINK_TTL_SECONDS } from '@/lib/claim-link.mjs';
import { CLAIM_COOKIE, claimRecord, claimableRepo, decodeState, ownershipBasis, sameState } from '@/lib/claims.mjs';

/**
 * NH-119: GitHub sends the browser back here after sign-in.
 *
 *   GET /api/claim/callback?code=…&state=…   -> 303 to /p/{id}?claim={outcome}#claim
 *
 * Everything is decided on the server from what GitHub answers to the user's own token; nothing
 * the browser sends (beyond the one-time code) is trusted. The token is not stored and is not put
 * in a cookie or a URL.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const started = decodeState(request.cookies.get(CLAIM_COOKIE)?.value);

  const finish = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
    res.cookies.set(CLAIM_COOKIE, '', { path: '/api/claim', maxAge: 0 });
    return res;
  };
  // No cookie: expired, another browser, or a callback URL someone was sent. There is no project
  // to return to that can be trusted, so go home.
  if (!started) return finish('/?claim=expired');
  const back = (outcome: string) => finish(`/p/${encodeURIComponent(started.id)}?claim=${outcome}#claim`);

  if (!sameState(q.get('state'), started.state)) return back('expired');
  if (q.get('error')) return back('denied');
  const code = q.get('code');
  if (!code || !claimsConfigured) return back('error');

  try {
    const project = await getProject(started.id);
    if (!project) return finish('/?claim=error');
    const slug = claimableRepo(project);
    if (started.action === 'claim' && !slug) return back('not_claimable');

    const { user, repo } = await githubIdentity({
      code,
      verifier: started.verifier,
      redirectUri: `${request.nextUrl.origin}/api/claim/callback`,
      // Removing needs only "who is this": a maker can withdraw even after losing the repository.
      slug: started.action === 'claim' ? slug : null,
    });

    if (started.action === 'remove') {
      const id = (user as { id?: unknown } | null)?.id;
      if (!Number.isInteger(id)) return back('error');
      await removeClaim(project.submission_id, id as number);
      const res = back('removed');
      res.cookies.set(LINK_COOKIE, '', { path: '/api/claim', maxAge: 0 });
      return res;
    }

    const basis = ownershipBasis(user, repo);
    if (!basis) return back('not_owner');
    const claim = claimRecord({ user, repo, basis });
    await saveClaim(project.submission_id, claim);
    // Step 2 of the NEAR link (lib/claim-link.mjs): this browser may now link one NEAR account.
    const res = back('verified');
    res.cookies.set(LINK_COOKIE, await issueLink(project.submission_id, claim), {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'strict',
      path: '/api/claim',
      maxAge: LINK_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    console.error('[claims] callback failed:', err instanceof Error ? err.message : err);
    return back('error');
  }
}
