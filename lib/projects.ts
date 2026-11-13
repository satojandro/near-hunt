import 'server-only';
import { unstable_cache } from 'next/cache';
import { readProjects, DEFAULT_ACCOUNT } from './kv.mjs';
import { toListing, filterHidden, type ListingItem } from './listing.mjs';
import { readIsFailing } from './freshness.mjs';
import { loadSnapshotValue, saveSnapshotValue } from './snapshot-store';
import { isFreshnessRecord, newestSnapshot, snapshotKey } from './snapshot.mjs';
import HIDDEN_PROJECTS from '../data/hidden-projects.json';

/** Redis key for the durable copy of the listing (lib/snapshot.mjs). */
const PROJECTS_SNAPSHOT_KEY = snapshotKey('projects');

/** The stored shape: the listing plus when it was read and which namespace it came from. */
interface Snapshot {
  items: ListingItem[];
  fetched_at: string;
  account: string;
}

const isSnapshot = (value: unknown): boolean =>
  isFreshnessRecord(value, (items) => Array.isArray(items)) &&
  typeof (value as { account?: unknown }).account === 'string';

/**
 * Seconds a cached copy of the project list is served before it is re-read from the KV API.
 *
 * 120, not 60: the listing changes only when an import batch lands (scripts/import.mjs, a few times
 * a day) and the per-project vote counts are read separately (lib/votes.ts), so a two-minute-old
 * list is not visibly stale — while every revalidation walks five paginated KV pages of ~300 KB
 * each (the API caps a page at 200 rows, so 813 records cannot be one request), and each of
 * Vercel's ~18 edge regions does that walk on its own. Halving the frequency halves the load on the
 * one upstream that was timing out.
 */
export const PROJECTS_REVALIDATE_SECONDS = 120;
/**
 * Per-request timeout for project reads: a hung indexer must not hold the page forever.
 *
 * Left at 8 s on purpose. A five-page walk measures ~2.1 s from a healthy network, so this is a
 * stall detector, not a budget that needs widening; lengthening it would push the read towards the
 * platform's function limit and turn a graceful degrade into a hard failure. What needed fixing was
 * what happens *after* a timeout, which is the durable copy in lib/snapshot.mjs.
 */
export const PROJECTS_TIMEOUT_MS = 8000;

export interface ProjectList {
  items: ListingItem[];
  /** ISO time the KV API was read. */
  fetched_at: string;
  account: string;
  /**
   * True when the most recent read of the KV API failed, so this is an older copy (NH-82). Pair
   * with `fetched_at` and `staleNotice` (lib/freshness.mjs) for the banner.
   */
  read_failing: boolean;
}

type CachedList = Omit<ProjectList, 'read_failing'>;

/** Thrown when the KV API cannot be read and there is no earlier copy to fall back on. */
export class ProjectsUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('The NEAR indexer (FastData KV API) is not responding and there is no earlier copy of the project list.');
    this.name = 'ProjectsUnavailableError';
    this.cause = cause;
  }
}

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(PROJECTS_TIMEOUT_MS) });

/**
 * Everything this module remembers between requests.
 *
 * Kept on `globalThis` rather than in module scope because Next builds this file into more than one
 * server bundle — route handlers and the RSC/SSR layer each get their own copy of the module, so
 * module-level variables silently become *two* independent caches, two in-flight slots and two
 * backoff clocks. That split is invisible until you count upstream requests: the same page render
 * walked the KV API once per bundle. A `Symbol.for` key makes every copy share one state object.
 */
interface ProjectsState {
  /** Newest list this process has served, so a failed read always has something to return. */
  lastGood: CachedList | null;
  /** When the most recent KV read succeeded (0 = never), for `readIsFailing`. */
  lastOkAt: number;
  /** When the most recent KV read failed (0 = never), for `readIsFailing` and the backoff. */
  lastFailedAt: number;
  /** The read currently in progress, shared by every caller that arrives while it runs. */
  inflight: Promise<CachedList> | null;
  /** The shared-store read in progress, so concurrent callers cost one round trip, not one each. */
  snapshotInflight: Promise<Snapshot | null> | null;
}

const STATE_KEY = Symbol.for('nearhunt.projects.state');
const state: ProjectsState = ((globalThis as unknown as Record<symbol, ProjectsState>)[STATE_KEY] ??= {
  lastGood: null,
  lastOkAt: 0,
  lastFailedAt: 0,
  inflight: null,
  snapshotInflight: null,
});

/**
 * How long a failed read stops new attempts, per instance.
 *
 * A single page render asks for the project list several times (the route, its metadata, and the
 * child components), and while the indexer is down each of those used to start another five-page
 * walk that could only fail — six doomed walks of up to 8 s each for one visitor, all counted
 * against the same upstream. Five seconds is far below the cache's own 120 s revalidation, so a
 * recovered indexer is picked up promptly, and above the length of one render.
 */
export const PROJECTS_RETRY_BACKOFF_MS = 5000;

/**
 * How stale the in-process copy may be before a failed read consults the shared store again.
 *
 * Without this every caller during an outage pays a Redis round trip for a copy it already holds.
 */
const FALLBACK_REFRESH_MS = 5 * 60 * 1000;

/** Thrown instead of walking the KV API while a recent failure is still cooling down. */
class ReadCoolingDownError extends Error {
  constructor() {
    super('project list read skipped: the previous attempt failed moments ago');
    this.name = 'ReadCoolingDownError';
  }
}

function isCoolingDown(): boolean {
  return state.lastFailedAt > 0 && Date.now() - state.lastFailedAt < PROJECTS_RETRY_BACKOFF_MS;
}

function readOnce(): Promise<CachedList> {
  if (isCoolingDown()) return Promise.reject(new ReadCoolingDownError());
  if (!state.inflight) {
    state.inflight = readCachedProjects().finally(() => {
      state.inflight = null;
    });
  }
  return state.inflight;
}

/**
 * The stored copy, shared between concurrent callers. Two callers can reach the fallback before
 * either has stored what it read, and without this both would pay a Redis round trip for the same
 * value.
 */
function loadSnapshotOnce(): Promise<Snapshot | null> {
  if (!state.snapshotInflight) {
    state.snapshotInflight = loadSnapshotValue<Snapshot>(PROJECTS_SNAPSHOT_KEY, isSnapshot, 'projects').finally(() => {
      state.snapshotInflight = null;
    });
  }
  return state.snapshotInflight as Promise<Snapshot | null>;
}

/**
 * The KV read, cached ~120 s (NH-11). When the copy expires, Next serves it while it re-reads in
 * the background; if that re-read fails the old copy stays and `lastReadFailedAt` moves on, which
 * is what turns the banner on. Errors are never cached.
 *
 * Every success also leaves a durable copy behind (lib/snapshot.mjs), so the next server
 * instance to start has something to serve before it has read the KV API even once.
 */
const readCachedProjects = unstable_cache(
  async (): Promise<CachedList> => {
    try {
      const entries = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet', fetchImpl: timedFetch });
      state.lastOkAt = Date.now();
      // NH-108: the owner's hide list is applied here, the one place every reader passes through.
      const items = filterHidden(toListing(entries), HIDDEN_PROJECTS);
      const list: CachedList = { items, fetched_at: new Date().toISOString(), account: DEFAULT_ACCOUNT };
      await saveSnapshotValue(PROJECTS_SNAPSHOT_KEY, list, 'projects');
      return list;
    } catch (err) {
      state.lastFailedAt = Date.now();
      throw err;
    }
  },
  ['nearhunt-projects-v2'],
  { revalidate: PROJECTS_REVALIDATE_SECONDS, tags: ['projects'] },
);

/**
 * Every live project record written by `nearhunt.near` (NH-01 via `readProjects`). Order is the
 * KV API's: by key.
 *
 * Never fails while any copy exists. The order of fallbacks is fastest-first:
 *   1. the cached list (and, per instance, `lastGood` — what this process read most recently);
 *   2. the durable copy in Redis, which is what a *cold* instance uses: it has no `lastGood` of its
 *      own, and before this existed a first read that timed out threw `ProjectsUnavailableError`
 *      and the visitor got the "indexer not responding" page;
 * and only with no copy anywhere does it throw, which the route error boundary renders.
 */
export async function getProjects(): Promise<ProjectList> {
  try {
    const list = await readOnce();
    if (!state.lastGood || list.fetched_at >= state.lastGood.fetched_at) state.lastGood = list;
    return {
      ...list,
      read_failing: readIsFailing({ lastFailedAt: state.lastFailedAt, lastOkAt: state.lastOkAt, fetchedAt: list.fetched_at }),
    };
  } catch (err) {
    // A skipped attempt (cooling down after a failure) is not news; only a real failure is logged.
    if (!(err instanceof ReadCoolingDownError)) {
      console.error('[projects] KV read failed:', err instanceof Error ? err.message : err);
    }
    // The shared store is only worth a round trip when this instance has nothing recent to show:
    // during an outage the copy in memory is the same copy, and asking again per caller is waste.
    const heldInMemory =
      state.lastGood && Date.now() - new Date(state.lastGood.fetched_at).getTime() < FALLBACK_REFRESH_MS
        ? state.lastGood
        : null;
    const stored = heldInMemory ? null : await loadSnapshotOnce();
    // Newest wins: a live instance's own copy is normally fresher than the stored one, but another
    // instance may have stored a newer read than this one ever managed.
    const fallback = newestSnapshot(heldInMemory ?? state.lastGood, stored) as CachedList | null;
    if (fallback) {
      state.lastGood = fallback;
      return { ...fallback, read_failing: true };
    }
    throw new ProjectsUnavailableError(err);
  }
}

/**
 * One project, or null when it does not exist. When the list being served is an older copy and
 * the id is not in it, the project may simply be newer than the copy, so this throws
 * `ProjectsUnavailableError` instead of claiming it does not exist.
 */
export async function getProject(submissionId: string): Promise<ListingItem | null> {
  const { items, read_failing } = await getProjects();
  const found = items.find((p) => p.submission_id === submissionId) ?? null;
  if (!found && read_failing) throw new ProjectsUnavailableError();
  return found;
}
