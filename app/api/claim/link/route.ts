import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { confirmLink, pendingLink } from '@/lib/claims';
import { LINK_COOKIE, isNearAccountId } from '@/lib/claim-link.mjs';

/**
 * NH-119, steps 2-3: link a NEAR account to a GitHub-checked claim (lib/claim-link.mjs).
 *
 *   GET  /api/claim/link              -> { pending: { id, github_login, code } | null }
 *   POST /api/claim/link { account }  -> { status: 'linked' | 'pending' | 'expired' }
 *
 * Both act only for the browser holding the httpOnly cookie set after a passed GitHub check.
 * POST trusts nothing in its body: `account` only tells the server whose row to look for, and the
 * link is made only if the index shows that account's own row carrying the issued code.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'cache-control': 'no-store' };

export async function GET(request: NextRequest) {
  const link = await pendingLink(request.cookies.get(LINK_COOKIE)?.value);
  return NextResponse.json(
    { pending: link ? { id: link.id, github_login: link.github_login, code: link.code } : null },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  // The cookie is SameSite=Strict; the Origin check is a second lock on the same door.
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'cross_origin' }, { status: 403, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => null)) as { account?: unknown } | null;
  if (!isNearAccountId(body?.account)) {
    return NextResponse.json({ error: 'bad_account' }, { status: 400, headers: NO_STORE });
  }
  try {
    const status = await confirmLink(request.cookies.get(LINK_COOKIE)?.value, body.account);
    const res = NextResponse.json({ status }, { headers: NO_STORE });
    if (status !== 'pending') res.cookies.set(LINK_COOKIE, '', { path: '/api/claim', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('[claims] link confirm failed:', err instanceof Error ? err.message : err);
    // The index or the store did not answer: the row may still be there, so the caller may retry.
    return NextResponse.json({ status: 'pending' }, { headers: NO_STORE });
  }
}
