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
 * The banner appears only when the last read of the KV API failed and an older copy is being
 * served. Age alone is not enough: after a quiet spell the cache can hand out a copy that is a
 * few minutes old while the indexer is perfectly healthy, and the banner would then blame it
 * for nothing.
 *
 * @param {object} opts
 * @param {string | number | Date} opts.fetchedAt when the copy being shown was read
 * @param {number} opts.now epoch ms
 * @param {boolean} opts.readFailing the most recent KV read failed
 * @returns {{ headline: string, body: string, age: string } | null}
 */
export function staleNotice({ fetchedAt, now, readFailing }) {
  if (!readFailing) return null;
  const age = ageText(fetchedAt, now);
  return {
    age: age ?? 'earlier',
    headline: age ? `Showing data from ${age}.` : 'Showing an earlier copy of the data.',
    body:
      'The NEAR indexer is slow to respond right now. Votes you cast are safe on chain and will show up once it catches up.',
  };
}
