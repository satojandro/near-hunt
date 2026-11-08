import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOTE_GAS,
  voteKey,
  voteArgs,
  voteAction,
  isActiveVote,
  votedIdsFromRows,
  accountVotesUrl,
  readAccountVotes,
  readAccountVote,
  confirmVote,
  classifySendResult,
  sendVote,
  castVote,
  shareText,
  projectUrl,
} from '../lib/vote-client.mjs';

const row = (writer, key, value = {}, block_height = 1) => ({
  predecessor_id: writer, current_account_id: 'nearhunt.testnet', block_height, key, value,
});

/** A fake fetch that records calls and answers each with the next response (or the last one). */
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    if (r && r.status) return { ok: false, status: r.status, json: async () => ({}) };
    return { ok: true, json: async () => r };
  };
  return { impl, calls };
}

/** A clock that only moves when sleep is called. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

// --- the write --------------------------------------------------------------

test('upvote args are {"vote/{id}": {}} and withdraw args are {"vote/{id}": null}', () => {
  assert.deepEqual(voteArgs('abc', true), { 'vote/abc': {} });
  assert.deepEqual(voteArgs('abc', false), { 'vote/abc': null });
  assert.equal(JSON.stringify(voteArgs('abc', false)), '{"vote/abc":null}');
});

test('the action is a 1 Ggas, zero-deposit FunctionCall to __fastdata_kv', () => {
  const a = voteAction('abc', true);
  assert.equal(a.type, 'FunctionCall');
  assert.equal(a.params.methodName, '__fastdata_kv');
  assert.equal(a.params.gas, '1000000000');
  assert.equal(VOTE_GAS, '1000000000');
  assert.equal(a.params.deposit, '0');
  assert.deepEqual(a.params.args, { 'vote/abc': {} });
});

test('voteKey refuses an empty project id', () => {
  assert.throws(() => voteKey(''), /projectId/);
  assert.throws(() => voteArgs(undefined, true), /projectId/);
});

// --- reading votes ----------------------------------------------------------

test('only a plain object counts as a vote; null, arrays and scalars do not', () => {
  assert.equal(isActiveVote({}), true);
  assert.equal(isActiveVote({ note: 1 }), true);
  assert.equal(isActiveVote(null), false);
  assert.equal(isActiveVote(undefined), false);
  assert.equal(isActiveVote('yes'), false);
  // `typeof [] === 'object'`, but a schema/README.md vote value is `{}` or `null`, never an array.
  assert.equal(isActiveVote([]), false);
  assert.equal(isActiveVote([{}]), false);
  assert.equal(isActiveVote(1), false);
  assert.equal(isActiveVote(true), false);
});

// The browser read and the server tally each own a copy of this predicate (the client must not
// import the server modules). They have to answer identically, or a card reads "voted" while the
// tally counts 0. This test fails if either copy drifts.
test('the client and tally predicates agree on every value shape', async () => {
  const { isActiveVote: tallyIsActiveVote } = await import('../lib/votes.mjs');
  const shapes = [{}, { note: 1 }, null, undefined, [], [{}], [1], 'yes', '', 0, 1, true, false];
  for (const v of shapes) {
    assert.equal(
      isActiveVote(v), tallyIsActiveVote(v),
      `client and tally disagree on ${JSON.stringify(v)}: client=${isActiveVote(v)} tally=${tallyIsActiveVote(v)}`,
    );
  }
});

test('voted ids come only from the account’s own non-null vote rows', () => {
  const ids = votedIdsFromRows(
    [
      row('alice.testnet', 'vote/a'),
      row('alice.testnet', 'vote/b', null),
      row('mallory.testnet', 'vote/c'),
      row('alice.testnet', 'project/d'),
      // Off-schema value: the tally ignores it, so the browser must ignore it too.
      row('alice.testnet', 'vote/e', [{}]),
    ],
    'alice.testnet',
  );
  assert.deepEqual([...ids], ['a']);
});

test('account votes are one writer-scoped prefix read, following pages', async () => {
  const { impl, calls } = fakeFetch([
    { entries: [row('alice.testnet', 'vote/a')], page_token: 'p2' },
    { entries: [row('alice.testnet', 'vote/b')] },
  ]);
  const ids = await readAccountVotes({ network: 'testnet', voteAccount: 'nearhunt.testnet', accountId: 'alice.testnet', fetchImpl: impl });
  assert.deepEqual([...ids].sort(), ['a', 'b']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://kv.test.fastnear.com/v0/latest/nearhunt.testnet/alice.testnet');
  assert.deepEqual(calls[0].body, { key_prefix: 'vote/', limit: 200 });
  assert.equal(calls[1].body.page_token, 'p2');
});

test('mainnet votes are read from kv.main', () => {
  assert.equal(
    accountVotesUrl({ network: 'mainnet', voteAccount: 'nearhunt.near', accountId: 'bob.near' }),
    'https://kv.main.fastnear.com/v0/latest/nearhunt.near/bob.near',
  );
  assert.throws(() => accountVotesUrl({ network: 'devnet', voteAccount: 'x', accountId: 'y' }), /unknown network/);
});

test('one vote is an exact-key read', async () => {
  const { impl, calls } = fakeFetch([{ entries: [row('alice.testnet', 'vote/a', {}, 42)] }]);
  const r = await readAccountVote({ network: 'testnet', voteAccount: 'nearhunt.testnet', accountId: 'alice.testnet', projectId: 'a', fetchImpl: impl });
  assert.deepEqual(r, { voted: true, blockHeight: 42 });
  assert.deepEqual(calls[0].body, { key: 'vote/a' });
});

test('an off-schema row value reads as not voted, matching the tally', async () => {
  const { impl } = fakeFetch([{ entries: [row('alice.testnet', 'vote/a', [{}], 42)] }]);
  const r = await readAccountVote({ network: 'testnet', voteAccount: 'nearhunt.testnet', accountId: 'alice.testnet', projectId: 'a', fetchImpl: impl });
  assert.deepEqual(r, { voted: false, blockHeight: 42 });
});

test('a KV error status is an error, not "not voted"', async () => {
  const { impl } = fakeFetch([{ status: 503 }]);
  await assert.rejects(
    readAccountVotes({ network: 'testnet', voteAccount: 'nearhunt.testnet', accountId: 'a.testnet', fetchImpl: impl }),
    /503/,
  );
});

// --- confirmation -----------------------------------------------------------

const base = { network: 'testnet', voteAccount: 'nearhunt.testnet', accountId: 'alice.testnet', projectId: 'a' };

test('confirmation polls until the row shows the upvote', async () => {
  const clock = fakeClock();
  const { impl, calls } = fakeFetch([
    { entries: [] },
    { entries: [] },
    { entries: [row('alice.testnet', 'vote/a', {}, 7)] },
  ]);
  const r = await confirmVote({ ...base, upvote: true, fetchImpl: impl, ...clock, intervalMs: 1000 });
  assert.deepEqual(r, { confirmed: true, blockHeight: 7, attempts: 3, lastError: null });
  assert.equal(calls.length, 3);
});

test('a withdrawn vote is confirmed by a null row', async () => {
  const clock = fakeClock();
  const { impl } = fakeFetch([
    { entries: [row('alice.testnet', 'vote/a', {}, 7)] },
    { entries: [row('alice.testnet', 'vote/a', null, 9)] },
  ]);
  const r = await confirmVote({ ...base, upvote: false, fetchImpl: impl, ...clock });
  assert.equal(r.confirmed, true);
  assert.equal(r.blockHeight, 9);
});

test('a row written by someone else never confirms my vote', async () => {
  const clock = fakeClock();
  const { impl } = fakeFetch([{ entries: [row('mallory.testnet', 'vote/a', {})] }]);
  const r = await confirmVote({ ...base, upvote: true, fetchImpl: impl, ...clock, timeoutMs: 5000, intervalMs: 1000 });
  assert.equal(r.confirmed, false);
});

test('confirmation gives up at the timeout and reports the last read error', async () => {
  const clock = fakeClock();
  const { impl, calls } = fakeFetch([new Error('network down')]);
  const r = await confirmVote({ ...base, upvote: true, fetchImpl: impl, ...clock, timeoutMs: 30_000, intervalMs: 1500 });
  assert.equal(r.confirmed, false);
  assert.equal(r.lastError, 'network down');
  assert.equal(calls.length, 21); // t = 0, 1.5 s, … 30 s
  assert.ok(clock.now() <= 30_000);
});

test('read errors are retried, and a later good read confirms', async () => {
  const clock = fakeClock();
  const { impl } = fakeFetch([new Error('flaky'), { entries: [row('alice.testnet', 'vote/a')] }]);
  const r = await confirmVote({ ...base, upvote: true, fetchImpl: impl, ...clock });
  assert.equal(r.confirmed, true);
  assert.equal(r.attempts, 2);
});

// --- classifying what signing returned ---------------------------------------

// The outcome shape recorded in the NH-35 spike, §3d.
const codeDoesNotExistOutcome = {
  status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { CompilationError: { CodeDoesNotExist: { account_id: 'nearhunt.testnet' } } } } } } },
  transaction: { hash: '7gDSszcZtKcvieVz8h353GBHnbqQUUeQuf2DnvJG56DR' },
  transaction_outcome: { id: '7gDSszcZtKcvieVz8h353GBHnbqQUUeQuf2DnvJG56DR' },
};

test('CodeDoesNotExist in a returned outcome means written', () => {
  const c = classifySendResult({ ok: codeDoesNotExistOutcome });
  assert.equal(c.kind, 'written');
  assert.equal(c.txHash, '7gDSszcZtKcvieVz8h353GBHnbqQUUeQuf2DnvJG56DR');
});

test('near-api-js v7 ContractCodeDoesNotExistError (local signing) means written', () => {
  // As thrown on testnet by Account.signAndSendTransaction (see the report for the run).
  class ContractCodeDoesNotExistError extends Error {}
  const err = new ContractCodeDoesNotExistError('Contract code for contract ID nearhunt.testnet does not exist at block height -1');
  err.contractId = 'nearhunt.testnet';
  err.transactionResult = codeDoesNotExistOutcome;
  const c = classifySendResult({ error: err });
  assert.equal(c.kind, 'written');
  assert.equal(c.txHash, '7gDSszcZtKcvieVz8h353GBHnbqQUUeQuf2DnvJG56DR');
});

test('a wallet’s "failed" message for the same receipt means written', () => {
  // Meteor's wording, from the NH-35 spike §3.
  const err = new Error('Transaction 7gDS… failed. Cannot find contract code for account nearhunt.near');
  assert.equal(classifySendResult({ error: err }).kind, 'written');
});

test('a successful outcome means written', () => {
  assert.equal(classifySendResult({ ok: { status: { SuccessValue: '' }, transaction: { hash: 'h' } } }).kind, 'written');
});

test('the user declining in the wallet is rejected', () => {
  for (const msg of ['User rejected', 'User cancelled the request', 'Rejected by user', 'User closed the window']) {
    assert.equal(classifySendResult({ error: new Error(msg) }).kind, 'rejected', msg);
  }
});

test('a login key that is not on chain is key-missing, also inside a FailoverRpcError', () => {
  const inner = new Error('Access key ed25519:5W64… does not exist at block height 276758381');
  const outer = new Error('Exceeded 1 providers to execute request');
  outer.errors = [inner];
  assert.equal(classifySendResult({ error: inner }).kind, 'key-missing');
  assert.equal(classifySendResult({ error: outer }).kind, 'key-missing');
});

test('a spent allowance is no-allowance', () => {
  assert.equal(classifySendResult({ error: new Error('Access Key {…} does not have enough allowance: NotEnoughAllowance') }).kind, 'no-allowance');
});

test('anything else is unknown, including other receipt failures', () => {
  assert.equal(classifySendResult({ error: new Error('fetch failed') }).kind, 'unknown');
  assert.equal(classifySendResult({ error: 'something odd' }).kind, 'unknown');
  const other = { status: { Failure: { ActionError: { kind: { AccountDoesNotExist: { account_id: 'x' } } } } } };
  assert.equal(classifySendResult({ ok: other }).kind, 'unknown');
});

// --- casting a vote through any signer ---------------------------------------

const voteOpts = { network: 'testnet', voteAccount: 'nearhunt.testnet', accountId: 'alice.testnet', projectId: 'a' };
const codeDoesNotExistError = () => Object.assign(new Error('Contract code for contract ID nearhunt.testnet does not exist at block height -1'), { transactionResult: codeDoesNotExistOutcome });

test('sendVote hands any signAndSendTransaction-shaped function the vote write', async () => {
  const seen = [];
  const r = await sendVote({ signAndSendTransaction: async (p) => { seen.push(p); throw codeDoesNotExistError(); }, voteAccount: 'nearhunt.testnet', projectId: 'a', upvote: false });
  assert.equal(r.kind, 'written');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].receiverId, 'nearhunt.testnet');
  assert.deepEqual(seen[0].actions[0].params.args, { 'vote/a': null });
});

test('castVote: the expected receipt failure is sent once, then confirmed by the index', async () => {
  let sends = 0;
  const { impl } = fakeFetch([{ entries: [] }, { entries: [row('alice.testnet', 'vote/a', {}, 5)] }]);
  const r = await castVote({ ...voteOpts, upvote: true, signAndSendTransaction: async () => { sends += 1; throw codeDoesNotExistError(); }, fetchImpl: impl, ...fakeClock() });
  assert.equal(sends, 1);
  assert.equal(r.outcome, 'confirmed');
  assert.equal(r.blockHeight, 5);
});

test('castVote: never resends when the index does not catch up; it times out', async () => {
  let sends = 0;
  const { impl } = fakeFetch([{ entries: [] }]);
  const r = await castVote({ ...voteOpts, upvote: true, signAndSendTransaction: async () => { sends += 1; return codeDoesNotExistOutcome; }, fetchImpl: impl, ...fakeClock(), timeoutMs: 30_000 });
  assert.equal(sends, 1);
  assert.equal(r.outcome, 'timeout');
});

test('castVote: a declined wallet request returns at once without polling', async () => {
  const { impl, calls } = fakeFetch([{ entries: [] }]);
  const r = await castVote({ ...voteOpts, upvote: true, signAndSendTransaction: async () => { throw new Error('User rejected'); }, fetchImpl: impl, ...fakeClock() });
  assert.equal(r.outcome, 'rejected');
  assert.equal(calls.length, 0);
});

test('castVote: a missing login key falls back to the wallet once', async () => {
  let walletSends = 0;
  const { impl } = fakeFetch([{ entries: [row('alice.testnet', 'vote/a')] }]);
  const r = await castVote({
    ...voteOpts, upvote: true, fetchImpl: impl, ...fakeClock(),
    signAndSendTransaction: async () => { throw new Error('Access key ed25519:x does not exist at block height 1'); },
    fallbackSend: () => async () => { walletSends += 1; return codeDoesNotExistOutcome; },
  });
  assert.equal(walletSends, 1);
  assert.equal(r.usedFallback, true);
  assert.equal(r.outcome, 'confirmed');
});

test('castVote: a missing login key without a fallback fails without polling', async () => {
  const { impl, calls } = fakeFetch([{ entries: [] }]);
  const r = await castVote({ ...voteOpts, upvote: true, fetchImpl: impl, ...fakeClock(), signAndSendTransaction: async () => { throw new Error('Access key ed25519:x does not exist'); } });
  assert.equal(r.outcome, 'failed');
  assert.equal(calls.length, 0);
});

// --- sharing ----------------------------------------------------------------

test('share text carries #nearhunt and the project link', () => {
  const t = shareText({ projectId: '21996773-48fa', projectName: 'Veto' });
  assert.match(t, /#nearhunt/);
  assert.match(t, /https:\/\/nearhunt\.xyz\/p\/21996773-48fa/);
  assert.match(t, /Veto/);
  assert.equal(projectUrl('a b'), 'https://nearhunt.xyz/p/a%20b');
  assert.match(shareText({ projectId: 'x' }), /a project/);
});
