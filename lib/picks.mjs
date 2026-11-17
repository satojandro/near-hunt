/**
 * NH Picks: which reviewed projects NEAR Hunt recommends, like a bookshop's staff picks.
 *
 * Input is the AI reviewer's rows (Supabase `project_evaluations`, written by
 * scripts/judge-ingest.mjs). Output is the public list in data/picks.json.
 *
 * What leaves the table (owner decision, 17 Nov: show the AI score and the judge memo as written):
 * name, track, one-line pitch, NEAR primitives, the score shown (human override, else weighted) and
 * the judge memo. Never the peer comparison (it names other entries), the human-spice notes or the
 * rubric. Picks are sorted by track, then name; a project picked only because it tops its track is
 * not marked differently.
 *
 * Who is picked:
 *   1. it passed the screening gate;
 *   2. its score (the human override when there is one, else the weighted score) is at or above
 *      `cutoff`, or `perTrackTop` is on and it is the highest-scoring project in its track, so no
 *      track goes without a pick;
 *   3. it is not hidden (data/hidden-projects.json), is not NEAR Hunt itself and, when `listed` is
 *      given, has a live listing on chain (otherwise its card would link to a 404);
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
 * `names` maps a submission id to its listing's name. Pass it: the reviewer often named a project
 * after its repository ("near", "leash") rather than what the builder called it ("Quiet Treasury",
 * "Bylaw"), and a pick should read the same as the project's own page.
 *
 * @param {{cutoff?: number, perTrackTop?: boolean, hidden?: unknown, listed?: Iterable<string>, names?: Map<string, string>, duplicates?: {clusters?: Array<{submissions?: Array<{submission_id: string}>}>}}} [opts]
 */
export function selectPicks(rows, opts = {}) {
  const cutoff = Number.isFinite(opts.cutoff) ? opts.cutoff : DEFAULT_CUTOFF;
  const perTrackTop = opts.perTrackTop !== false;
  const hidden = idSet(opts.hidden);
  const listed = opts.listed ? new Set(opts.listed) : null;

  const eligible = (rows ?? []).filter(
    (r) =>
      r &&
      typeof r.project_id === 'string' &&
      r.gate_pass === true &&
      effectiveScore(r) !== null &&
      !hidden.has(r.project_id) &&
      (!listed || listed.has(r.project_id)) &&
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
      name: String(opts.names?.get(r.project_id) ?? '').trim() || String(r.name).trim(),
      track: r.best_fit_track || 'Other',
      pitch: String(r.scorecard?.one_line_thesis ?? '').trim(),
      primitives: Array.isArray(r.near_primitives) ? r.near_primitives.filter((p) => typeof p === 'string') : [],
      score: Math.round(effectiveScore(r) * 100) / 100,
      memo: String(r.judge_memo ?? '').trim(),
    }))
    .sort(byTrackThenName);
}

/** The reviewer's track names, mapped to the directory's track slugs (lib/tracks.mjs, lib/tints.mjs). */
export const JUDGE_TRACK_SLUG = {
  'Agent Economy': 'agents',
  'AI Security & Defense': 'security',
  'AI Swarms': 'swarms',
  'Autonomous Business': 'business',
  'Games With Real Economies': 'games',
  'Investment Thesis': 'thesis',
  'Memecoins With Mechanics': 'memecoins',
  'NFTs That Do Something': 'nfts',
  'Open Innovation': 'open',
  'Privacy & Private AI': 'privacy',
  'Real-World Money': 'realworld',
  'Social Money': 'social',
  'Unstoppable DeFi': 'defi',
};

/** Directory slug for a reviewer track; unknown tracks fall back to "open". */
export function judgeTrackSlug(track) {
  return JUDGE_TRACK_SLUG[track] ?? 'open';
}

/** The pick for one submission, or null. */
export function findPick(picks, submissionId) {
  return (picks ?? []).find((p) => p.submission_id === submissionId) ?? null;
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
