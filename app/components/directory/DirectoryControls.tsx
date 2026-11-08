import Link from 'next/link';
import { buildHref, type DirectoryState, type TrackChip } from '@/lib/directory.mjs';
import { trackLabel } from '@/lib/tracks.mjs';

const SORT_TABS = [
  { sort: 'upvoted', label: 'Most upvoted' },
  { sort: 'newest', label: 'Newest' },
  { sort: 'discussed', label: 'Most discussed' },
] as const;

/**
 * Sort tabs (NH-14, NH-43). Plain links: the URL carries the state. "Most discussed" is shown
 * only once some project has a near.social discussion post (`discussed`), or when it is active.
 */
export function SortTabs({ state, discussed = false }: { state: DirectoryState; discussed?: boolean }) {
  const tabs = SORT_TABS.filter((t) => t.sort !== 'discussed' || discussed || state.sort === 'discussed');
  return (
    <nav className="dir-tabs" aria-label="Sort projects">
      {tabs.map(({ sort, label }) => {
        const active = state.sort === sort;
        return (
          <Link
            key={sort}
            href={buildHref(state, { sort })}
            className="dir-tab"
            aria-current={active ? 'true' : undefined}
            scroll={false}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Track chips with live counts (NH-13). Single-select; "All" clears the filter. */
export function TrackChips({ state, chips }: { state: DirectoryState; chips: TrackChip[] }) {
  return (
    <nav className="dir-chips" aria-label="Filter by track">
      {chips.map((c) => {
        const label = c.track ? trackLabel(c.track) : 'All';
        return (
          <Link
            key={c.track ?? '__all'}
            href={buildHref(state, { track: c.track })}
            className="dir-chip"
            aria-current={c.active ? 'true' : undefined}
            aria-label={`${label}, ${c.count} ${c.count === 1 ? 'project' : 'projects'}`}
            scroll={false}
          >
            {label} <span className="dir-chip-count">{c.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
