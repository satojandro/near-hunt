'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Projects', match: (p: string) => p === '/' || p.startsWith('/p/') },
  { href: '/open-data', label: 'Open data', match: (p: string) => p.startsWith('/open-data') },
];

/** Header nav; marks the current section with aria-current (styled in globals.css). */
export default function SiteNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
