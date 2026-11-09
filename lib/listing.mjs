/**
 * Turning raw KV rows into the listing the app shows. Pure functions, no network, so they can
 * be unit-tested with `node --test`.
 */

export const PROJECT_SCHEMA = 'nearhunt/project/1';
const KEY_PREFIX = 'project/';

/**
 * Keep only live, well-formed project records and attach their chain provenance.
 *
 * Drops tombstones (value null), rows whose value is not a `nearhunt/project/1` object, and rows
 * whose key does not match the record's own `source.submission_id`. The caller is expected to
 * pass rows from `readProjects()`, which already keeps only rows written by `nearhunt.near`.
 *
 * @param {Array<{key:string,value:any,block_height:number,block_timestamp?:string,predecessor_id:string,current_account_id:string}>} entries
 * @returns {Array<object>} listing items: the record plus `submission_id`, `key`, `account`,
 *   `block_height` and `block_timestamp`
 */
export function toListing(entries) {
  const out = [];
  for (const e of entries) {
    if (!e || typeof e.key !== 'string' || !e.key.startsWith(KEY_PREFIX)) continue;
    const v = e.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    if (v.schema !== PROJECT_SCHEMA) continue;
    if (typeof v.name !== 'string' || !Array.isArray(v.tracks)) continue;
    const submissionId = e.key.slice(KEY_PREFIX.length);
    if (v.source?.submission_id !== submissionId) continue;
    out.push({
      ...v,
      submission_id: submissionId,
      key: e.key,
      account: e.current_account_id,
      block_height: e.block_height,
      block_timestamp: e.block_timestamp ?? null,
    });
  }
  return out;
}

/**
 * Drop listings the owner has hidden (data/hidden-projects.json, NH-108).
 *
 * Hiding is not a tombstone: the record stays on chain, `readProjects()` still returns it, and the
 * importer/validator never see this filter. Only what the app serves changes, so an entry can be
 * removed and the listing comes back on the next deploy. Entries are matched on the record's own
 * `submission_id`, never on a name, so a rename cannot hide the wrong project.
 *
 * @param {Array<object>} items   listing items from toListing()
 * @param {{projects?: Array<{submission_id?: string}>} | Array<string>} hidden
 */
export function filterHidden(items, hidden) {
  const entries = Array.isArray(hidden) ? hidden : (hidden?.projects ?? []);
  const ids = new Set(
    entries.map((e) => (typeof e === 'string' ? e : e?.submission_id)).filter((id) => typeof id === 'string'),
  );
  if (ids.size === 0) return items;
  return items.filter((it) => !ids.has(it.submission_id));
}

/** Track slug -> count, most common first, ties by slug. */
export function trackCounts(items) {
  const counts = new Map();
  for (const it of items) for (const t of it.tracks) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([track, count]) => ({ track, count }))
    .sort((a, b) => b.count - a.count || a.track.localeCompare(b.track));
}
