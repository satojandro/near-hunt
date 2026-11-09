import 'server-only';
import { unstable_cache } from 'next/cache';
import { readLatest } from './kv.mjs';
import { NETWORK, VOTE_ACCOUNT } from './network.mjs';
import { participantsFrom } from './participants.mjs';

/** Seconds a cached participant list is served (NH-112). */
export const PARTICIPANTS_REVALIDATE_SECONDS = 60;
const TIMEOUT_MS = 6000;

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });

export interface Participant {
  account_id: string;
  votes: number;
  comments: number;
  last_block: number;
}

export interface ParticipantList {
  /** Most recently active first. Empty when `available` is false. */
  items: Participant[];
  /** False when the rows could not be read: the strip is hidden, never shown as "0 people". */
  available: boolean;
}

/**
 * Everyone who has signed a vote or a comment, read across all writers of `nearhunt.near`.
 *
 * This is deliberately *not* a login count. Signing in with NEAR Connect happens in the browser and
 * writes nothing to the chain, so "logged in" is not measurable without adding a per-user write.
 * A vote or a comment is a signed row, which is what the strip reports (lib/participants.mjs).
 */
const readParticipants = unstable_cache(
  async (): Promise<Participant[]> => {
    const [votes, comments] = await Promise.all([
      readLatest({ account: VOTE_ACCOUNT, keyPrefix: 'vote/', network: NETWORK, fetchImpl: timedFetch }),
      readLatest({ account: VOTE_ACCOUNT, keyPrefix: 'comment/', network: NETWORK, fetchImpl: timedFetch }),
    ]);
    return participantsFrom([...votes, ...comments]);
  },
  ['nearhunt-participants-v1', NETWORK, VOTE_ACCOUNT],
  // Votes and comments both revalidate this, so a fresh vote moves the number immediately.
  { revalidate: PARTICIPANTS_REVALIDATE_SECONDS, tags: ['participants', 'votes', 'comments'] },
);

/** Never throws: a failed read hides the strip instead of showing a false zero. */
export async function getParticipants(): Promise<ParticipantList> {
  try {
    return { items: await readParticipants(), available: true };
  } catch (err) {
    console.error('[participants] KV read failed:', err instanceof Error ? err.message : err);
    return { items: [], available: false };
  }
}
