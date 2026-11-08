import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rootPostText, rootPostArgs, rootPostTransaction, selectBatch, planSocialPosts, MAX_BATCH } from '../lib/social-post.mjs';

const p = (id, name, block_height, extra = {}) => ({ submission_id: id, name, block_height, tracks: ['ai'], ...extra });

test('rootPostText: name, one-line description, #nearhunt and the project link last', () => {
  assert.equal(
    rootPostText(p('abc', 'Veto', 1, { description: 'On-chain spending\nfirewall   for AI agents.' })),
    'Veto: On-chain spending firewall for AI agents.\n\nDiscuss and upvote it on NEAR Hunt #nearhunt\nhttps://nearhunt.xyz/p/abc',
  );
  assert.equal(rootPostText(p('abc', 'Veto', 1, { description: null })), 'Veto\n\nDiscuss and upvote it on NEAR Hunt #nearhunt\nhttps://nearhunt.xyz/p/abc');
  const long = rootPostText(p('x', 'N', 1, { description: 'word '.repeat(100) }));
  assert.ok(long.split('\n')[0].length <= 210);
  assert.match(long.split('\n')[0], /…$/);
  // No mentions: nobody gets notified by NEAR Hunt's posts.
  assert.ok(!/(^|[^A-Za-z0-9_@.])@[a-z0-9]/.test(rootPostText(p('x', 'Ping @alice.near', 1))));
});

test('rootPostArgs / rootPostTransaction follow skill.md: one post key, receiver social', () => {
  assert.deepEqual(Object.keys(rootPostArgs(p('abc', 'Veto', 1), '1794200000000')), ['post/1794200000000']);
  const tx = rootPostTransaction(p('abc', 'Veto', 1), '1794200000000');
  assert.equal(tx.signerId, 'nearhunt.near');
  assert.equal(tx.receiverId, 'social');
  assert.equal(tx.actions[0].params.methodName, '__fastdata_kv');
  assert.equal(tx.actions[0].params.deposit, '0');
  assert.equal(tx.actions[0].params.gas, '1000000000');
  assert.throws(() => rootPostArgs(p('abc', 'Veto', 1), '012'), TypeError);
});

test('selectBatch: skips projects with social_post, deterministic order, capped at 40', () => {
  const items = [p('c', 'C', 2), p('a', 'A', 2), p('b', 'B', 1, { social_post: 'nearhunt.near/1' }), p('d', 'D', 1)];
  assert.deepEqual(selectBatch(items, 10).map((x) => x.submission_id), ['d', 'a', 'c']);
  assert.deepEqual(selectBatch(items.slice().reverse(), 10).map((x) => x.submission_id), ['d', 'a', 'c']);
  assert.throws(() => selectBatch(items, MAX_BATCH + 1), RangeError);
  assert.throws(() => selectBatch(items, 0), RangeError);
  const many = Array.from({ length: 100 }, (_, i) => p(`id${i}`, `P${i}`, i));
  assert.equal(selectBatch(many).length, 40);
});

test('planSocialPosts: one tx per post, sequential ids, overlay, byte total', () => {
  const items = [p('a', 'A', 1), p('b', 'B', 2), p('c', 'C', 3, { social_post: 'nearhunt.near/5' })];
  const plan = planSocialPosts({ items, limit: 40, startMs: 1794200000000 });
  assert.equal(plan.account, 'nearhunt.near');
  assert.equal(plan.receiver, 'social');
  assert.equal(plan.transactions, 2);
  assert.equal(plan.already_posted, 1);
  assert.deepEqual(plan.overlay, { a: 'nearhunt.near/1794200000000', b: 'nearhunt.near/1794200000001' });
  assert.equal(plan.total_bytes, plan.posts.reduce((n, x) => n + Buffer.byteLength(JSON.stringify(x.tx.actions[0].params.args)), 0));
});
