/**
 * Track → tint pair (NH-114, docs/mockups/themes/README.md §3).
 *
 * Six hue pairs are cycled by track, and the same pair colours a project's letter tile and every
 * track chip on its card. The mapping is a design decision from the mockups, not a derived value:
 * it must stay in step with the `--tint-*` tokens in app/globals.css.
 */

export const TRACK_TINT = {
  security: 1,
  agents: 2,
  privacy: 3,
  business: 4,
  realworld: 5,
  open: 6,
  defi: 5,
  thesis: 6,
  swarms: 2,
  nfts: 6,
  games: 1,
  social: 4,
  memecoins: 3,
};

/** Tint number for a track slug; unknown tracks fall back to tint 1. */
export function tintIndex(slug) {
  return TRACK_TINT[slug] ?? 1;
}

/** Class name defined in app/globals.css. */
export function tintClass(slug) {
  return `tint-${tintIndex(slug)}`;
}
