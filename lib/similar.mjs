/**
 * NH-23 "Similar projects": other live projects that share the most tracks with this one. Pure.
 *
 * Ranking: most shared tracks first; ties go to the project with fewer tracks overall (a closer
 * match, not just a broader one), then by name, then by submission id — so the same feed always
 * gives the same list. Projects sharing no track are never shown.
 */

export const SIMILAR_LIMIT = 4;

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @template {{submission_id: string, name?: string, tracks?: string[]}} P
 * @param {P} project
 * @param {Iterable<P>} all   every live project (may include `project` itself)
 * @param {number} [limit]
 * @returns {Array<{project: P, shared: string[]}>}
 */
export function similarProjects(project, all, limit = SIMILAR_LIMIT) {
  const mine = new Set(Array.isArray(project?.tracks) ? project.tracks : []);
  if (mine.size === 0 || limit <= 0) return [];
  const seen = new Set([project.submission_id]);
  const scored = [];
  for (const p of all ?? []) {
    if (!p || typeof p.submission_id !== 'string' || seen.has(p.submission_id)) continue;
    seen.add(p.submission_id);
    const tracks = Array.isArray(p.tracks) ? [...new Set(p.tracks)] : [];
    const shared = tracks.filter((t) => mine.has(t));
    if (shared.length === 0) continue;
    scored.push({ project: p, shared, total: tracks.length });
  }
  scored.sort(
    (a, b) =>
      b.shared.length - a.shared.length ||
      a.total - b.total ||
      cmp(String(a.project.name ?? '').toLowerCase(), String(b.project.name ?? '').toLowerCase()) ||
      cmp(a.project.submission_id, b.project.submission_id),
  );
  return scored.slice(0, limit).map(({ project: p, shared }) => ({ project: p, shared }));
}
