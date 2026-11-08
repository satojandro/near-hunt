/**
 * Client-side vote logic (NH-31, NH-32, NH-34), kept free of React and of the network so it can
 * be unit-tested: building the write, reading what came back, and confirming against the index.
 *
 * The write: a FunctionCall to `VOTE_ACCOUNT`, method `__fastdata_kv`, args
 * `{"vote/{projectId}": {}}` to upvote or `{"vote/{projectId}": null}` to withdraw. The receiver
 * has no contract, so the receipt always fails with `CodeDoesNotExist`; the FastData indexer
 * stores the row anyway (docs/spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md).
 * That failure therefore means "written", it is never retried, and the KV index — not the
 * receipt — decides whether the vote counts.
 */

import { KV_HOSTS } from './kv.mjs';

export const VOTE_PREFIX = 'vote/';

/**
 * Prepaid gas for one vote: 1 Ggas. The call runs no code (there is none), so this is the most
 * that can be charged, not what will be; it is what the NH-35 spike proved on testnet and what
 * `scripts/import.mjs` uses. Kept small because a function-call key pays gas from a limited
 * allowance.
 */
export const VOTE_GAS = '1000000000';

/** The deposit is always zero: a function-call access key cannot attach one anyway. */
export const VOTE_DEPOSIT = '0';

export function voteKey(projectId) {
  if (typeof projectId !== 'string' || projectId.length === 0) throw new Error('projectId is required');
  return `${VOTE_PREFIX}${projectId}`;
}

/** `{"vote/{id}": {}}` to upvote, `{"vote/{id}": null}` to withdraw (schema/README.md). */
export function voteArgs(projectId, upvote) {
  return { [voteKey(projectId)]: upvote ? {} : null };
}

/**
 * The action in the shape NEAR Connect wallets accept (the wallet-selector action format, which
 * `function-call-key-plugin` also reads when it signs locally with the login key).
 */
export function voteAction(projectId, upvote, methodName = '__fastdata_kv') {
  return {
    type: 'FunctionCall',
    params: { methodName, args: voteArgs(projectId, upvote), gas: VOTE_GAS, deposit: VOTE_DEPOSIT },
  };
}

/**
 * A row's value means "upvoted" only when it is a plain JSON object; `null` is a withdrawn vote,
 * and nothing else counts (schema/README.md: `{}` = active, `null` = withdrawn).
 *
 * This must agree with `isActiveVote` in lib/votes.mjs, which decides the counts the page shows:
 * an array is `typeof 'object'` but is not a vote, and the browser read and the server tally have
 * to agree on that or a card can read "voted" while the tally says 0. `test/vote-client.test.mjs`
 * pins the two together.
 */
export function isActiveVote(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Project ids the account currently upvotes, from its `vote/` rows. Rows written by anyone else
 * are ignored: the voter is the row's `predecessor_id`, never something inside the key.
 */
export function votedIdsFromRows(entries, accountId) {
  const ids = new Set();
  for (const e of entries ?? []) {
    if (!e || e.predecessor_id !== accountId) continue;
    if (typeof e.key !== 'string' || !e.key.startsWith(VOTE_PREFIX)) continue;
    if (isActiveVote(e.value)) ids.add(e.key.slice(VOTE_PREFIX.length));
  }
  return ids;
}

/** `POST {host}/v0/latest/{voteAccount}/{accountId}` — one writer's rows in the vote namespace. */
export function accountVotesUrl({ network, voteAccount, accountId }) {
  const host = KV_HOSTS[network];
  if (!host) throw new Error(`unknown network: ${network}`);
  if (!voteAccount || !accountId) throw new Error('voteAccount and accountId are required');
  return `${host}/v0/latest/${voteAccount}/${accountId}`;
}

async function postJson(fetchImpl, url, body, signal) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`KV API returned ${res.status} for ${url}`);
  return res.json();
}

/**
 * Every project the account upvotes: one request (plus pages) for the whole `vote/` prefix, so a
 * page of cards shares a single read instead of asking once per card.
 *
 * @returns {Promise<Set<string>>}
 */
export async function readAccountVotes({ network, voteAccount, accountId, fetchImpl = fetch, signal }) {
  const url = accountVotesUrl({ network, voteAccount, accountId });
  const entries = [];
  let pageToken = null;
  do {
    const body = { key_prefix: VOTE_PREFIX, limit: 200 };
    if (pageToken) body.page_token = pageToken;
    const json = await postJson(fetchImpl, url, body, signal);
    entries.push(...(json.entries ?? []));
    pageToken = json.page_token ?? null;
  } while (pageToken);
  return votedIdsFromRows(entries, accountId);
}

/**
 * The account's current vote on one project: `true` (upvoted), `false` (withdrawn or never voted).
 */
export async function readAccountVote({ network, voteAccount, accountId, projectId, fetchImpl = fetch, signal }) {
  const url = accountVotesUrl({ network, voteAccount, accountId });
  const key = voteKey(projectId);
  const json = await postJson(fetchImpl, url, { key }, signal);
  const row = (json.entries ?? []).find((e) => e.key === key && e.predecessor_id === accountId);
  return row ? { voted: isActiveVote(row.value), blockHeight: row.block_height ?? null } : { voted: false, blockHeight: null };
}

/**
 * Poll the index until the account's row for `projectId` shows the state just written, or give
 * up after `timeoutMs`. Read failures are retried until the deadline: the write may still land.
 *
 * @returns {Promise<{confirmed: boolean, blockHeight: number|null, attempts: number, lastError: string|null}>}
 */
export async function confirmVote({
  network,
  voteAccount,
  accountId,
  projectId,
  upvote,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = 30_000,
  intervalMs = 1_500,
}) {
  const deadline = now() + timeoutMs;
  let attempts = 0;
  let lastError = null;
  for (;;) {
    attempts += 1;
    try {
      const { voted, blockHeight } = await readAccountVote({ network, voteAccount, accountId, projectId, fetchImpl });
      if (voted === Boolean(upvote)) return { confirmed: true, blockHeight, attempts, lastError: null };
      lastError = null;
    } catch (err) {
      lastError = err?.message ?? String(err);
    }
    if (now() + intervalMs > deadline) return { confirmed: false, blockHeight: null, attempts, lastError };
    await sleep(intervalMs);
  }
}

// ---------------------------------------------------------------------------
// What a signing attempt returned
// ---------------------------------------------------------------------------

const CODE_DOES_NOT_EXIST = /CodeDoesNotExist|Cannot find contract code|Contract code for contract ID .* does not exist/i;
const USER_REJECTED = /user (rejected|cancell?ed|denied|closed)|rejected by (the )?user|request rejected|cancell?ed by (the )?user|popup closed|window closed|^rejected$|^cancell?ed$/i;
const KEY_MISSING = /access ?key.*(does not exist|not found|doesn't exist)|AccessKeyNotFound|AccessKeyDoesNotExist|UNKNOWN_ACCESS_KEY/i;
const NO_ALLOWANCE = /NotEnoughAllowance|not enough allowance/i;

function failureOf(x) {
  if (!x || typeof x !== 'object') return null;
  const status = x.status ?? x.transactionResult?.status ?? x.final_execution_outcome?.status;
  if (status && typeof status === 'object' && 'Failure' in status) return status.Failure;
  return null;
}

function messageOf(x, depth = 0) {
  if (x == null || depth > 3) return '';
  if (typeof x === 'string') return x;
  const parts = [x.message, x.name, x.type];
  if (x.cause) parts.push(messageOf(x.cause, depth + 1));
  // near-api-js's FailoverRpcProvider wraps each provider's error in `errors`.
  if (Array.isArray(x.errors)) for (const e of x.errors) parts.push(messageOf(e, depth + 1));
  if (typeof x.contractId === 'string') parts.push(`contract ${x.contractId}`);
  return parts.filter(Boolean).join(' ');
}

function txHashOf(x) {
  if (!x || typeof x !== 'object') return null;
  return (
    x.transaction?.hash ??
    x.transaction_outcome?.id ??
    x.transactionResult?.transaction?.hash ??
    x.transactionResult?.transaction_outcome?.id ??
    (typeof x.txHash === 'string' ? x.txHash : null)
  );
}

/**
 * Classify what came back from signing and sending a vote — a resolved outcome or a thrown error.
 *
 *   written   — the transaction landed. Includes the expected `CodeDoesNotExist` receipt failure.
 *               Confirm against the index; never resend.
 *   rejected  — the person declined in the wallet. Nothing was sent; roll back.
 *   key-missing — the login key is not on chain (the wallet did not add it, or it was deleted).
 *               Nothing was sent; the caller may drop the local key and ask the wallet instead.
 *   no-allowance — the login key's gas allowance is spent. Nothing was sent.
 *   unknown   — anything else (network drop, a wallet's own error text). It may or may not have
 *               landed, so confirm against the index and roll back only if it never shows up.
 *
 * @param {{ok?: unknown, error?: unknown}} result  exactly one of `ok` / `error`
 * @returns {{kind: 'written'|'rejected'|'key-missing'|'no-allowance'|'unknown', txHash: string|null, detail: string}}
 */
export function classifySendResult({ ok, error } = {}) {
  if (error === undefined) {
    const failure = failureOf(ok);
    if (!failure) return { kind: 'written', txHash: txHashOf(ok), detail: 'transaction succeeded' };
    const text = JSON.stringify(failure);
    if (CODE_DOES_NOT_EXIST.test(text)) {
      return { kind: 'written', txHash: txHashOf(ok), detail: 'receipt failed with CodeDoesNotExist (expected)' };
    }
    return { kind: 'unknown', txHash: txHashOf(ok), detail: `transaction failed: ${text.slice(0, 200)}` };
  }

  const failure = failureOf(error);
  const text = `${messageOf(error)} ${failure ? JSON.stringify(failure) : ''}`.trim();
  if (CODE_DOES_NOT_EXIST.test(text)) {
    return { kind: 'written', txHash: txHashOf(error), detail: 'receipt failed with CodeDoesNotExist (expected)' };
  }
  if (USER_REJECTED.test(text)) return { kind: 'rejected', txHash: null, detail: text };
  if (NO_ALLOWANCE.test(text)) return { kind: 'no-allowance', txHash: null, detail: text };
  if (KEY_MISSING.test(text)) return { kind: 'key-missing', txHash: null, detail: text };
  return { kind: 'unknown', txHash: txHashOf(error), detail: text || 'unknown error' };
}

// ---------------------------------------------------------------------------
// Casting a vote — wallet-agnostic
// ---------------------------------------------------------------------------

/**
 * Send one vote write with whatever signs it, and classify the result. `signAndSendTransaction`
 * is any function shaped like NEAR Connect's / near-connect-hooks' `({receiverId, actions})`
 * — a wallet, the function-call-key plugin, or a test double. This module never imports a
 * wallet library.
 */
export async function sendVote({ signAndSendTransaction, voteAccount, projectId, upvote, methodName }) {
  const params = { receiverId: voteAccount, actions: [voteAction(projectId, upvote, methodName)] };
  try {
    return classifySendResult({ ok: await signAndSendTransaction(params) });
  } catch (error) {
    return classifySendResult({ error });
  }
}

/**
 * The whole vote: send once, then confirm against the KV index.
 *
 *   - `written` / `unknown` → poll the index; `confirmed` if the row shows the new state in time,
 *     `timeout` otherwise. The write is never sent a second time.
 *   - `rejected` → nothing was sent; returned straight away.
 *   - `key-missing` / `no-allowance` → nothing was sent. If `fallbackSend` is given (e.g. "ask
 *     the wallet to sign instead"), the vote is sent through it once; otherwise `failed`.
 *
 * @returns {Promise<{outcome: 'confirmed'|'timeout'|'rejected'|'failed', kind: string, txHash: string|null, detail: string, blockHeight: number|null, usedFallback: boolean}>}
 */
export async function castVote({
  signAndSendTransaction,
  fallbackSend,
  network,
  voteAccount,
  accountId,
  projectId,
  upvote,
  methodName,
  fetchImpl,
  now,
  sleep,
  timeoutMs,
  intervalMs,
  onSent,
}) {
  let usedFallback = false;
  let sent = await sendVote({ signAndSendTransaction, voteAccount, projectId, upvote, methodName });

  if ((sent.kind === 'key-missing' || sent.kind === 'no-allowance') && fallbackSend) {
    usedFallback = true;
    const send = await fallbackSend(sent);
    if (send) sent = await sendVote({ signAndSendTransaction: send, voteAccount, projectId, upvote, methodName });
  }

  const base = { kind: sent.kind, txHash: sent.txHash, detail: sent.detail, usedFallback };
  if (sent.kind === 'rejected') return { ...base, outcome: 'rejected', blockHeight: null };
  if (sent.kind === 'key-missing' || sent.kind === 'no-allowance') return { ...base, outcome: 'failed', blockHeight: null };

  onSent?.(sent);
  const conf = await confirmVote({ network, voteAccount, accountId, projectId, upvote, fetchImpl, now, sleep, timeoutMs, intervalMs });
  return { ...base, outcome: conf.confirmed ? 'confirmed' : 'timeout', blockHeight: conf.blockHeight };
}

// ---------------------------------------------------------------------------
// Sharing (NH-34)
// ---------------------------------------------------------------------------

export const SITE_ORIGIN = 'https://nearhunt.xyz';

export function projectUrl(projectId) {
  return `${SITE_ORIGIN}/p/${encodeURIComponent(projectId)}`;
}

/**
 * Text for a near.social post after an upvote. near.social has no URL that pre-fills its
 * composer (its compose widget seeds itself only from a private local draft), so the UI copies
 * this text and opens near.social; nothing is written from NEAR Hunt's side.
 */
export function shareText({ projectId, projectName }) {
  const name = projectName?.trim() ? projectName.trim() : 'a project';
  return `Just upvoted ${name} on NEAR Hunt #nearhunt ${projectUrl(projectId)}`;
}
