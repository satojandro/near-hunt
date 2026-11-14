/**
 * Support page (NH-121): donate NEAR to the account that runs NEAR Hunt, or stake with the
 * owner's validator. Pure functions only, so the amount handling is unit-tested.
 *
 * Both are ordinary wallet transactions signed by the visitor: the login key cannot sign them
 * (it is a function-call key for `__fastdata_kv` on `nearhunt.near` with no deposit), so the
 * wallet always asks. No agent, script or server signs anything here (AGENTS.md §1).
 */

import { isAccountId } from './social.mjs';

/** 1 NEAR in yoctoNEAR. */
export const YOCTO_PER_NEAR = 10n ** 24n;

/** Smallest amount the form accepts, so a stray "0.0000001" is not sent by mistake. */
export const MIN_NEAR = '0.01';

/** Largest amount the form accepts in one transaction; a typo guard, not a policy. */
export const MAX_NEAR = '100000';

/** Prepaid gas for `deposit_and_stake` on a standard staking pool (what wallets use). */
export const STAKE_GAS = '125000000000000';

/** Quick-pick amounts shown as buttons. */
export const PRESETS = ['1', '5', '25'];

/**
 * "1.5" -> 1500000000000000000000000n. Accepts digits with at most 24 decimals and an optional
 * leading/trailing space; anything else (signs, exponents, commas, empty) returns null.
 */
export function parseNear(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  const m = /^(\d+)(?:\.(\d{0,24}))?$/.exec(s) ?? /^\.(\d{1,24})$/.exec(s);
  if (!m) return null;
  const whole = m.length === 3 ? m[1] : '0';
  const frac = (m.length === 3 ? m[2] ?? '' : m[1]).padEnd(24, '0');
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt(frac);
}

/** Validates a typed amount: `{ ok: true, yocto }` or `{ ok: false, error }` for the form. */
export function checkAmount(input) {
  const yocto = parseNear(input);
  if (yocto === null) return { ok: false, error: 'Enter an amount in NEAR, like 1 or 2.5.' };
  if (yocto < parseNear(MIN_NEAR)) return { ok: false, error: `The smallest amount is ${MIN_NEAR} NEAR.` };
  if (yocto > parseNear(MAX_NEAR)) return { ok: false, error: `The largest amount in one go is ${MAX_NEAR} NEAR.` };
  return { ok: true, yocto: yocto.toString() };
}

/** A direct donation: one Transfer to `receiverId`, in the wallet-selector action format. */
export function donationTx(receiverId, yocto) {
  if (!isAccountId(receiverId)) throw new Error(`not an account id: ${receiverId}`);
  return { receiverId, actions: [{ type: 'Transfer', params: { deposit: String(yocto) } }] };
}

/** Stake with a pool: `deposit_and_stake` with the amount attached. The visitor keeps ownership. */
export function stakeTx(poolId, yocto) {
  if (!isAccountId(poolId)) throw new Error(`not an account id: ${poolId}`);
  return {
    receiverId: poolId,
    actions: [
      {
        type: 'FunctionCall',
        params: { methodName: 'deposit_and_stake', args: {}, gas: STAKE_GAS, deposit: String(yocto) },
      },
    ],
  };
}

/**
 * An account id from an env value (`NEXT_PUBLIC_STAKING_POOL`, `NEXT_PUBLIC_DONATION_ACCOUNT`), or null.
 * A null pool hides the staking card, so the page never offers a pool nobody configured.
 */
export function accountFromEnv(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return isAccountId(v) ? v : null;
}

/** Explorer page for an account on `network`. */
export function explorerAccountUrl(accountId, network) {
  const host = network === 'testnet' ? 'https://testnet.nearblocks.io' : 'https://nearblocks.io';
  return `${host}/address/${encodeURIComponent(accountId)}`;
}

/** Explorer page for a transaction on `network`. */
export function explorerTxUrl(txHash, network) {
  const host = network === 'testnet' ? 'https://testnet.nearblocks.io' : 'https://nearblocks.io';
  return `${host}/txns/${encodeURIComponent(txHash)}`;
}
