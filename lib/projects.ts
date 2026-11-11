import 'server-only';
import { unstable_cache } from 'next/cache';
import { readProjects, DEFAULT_ACCOUNT } from './kv.mjs';
import { toListing, filterHidden, type ListingItem } from './listing.mjs';
import { readIsFailing } from './freshness.mjs';
import HIDDEN_PROJECTS from '../data/hidden-projects.json';

/** Seconds a cached copy of the project list is served before it is re-read from the KV API. */
export const PROJECTS_REVALIDATE_SECONDS = 60;
/** Per-request timeout for project reads: a hung indexer must not hold the page forever. */
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

// Per server instance. `lastGood` is the newest list this process has served; the two timestamps
// say whether the latest KV read (including a background revalidation) worked.
let lastGood: CachedList | null = null;
let lastReadOkAt = 0;
let lastReadFailedAt = 0;

/**
 * The KV read, cached ~60 s (NH-11). When the copy expires, Next serves it while it re-reads in
 * the background; if that re-read fails the old copy stays and `lastReadFailedAt` moves on, which
 * is what turns the banner on. Errors are never cached.
 */
const readCachedProjects = unstable_cache(
  async (): Promise<CachedList> => {
    try {
      const entries = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet', fetchImpl: timedFetch });
      lastReadOkAt = Date.now();
      // NH-108: the owner's hide list is applied here, the one place every reader passes through.
      const items = filterHidden(toListing(entries), HIDDEN_PROJECTS);
      return { items, fetched_at: new Date().toISOString(), account: DEFAULT_ACCOUNT };
    } catch (err) {
      lastReadFailedAt = Date.now();
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
 * Never fails while any copy exists: if the KV API is unreachable it returns the last list this
 * server read, with `read_failing: true`. With no copy at all it throws
 * `ProjectsUnavailableError`, which the route's error boundary renders as "indexer not responding".
 */
export async function getProjects(): Promise<ProjectList> {
  try {
    const list = await readCachedProjects();
    if (!lastGood || list.fetched_at >= lastGood.fetched_at) lastGood = list;
    return {
      ...list,
      read_failing: readIsFailing({ lastFailedAt: lastReadFailedAt, lastOkAt: lastReadOkAt, fetchedAt: list.fetched_at }),
    };
  } catch (err) {
    console.error('[projects] KV read failed:', err instanceof Error ? err.message : err);
    if (lastGood) return { ...lastGood, read_failing: true };
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
