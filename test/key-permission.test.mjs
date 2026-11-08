import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FULL_ACCESS,
  describePermission,
  isFullAccess,
  importKeyDecision,
} from '../lib/key-permission.mjs';

// Stubbed `view_access_key` responses, exactly as the RPC returns them. No network here.
const FULL_ACCESS_RPC = { permission: 'FullAccess', nonce: 1, block_height: 223583000 };
const FUNCTION_CALL_RPC = {
  permission: {
    FunctionCall: {
      allowance: '250000000000000000000000',
      receiver_id: 'nearhunt.near',
      method_names: ['__fastdata_kv'],
    },
  },
  nonce: 2,
  block_height: 223583001,
};

test('a full-access RPC response reads as "full access"', () => {
  assert.equal(describePermission(FULL_ACCESS_RPC.permission), 'full access');
  assert.equal(isFullAccess(FULL_ACCESS_RPC.permission), true);
});

test('a function-call RPC response names its receiver and methods', () => {
  assert.equal(
    describePermission(FUNCTION_CALL_RPC.permission),
    'FunctionCall(nearhunt.near, __fastdata_kv)',
  );
  assert.equal(isFullAccess(FUNCTION_CALL_RPC.permission), false);
});

test('an empty method list means any method on the receiver', () => {
  const permission = { FunctionCall: { receiver_id: 'nearhunt.near', method_names: [] } };
  assert.equal(describePermission(permission), 'FunctionCall(nearhunt.near, *)');
});

test('a missing or unrecognised permission is reported as unknown, not guessed', () => {
  assert.match(describePermission(null), /^unknown/);
  assert.match(describePermission('SomethingNew'), /^unknown/);
});

test('execute refuses a full-access key and points at the runbook', () => {
  const decision = importKeyDecision({
    permission: FULL_ACCESS_RPC.permission,
    keyPath: '/home/me/.near-credentials/mainnet/nearhunt.near.json',
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /full-access/);
  assert.match(decision.reason, /docs\/runbooks\/keys\.md/);
  assert.match(decision.reason, /--accept-full-access/);
});

test('execute accepts a full-access key only with the explicit opt-in, and warns', () => {
  const decision = importKeyDecision({
    permission: FULL_ACCESS_RPC.permission,
    acceptFullAccess: true,
  });
  assert.equal(decision.allowed, true);
  assert.match(decision.warning, /--accept-full-access/);
});

test('execute accepts a function-call key silently', () => {
  const decision = importKeyDecision({ permission: FUNCTION_CALL_RPC.permission });
  assert.equal(decision.allowed, true);
  assert.equal(decision.warning, null);
});

test('an unreadable permission warns but does not block', () => {
  const decision = importKeyDecision({ permission: null, keyPath: '/tmp/key.json' });
  assert.equal(decision.allowed, true);
  assert.match(decision.warning, /could not read the permission/);
});
