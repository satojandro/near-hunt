/**
 * Wording for the "indexer slow or unreachable" banner (NH-82, mockup States.png, third panel).
 *
 * Pure: the caller passes the time the project list was read (`fetchedAt`) and whether the most
 * recent read of the KV API failed. Nothing here touches the network or the clock.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "less than a minute ago", "1 minute ago", "4 minutes ago", "2 hours ago", "3 days ago".
 * Returns null for an unparseable time. A time in the future (clock skew) reads as "just now".
 *
 * @param {string | number | Date} fetchedAt
 * @param {number} now epoch ms
 */
export function ageText(fetchedAt, now) {
  const t = new Date(fetchedAt).getTime();
  if (Number.isNaN(t) || !Number.isFinite(now)) return null;
  const age = now - t;
  if (age < MINUTE) return 'less than a minute ago';
  if (age < HOUR) return plural(Math.floor(age / MINUTE), 'minute');
  if (age < 2 * DAY) return plural(Math.floor(age / HOUR), 'hour');
  return plural(Math.floor(age / DAY), 'day');
}

function plural(n, unit) {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/**
 * The banner to show, or null when the data is current.
 *
 * Two rules, and the second is the one that used to be missing (NH-122):
 *   1. the banner appears only when the caller says the copy is being served late — age alone is
 *      not enough, because after a quiet spell a cache can hand out a copy a few minutes old while
 *      the walker is perfectly healthy;
 *   2. a copy younger than `minAgeMs` is never called stale, whatever the caller believes. The
 *      banner's whole claim is the age it prints, so "Showing data from less than a minute ago.
 *      The indexer is slow to respond" must be impossible to render. It was not: a failed read
 *      plus a copy another instance had stored seconds earlier produced exactly that.
 *
 * @param {object} opts
 * @param {string | number | Date} opts.fetchedAt when the copy being shown was read
 * @param {number} opts.now epoch ms
 * @param {boolean} opts.readFailing the caller considers this copy late
 * @param {number} [opts.minAgeMs] youngest age that may be called stale
 * @returns {{ headline: string, body: string, age: string } | null}
 */
export function staleNotice({ fetchedAt, now, readFailing, minAgeMs = MINUTE }) {
  if (!readFailing) return null;
  const readAt = new Date(fetchedAt).getTime();
  if (Number.isFinite(readAt) && Number.isFinite(now) && now - readAt < minAgeMs) return null;
  const age = ageText(fetchedAt, now);
  return {
    age: age ?? 'earlier',
    headline: age ? `Showing data from ${age}.` : 'Showing an earlier copy of the data.',
    body:
      'The NEAR indexer is slow to respond right now. Votes you cast are safe on chain and will show up once it catches up.',
  };
}

/**
 * Whether the latest read of the KV API is failing, for the copy being served.
 *
 * Not used by the project listing any more: NH-122 replaced "a read on this instance failed" with
 * "the copy is older than three walk intervals" (`PROJECTS_STALE_AFTER_MS`), because the first
 * said nothing about the copy's age and could contradict the banner it produced. Kept for reads
 * that still decide staleness from their own failure clock.
 *
 * @param {object} opts
 * @param {number} opts.lastFailedAt epoch ms of this instance's last failed read (0 = never)
 * @param {number} opts.lastOkAt epoch ms of this instance's last successful read (0 = never)
 * @param {string | number | Date} opts.fetchedAt when the copy being served was read
 */
export function readIsFailing({ lastFailedAt, lastOkAt, fetchedAt }) {
  const fetched = new Date(fetchedAt).getTime();
  const lastGood = Math.max(lastOkAt || 0, Number.isNaN(fetched) ? 0 : fetched);
  return (lastFailedAt || 0) > lastGood;
}

/**
 * Wording for a number or list that is a stored copy rather than a live read (lib/snapshot.mjs).
 *
 * The rule this exists to enforce: a copy is never presented as current. "4 upvotes" from four
 * minutes ago and "4 upvotes" from four seconds ago are different claims, especially to somebody
 * who has just cast a vote and is checking whether it landed.
 *
 * @param {string | number | Date | null | undefined} fetchedAt when the copy was read
 * @param {number} [now] epoch ms
 * @returns {string} e.g. "as of 4 minutes ago"
 */
export function staleCopyText(fetchedAt, now = Date.now()) {
  if (fetchedAt == null) return 'from an earlier read';
  const age = ageText(fetchedAt, now);
  return age ? `as of ${age}` : 'from an earlier read';
}

/** Age past which a cached copy is labelled as a copy even when no read has failed. */
export const STALE_COPY_AFTER_MS = 5 * MINUTE;

/**
 * Whether a copy handed back by the cache must be labelled as a saved copy.
 *
 * The cache (Next `unstable_cache`) answers with an expired entry straight away and re-reads in the
 * background; when that re-read fails the error is swallowed and the old entry keeps being served.
 * So "the cache answered" does not mean "this was just read". A copy is a saved copy when:
 *   - a read on this instance failed after the copy was read (the indexer has not answered since), or
 *   - it is older than `maxAgeMs`, whatever the reason (a quiet spell, or failures on other instances), or
 *   - its time is missing or unparseable, so nothing can be claimed about it.
 *
 * @param {object} opts
 * @param {string | number | Date | null | undefined} opts.fetchedAt when the copy was read
 * @param {number} opts.now epoch ms
 * @param {number} [opts.lastFailedAt] epoch ms of this instance's last failed read (0 = never)
 * @param {number} [opts.maxAgeMs]
 */
export function copyIsStale({ fetchedAt, now, lastFailedAt = 0, maxAgeMs = STALE_COPY_AFTER_MS }) {
  if (fetchedAt == null || fetchedAt === '') return true;
  const t = new Date(fetchedAt).getTime();
  if (Number.isNaN(t)) return true;
  if (now - t > maxAgeMs) return true;
  return (lastFailedAt || 0) > t;
}
