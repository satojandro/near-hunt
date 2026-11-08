/**
 * Directory filtering, sorting and URL state (NH-12, NH-13, NH-14). Pure functions, no network,
 * so they can be unit-tested with `node --test`.
 */

import { trackCounts } from './listing.mjs';

export const SORTS = /** @type {const} */ (['upvoted', 'newest']);

/**
 * Default sort is Newest. Votes are tallied since NH-33, but with few or no votes "Most upvoted"
 * is mostly ties broken by newest; defaulting to it would present an ordering that carries
 * little signal as if it were a ranking. Revisit once votes accumulate (docs/PLAN.md decides).
 */
export const DEFAULT_SORT = 'newest';

/** Lower-case, strip diacritics, collapse runs of whitespace. `"  Café   Bar "` -> `"cafe bar"`. */
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Read `?q=&track=&sort=` into directory state. Unknown sorts fall back to the default; a track
 * not in `knownTracks` (when given) is ignored rather than producing an empty list.
 *
 * @param {Record<string, string | string[] | undefined>} params
 * @param {string[]} [knownTracks]
 */
export function parseParams(params = {}, knownTracks) {
  const rawQ = first(params.q);
  const q = typeof rawQ === 'string' ? rawQ.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  const rawTrack = first(params.track);
  let track = typeof rawTrack === 'string' && rawTrack !== '' && rawTrack !== 'all' ? rawTrack : null;
  if (track && knownTracks && !knownTracks.includes(track)) track = null;
  const rawSort = first(params.sort);
  const sort = SORTS.includes(rawSort) ? rawSort : DEFAULT_SORT;
  return { q, track, sort };
}

/** Case-, whitespace- and diacritic-insensitive substring match on the project name only. */
export function searchItems(items, q) {
  const needle = normalizeText(q);
  if (!needle) return items.slice();
  return items.filter((it) => normalizeText(it.name).includes(needle));
}

export function filterByTrack(items, track) {
  if (!track) return items.slice();
  return items.filter((it) => it.tracks.includes(track));
}

function byNewest(a, b) {
  return (b.block_height ?? 0) - (a.block_height ?? 0) || a.name.localeCompare(b.name) || a.submission_id.localeCompare(b.submission_id);
}

/**
 * Sort a copy of `items`.
 * - `newest`: highest block_height first, ties by name.
 * - `upvoted`: most votes first (`votes[submission_id]`, missing = 0), ties broken as `newest`.
 *
 * @param {Array<object>} items
 * @param {'upvoted' | 'newest'} sort
 * @param {Record<string, number>} [votes]
 */
export function sortItems(items, sort, votes = {}) {
  const out = items.slice();
  if (sort === 'upvoted') {
    const n = (it) => votes[it.submission_id] ?? 0;
    out.sort((a, b) => n(b) - n(a) || byNewest(a, b));
  } else {
    out.sort(byNewest);
  }
  return out;
}

/**
 * Track chips for the current search. Order is stable (by count over the whole feed) so chips do
 * not jump around while typing; counts reflect the search. Tracks with no matches are dropped,
 * except the active one, so it can always be seen and cleared.
 */
export function trackChips(allItems, searched, activeTrack) {
  const live = new Map(trackCounts(searched).map(({ track, count }) => [track, count]));
  const chips = [{ track: null, count: searched.length, active: !activeTrack }];
  for (const { track } of trackCounts(allItems)) {
    const count = live.get(track) ?? 0;
    if (count === 0 && track !== activeTrack) continue;
    chips.push({ track, count, active: track === activeTrack });
  }
  return chips;
}

/** `/?q=&track=&sort=` with defaults left out. `overrides` replaces fields of `state`. */
export function buildHref(state, overrides = {}) {
  const s = { ...state, ...overrides };
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.track) p.set('track', s.track);
  if (s.sort && s.sort !== DEFAULT_SORT) p.set('sort', s.sort);
  const qs = p.toString();
  return qs ? `/?${qs}` : '/';
}

/** Host of a URL without a leading `www.`, or null if it does not parse as http(s). */
export function hostOf(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** `"2026-11-08T07:15:21.835Z"` -> `"07:15 UTC"`. */
export function formatFetchedUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

/**
 * Everything the directory page renders, from the full feed and the URL params.
 *
 * @param {Array<object>} items full feed
 * @param {Record<string, string | string[] | undefined>} params URL search params
 * @param {Record<string, number>} [votes] submission_id -> vote count (NH-33; missing = 0)
 */
export function directoryView(items, params, votes = {}) {
  const known = trackCounts(items).map((t) => t.track);
  const state = parseParams(params, known);
  const searched = searchItems(items, state.q);
  const results = sortItems(filterByTrack(searched, state.track), state.sort, votes);
  return {
    state,
    total: items.length,
    results,
    chips: trackChips(items, searched, state.track),
  };
}
