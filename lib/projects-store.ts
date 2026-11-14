import 'server-only';
import { loadSnapshotValue, saveSnapshotValue, touchSnapshotValue } from './snapshot-store';
import {
  PROJECTS_MARKER_KEY,
  PROJECTS_SNAPSHOT_KEY,
  isProjectsMarker,
  isProjectsSnapshot,
  listingDigest,
  needsCopyRepair,
  resolveProjectsSnapshot,
  type ProjectsMarker,
  type ProjectsSnapshot,
} from './refresh-projects.mjs';
import type { ListingItem } from './listing.mjs';

/**
 * The listing's two keys in the shared store (NH-122), and the only place they are read or written.
 *
 * Why two: the items only change when an import batch lands, but "when did we last see chain"
 * changes every minute. Measured 14 Nov 2026 with `node scripts/listing-sizes.mjs` (1,838 rows):
 * the items key is ~2.7 MB of JSON, stored as ~730 KB (gzip + base64), so writing it every minute
 * would be ~1 GB of Redis writes a day; the marker is 176 B stored (~250 KB a day). The sizes grow
 * with the listing; re-run the script for today's numbers.
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
 *   `stored` false with `changed` false means "nothing to write, TTL refreshed"; `stored` true with
 *   `changed` false means the heavy key had gone and was written again; `marked` false means the store
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
}): Promise<{ changed: boolean; repaired: boolean; stored: boolean; marked: boolean; digest: string }> {
  const digest = listingDigest(items);
  const previous = await readProjectsMarker();
  const changed = previous?.digest !== digest;
  // A marker that cannot vouch for the store's items (see `needsCopyRepair`) forces one rewrite, so
  // an items value left without — or with a different — digest is repaired instead of freezing the
  // age the reader prints for it.
  const repaired = needsCopyRepair(previous);
  // Unchanged rows are not rewritten, but the heavy key carries a 7-day TTL: keep it alive on every
  // walk, and write it again when it is gone (expired, evicted). Without this a quiet week with no
  // imports lets it expire while the marker still matches, and every instance is back to walking.
  const present = changed || repaired ? false : await touchSnapshotValue(PROJECTS_SNAPSHOT_KEY, 'projects');

  let stored = false;
  if (changed || repaired || !present) {
    stored = await saveSnapshotValue(
      PROJECTS_SNAPSHOT_KEY,
      { items, account, fetched_at: fetchedAt, digest },
      'projects',
    );
    if (!stored) return { changed, repaired, stored, marked: false, digest };
  }

  const marked = await saveSnapshotValue(
    PROJECTS_MARKER_KEY,
    { fetched_at: fetchedAt, digest, rows: items.length, copy_digest: digest },
    'projects-marker',
  );
  return { changed, repaired, stored, marked, digest };
}

/**
 * Leave a copy behind after a request-path walk, without competing with the walker.
 *
 * The cron route is the listing's writer (`writeProjectsSnapshot`). A page that had to walk because
 * no copy existed only *seeds* an empty store: both keys are written with SET NX, so a value the
 * walker (or another cold instance) already stored is never overwritten, and concurrent cold
 * instances do not each push a ~730 KB value. The marker is seeded only when this call seeded the
 * items, so it never describes rows another writer stored (and `resolveProjectsSnapshot` checks the
 * digest regardless).
 *
 * Never throws. @returns the digest of `items` (for the copy in memory) and whether it was stored.
 */
export async function seedProjectsSnapshot({
  items,
  account,
  fetchedAt,
}: {
  items: ListingItem[];
  account: string;
  fetchedAt: string;
}): Promise<{ seeded: boolean; digest: string }> {
  const digest = listingDigest(items);
  const seeded = await saveSnapshotValue(
    PROJECTS_SNAPSHOT_KEY,
    { items, account, fetched_at: fetchedAt, digest },
    'projects',
    { onlyIfAbsent: true },
  );
  if (seeded) {
    await saveSnapshotValue(
      PROJECTS_MARKER_KEY,
      { fetched_at: fetchedAt, digest, rows: items.length, copy_digest: digest },
      'projects-marker',
      { onlyIfAbsent: true },
    );
  }
  return { seeded, digest };
}
