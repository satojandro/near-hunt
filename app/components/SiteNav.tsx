'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = { href: string; label: string; match: (p: string) => boolean; heart?: boolean; featured?: boolean };

const LINKS: NavLink[] = [
  { href: '/', label: 'Projects', match: (p: string) => p === '/' || p.startsWith('/p/') },
  // NH Picks is where we want newcomers to start, so it is the one link drawn as a pill with a
  // sparkle (owner request, 17 Nov).
  { href: '/picks', label: 'NH Picks', match: (p: string) => p.startsWith('/picks'), featured: true },
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
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.match(pathname) ? 'page' : undefined}
          className={l.featured ? 'nav-featured' : undefined}
        >
          {l.featured ? (
            <span className="nav-pill">
              <svg className="nav-sparkle" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
              </svg>
              {l.label}
            </span>
          ) : (
            l.label
          )}
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
