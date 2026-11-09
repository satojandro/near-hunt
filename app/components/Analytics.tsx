'use client';

/**
 * Aggregate, cookie-free page counting (Umami Cloud) plus one delegated listener for outbound
 * clicks, which is the signal the chain cannot give us: which projects people actually open.
 *
 * Off by default. The script is only loaded when NEXT_PUBLIC_UMAMI_WEBSITE_ID is set at build
 * time, so a clone without analytics behaves identically. `data-domains` keeps localhost and
 * preview deploys out of the numbers.
 *
 * No cookies, no identifiers, no cross-site tracking: the footer says so, and the sponsor policy
 * (docs/PLAN.md NH-104) relies on it — aggregate counting is not ad tracking.
 */

import Script from 'next/script';
import { useEffect } from 'react';
import { track } from '@/lib/analytics';

const WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

/** Hosts that count as "inside the site"; a click to any other host is an outbound click. */
const OWN_HOSTS = new Set(['nearhunt.xyz', 'www.nearhunt.xyz', 'near-hunt.vercel.app']);

export default function Analytics() {
  useEffect(() => {
    if (!WEBSITE_ID) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (!/^https?:$/.test(url.protocol) || OWN_HOSTS.has(url.hostname)) return;
      const kind = anchor.dataset.outboundKind ?? 'other';
      track('outbound_click', { host: url.hostname, kind });
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  if (!WEBSITE_ID) return null;
  return (
    <Script
      src="https://cloud.umami.is/script.js"
      data-website-id={WEBSITE_ID}
      data-domains="nearhunt.xyz,www.nearhunt.xyz,near-hunt.vercel.app"
      strategy="afterInteractive"
    />
  );
}
