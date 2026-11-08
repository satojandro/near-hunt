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

/** Fields enrichment may fill when they are still unknown. Never overwrites a supplied value. */
export const ENRICHABLE_FIELDS = ['description', 'repository_url', 'links'];

export const keyFor = (submissionId) => `project/${submissionId}`;

/**
 * What an enrichment proposal adds to one record, given what is already there.
 *
 * Rules: only fill a field that is null/missing; never overwrite a value a builder supplied;
 * attach provenance (`enrichment`) describing where the values came from. A proposal that adds
 * nothing returns `{}`, so a re-run does not rewrite the record.
 *
 * @param {object|null} prev existing record value
 * @param {object|undefined} item one entry from `data/enrichment/proposal.json` (`status: 'ok'`)
 */
export function enrichmentFragment(prev, item) {
  if (!item || item.status !== 'ok') return {};
  const fragment = {};
  if (prev?.description == null && item.description) fragment.description = item.description;
  if (prev?.repository_url == null && item.repository_url) fragment.repository_url = item.repository_url;
  if (prev?.links == null && Array.isArray(item.links) && item.links.length > 0) fragment.links = item.links;
  if (Object.keys(fragment).length === 0) return {};
  fragment.enrichment = { ...item.enrichment, fields: Object.keys(fragment) };
  return fragment;
}

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
 * @param {Record<string, object>} [p.enrichment] submission_id -> proposal entry (see scripts/enrich.mjs)
 */
export function planImport({ submissions, existing, nowIso, enrichment = {} }) {
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
      const record = newRecord(sub, nowIso);
      create.push({ key, value: { ...record, ...enrichmentFragment(record, enrichment[sub.id]) } });
      continue;
    }

    const prev = onChain.get(key);
    if (prev === null) {
      deletedOnChain.push(key);
      continue;
    }

    const merged = { ...prev, ...ownedFields(sub), ...enrichmentFragment(prev, enrichment[sub.id]) };
    if (canonical(withoutTimestamp(merged)) === canonical(withoutTimestamp(prev))) {
      unchanged += 1;
      continue;
    }

    const changedFields = [...OWNED_FIELDS, ...ENRICHABLE_FIELDS];
    const changes = changedFields.filter((f) => canonical(merged[f]) !== canonical(prev[f]));
    update.push({ key, value: { ...merged, updated_at: nowIso }, changes });
  }

  const missingFromFeed = [...onChain.entries()]
    .filter(([key, value]) => value !== null && !inFeed.has(key))
    .map(([key]) => key);

  return { create, update, unchanged, missingFromFeed, deletedOnChain };
}

/**
 * Split writes into FastData calls of at most `size` keys and roughly `maxBytes` of JSON.
 * The key cap is FastData's; the byte cap keeps one function call inside a gas envelope that
 * has actually been proven (a 256-key batch of enriched records is ~260 KB).
 */
export function toBatches(writes, size = MAX_KEYS_PER_CALL, maxBytes = 64_000) {
  const batches = [];
  let current = {};
  let bytes = 2; // "{}"
  for (const w of writes) {
    const piece = Buffer.byteLength(JSON.stringify({ [w.key]: w.value }));
    const wouldBe = bytes + piece + (Object.keys(current).length ? 1 : 0);
    if (Object.keys(current).length >= size || (Object.keys(current).length > 0 && wouldBe > maxBytes)) {
      batches.push(current);
      current = {};
      bytes = 2;
    }
    current[w.key] = w.value;
    bytes += piece + (Object.keys(current).length > 1 ? 1 : 0);
  }
  if (Object.keys(current).length) batches.push(current);
  return batches;
}
