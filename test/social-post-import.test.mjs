import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, newRecord, keyFor, socialPostFragment } from '../lib/import-plan.mjs';

// NH-40: the importer's `--social-posts` overlay. Same helpers as test/import-plan.test.mjs.
const NOW = '2026-11-09T00:00:00.000Z';
const OLD = '2026-11-08T07:15:21.835Z';
const sub = (id) => ({ id, project_name: `Project ${id}`, tracks: ['agents'], demo_url: `https://x.com/p/${id}` });
const row = (s, over = {}) => ({ key: keyFor(s.id), value: { ...newRecord(s, OLD), ...over } });

test('social_post overlay fills an empty social_post and never replaces one', () => {
  const [a, b, c] = [sub('a'), sub('b'), sub('c')];
  const existing = [row(a), row(b, { social_post: 'nearhunt.near/1' }), row(c)];
  const socialPosts = {
    a: 'nearhunt.near/1794200000000',
    b: 'nearhunt.near/2', // conflicts with the value on chain
    c: 'mallory.near/3', // not a nearhunt.near post
    n: 'nearhunt.near/1794200000001', // a project new to the chain
  };
  const plan = planImport({ submissions: [a, b, c, sub('n')], existing, nowIso: NOW, socialPosts });
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].key, 'project/a');
  assert.deepEqual(plan.update[0].changes, ['social_post']);
  assert.equal(plan.update[0].value.social_post, 'nearhunt.near/1794200000000');
  assert.equal(plan.update[0].value.updated_at, NOW);
  assert.equal(plan.create[0].value.social_post, 'nearhunt.near/1794200000001');
  assert.equal(plan.unchanged, 2);
  assert.deepEqual(plan.socialPostConflicts.map((x) => x.key), ['project/b', 'project/c']);
});

test('re-running an applied overlay is a no-op; no overlay means no conflicts', () => {
  const a = sub('a');
  const ref = 'nearhunt.near/1794200000000';
  const after = planImport({ submissions: [a], existing: [row(a, { social_post: ref })], nowIso: NOW, socialPosts: { a: ref } });
  assert.equal(after.unchanged, 1);
  assert.deepEqual(after.socialPostConflicts, []);
  const none = planImport({ submissions: [a], existing: [row(a)], nowIso: NOW });
  assert.equal(none.unchanged, 1);
  assert.deepEqual(none.socialPostConflicts, []);
});

test('socialPostFragment validates the reference against the schema pattern', () => {
  assert.deepEqual(socialPostFragment(null, undefined), { fragment: {}, conflict: null });
  assert.deepEqual(socialPostFragment({}, 'nearhunt.near/5'), { fragment: { social_post: 'nearhunt.near/5' }, conflict: null });
  assert.match(socialPostFragment(null, 'nearhunt.near/0123').conflict, /not a nearhunt.near post reference/);
  assert.match(socialPostFragment(null, 42).conflict, /not a nearhunt.near post reference/);
});
