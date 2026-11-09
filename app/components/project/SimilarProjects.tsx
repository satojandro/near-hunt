// NH-23: up to four other live projects sharing the most tracks (lib/similar.mjs).
import Link from 'next/link';
import { similarProjects } from '@/lib/similar.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import ProjectAvatar from '@/app/components/ProjectAvatar';
import p from './project.module.css';
import s from './similar.module.css';

export default function SimilarProjects({ project, all }: { project: ListingItem; all: ListingItem[] }) {
  const similar = similarProjects(project, all);
  if (similar.length === 0) return null;
  return (
    <section className={p.card} aria-labelledby="similar-title">
      <h2 id="similar-title" className={p.cardTitle}>Similar projects</h2>
      <ul className={s.list}>
        {similar.map(({ project: q, shared }) => (
          <li key={q.submission_id}>
            <Link className={s.item} href={`/p/${encodeURIComponent(q.submission_id)}`}>
              <ProjectAvatar id={q.submission_id} name={q.name} track={q.tracks[0]} size={36} />
              <span className={s.itemText}>
                <span className={s.itemName}>{q.name}</span>
                <span className={s.itemTracks}>{shared.map(trackLabel).join(' · ')}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
