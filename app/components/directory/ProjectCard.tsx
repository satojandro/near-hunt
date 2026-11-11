import Link from 'next/link';
import ProjectAvatar from '@/app/components/ProjectAvatar';
import { hostOf } from '@/lib/directory.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import { tintClass } from '@/lib/tints.mjs';
import UpvoteButton from '@/app/components/vote/UpvoteButton';
import ds from '@/app/components/discussion/discussion.module.css';

/**
 * One row of the directory (mockup board 1). The whole card is a link to the project page.
 * The description (NH-115) is the record's own text, shown as plain text and clamped to two lines.
 * `comments` (NH-43) is undefined when the count is unavailable: nothing is shown then.
 */
export default function ProjectCard({ item, rank, votes, comments }: { item: ListingItem; rank: number; votes: number; comments?: number }) {
  const host = hostOf(item.demo_url);
  return (
    <li className="dir-card">
      {/* Playful themes zero-pad the rank; the calm themes keep today's "1" (globals.css). */}
      <span className="dir-rank" aria-hidden="true">
        <span className="rank-plain">{rank}</span><span className="rank-pad">{String(rank).padStart(2, '0')}</span>
      </span>
      <span className="dir-avatar"><ProjectAvatar id={item.submission_id} name={item.name} track={item.tracks[0]} /></span>
      <div className="dir-card-body">
        <Link href={`/p/${encodeURIComponent(item.submission_id)}`} className="dir-card-link">
          <span className="visually-hidden">{rank}. </span>{item.name}
        </Link>
        {/* NH-115: the builder's own words, cut to two lines by CSS. Nothing when there are none. */}
        {item.description ? <p className="dir-card-desc">{item.description}</p> : null}
        <div className="dir-card-meta">
          <span className="visually-hidden">Tracks:</span>
          {item.tracks.map((t) => (
            <span key={t} className={`dir-pill ${tintClass(t)}`}>{trackLabel(t)}</span>
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
