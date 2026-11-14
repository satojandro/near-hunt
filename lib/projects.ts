import 'server-only';
import { DEFAULT_ACCOUNT } from './kv.mjs';
import { buildProjectsListing, type ListingItem } from './listing.mjs';
import { copyIsStale } from './freshness.mjs';
import { readProjectsCopy, readProjectsMarker, seedProjectsSnapshot } from './projects-store';
import {
  PROJECTS_MEMORY_TTL_MS,
  PROJECTS_STALE_AFTER_MS,
  advanceFromMarker,
  liveRefreshDue,
  liveWalkCoolingDown,
  resolveProjectsSnapshot,
  walkProjects,
  type ProjectsSnapshot,
} from './refresh-projects.mjs';
import HIDDEN_PROJECTS from '../data/hidden-projects.json';

/**
 * The project listing, read from a copy that one walker keeps current (NH-122).
 *
 * Until 14 Nov every request that missed Next's data cache walked the FastData KV API itself:
 * nine sequential pages of ~300 KB for 1,680 records, in each of ~18 Vercel regions, every two
 * minutes. Production logs showed the consequence — six walks aborted at the 8 s page timeout in
 * an eight-minute window (cdg1, arn1, bom1, syd1, fra1), each failing all seven cached chunks at
 * once, which is what turned the "indexer is slow" banner on over a copy that could be seconds
 * old.
 *
 * The read path is now, fastest first:
 *   1. this instance's memory (one store round trip a minute at most);
 *   2. the stored copy in Upstash, written by `walkProjects` in app/api/cron/refresh-projects
 *      once a minute — one walk a minute instead of one per region per request;
 *   3. the live walk, only when no copy exists at all (a cold deployment with an empty store), or
 *      when the store gives no marker (a checkout without Upstash, or the store is down) — then
 *      nothing else refreshes this instance, so it walks itself, at most once a minute
 *      (`liveRefreshDue`). That path is what a page used to do every time, so it is kept, not
 *      trusted.
 *
 * The banner's trigger changed with it. It used to be "a read on this instance failed after the
 * copy was read", which said nothing about the copy's age and could contradict it ("showing data
 * from less than a minute ago" is not stale). It is now the claim itself: the copy is older than
 * `PROJECTS_STALE_AFTER_MS`, three walk intervals. No successful walk for three minutes means the
 * walker or the indexer is in trouble, and then the age in the banner is true.
 */

export interface ProjectList {
  items: ListingItem[];
  /** ISO time the listing was last read from chain (the walker's, not this instance's). */
  fetched_at: string;
  account: string;
  /**
   * True when the copy being served is old enough to label (NH-82): older than
   * `PROJECTS_STALE_AFTER_MS`. Pair with `fetched_at` and `staleNotice` (lib/freshness.mjs).
   */
  read_failing: boolean;
}

/** Thrown when there is no copy anywhere and the live walk fails too. */
export class ProjectsUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('The NEAR indexer (FastData KV API) is not responding and there is no earlier copy of the project list.');
    this.name = 'ProjectsUnavailableError';
    this.cause = cause;
  }
}

/**
 * Per-request timeout for the request-path fallback walk only.
 *
 * Left at 8 s on purpose: the walker (15 s a page, retried) is where a slow indexer is absorbed,
 * and this path runs only when no copy exists anywhere. Lengthening it would push a page render
 * towards the platform's function limit and turn a graceful degrade into a hard failure.
 */
export const PROJECTS_TIMEOUT_MS = 8000;

/**
 * The whole request-path walk gives up after this long, however many pages are left. Eight seconds
 * a page alone would let nine pages hold a page render for ~72 s, near the function limit; a page
 * that cannot be rendered in 25 s is better served the "indexer not responding" page.
 */
export const PROJECTS_LIVE_WALK_BUDGET_MS = 25_000;

/**
 * Everything this module remembers between requests.
 *
 * On `globalThis` rather than in module scope because Next builds this file into more than one
 * server bundle — route handlers and the RSC/SSR layer each get their own copy of the module, so
 * module-level variables become *two* independent memories and two store reads. A `Symbol.for` key
 * makes every copy share one state object.
 */
interface ProjectsState {
  /** The copy this process last served, and when it last asked the store about it. */
  snapshot: ProjectsSnapshot | null;
  loadedAt: number;
  /** The store read in progress, so concurrent callers cost one round trip, not one each. */
  snapshotInflight: Promise<ProjectsSnapshot | null> | null;
  /** The fallback walk in progress, shared by every caller that arrives while it runs. */
  walkInflight: Promise<ProjectsSnapshot> | null;
  /** Whether the last store check returned a marker; false means nothing else refreshes memory. */
  storeAnswered: boolean;
  /** When this instance last started a live walk (0 = never), to walk at most once a minute. */
  lastLiveAttemptAt: number;
  /** When this instance's last live walk failed (0 = never), for `liveWalkCoolingDown`. */
  lastLiveFailedAt: number;
}

const STATE_KEY = Symbol.for('nearhunt.projects.state');
const state: ProjectsState = ((globalThis as unknown as Record<symbol, ProjectsState>)[STATE_KEY] ??= {
  snapshot: null,
  loadedAt: 0,
  snapshotInflight: null,
  walkInflight: null,
  storeAnswered: false,
  lastLiveAttemptAt: 0,
  lastLiveFailedAt: 0,
});

/**
 * The stored copy, re-checked at most once per `PROJECTS_MEMORY_TTL_MS`.
 *
 * The marker is read first because it is small (176 B measured): when its digest matches the copy
 * in memory the rows have not changed, only the time of the last walk has, and the heavy value
 * (685 KB stored) is not downloaded again (`advanceFromMarker`).
 */
async function loadSnapshot(): Promise<ProjectsSnapshot | null> {
  if (state.snapshot && Date.now() - state.loadedAt < PROJECTS_MEMORY_TTL_MS) return state.snapshot;
  if (!state.snapshotInflight) {
    state.snapshotInflight = (async () => {
      const marker = await readProjectsMarker();
      state.storeAnswered = marker !== null;
      const advanced = advanceFromMarker(state.snapshot, marker) as ProjectsSnapshot | null;
      if (advanced) {
        state.snapshot = advanced;
        return advanced;
      }
      const copy = await readProjectsCopy();
      const next = resolveProjectsSnapshot(copy, marker) as ProjectsSnapshot | null;
      if (next) state.snapshot = next;
      return state.snapshot;
    })().finally(() => {
      state.loadedAt = Date.now();
      state.snapshotInflight = null;
    });
  }
  return state.snapshotInflight;
}

/** The live walk, kept as the last resort. Also leaves a copy behind for the next cold instance. */
async function readLive(): Promise<ProjectsSnapshot> {
  if (!state.walkInflight) {
    state.lastLiveAttemptAt = Date.now();
    state.walkInflight = (async () => {
      const { entries } = await walkProjects({
        account: DEFAULT_ACCOUNT,
        network: 'mainnet',
        limits: { attemptsPerPage: 1, perPageTimeoutMs: PROJECTS_TIMEOUT_MS, walkBudgetMs: PROJECTS_LIVE_WALK_BUDGET_MS },
      });
      const snapshot: ProjectsSnapshot = {
        items: buildProjectsListing(entries, HIDDEN_PROJECTS),
        account: DEFAULT_ACCOUNT,
        fetched_at: new Date().toISOString(),
      };
      // Seeds an empty store only (SET NX): the cron walker stays the writer, and cold instances
      // do not race it or each other. Never throws; a walk that cannot store is still worth serving.
      const seed = await seedProjectsSnapshot({
        items: snapshot.items,
        account: snapshot.account,
        fetchedAt: snapshot.fetched_at,
      });
      snapshot.digest = seed.digest;
      state.snapshot = snapshot;
      state.loadedAt = Date.now();
      return snapshot;
    })().finally(() => {
      state.walkInflight = null;
    });
  }
  return state.walkInflight;
}

/** The served shape: the copy plus whether its age has to be admitted. */
function asList(snapshot: ProjectsSnapshot): ProjectList {
  return {
    items: snapshot.items,
    fetched_at: snapshot.fetched_at,
    account: snapshot.account,
    read_failing: copyIsStale({ fetchedAt: snapshot.fetched_at, now: Date.now(), maxAgeMs: PROJECTS_STALE_AFTER_MS }),
  };
}

/**
 * Every live project record written by `nearhunt.near`, hide list applied.
 *
 * Never fails while any copy exists, and the copy's age is always carried to the UI.
 */
export async function getProjects(): Promise<ProjectList> {
  const snapshot = await loadSnapshot();
  // With a working store the walker keeps the copy fresh. Without one (no Upstash, store down, no
  // marker yet) nothing else ever would, so this instance refreshes its own copy, once a minute.
  const refresh = liveRefreshDue({
    snapshot,
    storeAnswered: state.storeAnswered,
    lastAttemptAt: state.lastLiveAttemptAt,
    now: Date.now(),
  });
  if (snapshot && !refresh) return asList(snapshot);
  // No copy, and a walk failed moments ago: do not start another one per caller. (With a copy,
  // `liveRefreshDue` already limits refreshes to one a minute.)
  if (!snapshot && !state.walkInflight && liveWalkCoolingDown({ lastFailedAt: state.lastLiveFailedAt, now: Date.now() })) {
    throw new ProjectsUnavailableError();
  }
  try {
    return asList(await readLive());
  } catch (err) {
    // Next marks a build-time prerender attempt with this digest. That is not an indexer failure:
    // the page is dynamic, and wrapping the error would turn the build's quiet "dynamic route"
    // note into a "walk failed" log line.
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') throw err;
    state.lastLiveFailedAt = Date.now();
    if (snapshot) {
      // A refresh that failed still leaves the copy we had; its age labels it (`asList`).
      console.error('[projects] live refresh failed, serving the copy in memory:', err instanceof Error ? err.message : err);
      return asList(snapshot);
    }
    console.error('[projects] live walk failed and there is no copy:', err instanceof Error ? err.message : err);
    throw new ProjectsUnavailableError(err);
  }
}

/**
 * One project, or null when it does not exist. When the copy being served is labelled and the id
 * is not in it, the project may simply be newer than the copy, so this throws
 * `ProjectsUnavailableError` instead of claiming it does not exist.
 */
export async function getProject(submissionId: string): Promise<ListingItem | null> {
  const { items, read_failing } = await getProjects();
  const found = items.find((p) => p.submission_id === submissionId) ?? null;
  if (!found && read_failing) throw new ProjectsUnavailableError();
  return found;
}
