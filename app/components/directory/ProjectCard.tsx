import Link from 'next/link';
import ProjectAvatar from '@/app/components/ProjectAvatar';
import { hostOf } from '@/lib/directory.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import { trackLabel } from '@/lib/tracks.mjs';

const UPVOTE_HINT = 'Upvoting arrives with account connect';

/** One row of the directory (mockup board 1). The whole card is a link to the project page. */
export default function ProjectCard({ item, rank, votes }: { item: ListingItem; rank: number; votes: number }) {
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
        </div>
      </div>
      {/* Count only, from the votes map (empty until NH-33). Deliberately not a button. */}
      <div className="dir-upvote" title={UPVOTE_HINT}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        <span>{votes}</span>
        <span className="visually-hidden"> {votes === 1 ? 'upvote' : 'upvotes'}. {UPVOTE_HINT}.</span>
      </div>
    </li>
  );
}
