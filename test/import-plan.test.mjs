import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, newRecord, canonical, toBatches, keyFor } from '../lib/import-plan.mjs';

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

test('canonical sorts nested keys but keeps array order', () => {
  assert.equal(canonical({ b: 1, a: { d: [2, 1], c: 0 } }), '{"a":{"c":0,"d":[2,1]},"b":1}');
});
