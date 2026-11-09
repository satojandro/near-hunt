import Link from 'next/link';
import ProjectAvatar from '@/app/components/ProjectAvatar';
import { hostOf } from '@/lib/directory.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import UpvoteButton from '@/app/components/vote/UpvoteButton';
import ds from '@/app/components/discussion/discussion.module.css';

/**
 * One row of the directory (mockup board 1). The whole card is a link to the project page.
 * `comments` (NH-43) is undefined when the count is unavailable: nothing is shown then.
 */
export default function ProjectCard({ item, rank, votes, comments }: { item: ListingItem; rank: number; votes: number; comments?: number }) {
  const host = hostOf(item.demo_url);
  return (
    <li className="dir-card">
      <span className="dir-rank" aria-hidden="true">{rank}</span>
      <span className="dir-avatar"><ProjectAvatar id={item.submission_id} name={item.name} /></span>
      <div className="dir-card-body">
        <Link href={`/p/${encodeURIComponent(item.submission_id)}`} className="dir-card-link">
          <span className="visually-hidden">{rank}. </span>{item.name}
        </Link>
        <div className="dir-card-meta">
          <span className="visually-hidden">Tracks:</span>
          {item.tracks.map((t) => (
            <span key={t} className="dir-pill">{trackLabel(t)}</span>
          ))}
          {host ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="dir-demo">Demo on {host}</span>
            </>
          ) : null}
          {typeof comments === 'number' ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={ds.cardCount}>{comments} {comments === 1 ? 'comment' : 'comments'}</span>
            </>
          ) : null}
        </div>
      </div>
      {/* Outside the name link: clicking it votes, it never navigates. */}
      <UpvoteButton projectId={item.submission_id} initialCount={votes} variant="card" projectName={item.name} />
    </li>
  );
}
