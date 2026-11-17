/**
 * NH Picks: which reviewed projects NEAR Hunt recommends, like a bookshop's staff picks.
 *
 * Input is the AI reviewer's rows (Supabase `project_evaluations`, written by
 * scripts/judge-ingest.mjs). Output is the public list in data/picks.json. The page shows it as
 * recommendations, not a ranking, so this module is careful about what leaves it:
 *
 *   - no scores, no memos, no peer comparisons: only the name, track, one-line pitch and the NEAR
 *     primitives used. Memos are written to the team and some are harsh; scores invite a ranking;
 *   - picks are sorted by track, then name, never by score, so the order reveals nothing;
 *   - a project picked only because it tops its track is not marked differently in public.
 *
 * Who is picked:
 *   1. it passed the screening gate;
 *   2. its score (the human override when there is one, else the weighted score) is at or above
 *      `cutoff`, or `perTrackTop` is on and it is the highest-scoring project in its track, so no
 *      track goes without a pick;
 *   3. it is not hidden (data/hidden-projects.json) and is not NEAR Hunt itself;
 *   4. of submissions flagged as one project (data/enrichment/duplicates.json clusters), only the
 *      highest-scoring one is kept.
 */

export const DEFAULT_CUTOFF = 4.5;

/** NEAR Hunt is a hackathon entry too; it never recommends itself. */
const SELF_NAME = /^\s*near\s*hunt\b/i;

/** @param {{human_score_override?: unknown, weighted_score?: unknown}} row */
export function effectiveScore(row) {
  for (const v of [row?.human_score_override, row?.weighted_score]) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Stable order that says nothing about score: track, then name, then id. */
function byTrackThenName(a, b) {
  return (
    a.track.localeCompare(b.track) ||
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
    a.submission_id.localeCompare(b.submission_id)
  );
}

/** Higher score first; ties go to the lower id so the choice never depends on input order. */
function better(a, b) {
  const d = (effectiveScore(b) ?? -1) - (effectiveScore(a) ?? -1);
  return d !== 0 ? d : String(a.project_id).localeCompare(String(b.project_id));
}

function idSet(list, key = 'submission_id') {
  const entries = Array.isArray(list) ? list : (list?.projects ?? []);
  return new Set(entries.map((e) => (typeof e === 'string' ? e : e?.[key])).filter((x) => typeof x === 'string'));
}

/**
 * @param {Array<object>} rows  project_evaluations rows
 * @param {{cutoff?: number, perTrackTop?: boolean, hidden?: unknown, duplicates?: {clusters?: Array<{submissions?: Array<{submission_id: string}>}>}}} [opts]
 */
export function selectPicks(rows, opts = {}) {
  const cutoff = Number.isFinite(opts.cutoff) ? opts.cutoff : DEFAULT_CUTOFF;
  const perTrackTop = opts.perTrackTop !== false;
  const hidden = idSet(opts.hidden);

  const eligible = (rows ?? []).filter(
    (r) =>
      r &&
      typeof r.project_id === 'string' &&
      r.gate_pass === true &&
      effectiveScore(r) !== null &&
      !hidden.has(r.project_id) &&
      !SELF_NAME.test(String(r.name ?? '')),
  );

  // One project per duplicate cluster: the best-scoring submission stands for the group.
  const clusterOf = new Map();
  (opts.duplicates?.clusters ?? []).forEach((c, i) => {
    for (const s of c?.submissions ?? []) if (typeof s?.submission_id === 'string') clusterOf.set(s.submission_id, i);
  });
  const bestInCluster = new Map();
  for (const r of eligible) {
    const c = clusterOf.get(r.project_id);
    if (c === undefined) continue;
    const cur = bestInCluster.get(c);
    if (!cur || better(r, cur) < 0) bestInCluster.set(c, r);
  }
  const deduped = eligible.filter((r) => {
    const c = clusterOf.get(r.project_id);
    return c === undefined || bestInCluster.get(c) === r;
  });

  const chosen = new Map();
  for (const r of deduped) if (effectiveScore(r) >= cutoff) chosen.set(r.project_id, r);
  if (perTrackTop) {
    const top = new Map();
    for (const r of deduped) {
      const t = r.best_fit_track || '';
      if (!t) continue;
      const cur = top.get(t);
      if (!cur || better(r, cur) < 0) top.set(t, r);
    }
    for (const r of top.values()) chosen.set(r.project_id, r);
  }

  return [...chosen.values()]
    .map((r) => ({
      submission_id: r.project_id,
      name: String(r.name).trim(),
      track: r.best_fit_track || 'Other',
      pitch: String(r.scorecard?.one_line_thesis ?? '').trim(),
      primitives: Array.isArray(r.near_primitives) ? r.near_primitives.filter((p) => typeof p === 'string') : [],
    }))
    .sort(byTrackThenName);
}

/** Group picks by track, keeping the order selectPicks gave. */
export function groupByTrack(picks) {
  const groups = new Map();
  for (const p of picks ?? []) {
    if (!groups.has(p.track)) groups.set(p.track, []);
    groups.get(p.track).push(p);
  }
  return [...groups].map(([track, items]) => ({ track, items }));
}

/** URL fragment for a track heading, e.g. "AI Security & Defense" → "ai-security-defense". */
export function trackSlug(track) {
  return String(track ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
