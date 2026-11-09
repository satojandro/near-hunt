import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Caveat, Fraunces, Inter, Space_Grotesk, Space_Mono } from 'next/font/google';
import WalletProvider from '@/app/components/wallet/WalletProvider';
import ConnectButton from '@/app/components/wallet/ConnectButton';
import SiteNav from '@/app/components/SiteNav';
import ThemePicker from '@/app/components/ThemePicker';
import Analytics from '@/app/components/Analytics';
import { correctionUrl } from '@/lib/links.mjs';
import { NETWORK, VOTE_ACCOUNT } from '@/lib/network.mjs';
import { themeInitScript } from '@/lib/themes.mjs';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' });
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-grotesk', display: 'swap' });
// The playful themes' fonts (NH-114): Fraunces display, Space Mono numbers, Caveat for the snapshot
// caption. `preload: false` is deliberate: a Light or Dark visitor never downloads them, because
// nothing in those themes' CSS asks for these families.
const fraunces = Fraunces({
  subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-fraunces', display: 'swap',
  preload: false, adjustFontFallback: false,
});
const spaceMono = Space_Mono({
  subsets: ['latin'], weight: ['400', '700'], variable: '--font-space-mono', display: 'swap', preload: false,
});
const caveat = Caveat({ subsets: ['latin'], weight: ['600'], variable: '--font-caveat', display: 'swap', preload: false });

export const metadata: Metadata = {
  metadataBase: new URL('https://nearhunt.xyz'),
  title: { default: 'NEAR Hunt', template: '%s · NEAR Hunt' },
  description:
    'Browse NEAR Hackathon projects. Every project is an open record on NEAR; votes are community signals, not official judging.',
};

// themeColor is the Light surface; the pre-paint script rewrites it to the theme actually applied.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#FFFFFF' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${grotesk.variable} ${fraunces.variable} ${spaceMono.variable} ${caveat.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* NH-114: data-theme before first paint, so a dark visitor never sees a white flash.
            A plain inline script as the first thing in <body>, not next/script: with
            strategy="beforeInteractive" the app router emitted the streamed Suspense content
            twice (two .dir-list, 670 cards), which a baseline build at origin/main does not. */}
        <script id="nh-theme-init" dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
        <WalletProvider>
          <header className="site-header">
            <div className="container">
              <Link href="/" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </span>
                <span className="brand-name">NEAR Hunt</span>
              </Link>
              <SiteNav />
              <span className="header-spacer" />
              <ThemePicker />
              <ConnectButton />
            </div>
          </header>
          {/* Four-band stripe under the header; height 0 in Light and Dark (README §3). */}
          <div className="theme-stripe" aria-hidden="true" />
          {children}
          <footer className="site-footer">
            <div className="container">
              <span>Project records are read from NEAR mainnet, account nearhunt.near, keys project/…</span>
              <span>Votes are written by voters to {VOTE_ACCOUNT} on NEAR {NETWORK}, keys vote/… — community signals, not official judging.</span>
              {/* NH-106: the header nav is hidden on phones, so the footer carries every route a
                  phone visitor needs. */}
              <nav className="footer-links" aria-label="Footer">
                <Link href="/">Projects</Link>
                <Link href="/open-data">Open data</Link>
                <Link href="/comment-policy">Comment policy</Link>
                <a href={correctionUrl()} target="_blank" rel="noopener noreferrer" data-outbound-kind="correction">
                  Report a problem
                </a>
                {/* NH-114: the header picker is hidden on phones, so this is the phone's picker. */}
                <ThemePicker variant="footer" />
              </nav>
              {/* The counter and the analytics are aggregate and cookie-free (Analytics.tsx,
                  app/api/views). The claim is only rendered when one of them is configured. */}
              {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
                || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL
                || process.env.UPSTASH_REDIS_REST_URL
                || process.env.KV_REST_API_URL ? (
                <span className="footer-privacy">Page views are counted in aggregate, without cookies or identifiers.</span>
              ) : null}
            </div>
          </footer>
        </WalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
