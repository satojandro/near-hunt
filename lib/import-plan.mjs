/**
 * Pure planning logic for the importer: given the source feed and what is already on chain,
 * decide exactly which keys to write. No network, no signing — so it can be unit-tested and
 * so a dry run shows precisely what --execute would send.
 *
 * Rules:
 * - The importer owns only the fields the source supplies (OWNED_FIELDS). Every other field on
 *   an existing record (description, repository_url, social_post, external_campaigns, …) is
 *   preserved, because something other than the importer may have set it.
 * - `updated_at` changes only when the content changes. A re-run on an unchanged feed writes
 *   nothing.
 * - A project missing from the feed is reported, never tombstoned automatically.
 * - A key whose latest value is a tombstone (null) was deleted on purpose; it is reported and
 *   not recreated.
 */

export const EVENT = 'nearhackathon-2026';
export const SCHEMA = 'nearhunt/project/1';
export const SOURCE_LISTING_URL = 'https://nearhackathon.com/#submissions';
export const MAX_KEYS_PER_CALL = 256;

export const OWNED_FIELDS = ['schema', 'id', 'source', 'name', 'tracks', 'demo_url'];

export const keyFor = (submissionId) => `project/${submissionId}`;

/** The fields the hackathon feed supplies, shaped as a record fragment. */
export function ownedFields(sub) {
  return {
    schema: SCHEMA,
    id: `${EVENT}:${sub.id}`,
    source: { event: EVENT, submission_id: sub.id, url: SOURCE_LISTING_URL },
    name: sub.project_name,
    tracks: sub.tracks ?? [],
    demo_url: sub.demo_url ?? null,
  };
}

/** A complete record for a project that is not on chain yet. */
export function newRecord(sub, nowIso) {
  return {
    ...ownedFields(sub),
    description: null,
    repository_url: null,
    external_campaigns: [],
    updated_at: nowIso,
  };
}

/** JSON with object keys sorted at every level, so key order never counts as a change. */
export function canonical(value) {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

const withoutTimestamp = ({ updated_at, ...rest }) => rest;

/**
 * @param {object} p
 * @param {Array<{id:string,project_name:string,tracks?:string[],demo_url?:string|null}>} p.submissions
 * @param {Array<{key:string,value:object|null}>} p.existing  authentic chain rows (see lib/kv.mjs)
 * @param {string} p.nowIso
 */
export function planImport({ submissions, existing, nowIso }) {
  const onChain = new Map(existing.map((e) => [e.key, e.value]));
  const inFeed = new Set();

  const create = [];
  const update = [];
  const deletedOnChain = [];
  let unchanged = 0;

  for (const sub of submissions) {
    const key = keyFor(sub.id);
    inFeed.add(key);

    if (!onChain.has(key)) {
      create.push({ key, value: newRecord(sub, nowIso) });
      continue;
    }

    const prev = onChain.get(key);
    if (prev === null) {
      deletedOnChain.push(key);
      continue;
    }

    const merged = { ...prev, ...ownedFields(sub) };
    if (canonical(withoutTimestamp(merged)) === canonical(withoutTimestamp(prev))) {
      unchanged += 1;
      continue;
    }

    const changes = OWNED_FIELDS.filter((f) => canonical(merged[f]) !== canonical(prev[f]));
    update.push({ key, value: { ...merged, updated_at: nowIso }, changes });
  }

  const missingFromFeed = [...onChain.entries()]
    .filter(([key, value]) => value !== null && !inFeed.has(key))
    .map(([key]) => key);

  return { create, update, unchanged, missingFromFeed, deletedOnChain };
}

/** Split writes into FastData calls of at most MAX_KEYS_PER_CALL keys. */
export function toBatches(writes, size = MAX_KEYS_PER_CALL) {
  const batches = [];
  for (let i = 0; i < writes.length; i += size) {
    batches.push(Object.fromEntries(writes.slice(i, i + size).map((w) => [w.key, w.value])));
  }
  return batches;
}
