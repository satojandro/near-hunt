import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNear, checkAmount, donationTx, stakeTx, accountFromEnv, explorerTxUrl, STAKE_GAS } from '../lib/support.mjs';

test('parseNear converts NEAR to yocto exactly', () => {
  assert.equal(parseNear('1'), 10n ** 24n);
  assert.equal(parseNear('1.5'), 15n * 10n ** 23n);
  assert.equal(parseNear(' 0.01 '), 10n ** 22n);
  assert.equal(parseNear('.5'), 5n * 10n ** 23n);
  assert.equal(parseNear('2.'), 2n * 10n ** 24n);
  assert.equal(parseNear('0.000000000000000000000001'), 1n);
});

test('parseNear refuses anything that is not a plain decimal', () => {
  for (const bad of ['', ' ', '-1', '+1', '1e3', '1,5', 'abc', '1.2.3', '0.0000000000000000000000001', '.', null, 5]) {
    assert.equal(parseNear(bad), null, String(bad));
  }
});

test('checkAmount enforces the range', () => {
  assert.deepEqual(checkAmount('5'), { ok: true, yocto: (5n * 10n ** 24n).toString() });
  assert.equal(checkAmount('0.001').ok, false);
  assert.equal(checkAmount('100001').ok, false);
  assert.equal(checkAmount('x').ok, false);
});

test('donationTx is a single Transfer', () => {
  assert.deepEqual(donationTx('nearhunt.near', '7'), {
    receiverId: 'nearhunt.near',
    actions: [{ type: 'Transfer', params: { deposit: '7' } }],
  });
  assert.throws(() => donationTx('Not An Account', '1'));
});

test('stakeTx calls deposit_and_stake with the deposit', () => {
  const tx = stakeTx('pool.poolv1.near', 3n);
  assert.equal(tx.receiverId, 'pool.poolv1.near');
  assert.deepEqual(tx.actions[0].params, { methodName: 'deposit_and_stake', args: {}, gas: STAKE_GAS, deposit: '3' });
});

test('accountFromEnv hides the card unless a valid id is configured', () => {
  assert.equal(accountFromEnv(undefined), null);
  assert.equal(accountFromEnv(''), null);
  assert.equal(accountFromEnv('bad id'), null);
  assert.equal(accountFromEnv(' My.PoolV1.near '), 'my.poolv1.near');
});

test('explorer links follow the network', () => {
  assert.equal(explorerTxUrl('abc', 'mainnet'), 'https://nearblocks.io/txns/abc');
  assert.equal(explorerTxUrl('abc', 'testnet'), 'https://testnet.nearblocks.io/txns/abc');
});
