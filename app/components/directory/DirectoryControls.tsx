import Link from 'next/link';
import { buildHref, type DirectoryState, type TrackChip } from '@/lib/directory.mjs';
import { trackLabel } from '@/lib/tracks.mjs';

// "Most discussed" waits for NH-43.
const SORT_TABS = [
  { sort: 'upvoted', label: 'Most upvoted' },
  { sort: 'newest', label: 'Newest' },
] as const;

/** Sort tabs (NH-14). Plain links: the URL carries the state. */
export function SortTabs({ state }: { state: DirectoryState }) {
  return (
    <nav className="dir-tabs" aria-label="Sort projects">
      {SORT_TABS.map(({ sort, label }) => {
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
