'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buildHref, type DirectorySort } from '@/lib/directory.mjs';

const DEBOUNCE_MS = 250;

/**
 * Search by project name (NH-12). The URL is the state: typing updates `?q=` with a debounced
 * `router.replace`, and the server renders the results. Without JavaScript the form still works
 * as a plain GET.
 */
export default function SearchBox({
  q, track, sort, total,
}: { q: string; track: string | null; sort: DirectorySort; total: number }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [pending, startTransition] = useTransition();
  const lastSent = useRef(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow URL changes made elsewhere (e.g. the "Clear search" link), but never overwrite what
  // the user is typing with an older value coming back from the server.
  useEffect(() => {
    if (q !== lastSent.current) {
      lastSent.current = q;
      setValue(q);
    }
  }, [q]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function push(next: string) {
    const normalised = next.replace(/\s+/g, ' ').trim();
    if (normalised === lastSent.current) return;
    lastSent.current = normalised;
    startTransition(() => {
      router.replace(buildHref({ q: normalised, track, sort }), { scroll: false });
    });
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), DEBOUNCE_MS);
  }

  return (
    <form
      role="search"
      action="/"
      method="get"
      className="dir-search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        push(value);
      }}
    >
      <label htmlFor="dir-search-input" className="visually-hidden">Search projects by name</label>
      <svg className="dir-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id="dir-search-input"
        type="search"
        name="q"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Search ${total} projects`}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        aria-busy={pending}
      />
      {track ? <input type="hidden" name="track" value={track} /> : null}
      {sort !== 'newest' ? <input type="hidden" name="sort" value={sort} /> : null}
    </form>
  );
}
