import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' });
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-grotesk', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://nearhunt.xyz'),
  title: { default: 'NEAR Hunt', template: '%s · NEAR Hunt' },
  description:
    'Browse NEAR Hackathon projects. Every project is an open record on NEAR; votes are community signals, not official judging.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </span>
              <span className="brand-name">NEAR Hunt</span>
            </Link>
            <nav className="site-nav" aria-label="Main">
              <Link href="/">Projects</Link>
            </nav>
            <span className="header-spacer" />
            {/* NH-30 (Day 2) wires this up. Disabled until then so it never pretends to work. */}
            <button type="button" className="connect-btn" disabled title="Connecting a NEAR account arrives with upvoting">
              Connect NEAR account
            </button>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container">
            <span>Project records are read from NEAR mainnet, account nearhunt.near, keys project/…</span>
            <span>Votes are community signals, not official judging.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
