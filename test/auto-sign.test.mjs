import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, newRecord, keyFor } from '../lib/import-plan.mjs';
import { signoff, describeSignoff, planEntry, insertPlanEntry, lastPlanNumber, AUTO_SIGN_CAPS } from '../lib/auto-sign.mjs';

const NOW = '2026-11-14T00:00:00.000Z';
const OLD = '2026-11-13T20:00:00.000Z';

const sub = (id, over = {}) => ({
  id,
  project_name: `Project ${id}`,
  tracks: ['agents'],
  demo_url: `https://x.com/p/${id}`,
  ...over,
});

const row = (s, over = {}) => ({ key: keyFor(s.id), value: { ...newRecord(s, OLD), ...over } });

const enrichment = (id, over = {}) => ({
  submission_id: id,
  status: 'ok',
  description: `What ${id} does, in the builder's words.`,
  repository_url: `https://github.com/builder/${id}`,
  media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/x.jpg', width: 1200, height: 675, post_url: `https://x.com/p/${id}` }],
  links: [{ url: `https://${id}.vercel.app`, kind: 'website', check: { verdict: 'live', http_status: 200, checked_at: NOW } }],
  enrichment: { method: 'x-thread', sources: [`https://x.com/p/${id}`], retrieved_at: NOW, fields: ['description', 'repository_url', 'media', 'links'] },
  ...over,
});

/** A plan from real inputs: creates from the feed + one enrichment fill on an existing record. */
const planOf = (subs, existing, enrichmentMap = {}) => {
  const plan = planImport({ submissions: subs, existing, nowIso: NOW, enrichment: enrichmentMap });
  return { plan, prevByKey: new Map(existing.map((r) => [r.key, r.value])) };
};

test('creates alone are allowed, and so are null-fills', () => {
  const a = sub('a');
  const b = sub('b');
  const { plan, prevByKey } = planOf([a, b], [row(b)], { a: enrichment('a'), b: enrichment('b') });
  assert.equal(plan.create.length, 1);
  assert.equal(plan.update.length, 1);

  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.blockers));
  assert.equal(verdict.stats.create, 1);
  assert.equal(verdict.stats.update, 1);
  assert.ok(verdict.stats.nullFills >= 4, 'description, repository_url, links and media are all fills');
});

test('replacing a builder-written value is refused, and says which field', () => {
  const a = sub('a');
  const existing = [row(a, { description: 'The builder wrote this.' })];
  const { plan, prevByKey } = planOf([a], existing, { a: enrichment('a', { description: 'The crawler wrote this.' }) });
  // enrich.mjs never overwrites a non-null description, so force the case the guard exists for.
  plan.update.push({ key: keyFor('a'), value: { ...plan.update[0].value, description: 'The crawler wrote this.' }, changes: ['description'] });

  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, false);
  const blocker = verdict.blockers.find((b) => b.code === 'overwrite');
  assert.ok(blocker, 'an overwrite blocker');
  assert.equal(blocker.detail.field, 'description');
  assert.equal(blocker.detail.from, 'The builder wrote this.');
});

test('a feed-owned field may change on an existing record (the feed is the source)', () => {
  const a = sub('a', { tracks: ['agents', 'defi'] });
  const existing = [row(a, { description: 'Builder text', tracks: ['agents'] })];
  const { plan, prevByKey } = planOf([a], existing);
  assert.deepEqual(plan.update[0].changes, ['tracks']);

  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.blockers));
  assert.equal(verdict.stats.feedOwnedChanges, 1);
});

test('a refresh run is never unattended', () => {
  const a = sub('a');
  const existing = [row(a, { description: 'set by an earlier enrichment', enrichment: { method: 'x-thread', sources: ['https://x.com/p/a'], fields: ['description'] } })];
  const { plan, prevByKey } = planOf([a], existing, { a: enrichment('a', { description: 'corrected' }) });
  const verdict = signoff(plan, { prevByKey, transactions: 1, refreshEnriched: true });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.some((b) => b.code === 'refresh-enriched'));
});

test('a tombstoned record in the feed is refused, not recreated', () => {
  const a = sub('a');
  const { plan, prevByKey } = planOf([a], [{ key: keyFor('a'), value: null }]);
  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.some((b) => b.code === 'tombstoned'));
});

test('a social_post reference may not appear as a side effect', () => {
  const a = sub('a');
  const { plan, prevByKey } = planOf([a], []);
  plan.create[0].value.social_post = 'nearhunt.near/123';
  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.some((b) => b.code === 'social-post'));
});

test('enrichment without sources is refused: a value nobody can check', () => {
  const a = sub('a');
  const { plan, prevByKey } = planOf([a], [], { a: enrichment('a', { enrichment: { method: 'x-thread', sources: [], fields: ['description'] } }) });
  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.some((b) => b.code === 'provenance'));
});

test('a link with no measured verdict is refused', () => {
  const a = sub('a');
  const { plan, prevByKey } = planOf([a], [], { a: enrichment('a', { links: [{ url: 'https://a.vercel.app', kind: 'website' }] }) });
  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.some((b) => b.code === 'link-verdict'));
});

test('a gone link is published with its verdict — honest data is not a blocker', () => {
  const a = sub('a');
  const { plan, prevByKey } = planOf([a], [], {
    a: enrichment('a', { links: [{ url: 'https://dead.example', kind: 'website', check: { verdict: 'gone', http_status: 404, checked_at: NOW } }] }),
  });
  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.blockers));
  assert.equal(verdict.stats.linkChecks, 1);
});

test('the caps are blast-radius gates, checked before anything is signed', () => {
  const subs = Array.from({ length: AUTO_SIGN_CAPS.keys + 1 }, (_, i) => sub(`s${i}`));
  const { plan, prevByKey } = planOf(subs, []);
  const verdict = signoff(plan, { prevByKey, transactions: 1 });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.some((b) => b.code === 'too-many-keys'));

  const txVerdict = signoff(planOf([sub('a')], []).plan, { prevByKey: new Map(), transactions: AUTO_SIGN_CAPS.transactions + 1 });
  assert.ok(txVerdict.blockers.some((b) => b.code === 'too-many-transactions'));
});

test('the report line names the blockers it refused on', () => {
  const a = sub('a');
  const prev = { ...newRecord(a, OLD), description: 'Builder text' };
  const plan = {
    create: [],
    update: [{ key: keyFor('a'), value: { ...prev, description: 'crawler' }, changes: ['description'] }],
    unchanged: 0,
    missingFromFeed: [],
    deletedOnChain: [],
  };
  const prevByKey = new Map([[keyFor('a'), prev]]);
  const line = describeSignoff(signoff(plan, { prevByKey, transactions: 1 }));
  assert.match(line, /^auto-sign refused: 1 blocker\(s\) — overwrite/);
  assert.match(describeSignoff(signoff(planOf([sub('b')], []).plan, { transactions: 1 })), /^auto-sign allowed: 1 create/);
});

test('the PLAN.md entry continues the numbering and lands before the next heading', () => {
  const markdown = '# Plan\n\n1. **one**\n\n2. **two**\n\n## Decisions taken\n\n| a | b |\n';
  assert.equal(lastPlanNumber(markdown), 2);
  const entry = planEntry({
    number: 3,
    date: '2026-11-14',
    stats: { create: 4, update: 2, keys: 6, nullFills: 3, feedOwnedChanges: 1, metadataChanges: 1 },
    txs: ['TX1', 'TX2'],
    verified: '6/6',
    feed: 'chain 100 → 106',
    readback: { rows: 106, description: '4/4', media: '4/4', links: '2/4', repository: '2/4', valid: '106/106', tests: '400/400' },
  });
  const out = insertPlanEntry(markdown, entry);
  assert.match(out, /^3\. \*\*Unattended batch, 2026-11-14/m);
  assert.ok(out.indexOf('3. **Unattended') < out.indexOf('## Decisions taken'));
  assert.match(out, /`TX1`, `TX2`/);
  assert.equal(lastPlanNumber(out), 3);
});
