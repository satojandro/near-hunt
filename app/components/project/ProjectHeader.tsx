import ProjectAvatar from '@/app/components/ProjectAvatar';
import { trackLabel } from '@/lib/tracks.mjs';
import { tintClass } from '@/lib/tints.mjs';
import { eventLabel } from '@/lib/project-view.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import s from './project.module.css';

/** `actions` renders at the right of the header (the upvote button, NH-31); `extra` sits in the
 * metadata row (NH-113: the page-view count). */
export default function ProjectHeader({
  project, actions, extra,
}: { project: ListingItem; actions?: React.ReactNode; extra?: React.ReactNode }) {
  const event = eventLabel(project.source?.event);
  return (
    <div className={s.header}>
      <ProjectAvatar id={project.submission_id} name={project.name} track={project.tracks[0]} size={72} />
      <div className={s.headerText}>
        <h1 className={s.title}>{project.name}</h1>
        <div className={s.meta}>
          {project.tracks.length > 0 ? (
            <ul aria-label="Tracks" style={{ display: 'contents', listStyle: 'none' }}>
              {project.tracks.map((t) => (
                <li key={t} className={`${s.pill} ${tintClass(t)}`}>{trackLabel(t)}</li>
              ))}
            </ul>
          ) : (
            <span className={s.event}>Tracks: Not supplied</span>
          )}
          {event ? <span className={s.event}>{event}</span> : null}
          {extra ? <span className={s.event}>{extra}</span> : null}
        </div>
      </div>
      {actions ? <div className={s.headerActions}>{actions}</div> : null}
    </div>
  );
}
