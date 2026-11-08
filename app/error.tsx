'use client';

import IndexerError from '@/app/components/states/IndexerError';

// The directory could not load. Almost always the FastData KV API (the NEAR indexer) not
// answering on a server with no earlier copy of the list; with a copy, the page renders with the
// "data from N minutes ago" banner instead (lib/projects.ts).
export default function DirectoryError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <IndexerError error={error} retry={retry} title="Projects could not be loaded">
      <p>
        The NEAR indexer that serves the project records is not responding right now, so there is
        nothing to show yet. The records themselves are safe on chain under nearhunt.near.
      </p>
      <p>Try again in a minute.</p>
    </IndexerError>
  );
}
