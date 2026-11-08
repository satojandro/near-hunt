import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLatest } from '../lib/kv.mjs';
import {
  idFromVoteKey, isActiveVote, latestPerWriter, tallyVotes, votersFor, readVoteRows, readProjectVoteRows,
} from '../lib/votes.mjs';

const vote = (voter, id, value = {}, block_height = 100, extra = {}) => ({
  predecessor_id: voter, current_account_id: 'nearhunt.near', block_height, block_timestamp: block_height * 1e9,
  key: `vote/${id}`, value, ...extra,
});

function fakeFetch(pages) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const page = pages[calls.length - 1] ?? { entries: [] };
    return { ok: true, json: async () => page };
  };
  return { impl, calls };
}

test('idFromVoteKey takes the submission id and rejects other shapes', () => {
  assert.equal(idFromVoteKey('vote/abc-1'), 'abc-1');
  assert.equal(idFromVoteKey('vote/'), null);
  assert.equal(idFromVoteKey('vote/a/alice.near'), null);
  assert.equal(idFromVoteKey('project/abc'), null);
  assert.equal(idFromVoteKey(null), null);
});

test('only plain objects are active votes', () => {
  assert.equal(isActiveVote({}), true);
  assert.equal(isActiveVote({ schema: 'x' }), true);
  for (const v of [null, undefined, [], 'yes', 1, true]) assert.equal(isActiveVote(v), false, String(v));
});

test('one account voting twice counts once (latest row per writer wins)', () => {
  const rows = [vote('alice.near', 'a', {}, 100), vote('alice.near', 'a', {}, 200), vote('bob.near', 'a')];
  assert.deepEqual(tallyVotes(rows, ['a']), { a: 2 });
  assert.equal(latestPerWriter(rows).length, 2);
});

test('a later null withdraws an earlier vote from the same account', () => {
  const rows = [vote('alice.near', 'a', {}, 100), vote('alice.near', 'a', null, 200), vote('bob.near', 'a', {}, 150)];
  assert.deepEqual(tallyVotes(rows, ['a']), { a: 1 });
  // ...and a later vote after a withdrawal counts again.
  rows.push(vote('alice.near', 'a', {}, 300));
  assert.deepEqual(tallyVotes(rows, ['a']), { a: 2 });
});

test('null values are ignored', () => {
  assert.deepEqual(tallyVotes([vote('alice.near', 'a', null)], ['a']), { a: 0 });
});

test('votes for ids with no project record are ignored', () => {
  const rows = [vote('alice.near', 'a'), vote('alice.near', 'nh35-probe'), vote('bob.near', 'ghost')];
  assert.deepEqual(tallyVotes(rows, ['a', 'b']), { a: 1, b: 0 });
});

test('foreign value shapes are ignored', () => {
  const rows = [
    vote('a1.near', 'a', 'upvote'), vote('a2.near', 'a', 1), vote('a3.near', 'a', true),
    vote('a4.near', 'a', ['x']), vote('a5.near', 'a', {}), vote('a6.near', 'a', { schema: 'nearhunt/probe/1' }),
  ];
  assert.deepEqual(tallyVotes(rows, ['a']), { a: 2 });
});

test('account ids inside keys or values are never trusted as the voter', () => {
  const rows = [
    vote('mallory.near', 'a', { voter: 'alice.near' }),
    vote('mallory.near', 'a/alice.near', {}), // old `vote/{id}/{voter}` shape: not a vote for `a`
  ];
  assert.deepEqual(tallyVotes(rows, ['a']), { a: 1 });
  assert.deepEqual(votersFor(rows, 'a'), ['mallory.near']);
});

test('rows without a valid writer account are dropped', () => {
  const rows = [vote('', 'a'), vote('Not An Account', 'a'), { key: 'vote/a', value: {} }, null];
  assert.deepEqual(tallyVotes(rows, ['a']), { a: 0 });
});

test('votersFor lists active voters, latest vote first, ties by account', () => {
  const rows = [
    vote('carol.near', 'a', {}, 100), vote('alice.near', 'a', {}, 300), vote('bob.near', 'a', {}, 300),
    vote('dave.near', 'a', null, 400), vote('erin.near', 'b', {}, 500),
  ];
  assert.deepEqual(votersFor(rows, 'a'), ['alice.near', 'bob.near', 'carol.near']);
  assert.deepEqual(votersFor(rows, 'zzz'), []);
});

test('readVoteRows is one unscoped key_prefix read and follows pagination', async () => {
  const { impl, calls } = fakeFetch([
    { entries: [vote('alice.near', 'a')], page_token: 't1' },
    { entries: [vote('bob.near', 'a')], page_token: 't2' },
    { entries: [vote('carol.near', 'b')] },
  ]);
  const rows = await readVoteRows({ account: 'nearhunt.near', network: 'mainnet', fetchImpl: impl });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://kv.main.fastnear.com/v0/latest/nearhunt.near');
  assert.equal(calls[0].body.key_prefix, 'vote/');
  assert.equal(calls[1].body.page_token, 't1');
  assert.equal(calls[2].body.page_token, 't2');
  assert.deepEqual(tallyVotes(rows, ['a', 'b']), { a: 2, b: 1 });
});

test('readVoteRows on testnet uses the testnet host', async () => {
  const { impl, calls } = fakeFetch([{ entries: [] }]);
  await readVoteRows({ account: 'nearhunt.testnet', network: 'testnet', fetchImpl: impl });
  assert.equal(calls[0].url, 'https://kv.test.fastnear.com/v0/latest/nearhunt.testnet');
});

test('readProjectVoteRows sends an exact key, not a prefix, and drops other keys', async () => {
  const { impl, calls } = fakeFetch([{ entries: [vote('alice.near', 'a'), vote('bob.near', 'ab')] }]);
  const rows = await readProjectVoteRows('a', { account: 'nearhunt.near', network: 'mainnet', fetchImpl: impl });
  assert.deepEqual(calls[0].body, { limit: 200, key: 'vote/a' });
  assert.deepEqual(rows.map((r) => r.predecessor_id), ['alice.near']);
  assert.throws(() => readProjectVoteRows('a/b', { fetchImpl: impl }), /invalid submission id/);
});

test('readLatest refuses key and keyPrefix together', async () => {
  await assert.rejects(readLatest({ account: 'x.near', key: 'vote/a', keyPrefix: 'vote/', fetchImpl: async () => {} }), /not both/);
});

test('a failed votes read is an error, not zero votes', async () => {
  const impl = async () => ({ ok: false, status: 502, json: async () => ({}) });
  await assert.rejects(readVoteRows({ account: 'nearhunt.near', network: 'mainnet', fetchImpl: impl }), /502/);
});

test('latestPerWriter breaks a same-block tie on exact nanosecond strings', async () => {
  const { latestPerWriter } = await import('../lib/votes.mjs');
  // These two differ only past 2^53: as numbers they would be equal.
  const a = { predecessor_id: 'a.near', key: 'vote/x', value: null, block_height: 5, block_timestamp: '1794155090502512652' };
  const b = { predecessor_id: 'a.near', key: 'vote/x', value: {}, block_height: 5, block_timestamp: '1794155090502512653' };
  assert.equal(Number(a.block_timestamp), Number(b.block_timestamp));
  assert.deepEqual(latestPerWriter([a, b]), [b]);
  assert.deepEqual(latestPerWriter([b, a]), [b]);
});
