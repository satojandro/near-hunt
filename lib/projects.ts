import 'server-only';
import { unstable_cache } from 'next/cache';
import { readProjects, DEFAULT_ACCOUNT } from './kv.mjs';
import { toListing, type ListingItem } from './listing.mjs';

/** Seconds a cached copy of the project list is served before it is re-read from the KV API. */
export const PROJECTS_REVALIDATE_SECONDS = 60;

export interface ProjectList {
  items: ListingItem[];
  /** ISO time the KV API was read. */
  fetched_at: string;
  account: string;
}

/**
 * Every live project record written by `nearhunt.near` (NH-01 via `readProjects`), with a short
 * server cache (NH-11). Order is the KV API's: by key.
 */
export const getProjects = unstable_cache(
  async (): Promise<ProjectList> => {
    const entries = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
    return { items: toListing(entries), fetched_at: new Date().toISOString(), account: DEFAULT_ACCOUNT };
  },
  ['nearhunt-projects-v1'],
  { revalidate: PROJECTS_REVALIDATE_SECONDS, tags: ['projects'] },
);

export async function getProject(submissionId: string): Promise<ListingItem | null> {
  const { items } = await getProjects();
  return items.find((p) => p.submission_id === submissionId) ?? null;
}
