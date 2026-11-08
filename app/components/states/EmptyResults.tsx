import Link from 'next/link';
import { buildHref, type DirectoryState } from '@/lib/directory.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import s from './states.module.css';

/**
 * NH-81: no results for the current search and/or track filter (mockup States.png, second panel).
 * "Clear filters" keeps the sort and drops both the search and the track.
 */
export default function EmptyResults({ state }: { state: DirectoryState }) {
  const track = state.track ? trackLabel(state.track) : null;
  const title = state.q ? `Nothing matches “${state.q}”` : `No projects in ${track ?? 'this view'} yet`;

  let text: string;
  if (state.q && track) {
    text = `We search names only, because the hackathon feed has no descriptions. Try a shorter word or clear the ${track} filter.`;
  } else if (state.q) {
    text = 'We search names only, because the hackathon feed has no descriptions. Try a shorter word.';
  } else {
    text = 'No project in the hackathon feed lists this track. Pick another track or show them all.';
  }

  return (
    <div className={s.empty}>
      <svg className={s.emptyIcon} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
      </svg>
      <h2 className={s.emptyTitle}>{title}</h2>
      <p className={s.emptyText}>{text}</p>
      <div className={s.emptyActions}>
        <Link href={buildHref(state, { q: '', track: null })} className={s.btnDark} scroll={false}>
          {state.q && track ? 'Clear filters' : state.q ? 'Clear search' : 'Show all tracks'}
        </Link>
        {state.q && track ? (
          <Link href={buildHref(state, { track: null })} className={s.btnLight} scroll={false}>
            Search all tracks
          </Link>
        ) : null}
      </div>
    </div>
  );
}
