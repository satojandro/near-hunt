'use client';

import { useEffect, useTransition } from 'react';
import Link from 'next/link';
import s from './states.module.css';

/**
 * The FastData KV API could not be read and the server had no earlier copy of the project list
 * (lib/projects.ts `ProjectsUnavailableError`). Used by the route error boundaries. Production
 * hides server error messages, so the copy does not depend on `error.message`.
 */
export default function IndexerError({
  error, retry, title, children, homeLink = false,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
  children: React.ReactNode;
  homeLink?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={`container ${s.error}`}>
      <div className={s.errorCard} role="alert">
        <h1>{title}</h1>
        {children}
        <div className={s.errorActions}>
          <button
            type="button"
            className={s.btnLight}
            aria-busy={pending}
            disabled={pending}
            onClick={() => startTransition(() => retry())}
          >
            {pending ? 'Trying again…' : 'Try again'}
          </button>
          {homeLink ? <Link href="/" className={s.btnDark}>Browse all projects</Link> : null}
        </div>
        {error.digest ? <p style={{ fontSize: 12 }}>Reference: {error.digest}</p> : null}
      </div>
    </main>
  );
}
