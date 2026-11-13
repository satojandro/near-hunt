/**
 * The guard in front of an unattended mainnet import (AGENTS.md §1, owner decision 14 Nov 2026).
 *
 * The owner's rule used to be "no mainnet write without a human reading the diff". It is now:
 * a scheduled cycle may sign **creates and null-fills** by itself; anything that would replace a
 * value somebody else put on chain still waits for a human. This module is that boundary, in one
 * place, as a pure function over `planImport`'s output — so the guard can be unit-tested and the
 * thing it approves is the same object the importer writes, not a second opinion about it.
 *
 * Every check returns a blocker with a code, a sentence a human can act on, and the detail. One
 * blocker means nothing is signed: the batch stays ready and the report names what tripped.
 */
import { OWNED_FIELDS } from './import-plan.mjs';

/** Fields the feed itself supplies. The importer is entitled to change these on an existing row. */
export const FEED_OWNED = new Set(OWNED_FIELDS);

/** Provenance and metadata: additive, never a builder's content value. */
export const METADATA_FIELDS = new Set(['enrichment', 'updated_at']);

/**
 * How large one unattended write may get. A cap is not a quality gate; it is a blast-radius gate:
 * if the pipeline produces thousands of keys, a human should see why before it is signed.
 *
 * Owner, 14 Nov 2026: raised from 200/4 to 400/8 ahead of judging, because a burst above ~240
 * submissions in one 3-hour window would otherwise refuse the whole batch (the cap is checked
 * before anything is signed) — the worst possible moment for the pipeline to stop. The importer's
 * own per-transaction limit (64 KB of args, 256 keys) still governs how the batch is packed.
 */
export const AUTO_SIGN_CAPS = { keys: 400, transactions: 8 };

export const LINK_VERDICTS = ['live', 'gone', 'unverified'];

const isMissing = (value) => value === null || value === undefined;
const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\/\S+$/i.test(value);

/** "a, b and c" — for the one-line report. */
const list = (items) => {
  const shown = items.slice(0, 4);
  return items.length > 4 ? `${shown.join(', ')} and ${items.length - shown.length} more` : shown.join(', ');
};

/**
 * Decide whether the plan may be signed without a human.
 *
 * @param {ReturnType<import('./import-plan.mjs').planImport>} plan
 * @param {object} opts
 * @param {Map<string, object>} opts.prevByKey  chain key -> stored value (null for a tombstone)
 * @param {{keys?: number, transactions?: number}} [opts.caps]
 * @param {number} [opts.transactions]          transactions the importer will send
 * @param {boolean} [opts.refreshEnriched]      must stay false: that flag is what overwrites values
 * @returns {{ok: boolean, blockers: Array<{code: string, message: string, detail?: object}>, stats: object}}
 */
export function signoff(plan, { prevByKey = new Map(), caps = AUTO_SIGN_CAPS, transactions = 0, refreshEnriched = false } = {}) {
  const blockers = [];
  const add = (code, message, detail) => blockers.push({ code, message, detail });

  const writes = [...(plan.create ?? []), ...(plan.update ?? [])];
  const stats = {
    create: plan.create?.length ?? 0,
    update: plan.update?.length ?? 0,
    unchanged: plan.unchanged ?? 0,
    keys: writes.length,
    transactions,
    nullFills: 0,
    feedOwnedChanges: 0,
    metadataChanges: 0,
    enrichmentRecords: 0,
    linkChecks: 0,
  };

  // A refresh run is the one path that replaces values the enrichment pipeline set earlier. It is
  // never part of an unattended write: that is a human decision about specific records.
  if (refreshEnriched) {
    add('refresh-enriched', 'the plan was built with --refresh-enriched, which may overwrite values an earlier run set');
  }

  // Nothing is ever deleted by a machine: a tombstone hides a value but the history stays public.
  if (plan.deletedOnChain?.length) {
    add('tombstoned', `${plan.deletedOnChain.length} record(s) are in the feed but tombstoned on chain; recreating a deleted project is an owner decision`, {
      keys: plan.deletedOnChain.slice(0, 10),
    });
  }

  const badValues = writes.filter((w) => w.value === null || typeof w.value !== 'object');
  if (badValues.length) {
    add('not-a-record', `${badValues.length} write(s) are null or not an object, which is a delete, not an import`, {
      keys: badValues.slice(0, 10).map((w) => w.key),
    });
  }

  // The boundary that matters: an existing value may only be *filled*, never replaced.
  for (const w of plan.update ?? []) {
    const prev = prevByKey.get(w.key) ?? {};
    for (const field of w.changes ?? []) {
      if (METADATA_FIELDS.has(field)) {
        stats.metadataChanges += 1;
        continue;
      }
      if (FEED_OWNED.has(field)) {
        stats.feedOwnedChanges += 1;
        continue;
      }
      if (isMissing(prev[field])) {
        stats.nullFills += 1;
        continue;
      }
      add('overwrite', `${w.key} would replace ${field} with a different value`, {
        key: w.key,
        field,
        from: prev[field],
        to: w.value[field],
      });
    }
  }

  // `social_post` is NH-40 promotion, written only after an approved batch. Never as a side effect.
  for (const w of writes) {
    const prev = prevByKey.get(w.key) ?? {};
    if (!isMissing(w.value?.social_post) && isMissing(prev.social_post)) {
      add('social-post', `${w.key} would gain a social_post reference, which only the NH-40 drip may set`, {
        key: w.key,
        value: w.value.social_post,
      });
    }
  }

  // A record that claims enrichment must say where the values came from, or it cannot be checked.
  for (const w of writes) {
    const enrichment = w.value?.enrichment;
    if (isMissing(enrichment)) continue;
    stats.enrichmentRecords += 1;
    const sources = enrichment?.sources;
    if (!Array.isArray(sources) || sources.length === 0 || !sources.every(isHttpUrl)) {
      add('provenance', `${w.key} carries enrichment without usable sources (a non-empty list of http(s) URLs)`, {
        key: w.key,
        sources,
      });
    }
  }

  // A link is published with the verdict that was measured when it was probed. No verdict, no claim.
  for (const w of writes) {
    for (const link of w.value?.links ?? []) {
      if (!LINK_VERDICTS.includes(link?.check?.verdict)) {
        add('link-verdict', `${w.key} carries a link with no measured verdict, so its status would be a guess`, {
          key: w.key,
          url: link?.url,
          check: link?.check,
        });
        continue;
      }
      stats.linkChecks += 1;
    }
  }

  if (stats.keys > (caps.keys ?? AUTO_SIGN_CAPS.keys)) {
    add('too-many-keys', `${stats.keys} keys is above the unattended cap of ${caps.keys ?? AUTO_SIGN_CAPS.keys}`);
  }
  if (transactions > (caps.transactions ?? AUTO_SIGN_CAPS.transactions)) {
    add('too-many-transactions', `${transactions} transactions is above the unattended cap of ${caps.transactions ?? AUTO_SIGN_CAPS.transactions}`);
  }

  return { ok: blockers.length === 0, blockers, stats };
}

/** One paragraph a human can read in a chat message, from the guard's own numbers. */
export function describeSignoff({ ok, blockers, stats }) {
  const head = `${stats.create} create(s) + ${stats.update} update(s) = ${stats.keys} key(s), ${stats.transactions} transaction(s)`;
  if (ok) return `auto-sign allowed: ${head} (${stats.nullFills} null-fill(s), ${stats.feedOwnedChanges} feed-owned change(s))`;
  return `auto-sign refused: ${blockers.length} blocker(s) — ${list(blockers.map((b) => b.code))} (${head})`;
}

/**
 * The `docs/PLAN.md` entry an unattended batch appends, in the same numbered shape as the batches a
 * human approved. Kept as a pure function so the wording is reviewed once and does not drift.
 *
 * @param {object} p
 * @param {number} p.number        the entry number to use
 * @param {string} p.date          ISO date, `2026-11-14`
 * @param {object} p.stats         guard stats
 * @param {string[]} p.txs         transaction hashes the importer sent
 * @param {string} p.verified      the importer's own `N/N` line
 * @param {object} p.readback      counts read back from the indexer
 * @param {string} p.feed          feed/chain numbers at signing time
 */
export function planEntry({ number, date, stats, txs, verified, readback, feed }) {
  const lines = [
    `${number}. **Unattended batch, ${date} — ${stats.create} new submission(s) and ${stats.update} null-fill(s), ${stats.keys} key(s).** ` +
      `Signed by the scheduled cycle under the owner's standing authorization (14 Nov 2026): creates and null-fills only, ` +
      `${feed}. The guard in \`lib/auto-sign.mjs\` passed with ${stats.nullFills} null-fill(s), ${stats.feedOwnedChanges} feed-owned change(s) ` +
      `and ${stats.metadataChanges} metadata change(s), and **no value another writer set was replaced**.`,
    '',
    `   ${txs.length} transaction(s): ${txs.map((t) => `\`${t}\``).join(', ')}. \`verified: ${verified}\`.`,
    '',
    `   **Read back:** ${readback.rows} project rows; the ${stats.create} new records carry description ${readback.description}, ` +
      `media ${readback.media}, links ${readback.links}, repository ${readback.repository}. The importer's re-run prints ` +
      `\`new: 0, changed: 0\`; \`npm run validate:schema\` ${readback.valid}; \`npm test\` ${readback.tests}.`,
  ];
  return lines.join('\n');
}

/**
 * Insert an entry at the end of the numbered "where things stand" list, before the next `## ` heading.
 * Pure text in, text out.
 */
export function insertPlanEntry(markdown, entry) {
  const marker = '\n## Decisions taken';
  const at = markdown.indexOf(marker);
  if (at === -1) throw new Error('docs/PLAN.md: no "## Decisions taken" heading to anchor the batch list');
  const head = markdown.slice(0, at).replace(/\s+$/, '');
  const tail = markdown.slice(at + 1); // starts at the heading itself
  return `${head}\n\n${entry}\n\n${tail}`;
}

/** The highest numbered entry already in the batch list, so a new one continues the series. */
export function lastPlanNumber(markdown) {
  const at = markdown.indexOf('\n## Decisions taken');
  const list_ = at === -1 ? markdown : markdown.slice(0, at);
  const numbers = [...list_.matchAll(/^(\d+)\.\s/gm)].map((m) => Number(m[1]));
  return numbers.length ? Math.max(...numbers) : 0;
}
