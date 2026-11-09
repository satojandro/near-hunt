'use client';

/**
 * "N views" next to a listing (NH-113).
 *
 * Counts its own visit once per browser session (sessionStorage, never a cookie), then shows the
 * number the server holds. Renders nothing when no counter is configured or the request fails, so a
 * page never displays a made-up zero.
 *
 * The label says "views", not "visitors": this is a page-view counter, one add per session per
 * browser, and it is trivially inflatable. It is an interest signal, not analytics.
 */

import { useEffect, useState } from 'react';

const SEEN_PREFIX = 'nh:viewed:';

export default function ViewCount({ path, className }: { path: string; className?: string }) {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const storageKey = SEEN_PREFIX + path;

    let seen = false;
    try {
      seen = window.sessionStorage.getItem(storageKey) === '1';
    } catch {
      // Storage unavailable: fall through and let the POST happen.
    }

    const url = seen ? `/api/views?path=${encodeURIComponent(path)}` : '/api/views';
    const init: RequestInit = seen
      ? { method: 'GET', cache: 'no-store' }
      : {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path }),
        };

    fetch(url, init)
      .then((res) => res.json())
      .then((json: { views?: unknown; available?: unknown }) => {
        if (cancelled) return;
        if (json?.available === true && typeof json.views === 'number') {
          setViews(json.views);
          try {
            window.sessionStorage.setItem(storageKey, '1');
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // Best-effort: nothing rendered.
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  if (views == null) return null;
  return (
    <span className={className} title="Page views, counted once per browser session. Approximate.">
      {views.toLocaleString('en-US')} {views === 1 ? 'view' : 'views'}
    </span>
  );
}
