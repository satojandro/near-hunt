import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLatest, readProjects, readForeignProjectRows } from '../lib/kv.mjs';

/** A fake fetch that records calls and serves pages in order. */
function fakeFetch(pages) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const page = pages[calls.length - 1] ?? { entries: [] };
    return { ok: true, json: async () => page };
  };
  return { impl, calls };
}

const rowBy = (writer, key, value = {}) => ({
  predecessor_id: writer, current_account_id: 'nearhunt.near', block_height: 1, key, value,
});

test('project reads are scoped to the namespace account as writer', async () => {
  const { impl, calls } = fakeFetch([{ entries: [rowBy('nearhunt.near', 'project/a')] }]);
  await readProjects({ fetchImpl: impl });
  assert.equal(calls[0].url, 'https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near');
  assert.equal(calls[0].body.key_prefix, 'project/');
});

test('rows from other writers are dropped even if the API returns them', async () => {
  const { impl } = fakeFetch([{ entries: [rowBy('nearhunt.near', 'project/a'), rowBy('mallory.near', 'project/fake')] }]);
  const rows = await readProjects({ fetchImpl: impl });
  assert.deepEqual(rows.map((r) => r.key), ['project/a']);
});

test('page tokens are followed until exhausted', async () => {
  const { impl, calls } = fakeFetch([
    { entries: [rowBy('nearhunt.near', 'project/a')], page_token: 't1' },
    { entries: [rowBy('nearhunt.near', 'project/b')] },
  ]);
  const rows = await readLatest({ account: 'nearhunt.near', writer: 'nearhunt.near', fetchImpl: impl });
  assert.equal(rows.length, 2);
  assert.equal(calls[1].body.page_token, 't1');
});

test('foreign rows are those written by anyone but the account', async () => {
  const { impl, calls } = fakeFetch([{ entries: [rowBy('nearhunt.near', 'project/a'), rowBy('mallory.near', 'project/fake')] }]);
  const foreign = await readForeignProjectRows({ fetchImpl: impl });
  assert.equal(calls[0].url, 'https://kv.main.fastnear.com/v0/latest/nearhunt.near');
  assert.deepEqual(foreign.map((r) => r.predecessor_id), ['mallory.near']);
});

test('a non-OK response is an error, not an empty result', async () => {
  const impl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(readProjects({ fetchImpl: impl }), /503/);
});
