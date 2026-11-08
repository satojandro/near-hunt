import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Inter, Space_Grotesk } from 'next/font/google';
import WalletProvider from '@/app/components/wallet/WalletProvider';
import ConnectButton from '@/app/components/wallet/ConnectButton';
import SiteNav from '@/app/components/SiteNav';
import { NETWORK, VOTE_ACCOUNT } from '@/lib/network.mjs';
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
        <WalletProvider>
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
              <SiteNav />
              <span className="header-spacer" />
              <ConnectButton />
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <div className="container">
              <span>Project records are read from NEAR mainnet, account nearhunt.near, keys project/…</span>
              <span>Votes are written by voters to {VOTE_ACCOUNT} on NEAR {NETWORK}, keys vote/… — community signals, not official judging.</span>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
