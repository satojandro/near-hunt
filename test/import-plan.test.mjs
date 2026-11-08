import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, newRecord, canonical, toBatches, keyFor, enrichmentFragment } from '../lib/import-plan.mjs';

const NOW = '2026-11-09T00:00:00.000Z';
const OLD = '2026-11-08T07:15:21.835Z';

const sub = (id, over = {}) => ({
  id,
  project_name: `Project ${id}`,
  tracks: ['agents'],
  demo_url: `https://x.com/p/${id}`,
  ...over,
});

const row = (s, over = {}) => ({ key: keyFor(s.id), value: { ...newRecord(s, OLD), ...over } });

test('an unchanged feed writes nothing and keeps updated_at', () => {
  const s = sub('a');
  const plan = planImport({ submissions: [s], existing: [row(s)], nowIso: NOW });
  assert.equal(plan.create.length, 0);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.unchanged, 1);
});

test('key order on chain does not count as a change', () => {
  const s = sub('a');
  const shuffled = Object.fromEntries(Object.entries(newRecord(s, OLD)).reverse());
  const plan = planImport({ submissions: [s], existing: [{ key: keyFor('a'), value: shuffled }], nowIso: NOW });
  assert.equal(plan.unchanged, 1);
});

test('a new submission is created with null unknowns and the current timestamp', () => {
  const plan = planImport({ submissions: [sub('b')], existing: [], nowIso: NOW });
  assert.equal(plan.create.length, 1);
  const v = plan.create[0].value;
  assert.equal(plan.create[0].key, 'project/b');
  assert.equal(v.description, null);
  assert.equal(v.repository_url, null);
  assert.deepEqual(v.external_campaigns, []);
  assert.equal(v.updated_at, NOW);
});

test('a changed source field is updated, and only that field is reported', () => {
  const s = sub('a');
  const plan = planImport({
    submissions: [{ ...s, tracks: ['agents', 'security'] }],
    existing: [row(s)],
    nowIso: NOW,
  });
  assert.equal(plan.update.length, 1);
  assert.deepEqual(plan.update[0].changes, ['tracks']);
  assert.deepEqual(plan.update[0].value.tracks, ['agents', 'security']);
  assert.equal(plan.update[0].value.updated_at, NOW);
});

test('fields the importer does not own are preserved on update', () => {
  const s = sub('a');
  const existing = [row(s, {
    description: 'Written by the builder',
    repository_url: 'https://github.com/x/y',
    social_post: 'nearhunt.near/1794122153750',
    external_campaigns: [{ provider: 'babyshark', url: 'https://example.org/c/1' }],
  })];
  const plan = planImport({ submissions: [{ ...s, project_name: 'Renamed' }], existing, nowIso: NOW });
  const v = plan.update[0].value;
  assert.equal(v.name, 'Renamed');
  assert.equal(v.description, 'Written by the builder');
  assert.equal(v.repository_url, 'https://github.com/x/y');
  assert.equal(v.social_post, 'nearhunt.near/1794122153750');
  assert.equal(v.external_campaigns.length, 1);
});

test('extra fields on chain alone do not trigger a rewrite', () => {
  const s = sub('a');
  const plan = planImport({ submissions: [s], existing: [row(s, { social_post: 'nearhunt.near/1' })], nowIso: NOW });
  assert.equal(plan.unchanged, 1);
});

test('projects that left the feed are reported, never written', () => {
  const plan = planImport({ submissions: [], existing: [row(sub('gone'))], nowIso: NOW });
  assert.deepEqual(plan.missingFromFeed, ['project/gone']);
  assert.equal(plan.create.length + plan.update.length, 0);
});

test('a tombstoned project is not recreated', () => {
  const plan = planImport({ submissions: [sub('a')], existing: [{ key: 'project/a', value: null }], nowIso: NOW });
  assert.deepEqual(plan.deletedOnChain, ['project/a']);
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.missingFromFeed, []);
});

test('batches respect the 256-key FastData limit', () => {
  const writes = Array.from({ length: 300 }, (_, i) => ({ key: `project/${i}`, value: {} }));
  const batches = toBatches(writes);
  assert.deepEqual(batches.map((b) => Object.keys(b).length), [256, 44]);
});

test('batches also respect a byte cap, so one call stays within proven gas', () => {
  const big = (i) => ({ key: `project/${i}`, value: { description: 'x'.repeat(40_000) } });
  const batches = toBatches([big(1), big(2), big(3)], 256, 64_000);
  assert.equal(batches.length, 3);
  for (const b of batches) assert.ok(Buffer.byteLength(JSON.stringify(b)) <= 64_500);
});

test('canonical sorts nested keys but keeps array order', () => {
  assert.equal(canonical({ b: 1, a: { d: [2, 1], c: 0 } }), '{"a":{"c":0,"d":[2,1]},"b":1}');
});

const proposal = (over = {}) => ({
  submission_id: 'a',
  status: 'ok',
  description: 'The builder pitch.',
  repository_url: 'https://github.com/o/r',
  links: [{ url: 'https://demo.example', source_post_id: '1' }],
  enrichment: { method: 'x-thread', sources: ['https://x.com/a/status/1'], retrieved_at: NOW },
  ...over,
});

test('enrichment fills description and repository on an existing record', () => {
  const s = sub('a');
  const plan = planImport({
    submissions: [s],
    existing: [row(s)],
    nowIso: NOW,
    enrichment: { a: proposal() },
  });
  assert.equal(plan.update.length, 1);
  const v = plan.update[0].value;
  assert.equal(v.description, 'The builder pitch.');
  assert.equal(v.repository_url, 'https://github.com/o/r');
  assert.deepEqual(plan.update[0].changes, ['description', 'repository_url', 'links']);
  assert.equal(v.enrichment.method, 'x-thread');
  assert.deepEqual(v.enrichment.fields, ['description', 'repository_url', 'links']);
});

test('enrichment never overwrites a value already on chain', () => {
  const s = sub('a');
  const existing = [row(s, { description: 'Builder wrote this', repository_url: 'https://github.com/real/repo' })];
  const plan = planImport({ submissions: [s], existing, nowIso: NOW, enrichment: { a: proposal() } });
  // description and repository already exist; only the missing `links` field is added
  assert.equal(plan.update.length, 1);
  assert.deepEqual(plan.update[0].changes, ['links']);
  assert.equal(plan.update[0].value.description, 'Builder wrote this');
  assert.equal(plan.update[0].value.repository_url, 'https://github.com/real/repo');
});

test('enrichment is a no-op on the second run', () => {
  const s = sub('a');
  const first = planImport({ submissions: [s], existing: [row(s)], nowIso: NOW, enrichment: { a: proposal() } });
  const after = [{ key: keyFor('a'), value: first.update[0].value }];
  const second = planImport({ submissions: [s], existing: after, nowIso: NOW, enrichment: { a: proposal() } });
  assert.equal(second.update.length, 0);
  assert.equal(second.unchanged, 1);
});

test('non-ok proposals and missing fields add nothing', () => {
  assert.deepEqual(enrichmentFragment({ description: null }, { status: 'ambiguous-repository' }), {});
  assert.deepEqual(enrichmentFragment({ description: null }, undefined), {});
  assert.deepEqual(
    enrichmentFragment({ description: null }, { status: 'ok', description: null, repository_url: null, links: [] }),
    {},
  );
});

test('a new submission gets enrichment in the same create', () => {
  const plan = planImport({ submissions: [sub('b')], existing: [], nowIso: NOW, enrichment: { b: { ...proposal(), submission_id: 'b' } } });
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].value.description, 'The builder pitch.');
  assert.equal(plan.create[0].value.updated_at, NOW);
});

test('object key order inside links is not a change', () => {
  const prev = { links: [{ source_post_id: '1', url: 'https://demo.example' }], enrichment: { fields: ['links'] } };
  const item = { status: 'ok', links: [{ url: 'https://demo.example', source_post_id: '1' }] };
  assert.deepEqual(enrichmentFragment(prev, item, { refreshEnriched: true }), {});
});

test('refresh only corrects fields an earlier enrichment run set', () => {
  const s = sub('a');
  const enriched = row(s, {
    description: 'Old generated text. Repo:',
    repository_url: 'https://github.com/o/old',
    enrichment: { method: 'x-thread', retrieved_at: OLD, fields: ['description', 'repository_url'] },
  });
  const plan = planImport({
    submissions: [s],
    existing: [enriched],
    nowIso: NOW,
    enrichment: { a: proposal() },
    refreshEnriched: true,
  });
  assert.equal(plan.update.length, 1);
  assert.deepEqual(plan.update[0].changes, ['description', 'repository_url', 'links']);
  assert.equal(plan.update[0].value.description, 'The builder pitch.');

  // a description with no enrichment provenance is never rewritten, even with refresh
  const builder = row(s, { description: 'The builder wrote this', repository_url: 'https://github.com/real/repo' });
  const plan2 = planImport({
    submissions: [s],
    existing: [builder],
    nowIso: NOW,
    enrichment: { a: proposal() },
    refreshEnriched: true,
  });
  assert.deepEqual(plan2.update[0].changes, ['links']);
  assert.equal(plan2.update[0].value.description, 'The builder wrote this');
  assert.equal(plan2.update[0].value.repository_url, 'https://github.com/real/repo');
});
