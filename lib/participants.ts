import 'server-only';
import { unstable_cache } from 'next/cache';
import { readLatest } from './kv.mjs';
import { NETWORK, VOTE_ACCOUNT } from './network.mjs';
import { participantsFrom, PARTICIPANT_WINDOW_MS } from './participants.mjs';
import { loadSnapshotValue, saveSnapshotValue } from './snapshot-store';
import { isFreshnessRecord, snapshotKey } from './snapshot.mjs';
import { copyIsStale } from './freshness.mjs';

/** Seconds a cached participant list is served (NH-112). */
export const PARTICIPANTS_REVALIDATE_SECONDS = 60;
const TIMEOUT_MS = 6000;
/** How long a failed read stops new attempts, per instance (see lib/projects.ts). */
const PARTICIPANTS_RETRY_BACKOFF_MS = 5000;

const PARTICIPANTS_SNAPSHOT_KEY = snapshotKey('participants');

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
  /** True when the strip can be shown at all, whether read now or restored from a stored copy. */
  available: boolean;
  /** True when `items` is a stored copy: the strip keeps its shape but must not claim to be live. */
  stale: boolean;
  /** When the rows behind `items` were read. Null when `available` is false. */
  fetched_at: string | null;
}

/** The stored shape: the participants plus when they were read. */
interface ParticipantsCopy {
  items: Participant[];
  fetched_at: string;
}

const isParticipantsCopy = (value: unknown): boolean =>
  isFreshnessRecord(value, (items) => Array.isArray(items));

interface ParticipantsState {
  inflight: Promise<ParticipantsCopy> | null;
  lastFailedAt: number;
}

/** Shared across bundle copies of this module, like every other per-instance state here. */
const STATE_KEY = Symbol.for('nearhunt.participants.state');
const state: ParticipantsState = ((globalThis as unknown as Record<symbol, ParticipantsState>)[STATE_KEY] ??= {
  inflight: null,
  lastFailedAt: 0,
});

/**
 * Everyone who has signed a vote or a comment, read across all writers of `nearhunt.near`.
 *
 * This is deliberately *not* a login count. Signing in with NEAR Connect happens in the browser and
 * writes nothing to the chain, so "logged in" is not measurable without adding a per-user write.
 * A vote or a comment is a signed row, which is what the strip reports (lib/participants.mjs).
 */
const readParticipants = unstable_cache(
  async (): Promise<ParticipantsCopy> => {
    try {
      const [votes, comments] = await Promise.all([
        readLatest({ account: VOTE_ACCOUNT, keyPrefix: 'vote/', network: NETWORK, fetchImpl: timedFetch }),
        readLatest({ account: VOTE_ACCOUNT, keyPrefix: 'comment/', network: NETWORK, fetchImpl: timedFetch }),
      ]);
      // "Recently" is a real window, not a flourish: only rows signed in the last seven days count.
      const sinceMs = Date.now() - PARTICIPANT_WINDOW_MS;
      const copy: ParticipantsCopy = {
        items: participantsFrom([...votes, ...comments], { sinceMs }),
        fetched_at: new Date().toISOString(),
      };
      await saveSnapshotValue(PARTICIPANTS_SNAPSHOT_KEY, copy, 'participants');
      return copy;
    } catch (err) {
      state.lastFailedAt = Date.now();
      throw err;
    }
  },
  // v2: the cached value became `{items, fetched_at}`; the key changes with the shape.
  ['nearhunt-participants-v2', NETWORK, VOTE_ACCOUNT],
  // Votes and comments both revalidate this, so a fresh vote moves the number immediately.
  { revalidate: PARTICIPANTS_REVALIDATE_SECONDS, tags: ['participants', 'votes', 'comments'] },
);

/**
 * Never throws. A failed read falls back to the last stored list, marked `stale`; only when there is
 * no stored copy either does it hide the strip, rather than show a false zero.
 */
export async function getParticipants(): Promise<ParticipantList> {
  const coolingDown = state.lastFailedAt > 0 && Date.now() - state.lastFailedAt < PARTICIPANTS_RETRY_BACKOFF_MS;
  if (!coolingDown) {
    try {
      if (!state.inflight) {
        state.inflight = readParticipants().finally(() => {
          state.inflight = null;
        });
      }
      const copy = await state.inflight;
      if (!isParticipantsCopy(copy)) throw new Error('cached participants have an unexpected shape');
      // An expired cache entry is served while the re-read runs, and stays when it fails: label it.
      const stale = copyIsStale({ fetchedAt: copy.fetched_at, now: Date.now(), lastFailedAt: state.lastFailedAt });
      return { items: copy.items, available: true, stale, fetched_at: copy.fetched_at };
    } catch (err) {
      console.error('[participants] KV read failed:', err instanceof Error ? err.message : err);
    }
  }
  const stored = await loadSnapshotValue<ParticipantsCopy>(
    PARTICIPANTS_SNAPSHOT_KEY,
    isParticipantsCopy,
    'participants',
  );
  if (stored && stored.items.length > 0) {
    return { items: stored.items, available: true, stale: true, fetched_at: stored.fetched_at };
  }
  return { items: [], available: false, stale: false, fetched_at: null };
}
