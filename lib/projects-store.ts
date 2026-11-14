import 'server-only';
import { loadSnapshotValue, saveSnapshotValue } from './snapshot-store';
import {
  PROJECTS_MARKER_KEY,
  PROJECTS_SNAPSHOT_KEY,
  isProjectsMarker,
  isProjectsSnapshot,
  listingDigest,
  resolveProjectsSnapshot,
  type ProjectsMarker,
  type ProjectsSnapshot,
} from './refresh-projects.mjs';
import type { ListingItem } from './listing.mjs';

/**
 * The listing's two keys in the shared store (NH-122), and the only place they are read or written.
 *
 * Why two: the items are ~1.2 MB of JSON (314 KB gzipped) and only change when an import batch
 * lands, but "when did we last see chain" changes every minute. Writing the heavy value each
 * minute would be ~450 MB of Redis bandwidth a day; writing only a ~120-byte marker keeps the
 * copy honest and the bill near zero.
 *
 * Both functions never throw (lib/snapshot-store.ts absorbs store failures): a missing store must
 * put the app back on its request-path walk, not break it.
 */

/** When the listing was last read from chain, and what it hashed to. */
export function readProjectsMarker(): Promise<ProjectsMarker | null> {
  return loadSnapshotValue<ProjectsMarker>(PROJECTS_MARKER_KEY, isProjectsMarker, 'projects-marker');
}

/** The stored items themselves. */
export function readProjectsCopy(): Promise<ProjectsSnapshot | null> {
  return loadSnapshotValue<ProjectsSnapshot>(PROJECTS_SNAPSHOT_KEY, isProjectsSnapshot, 'projects');
}

/** The marker and the stored items together, assembled by `resolveProjectsSnapshot`. */
export async function readProjectsSnapshot(): Promise<ProjectsSnapshot | null> {
  const [copy, marker] = await Promise.all([readProjectsCopy(), readProjectsMarker()]);
  return resolveProjectsSnapshot(copy, marker) as ProjectsSnapshot | null;
}

/**
 * Record a successful read of the listing.
 *
 * The heavy value is written only when the content changed; the marker is written every time, and
 * only after the heavy write succeeded — a marker that points at rows the store does not have
 * would make every instance reload the old copy forever.
 *
 * @param {object} opts
 * @param {ListingItem[]} opts.items  the listing as it was read
 * @param {string} [opts.account]
 * @param {string} [opts.fetchedAt]   when the read happened (ISO)
 * @returns {Promise<{changed: boolean, stored: boolean, marked: boolean, digest: string}>}
 *   `stored` false with `changed` false means "nothing to write"; `marked` false means the store
 *   refused the write and the copy is no fresher than it was.
 */
export async function writeProjectsSnapshot({
  items,
  account,
  fetchedAt = new Date().toISOString(),
}: {
  items: ListingItem[];
  account: string;
  fetchedAt?: string;
}): Promise<{ changed: boolean; stored: boolean; marked: boolean; digest: string }> {
  const digest = listingDigest(items);
  const previous = await readProjectsMarker();
  const changed = previous?.digest !== digest;

  let stored = false;
  if (changed) {
    stored = await saveSnapshotValue(
      PROJECTS_SNAPSHOT_KEY,
      { items, account, fetched_at: fetchedAt, digest },
      'projects',
    );
    if (!stored) return { changed, stored, marked: false, digest };
  }

  const marked = await saveSnapshotValue(
    PROJECTS_MARKER_KEY,
    { fetched_at: fetchedAt, digest, rows: items.length },
    'projects-marker',
  );
  return { changed, stored, marked, digest };
}
