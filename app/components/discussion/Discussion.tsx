// NH-44: the project's discussion — comments on `nearhunt.near`, not near.social replies.
//
// The rows are read on the server (lib/comments.ts, cached 15 s, across writers) and the authors'
// names and avatars come from near.social profiles (NH-22's reader), which never throws: a
// near.social outage costs the names, never the comments.
import { PAGE_LIMIT } from '@/lib/comments.mjs';
import { getProjectComments } from '@/lib/comments';
import { fetchProfiles } from '@/lib/social.mjs';
import CommentsSection from './CommentsSection';
import type { ProfileView } from './CommentItem';

/** One near.social profile request per author; beyond this the account id stands in. */
const MAX_PROFILE_FETCH = 40;

export default async function Discussion({ projectId }: { projectId: string }) {
  const { items, count, available, stale, fetched_at: fetchedAt } = await getProjectComments(projectId);
  // The newest comments (oldest first inside the cut), so a busy thread shows the live end of it.
  const shown = items.slice(-PAGE_LIMIT);
  const authors = [...new Set(shown.map((c) => c.author))].slice(0, MAX_PROFILE_FETCH);
  const { profiles: fetched, status } = authors.length
    ? await fetchProfiles(authors)
    : { profiles: [], status: 'ok' as const };

  const profiles: Record<string, ProfileView> = {};
  for (const p of fetched) profiles[p.account_id] = { name: p.name, avatar_url: p.avatar_url };

  return (
    <CommentsSection
      projectId={projectId}
      initialItems={shown}
      count={count}
      available={available}
      stale={stale}
      fetchedAt={fetchedAt}
      profiles={profiles}
      profilesAvailable={status === 'ok'}
      now={Date.now()}
    />
  );
}
