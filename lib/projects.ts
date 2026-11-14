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
  /** The full KV walk in progress, shared by every cache chunk that misses at the same moment. */
  fullInflight: Promise<CachedList> | null;
  /** `fetched_at` of the copy last written to the shared store, so one read is stored once. */
  lastStoredFetchedAt: string;
  /** The shared-store read in progress, so concurrent callers cost one round trip, not one each. */
  snapshotInflight: Promise<Snapshot | null> | null;
}

const STATE_KEY = Symbol.for('nearhunt.projects.state');
const state: ProjectsState = ((globalThis as unknown as Record<symbol, ProjectsState>)[STATE_KEY] ??= {
  lastGood: null,
  lastOkAt: 0,
  lastFailedAt: 0,
  inflight: null,
  fullInflight: null,
  lastStoredFetchedAt: '',
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
 * How many records go into one cached entry.
 *
 * Why this is not a single entry any more: the listing outgrew Next's 2 MB limit for a data-cache
 * item. A whole-listing entry measured 2,150,157 bytes (1,255 records at ~1.6 KB each), so every
 * cache write was refused — "items over 2MB can not be cached" in the runtime logs — the 120 s
 * `revalidate` therefore never applied, and *every request* re-walked five KV pages, re-mapped the
 * listing and re-gzipped ~1.2 MB of it for the snapshot write. That is CPU, not I/O: it is what
 * put nearhunt.xyz at 90% of the plan's Fluid Active CPU. Splitting the listing into 250-record
 * chunks keeps each entry at ~400 KB, so the cache actually stores and a warm region does no work
 * per request. 250 also leaves room for the listing to roughly triple before a chunk nears the cap.
 */
export const PROJECTS_CHUNK_SIZE = 250;

/** One slice of the cached listing. `chunk_count` rides along so chunk 0 can enumerate the rest. */
interface CachedChunk extends CachedList {
  chunk: number;
  chunk_count: number;
}

/** The raw read, minus the caching: KV walk, hide list, durable copy. */
async function readFullList(): Promise<CachedList> {
  const entries = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet', fetchImpl: timedFetch });
  state.lastOkAt = Date.now();
  // NH-108: the owner's hide list is applied here, the one place every reader passes through.
  const items = filterHidden(toListing(entries), HIDDEN_PROJECTS);
  const list: CachedList = { items, fetched_at: new Date().toISOString(), account: DEFAULT_ACCOUNT };
  // Store the copy once per read instead of once per caller: encodeSnapshot gzips ~1.2 MB
  // synchronously, which is CPU spent for a value that has not changed since the last write.
  if (state.lastStoredFetchedAt !== list.fetched_at) {
    await saveSnapshotValue(PROJECTS_SNAPSHOT_KEY, list, 'projects');
    state.lastStoredFetchedAt = list.fetched_at;
  }
  return list;
}

/**
 * One KV walk per process, shared by every chunk that misses at the same moment.
 *
 * Without this, a cold region would walk the five KV pages once per chunk (five walks) whenever
 * the chunks expire together — the exact load the chunking is meant to remove.
 */
function readFullListOnce(): Promise<CachedList> {
  if (!state.fullInflight) {
    state.fullInflight = readFullList().finally(() => {
      state.fullInflight = null;
    });
  }
  return state.fullInflight;
}

/**
 * One cached chunk of the KV read, ~120 s (NH-11). When an entry expires Next serves it while it
 * re-reads in the background; if that re-read fails the old entry stays and `lastFailedAt` moves
 * on, which is what turns the banner on. Errors are never cached.
 *
 * The chunk number is a *key part*, not a function argument: `unstable_cache` keys on what it is
 * given, and an explicit key per chunk cannot silently collide into one shared entry the way an
 * argument-dependent key could.
 *
 * Every successful read also leaves a durable copy behind (lib/snapshot.mjs), so the next server
 * instance to start has something to serve before it has read the KV API even once.
 */
const chunkReaders = new Map<number, () => Promise<CachedChunk>>();

function readCachedChunk(chunk: number): Promise<CachedChunk> {
  let reader = chunkReaders.get(chunk);
  if (!reader) {
    const read = unstable_cache(
      async (): Promise<CachedChunk> => {
        try {
          const list = await readFullListOnce();
          const start = chunk * PROJECTS_CHUNK_SIZE;
          return {
            items: list.items.slice(start, start + PROJECTS_CHUNK_SIZE),
            fetched_at: list.fetched_at,
            account: list.account,
            chunk,
            chunk_count: Math.max(1, Math.ceil(list.items.length / PROJECTS_CHUNK_SIZE)),
          };
        } catch (err) {
          state.lastFailedAt = Date.now();
          throw err;
        }
      },
      ['nearhunt-projects-chunk-v1', String(chunk)],
      { revalidate: PROJECTS_REVALIDATE_SECONDS, tags: ['projects'] },
    );
    reader = read;
    chunkReaders.set(chunk, reader);
  }
  return reader();
}

/**
 * The whole listing, assembled from its cached chunks.
 *
 * Chunks are cached independently, so they can be a revalidation apart from each other. The
 * assembly therefore dedupes on `submission_id` and keeps the first copy it meets: a record that
 * moved across a chunk boundary in the newer read is served once, not twice, and the next
 * revalidation lines the chunks up again.
 */
async function readCachedProjects(): Promise<CachedList> {
  const first = await readCachedChunk(0);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.chunk_count - 1) }, (_, i) => readCachedChunk(i + 1)),
  );
  const seen = new Set<string>();
  const items: ListingItem[] = [];
  for (const chunk of [first, ...rest]) {
    for (const item of chunk.items) {
      const id: string = item.submission_id;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(item);
    }
  }
  return { items, fetched_at: first.fetched_at, account: first.account };
}

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
