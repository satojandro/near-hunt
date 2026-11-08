import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXCLUDED_WALLETS, SIGN_IN_OPTIONS, connectorOptions, mergeManifest, MANIFEST_PATH } from '../lib/wallets.mjs';
import { VOTE_ACCOUNT, VOTE_METHOD } from '../lib/network.mjs';

const w = (id, extra = {}) => ({ id, name: id, type: 'sandbox', executor: `https://x/${id}.js`, ...extra });

test('MyNearWallet is excluded (retired: sunset phase 3)', () => {
  assert.ok(EXCLUDED_WALLETS.includes('mynearwallet'));
  assert.ok(connectorOptions().excludedWallets.includes('mynearwallet'));
});

test('the merged manifest drops excluded wallets and appends extras', () => {
  const m = mergeManifest(
    { version: '1.1.0', wallets: [w('hot-wallet'), w('mynearwallet'), w('meteor-wallet')] },
    { extra: [w('nearhunt-privy')] },
  );
  assert.equal(m.version, '1.1.0');
  assert.deepEqual(m.wallets.map((x) => x.id), ['hot-wallet', 'meteor-wallet', 'nearhunt-privy']);
});

test('an extra entry with an official id replaces it; junk entries are skipped', () => {
  const m = mergeManifest(
    { wallets: [w('meteor-wallet', { executor: 'old' }), null, { name: 'no id' }] },
    { extra: [w('meteor-wallet', { executor: 'pinned' })], excluded: [] },
  );
  assert.deepEqual(m.wallets.map((x) => x.executor), ['pinned']);
});

test('an unreachable official manifest still yields the extras', () => {
  assert.deepEqual(mergeManifest(null, { extra: [w('a')] }).wallets.map((x) => x.id), ['a']);
});

test('login asks for a function-call key on VOTE_ACCOUNT limited to VOTE_METHOD', () => {
  const k = SIGN_IN_OPTIONS.addFunctionCallKey;
  assert.equal(k.contractId, VOTE_ACCOUNT);
  assert.deepEqual(k.allowMethods, { anyMethod: false, methodNames: [VOTE_METHOD] });
  assert.equal(k.gasAllowance.kind, 'limited');
});

test('the server render gets an empty manifest; the browser loads ours', () => {
  assert.deepEqual(connectorOptions({ server: true }).manifest.wallets, []);
  assert.equal(connectorOptions().manifest, MANIFEST_PATH);
});
