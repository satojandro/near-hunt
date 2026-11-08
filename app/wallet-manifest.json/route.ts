import { NextResponse } from 'next/server';
import { OFFICIAL_MANIFEST_URLS, mergeManifest } from '@/lib/wallets.mjs';

/**
 * `GET /wallet-manifest.json` — the NEAR Connect wallet list NEAR Hunt offers: the official
 * manifest minus EXCLUDED_WALLETS plus EXTRA_WALLETS (lib/wallets.mjs). The browser's
 * NearConnector loads this URL instead of the official one.
 */
// Rendered per request so a failed fetch is never baked in at build time; the upstream fetch
// itself is cached for an hour.
export const dynamic = 'force-dynamic';

export async function GET() {
  let official = null;
  for (const url of OFFICIAL_MANIFEST_URLS) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (res.ok) {
        official = await res.json();
        break;
      }
    } catch {
      // try the next mirror
    }
  }
  return NextResponse.json(mergeManifest(official), {
    // A failed upstream read is served briefly, so the next request retries it.
    headers: { 'cache-control': official ? 'public, max-age=300, s-maxage=3600' : 'no-store' },
  });
}
