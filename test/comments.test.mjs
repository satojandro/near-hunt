import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMENT_DEPOSIT,
  COMMENT_GAS,
  COMMENT_METHOD,
  COMMENT_PREFIX,
  MAX_COMMENT_CHARS,
  POLICY_PATH,
  blockTimeMs,
  cleanCommentText,
  commentArgs,
  commentFromRow,
  commentKey,
  commentRef,
  commentThread,
  commentTime,
  commentUrl,
  commentTransaction,
  countComments,
  deleteCommentArgs,
  isCommentId,
  latestRows,
  newCommentId,
  parseCommentKey,
  parseCommentRef,
  parseHideList,
  readAccountComment,
  readAllCommentRows,
  readProjectCommentRows,
  confirmComment,
  submitComment,
  threadView,
  validateCommentText,
} from '../lib/comments.mjs';

const NS = 'nearhunt.near';
const PID = 'p1';

/** Block time of every test row unless given: 2027-01-15, later than every id the tests use. */
const BLOCK_NS = '1800000000000000000';

const row = (writer, id, value, block_height = 10, project = PID, block_timestamp = BLOCK_NS) => ({
  predecessor_id: writer,
  current_account_id: NS,
  block_height,
  block_timestamp,
  key: `comment/${project}/${id}`,
  value,
});

const kvResponse = (entries, pageToken = null) => ({
  ok: true,
  text: async () => JSON.stringify({ entries, page_token: pageToken }),
});

/** A KV fake: records each request body and answers from a list of responses (last one repeats). */
function fakeKv(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { impl, calls };
}

/** A clock that only moves when sleep is called. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

// --- keys ---------------------------------------------------------------------

test('comment keys round-trip, and refuse ids a reader could not parse', () => {
  assert.equal(commentKey(PID, '1794122153750'), 'comment/p1/1794122153750');
  assert.deepEqual(parseCommentKey('comment/p1/1794122153750'), {
    project_id: 'p1',
    id: '1794122153750',
    key: 'comment/p1/1794122153750',
  });
  assert.equal(parseCommentKey('comment/p1/0'), null);
  assert.equal(parseCommentKey('comment/p1/0179'), null);
  assert.equal(parseCommentKey('comment/p1'), null);
  assert.equal(parseCommentKey('comment/p1/a'), null);
  assert.equal(parseCommentKey('vote/p1/123'), null);
  assert.equal(parseCommentKey(`comment/p1/${'9'.repeat(17)}`), null); // over 2^53 − 1
  assert.throws(() => commentKey('a/b', '123'), /submission id/);
  assert.throws(() => commentKey(PID, '0'), /comment id/);
  assert.equal(isCommentId('9007199254740991'), true);
  assert.equal(isCommentId('9007199254740992'), false);
});

test('a comment reference is {account}/{id}', () => {
  assert.equal(commentRef('bob.near', '123'), 'bob.near/123');
  assert.deepEqual(parseCommentRef('bob.near/123'), { account_id: 'bob.near', id: '123', key: 'bob.near/123' });
  assert.equal(parseCommentRef('bob.near/0'), null);
  assert.equal(parseCommentRef('Not An Account/123'), null);
  assert.throws(() => commentRef('bob.near', 'abc'), /comment id/);
});

test('a new comment id is ms-based and never repeats, even in the same millisecond', () => {
  assert.equal(newCommentId(5000, 0), '5000');
  assert.equal(newCommentId(5000, 0), '5000'); // a fresh "last" means a fresh client
  const a = newCommentId(5000);
  const b = newCommentId(5000);
  assert.equal(Number(b), Number(a) + 1);
  assert.equal(newCommentId(4000, 9000), '9001'); // clock skew cannot reuse an id
});

// --- text ---------------------------------------------------------------------

test('comment text is cleaned: CRLF, controls and bidi out, blank lines collapsed', () => {
  assert.equal(cleanCommentText('  hello  '), 'hello');
  assert.equal(cleanCommentText('a\r\nb'), 'a\nb');
  assert.equal(cleanCommentText('a\n\n\n\nb'), 'a\n\nb');
  assert.equal(cleanCommentText('a\u0000b\u202Ec'), 'abc');
  assert.equal(cleanCommentText('  \n\t '), '');
  assert.equal(cleanCommentText(null), '');
});

test('the 2,000 character limit counts characters, not UTF-16 units', () => {
  const ok = validateCommentText('x'.repeat(MAX_COMMENT_CHARS));
  assert.equal(ok.ok, true);
  const over = validateCommentText('x'.repeat(MAX_COMMENT_CHARS + 1));
  assert.equal(over.ok, false);
  assert.equal(over.error, 'too_long');
  // 2,000 emoji are 2,000 characters and 4,000 UTF-16 units: allowed.
  assert.equal(validateCommentText('😀'.repeat(MAX_COMMENT_CHARS)).ok, true);
  assert.equal(validateCommentText('   ').error, 'empty');
});

// --- the write ----------------------------------------------------------------

test('the write is a 1 Ggas, zero-deposit FunctionCall to __fastdata_kv on nearhunt.near', () => {
  const args = commentArgs({ projectId: PID, id: '123', text: 'Hi there' });
  assert.deepEqual(args, { 'comment/p1/123': { text: 'Hi there' } });
  const tx = commentTransaction({ account: NS, args });
  assert.deepEqual(tx, {
    receiverId: 'nearhunt.near',
    actions: [{
      type: 'FunctionCall',
      params: { methodName: COMMENT_METHOD, args: { 'comment/p1/123': { text: 'Hi there' } }, gas: COMMENT_GAS, deposit: COMMENT_DEPOSIT },
    }],
  });
  assert.equal(COMMENT_METHOD, '__fastdata_kv');
  assert.equal(COMMENT_GAS, '1000000000');
  assert.equal(COMMENT_DEPOSIT, '0');
});

test('reply_to is {account}/{ms}, and deleting writes null', () => {
  assert.deepEqual(
    commentArgs({ projectId: PID, id: '2', text: 'Yes', replyTo: 'bob.near/1' }),
    { 'comment/p1/2': { text: 'Yes', reply_to: 'bob.near/1' } },
  );
  assert.throws(() => commentArgs({ projectId: PID, id: '2', text: 'x', replyTo: 'nope' }), /comment reference/);
  assert.throws(() => commentArgs({ projectId: PID, id: '2', text: '   ' }), /empty/);
  assert.throws(() => commentArgs({ projectId: PID, id: '2', text: 'x'.repeat(MAX_COMMENT_CHARS + 1) }), /too_long/);
  assert.deepEqual(deleteCommentArgs({ projectId: PID, id: '2' }), { 'comment/p1/2': null });
});

// --- rows -> comments ---------------------------------------------------------

test('a row becomes a comment; the author is predecessor_id, never the value', () => {
  const c = commentFromRow(row('alice.near', '1794122153750', { text: 'Looks good', author: 'mallory.near' }));
  assert.equal(c.author, 'alice.near');
  assert.equal(c.ref, 'alice.near/1794122153750');
  assert.equal(c.key, 'comment/p1/1794122153750');
  assert.equal(c.text, 'Looks good');
  assert.equal(c.created_at, 1794122153750);
  assert.equal(c.reply_to, null);
  assert.equal(c.url, commentUrl(PID, 'alice.near', '1794122153750'));
  assert.match(c.url, /^https:\/\/nearhunt\.xyz\/p\/p1#c-alice\.near-1794122153750$/);
});

test('a comment time is min(id, block time): a future id cannot outrank real comments', () => {
  assert.equal(blockTimeMs('1800000000000000000'), 1800000000000);
  assert.equal(blockTimeMs(1.8e18), 1800000000000);
  assert.equal(blockTimeMs(undefined), null);
  assert.equal(blockTimeMs('not a number'), null);

  // A slow client clock keeps its own earlier time; a forged future one gets the block's.
  assert.equal(commentTime('1794122153750', '1794122160000000000'), 1794122153750);
  assert.equal(commentTime('9007199254740900', '1794122160000000000'), 1794122160000);
  assert.equal(commentTime('1794122153750', undefined), null);

  const future = commentFromRow(row('spam.near', '9007199254740900', { text: 'x' }, 10, PID, '1794122160000000000'));
  assert.equal(future.created_at, 1794122160000);
  assert.equal(future.id, '9007199254740900'); // identity is still the key
  // Renders: a forged id used to make toISOString() throw and take the page down.
  assert.doesNotThrow(() => new Date(future.created_at).toISOString());
  assert.equal(commentFromRow(row('alice.near', '1', { text: 'x' }, 10, PID, null)).created_at, null);
});

test('50 comments with forged future ids do not push a later real comment out of the newest 50', () => {
  const rows = [];
  for (let i = 0; i < 50; i++) {
    rows.push(row('spam.near', String(9007199254740900 + i), { text: 'spam' }, 10, PID, '1794122000000000000'));
  }
  rows.push(row('alice.near', '1794122153750', { text: 'real' }, 11, PID, '1794122154000000000'));
  const { items } = commentThread(rows, PID);
  assert.equal(items.at(-1).text, 'real');
  assert.ok(items.slice(-50).some((c) => c.author === 'alice.near'));
});

test('deletions, empty text, arrays, foreign projects and invalid writers are not comments', () => {
  assert.equal(commentFromRow(row('alice.near', '1', null)), null);
  assert.equal(commentFromRow(row('alice.near', '1', { text: '   ' })), null);
  assert.equal(commentFromRow(row('alice.near', '1', {})), null);
  assert.equal(commentFromRow(row('alice.near', '1', [])), null);
  assert.equal(commentFromRow(row('alice.near', '1', 'text')), null);
  assert.equal(commentFromRow(row('alice.near', '1', { text: 'x' }, 10, 'other'), { projectId: PID }), null);
  assert.equal(commentFromRow(row('alice.near', '1', { text: 'x' }), { projectId: 'other' }), null);
  assert.equal(commentFromRow({ ...row('alice.near', '1', { text: 'x' }), predecessor_id: 'Not An Account' }), null);
  assert.equal(commentFromRow({ ...row('alice.near', '1', { text: 'x' }), key: 'vote/p1/1' }), null);
});

test('reply_to survives only when it names a real account and id', () => {
  assert.equal(commentFromRow(row('bob.near', '2', { text: 'x', reply_to: 'alice.near/1' })).reply_to, 'alice.near/1');
  assert.equal(commentFromRow(row('bob.near', '2', { text: 'x', reply_to: 'alice.near/0' })).reply_to, null);
  assert.equal(commentFromRow(row('bob.near', '2', { text: 'x', reply_to: './1' })).reply_to, null);
});

test('a comment longer than the limit is cut for display and marked truncated', () => {
  const c = commentFromRow(row('alice.near', '1', { text: 'x'.repeat(MAX_COMMENT_CHARS + 10) }));
  assert.equal(c.truncated, true);
  assert.ok(Array.from(c.text).length <= MAX_COMMENT_CHARS);
  assert.ok(c.text.endsWith('…'));
});

test('the latest row per writer and key wins', () => {
  const rows = [
    row('alice.near', '1', { text: 'old' }, 10),
    row('alice.near', '1', { text: 'new' }, 11),
    row('alice.near', '1', null, 12),
    row('bob.near', '1', { text: 'same id, other writer' }, 11),
  ];
  const latest = latestRows(rows);
  assert.equal(latest.length, 2);
  const thread = commentThread(rows, PID);
  assert.deepEqual(thread.items.map((c) => [c.author, c.text]), [['bob.near', 'same id, other writer']]);
});

// --- hide list ----------------------------------------------------------------

test('a hide entry matches project, author and id — and nothing less', () => {
  const hidden = [{ project_id: PID, author: 'alice.near', id: '1', reason: null, added_at: null }];
  assert.equal(commentFromRow(row('alice.near', '1', { text: 'x' }), { hidden }), null);
  // Same id, different author: visible. Same author, different project: visible.
  assert.ok(commentFromRow(row('bob.near', '1', { text: 'x' }), { hidden }));
  assert.ok(commentFromRow(row('alice.near', '1', { text: 'x' }, 10, 'p2'), { hidden }));
});

test('the hide list drops malformed entries instead of hiding everything', () => {
  const parsed = parseHideList({
    comments: [
      { project_id: PID, author: 'alice.near', id: '1', reason: 'spam', added_at: '2026-11-09' },
      { project_id: PID, author: 'alice.near' },
      { author: 'alice.near', id: '2' },
      { project_id: 'a/b', author: 'alice.near', id: '3' },
      { project_id: PID, author: 'Not An Account', id: '4' },
      null,
    ],
  });
  assert.deepEqual(parsed, [{ project_id: PID, author: 'alice.near', id: '1', reason: 'spam', added_at: '2026-11-09' }]);
  assert.deepEqual(parseHideList(null), []);
  assert.deepEqual(parseHideList({ comments: 'nope' }), []);
});

// --- threads ------------------------------------------------------------------

test('the thread is oldest first, then by author, and counts visible comments', () => {
  const rows = [
    row('bob.near', '300', { text: 'b' }),
    row('alice.near', '100', { text: 'a' }),
    row('carol.near', '200', null),
  ];
  const { items, count } = commentThread(rows, PID);
  assert.deepEqual(items.map((c) => c.text), ['a', 'b']);
  assert.equal(count, 2);
});

test('replies nest one level; an answer to an answer hangs under the same root; orphans stay visible', () => {
  const { items } = commentThread([
    row('alice.near', '100', { text: 'root' }),
    row('bob.near', '200', { text: 'reply', reply_to: 'alice.near/100' }),
    row('carol.near', '300', { text: 'reply to reply', reply_to: 'bob.near/200' }),
    row('dave.near', '400', { text: 'orphan', reply_to: 'gone.near/1' }),
    row('erin.near', '500', { text: 'second root' }),
  ], PID);
  const view = threadView(items);
  assert.deepEqual(view.map((n) => n.text), ['root', 'orphan', 'second root']);
  assert.deepEqual(view[0].replies.map((r) => r.text), ['reply', 'reply to reply']);
  assert.deepEqual(view[1].replies, []);
});

test('replies to a hidden comment stay visible, promoted to the top level', () => {
  const hidden = [{ project_id: PID, author: 'alice.near', id: '100', reason: null, added_at: null }];
  const { items } = commentThread([
    row('alice.near', '100', { text: 'hidden root' }),
    row('bob.near', '200', { text: 'answer', reply_to: 'alice.near/100' }),
  ], PID, { hidden });
  const view = threadView(items);
  assert.deepEqual(view.map((n) => n.text), ['answer']);
});

test('counts are per project, ignore hidden and deleted rows, and honour the project filter', () => {
  const rows = [
    row('alice.near', '1', { text: 'x' }, 10, 'p1'),
    row('bob.near', '2', { text: 'y' }, 10, 'p1'),
    row('carol.near', '3', null, 10, 'p1'),
    row('dave.near', '4', { text: 'z' }, 10, 'p2'),
    row('erin.near', '5', { text: 'w' }, 10, 'gone'),
  ];
  assert.deepEqual(countComments(rows), { p1: 2, p2: 1, gone: 1 });
  assert.deepEqual(countComments(rows, { projectIds: ['p1', 'p2'] }), { p1: 2, p2: 1 });
  const hidden = [{ project_id: 'p2', author: 'dave.near', id: '4', reason: null, added_at: null }];
  assert.deepEqual(countComments(rows, { hidden }), { p1: 2, gone: 1 });
});

// --- reading from KV ----------------------------------------------------------

test('a project read is one prefix read across writers — no writer in the path', async () => {
  const kv = fakeKv([kvResponse([])]);
  await readProjectCommentRows({ projectId: PID, account: NS, fetchImpl: kv.impl });
  assert.equal(kv.calls.length, 1);
  assert.equal(kv.calls[0].url, `https://kv.main.fastnear.com/v0/latest/${NS}`);
  assert.deepEqual(kv.calls[0].body, { limit: 200, key_prefix: `comment/${PID}/` });
});

test('the counts read asks for the whole comment/ prefix', async () => {
  const kv = fakeKv([kvResponse([])]);
  await readAllCommentRows({ account: NS, fetchImpl: kv.impl });
  assert.deepEqual(kv.calls[0].body, { limit: 200, key_prefix: COMMENT_PREFIX });
});

test('readAccountComment reports what the writer’s row says, including a deletion', async () => {
  const live = fakeKv([kvResponse([row('alice.near', '123', { text: 'hello' }, 44)])]);
  assert.deepEqual(
    await readAccountComment({ network: 'mainnet', account: NS, accountId: 'alice.near', projectId: PID, id: '123', fetchImpl: live.impl }),
    { exists: true, deleted: false, text: 'hello', blockHeight: 44 },
  );
  const gone = fakeKv([kvResponse([row('alice.near', '123', null, 45)])]);
  assert.deepEqual(
    await readAccountComment({ network: 'mainnet', account: NS, accountId: 'alice.near', projectId: PID, id: '123', fetchImpl: gone.impl }),
    { exists: true, deleted: true, text: null, blockHeight: 45 },
  );
  const none = fakeKv([kvResponse([])]);
  assert.deepEqual(
    await readAccountComment({ network: 'mainnet', account: NS, accountId: 'alice.near', projectId: PID, id: '123', fetchImpl: none.impl }),
    { exists: false, deleted: false, text: null, blockHeight: null },
  );
});

// --- confirming and sending ---------------------------------------------------

test('confirmComment polls until the row shows the text and gives up at the deadline', async () => {
  const clock = fakeClock();
  const late = fakeKv([kvResponse([]), kvResponse([row('alice.near', '123', { text: 'hello' }, 44)])]);
  const ok = await confirmComment({
    network: 'mainnet', account: NS, accountId: 'alice.near', projectId: PID, id: '123', text: 'hello',
    fetchImpl: late.impl, now: clock.now, sleep: clock.sleep, timeoutMs: 10_000,
  });
  assert.equal(ok.confirmed, true);
  assert.equal(ok.blockHeight, 44);
  assert.equal(ok.attempts, 2);

  const clock2 = fakeClock();
  const never = fakeKv([kvResponse([])]);
  const out = await confirmComment({
    network: 'mainnet', account: NS, accountId: 'alice.near', projectId: PID, id: '123', text: 'hello',
    fetchImpl: never.impl, now: clock2.now, sleep: clock2.sleep, timeoutMs: 5_000, intervalMs: 1_000,
  });
  assert.equal(out.confirmed, false);
  assert.equal(never.calls.length, 6);
});

test('a posted comment is sent once and confirmed against the index', async () => {
  const sent = [];
  const sign = async (tx) => { sent.push(tx); return {}; };
  const kv = fakeKv([kvResponse([row('alice.near', '123', { text: 'hello' }, 44)])]);
  const r = await submitComment({
    signAndSendTransaction: sign, network: 'mainnet', account: NS, accountId: 'alice.near',
    projectId: PID, id: '123', text: 'hello', fetchImpl: kv.impl,
  });
  assert.equal(r.outcome, 'confirmed');
  assert.equal(r.text, 'hello');
  assert.equal(r.key, 'comment/p1/123');
  assert.equal(r.blockHeight, 44);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].actions[0].params.args, { 'comment/p1/123': { text: 'hello' } });
});

test('a wallet cancellation sends nothing else and is reported as rejected', async () => {
  let calls = 0;
  const sign = async () => { calls += 1; throw new Error('User rejected the request'); };
  const kv = fakeKv([kvResponse([])]);
  const r = await submitComment({
    signAndSendTransaction: sign, network: 'mainnet', account: NS, accountId: 'alice.near',
    projectId: PID, id: '123', text: 'hello', fetchImpl: kv.impl,
  });
  assert.equal(r.outcome, 'rejected');
  assert.equal(calls, 1);
  assert.equal(kv.calls.length, 0);
});

test('a missing login key falls back to the wallet once and is never retried', async () => {
  const first = async () => { throw new Error('AccessKeyNotFound: access key does not exist'); };
  const second = async () => ({});
  let fallbacks = 0;
  const kv = fakeKv([kvResponse([row('alice.near', '123', { text: 'hello' }, 44)])]);
  const r = await submitComment({
    signAndSendTransaction: first,
    fallbackSend: () => { fallbacks += 1; return second; },
    network: 'mainnet', account: NS, accountId: 'alice.near',
    projectId: PID, id: '123', text: 'hello', fetchImpl: kv.impl,
  });
  assert.equal(r.outcome, 'confirmed');
  assert.equal(fallbacks, 1);
  assert.equal(r.usedFallback, true);
});

test('a sent but unconfirmed write reports timeout and is not resent', async () => {
  const clock = fakeClock();
  const sent = [];
  const kv = fakeKv([kvResponse([])]);
  const r = await submitComment({
    signAndSendTransaction: async (tx) => { sent.push(tx); return {}; },
    network: 'mainnet', account: NS, accountId: 'alice.near', projectId: PID, id: '123', text: 'hello',
    fetchImpl: kv.impl, now: clock.now, sleep: clock.sleep, timeoutMs: 5_000, intervalMs: 1_000,
  });
  assert.equal(r.outcome, 'timeout');
  assert.equal(sent.length, 1);
});

test('deleting sends null and confirms on the deleted row', async () => {
  const sent = [];
  const kv = fakeKv([kvResponse([row('alice.near', '123', null, 50)])]);
  const r = await submitComment({
    signAndSendTransaction: async (tx) => { sent.push(tx); return {}; },
    network: 'mainnet', account: NS, accountId: 'alice.near', projectId: PID, id: '123',
    deleted: true, fetchImpl: kv.impl,
  });
  assert.equal(r.outcome, 'confirmed');
  assert.equal(r.text, null);
  assert.deepEqual(sent[0].actions[0].params.args, { 'comment/p1/123': null });
});

test('the policy URL is a site path', () => {
  assert.equal(POLICY_PATH, '/comment-policy');
});
