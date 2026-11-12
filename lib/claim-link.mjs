/**
 * Linking a NEAR account to a GitHub-checked claim (NH-119, steps 2-4). No Node imports: the
 * browser builds the write with this file and the server judges rows with it.
 *
 * Anyone can write any row to `nearhunt.near` (it has no contract), so a `maker/` row alone
 * proves nothing about a project. What makes one count:
 *
 *   1. GitHub sign-in: the server checks the person controls the listing's repository
 *      (lib/claims.mjs) and issues a one-time `code` for that GitHub account and that listing,
 *      held against an httpOnly cookie in the same browser.
 *   2. The person's NEAR account writes `maker/{submission_id}` -> `{ "code": "…" }`, signed with
 *      the login key like a vote. The writer is the row's `predecessor_id`.
 *   3. The same browser (cookie) asks the server to confirm; the server finds that row in the
 *      index and stores the account and the code on the claim.
 *   4. On every read, the account is shown only while its current row still carries the code the
 *      claim holds. A row with any other code, from any other account, or withdrawn (`null`) is
 *      ignored.
 *
 * The code becomes public the moment it is on chain. That is fine: confirming needs the cookie,
 * which only the browser that passed the GitHub check has.
 */
import { classifySendResult } from './vote-client.mjs';

export const MAKER_PREFIX = 'maker/';
export const LINK_COOKIE = 'nh_link';
/** Seconds a GitHub-checked browser has to write and confirm the NEAR row. */
export const LINK_TTL_SECONDS = 1800;

const ID_RE = /^[0-9a-z-]{8,64}$/i;
const CODE_RE = /^[0-9a-f]{32}$/;
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
/** Same budget as a vote: the call runs no code. */
const GAS = '1000000000';

export const isLinkCode = (v) => typeof v === 'string' && CODE_RE.test(v);
export const isNearAccountId = (v) => typeof v === 'string' && ACCOUNT_RE.test(v);

/** `maker/{submission_id}`: one row per writer per project. */
export function makerKey(submissionId) {
  if (typeof submissionId !== 'string' || !ID_RE.test(submissionId)) {
    throw new Error(`not a submission id: ${String(submissionId)}`);
  }
  return `${MAKER_PREFIX}${submissionId}`;
}

/** The write a maker signs. `receiverId` is the vote account; `methodName` the login key's method. */
export function makerTransaction({ account, submissionId, code, methodName = '__fastdata_kv' }) {
  if (!isLinkCode(code)) throw new Error('not a link code');
  return {
    receiverId: account,
    actions: [{
      type: 'FunctionCall',
      params: { methodName, args: { [makerKey(submissionId)]: { code } }, gas: GAS, deposit: '0' },
    }],
  };
}

/**
 * Is there a current row that links `account` to this listing with this `code`?
 * `rows` are latest rows from the index (one per writer per key).
 */
export function rowLinks(rows, { submissionId, account, code }) {
  if (!isNearAccountId(account) || !isLinkCode(code)) return false;
  const key = makerKey(submissionId);
  return (rows ?? []).some((r) =>
    r && r.key === key && r.predecessor_id === account &&
    r.value !== null && typeof r.value === 'object' && !Array.isArray(r.value) && r.value.code === code);
}

/**
 * The NEAR account to show for a stored claim, or null. Step 4: the store says which account and
 * code were confirmed; the chain must still say the same.
 */
export function linkedAccount(claim, rows, submissionId) {
  const account = claim?.near_account;
  return rowLinks(rows, { submissionId, account, code: claim?.link_code }) ? account : null;
}

/**
 * Sign and send the maker row. `fallbackSend` is asked once when the login key cannot sign
 * (same rule as votes and comments). Returns the classified result; the index decides the rest.
 */
export async function sendMakerRow({ send, fallbackSend, transaction }) {
  const once = async (fn) => {
    try {
      return classifySendResult({ ok: await fn(transaction) });
    } catch (error) {
      return classifySendResult({ error });
    }
  };
  let sent = await once(send);
  if ((sent.kind === 'key-missing' || sent.kind === 'no-allowance') && fallbackSend) {
    const fallback = await fallbackSend(sent);
    if (fallback) sent = await once(fallback);
  }
  return sent;
}
