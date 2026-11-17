'use client';

import { useEffect } from 'react';

// Track chips link to #{track}. If that section was folded away, open it before the browser
// scrolls there, on page load and on every chip click.
export default function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement && !el.open) {
        el.open = true;
        el.scrollIntoView();
      }
    };
    open();
    window.addEventListener('hashchange', open);
    // A chip for the section already in the hash fires no hashchange; catch the click instead.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (a) requestAnimationFrame(open);
    };
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', open);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return null;
}
