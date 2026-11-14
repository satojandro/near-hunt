'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = { href: string; label: string; match: (p: string) => boolean; heart?: boolean };

const LINKS: NavLink[] = [
  { href: '/', label: 'Projects', match: (p: string) => p === '/' || p.startsWith('/p/') },
  { href: '/open-data', label: 'Open data', match: (p: string) => p.startsWith('/open-data') },
  // "Support" alone reads as tech support / troubleshooting. The ask is collaboration (donate or
  // stake), so the label says who is being supported, and a quiet accent heart marks it as the
  // one warm link in the menu. Owner request, 14 Nov.
  { href: '/support', label: 'Support us', match: (p: string) => p.startsWith('/support'), heart: true },
];

/** Header nav; marks the current section with aria-current (styled in globals.css). */
export default function SiteNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? 'page' : undefined}>
          {l.label}
          {l.heart ? (
            <span className="nav-heart" aria-hidden="true">
              {' '}
              ♥
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
