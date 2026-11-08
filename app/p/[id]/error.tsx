'use client';

import IndexerError from '@/app/components/states/IndexerError';

// The project page could not load. A KV outage must not read as "Project not found": this page
// says the record could not be read, not that it does not exist (lib/projects.ts `getProject`).
export default function ProjectError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <IndexerError error={error} retry={retry} title="This project could not be loaded" homeLink>
      <p>
        The NEAR indexer that serves project records is not responding right now, so we cannot
        read this project. That does not mean it is gone: records stay on chain under nearhunt.near.
      </p>
      <p>Try again in a minute.</p>
    </IndexerError>
  );
}
