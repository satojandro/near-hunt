import { getProjects } from '@/lib/projects';
import { staleNotice } from '@/lib/freshness.mjs';
import s from './states.module.css';

/**
 * NH-82: "Showing data from N minutes ago" when the last KV read failed and an older copy of the
 * project list is being served (lib/projects.ts). Renders nothing while reads succeed.
 *
 * Reads the same cached list the page already loaded, so it costs no extra request.
 * `row` wraps it in its own page-width container (for pages whose children are full-width rows).
 */
export default async function StaleBanner({ row = false }: { row?: boolean }) {
  let notice;
  try {
    const { fetched_at, read_failing } = await getProjects();
    notice = staleNotice({ fetchedAt: fetched_at, now: Date.now(), readFailing: read_failing });
  } catch {
    return null; // No copy at all: the route's error boundary says so instead.
  }
  if (!notice) return null;
  const banner = (
    <p className={s.banner} role="status">
      <strong>{notice.headline}</strong> {notice.body}
    </p>
  );
  return row ? <div className={`container ${s.bannerRow}`}>{banner}</div> : <div className={s.bannerInline}>{banner}</div>;
}
