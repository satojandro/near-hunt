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
export const ENRICHABLE_FIELDS = ['description', 'repository_url', 'links', 'media'];

export const keyFor = (submissionId) => `project/${submissionId}`;

/** `social_post` must be a post reference by this account (schema: `^[a-z0-9._-]{2,64}/[1-9][0-9]{0,15}$`). */
const SOCIAL_POST_RE = /^[a-z0-9._-]{2,64}\/[1-9][0-9]{0,15}$/;

/**
 * What a `social_post` overlay (submission_id -> `{account}/{post_id}`, NH-40) adds to one record.
 * Only fills a record that has no `social_post` yet, and only with a reference to a post by
 * `poster`; it never replaces an existing reference (that is reported as a conflict instead).
 *
 * @returns {{fragment: object, conflict: string|null}}
 */
export function socialPostFragment(prev, ref, poster = 'nearhunt.near') {
  if (ref === undefined) return { fragment: {}, conflict: null };
  if (typeof ref !== 'string' || !SOCIAL_POST_RE.test(ref) || !ref.startsWith(`${poster}/`)) {
    return { fragment: {}, conflict: `not a ${poster} post reference: ${JSON.stringify(ref)}` };
  }
  if (prev?.social_post == null) return { fragment: { social_post: ref }, conflict: null };
  if (prev.social_post === ref) return { fragment: {}, conflict: null };
  return { fragment: {}, conflict: `already ${prev.social_post}, overlay says ${ref}` };
}

/**
 * What an enrichment proposal adds to one record, given what is already there.
 *
 * Rules: only fill a field that is null/missing (`description`, `repository_url`, `links`, `media`); never overwrite a value a builder supplied;
 * attach provenance (`enrichment`) describing where the values came from. A proposal that adds
 * nothing returns `{}`, so a re-run does not rewrite the record.
 *
 * `refreshEnriched` allows overwriting a field that this same enrichment pipeline set earlier
 * (the record's `enrichment.fields` names it), for corrections such as a link-label cleanup.
 * It never touches a value with no enrichment provenance — that is the builder's or the owner's.
 *
 * @param {object|null} prev existing record value
 * @param {object|undefined} item one entry from `data/enrichment/proposal.json` (`status: 'ok'`)
 * @param {{refreshEnriched?: boolean}} [opts]
 */
export function enrichmentFragment(prev, item, { refreshEnriched = false } = {}) {
  if (!item || item.status !== 'ok') return {};
  const setByEnrichment = (field) =>
    Boolean(prev?.enrichment) && Array.isArray(prev.enrichment.fields) && prev.enrichment.fields.includes(field);
  const canSet = (field, current) => current == null || (refreshEnriched && setByEnrichment(field));

  const fragment = {};
  if (canSet('description', prev?.description) && item.description && item.description !== prev?.description) {
    fragment.description = item.description;
  }
  if (canSet('repository_url', prev?.repository_url) && item.repository_url && item.repository_url !== prev?.repository_url) {
    fragment.repository_url = item.repository_url;
  }
  if (canSet('links', prev?.links) && Array.isArray(item.links) && item.links.length > 0) {
    if (canonical(item.links) !== canonical(prev?.links ?? null)) fragment.links = item.links;
  }
  // NH-96: media (image URLs from the builder's post) fills an empty field only, like links.
  if (canSet('media', prev?.media) && Array.isArray(item.media) && item.media.length > 0) {
    if (canonical(item.media) !== canonical(prev?.media ?? null)) fragment.media = item.media;
  }
  if (Object.keys(fragment).length === 0) return {};
  // Provenance accumulates: a later run that only adds `media` must not drop `description` from
  // `fields`, or a future --refresh-enriched could no longer correct it (and the record would
  // stop saying where its description came from).
  const prevFields = Array.isArray(prev?.enrichment?.fields) ? prev.enrichment.fields : [];
  const prevSources = Array.isArray(prev?.enrichment?.sources) ? prev.enrichment.sources : [];
  const fields = [...new Set([...prevFields, ...Object.keys(fragment)])];
  const sources = [...new Set([...prevSources, ...(item.enrichment?.sources ?? [])])];
  fragment.enrichment = { ...item.enrichment, sources, fields };
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
 * @param {Record<string, string>} [p.socialPosts] submission_id -> `nearhunt.near/{post_id}` (NH-40)
 */
export function planImport({
  submissions, existing, nowIso, enrichment = {}, socialPosts = {}, refreshEnriched = false,
}) {
  const onChain = new Map(existing.map((e) => [e.key, e.value]));
  const inFeed = new Set();

  const create = [];
  const update = [];
  const deletedOnChain = [];
  const socialPostConflicts = [];
  let unchanged = 0;

  const socialFor = (prev, id) => {
    const { fragment, conflict } = socialPostFragment(prev, socialPosts[id]);
    if (conflict) socialPostConflicts.push({ key: keyFor(id), reason: conflict });
    return fragment;
  };

  for (const sub of submissions) {
    const key = keyFor(sub.id);
    inFeed.add(key);

    if (!onChain.has(key)) {
      const record = newRecord(sub, nowIso);
      create.push({
        key,
        value: {
          ...record,
          ...enrichmentFragment(record, enrichment[sub.id], { refreshEnriched }),
          ...socialFor(record, sub.id),
        },
      });
      continue;
    }

    const prev = onChain.get(key);
    if (prev === null) {
      deletedOnChain.push(key);
      continue;
    }

    const merged = {
      ...prev,
      ...ownedFields(sub),
      ...enrichmentFragment(prev, enrichment[sub.id], { refreshEnriched }),
      ...socialFor(prev, sub.id),
    };
    if (canonical(withoutTimestamp(merged)) === canonical(withoutTimestamp(prev))) {
      unchanged += 1;
      continue;
    }

    // Labels for the dry-run printout only; whether to write is decided by the comparison above.
    const changedFields = [...OWNED_FIELDS, ...ENRICHABLE_FIELDS, 'social_post', 'enrichment'];
    const changes = changedFields.filter((f) => canonical(merged[f]) !== canonical(prev[f]));
    update.push({ key, value: { ...merged, updated_at: nowIso }, changes });
  }

  const missingFromFeed = [...onChain.entries()]
    .filter(([key, value]) => value !== null && !inFeed.has(key))
    .map(([key]) => key);

  return { create, update, unchanged, missingFromFeed, deletedOnChain, socialPostConflicts };
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
