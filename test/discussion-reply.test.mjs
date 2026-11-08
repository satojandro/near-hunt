import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replyArgs, replyTransaction, composeReplyText, draftLimit, newPostId, interpretTx, confirmTx,
  submitReply, replySuffix, MAX_POST_CHARS, SOCIAL_ACCOUNT, SOCIAL_API,
} from '../lib/discussion.mjs';

const PARENT = 'nearhunt.near/1794122153750';
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('replyArgs is exactly the skill.md reply template: post with reply_to/root plus the backlink', () => {
  // skill.md: {"post/1759140000500":{"text":"Agreed!","reply_to":"alice.near/1759140000000","root":"alice.near/1759140000000"},
  //            "reply/alice.near/1759140000000/1759140000500":{}}
  assert.deepEqual(
    replyArgs({ parent: 'alice.near/1759140000000', text: 'Agreed!', postId: '1759140000500' }),
    {
      'post/1759140000500': { text: 'Agreed!', reply_to: 'alice.near/1759140000000', root: 'alice.near/1759140000000' },
      'reply/alice.near/1759140000000/1759140000500': {},
    },
  );
  // Replying inside a thread: root is the parent's root.
  const nested = replyArgs({ parent: 'bob.near/2', parentRoot: PARENT, text: 'hi', postId: '3' });
  assert.equal(nested['post/3'].root, PARENT);
  assert.equal(nested['post/3'].reply_to, 'bob.near/2');
  assert.deepEqual(nested['reply/bob.near/2/3'], {});

  assert.throws(() => replyArgs({ parent: 'nope', text: 'x', postId: '1' }), TypeError);
  assert.throws(() => replyArgs({ parent: PARENT, text: '  ', postId: '1' }), TypeError);
  assert.throws(() => replyArgs({ parent: PARENT, text: 'x', postId: '01' }), TypeError);
  assert.throws(() => replyArgs({ parent: PARENT, text: 'x'.repeat(MAX_POST_CHARS + 1), postId: '1' }), RangeError);
});

test('replyTransaction: receiver social, __fastdata_kv, deposit 0, 1 Ggas', () => {
  const tx = replyTransaction({ parent: PARENT, text: 'hello', postId: '1794200000000' });
  assert.equal(tx.receiverId, SOCIAL_ACCOUNT);
  assert.equal(tx.receiverId, 'social');
  assert.equal(tx.actions.length, 1);
  const { type, params } = tx.actions[0];
  assert.equal(type, 'FunctionCall');
  assert.equal(params.methodName, '__fastdata_kv');
  assert.equal(params.deposit, '0');
  assert.equal(params.gas, '1000000000');
  assert.deepEqual(Object.keys(params.args), ['post/1794200000000', 'reply/nearhunt.near/1794122153750/1794200000000']);
});

test('composeReplyText adds #nearhunt and the project link once', () => {
  assert.deepEqual(composeReplyText('  Can caps be per token?  ', 'abc'), {
    ok: true, text: 'Can caps be per token?\n\n#nearhunt https://nearhunt.xyz/p/abc',
  });
  assert.equal(composeReplyText('Love it #NearHunt', 'abc').text, 'Love it #NearHunt\n\nhttps://nearhunt.xyz/p/abc');
  assert.equal(
    composeReplyText('see https://nearhunt.xyz/p/abc #nearhunt', 'abc').text,
    'see https://nearhunt.xyz/p/abc #nearhunt',
  );
  // #nearhunter is not #nearhunt
  assert.match(composeReplyText('#nearhunter', 'abc').text, /\n\n#nearhunt https/);
  assert.deepEqual(composeReplyText('   ', 'abc'), { ok: false, error: 'empty' });
  assert.equal(composeReplyText('x'.repeat(draftLimit('abc')), 'abc').ok, true);
  assert.equal(composeReplyText('x'.repeat(draftLimit('abc') + 1), 'abc').error, 'too_long');
  assert.equal(replySuffix('a b'), '#nearhunt https://nearhunt.xyz/p/a%20b');
});

test('newPostId is ms time, bumped when not greater than the last id', () => {
  assert.equal(newPostId(1794200000000, 0), '1794200000000');
  assert.equal(newPostId(1794200000000, 1794200000000), '1794200000001');
  assert.equal(newPostId(5, 1794200000005), '1794200000006');
});

// Shapes from https://api2.near.social/api.md ("Transaction outcome") and skill.md; the key
// status values are the documented set.
const indexed = (keys, extra = {}) => ({
  tx_hash: 'H', indexed: true, block_height: 1, block_ts: 1, predecessor_id: 'alice.near',
  actions: [{ kind: 'kv', status: 'ok', keys }], ...extra,
});

test('interpretTx maps every documented status', () => {
  const postKey = 'post/1794200000000';
  const backlink = { key: 'reply/nearhunt.near/1794122153750/1794200000000', status: 'ignored' };
  assert.deepEqual(interpretTx({ tx_hash: 'H', indexed: false }, { postKey }), { state: 'pending' });
  assert.deepEqual(interpretTx(indexed([{ key: postKey, status: 'ok' }, backlink]), { postKey, accountId: 'alice.near' }), { state: 'ok' });
  assert.deepEqual(interpretTx(indexed([{ key: postKey, status: 'rate_limited' }, backlink]), { postKey }), { state: 'rate_limited', reason: null });
  assert.deepEqual(
    interpretTx(indexed([{ key: postKey, status: 'invalid', reason: 'root must equal the parent root' }]), { postKey }),
    { state: 'invalid', reason: 'root must equal the parent root' },
  );
  assert.deepEqual(interpretTx(indexed([{ key: postKey, status: 'value_too_large' }]), { postKey }), { state: 'dropped', reason: 'value_too_large' });
  assert.equal(interpretTx(indexed([backlink]), { postKey }).state, 'error');
  assert.equal(
    interpretTx({ ...indexed([]), actions: [{ kind: 'kv', status: 'too_many_keys', keys: [] }] }, { postKey }).state,
    'invalid',
  );
  assert.equal(interpretTx(indexed([{ key: postKey, status: 'ok' }]), { postKey, accountId: 'bob.near' }).state, 'error');
  assert.equal(interpretTx(null, { postKey }).state, 'error');
});

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('confirmTx polls until indexed, and times out', async () => {
  const postKey = 'post/1';
  let n = 0;
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    n += 1;
    if (n === 1) throw new Error('network');
    if (n < 4) return res(200, { tx_hash: 'H', indexed: false });
    return res(200, indexed([{ key: postKey, status: 'rate_limited' }]));
  };
  const txHash = '8rX5McjBeiitsRAhQsY7sqWbTQ9nXXHBDYwCJyQuGhfk';
  const out = await confirmTx({ txHash, postKey, fetchImpl, ...clock() });
  assert.equal(out.state, 'rate_limited');
  assert.equal(out.attempts, 4);
  assert.equal(urls[0], `${SOCIAL_API}/v1/tx/${txHash}`);

  const never = await confirmTx({ txHash, postKey, fetchImpl: async () => res(200, { indexed: false }), timeoutMs: 6000, intervalMs: 1500, ...clock() });
  assert.equal(never.state, 'timeout');
});

test('submitReply: CodeDoesNotExist is success, then /v1/tx decides', async () => {
  const sent = [];
  const txHash = '8rX5McjBeiitsRAhQsY7sqWbTQ9nXXHBDYwCJyQuGhfk';
  const signAndSendTransaction = async (params) => {
    sent.push(params);
    const err = new Error('Transaction failed: CodeDoesNotExist { account_id: "social" }');
    err.transaction_outcome = { id: txHash };
    // NEAR Connect wallets throw the failed outcome; the hash rides along.
    err.txHash = txHash;
    throw err;
  };
  const fetchImpl = async () => res(200, {
    tx_hash: txHash, indexed: true, predecessor_id: 'alice.near',
    actions: [{ kind: 'kv', status: 'ok', keys: [{ key: 'post/1794200000000', status: 'ok' }, { key: 'reply/nearhunt.near/1794122153750/1794200000000', status: 'ignored' }] }],
  });
  const out = await submitReply({
    signAndSendTransaction, accountId: 'alice.near', parent: PARENT, text: 'hi #nearhunt', postId: '1794200000000', fetchImpl, ...clock(),
  });
  assert.equal(sent.length, 1, 'sent exactly once, never retried');
  assert.equal(sent[0].receiverId, 'social');
  assert.equal(out.outcome, 'ok');
  assert.equal(out.txHash, txHash);
  assert.equal(out.postKey, 'alice.near/1794200000000');
});

test('submitReply: a declined wallet sends nothing and reports rejected', async () => {
  let fetched = 0;
  const out = await submitReply({
    signAndSendTransaction: async () => { throw new Error('User rejected the request'); },
    accountId: 'alice.near', parent: PARENT, text: 'hi', postId: '1794200000000',
    fetchImpl: async () => { fetched += 1; return res(200, {}); }, ...clock(),
  });
  assert.equal(out.outcome, 'rejected');
  assert.equal(fetched, 0);
});

test('submitReply: invalid and rate_limited come back with the reason', async () => {
  const txHash = '8rX5McjBeiitsRAhQsY7sqWbTQ9nXXHBDYwCJyQuGhfk';
  const send = async () => ({ transaction: { hash: txHash }, status: { SuccessValue: '' } });
  for (const [status, reason] of [['invalid', 'text too long'], ['rate_limited', undefined]]) {
    const out = await submitReply({
      signAndSendTransaction: send, accountId: 'alice.near', parent: PARENT, text: 'hi', postId: '1794200000000',
      fetchImpl: async () => res(200, indexed([{ key: 'post/1794200000000', status, ...(reason ? { reason } : {}) }])),
      ...clock(),
    });
    assert.equal(out.outcome, status);
    assert.equal(out.reason, reason ?? null);
  }
});

test('submitReply without a tx hash waits for the post itself', async () => {
  const urls = [];
  const out = await submitReply({
    signAndSendTransaction: async () => ({}),
    accountId: 'alice.near', parent: PARENT, text: 'hi', postId: '1794200000000',
    fetchImpl: async (url) => { urls.push(url); return urls.length < 2 ? res(404, {}) : res(200, { post: {} }); },
    ...clock(),
  });
  assert.equal(out.outcome, 'ok');
  assert.equal(urls[0], `${SOCIAL_API}/v1/posts/alice.near/1794200000000`);
});

test('interpretTx on recorded /v1/tx responses', async () => {
  const { readFileSync } = await import('node:fs');
  const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/discussion/${n}`, import.meta.url), 'utf8'));
  // GET /v1/tx/23c6KfRGQHEgFhBVnVQU36v2hDiypKmEoM3H1FyJgCZQ (kcameau.near's post at block 223,500,744),
  // found via archival RPC and recorded 8 Nov 2026.
  assert.deepEqual(interpretTx(fx('tx-23c6KfRG-ok.json'), { postKey: 'post/1794074495671', accountId: 'kcameau.near' }), { state: 'ok' });
  assert.deepEqual(interpretTx(fx('tx-not-indexed.json'), { postKey: 'post/1' }), { state: 'pending' });
});
