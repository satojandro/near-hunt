/**
 * What a signing key is allowed to do, as far as the importer cares.
 *
 * A NEAR credentials file names its account and carries a secret key, but says nothing about
 * the key's permission — that lives on chain. The importer asks the RPC (`view_access_key`)
 * and reads `permission`, which is either the string `"FullAccess"` or an object shaped
 * `{ FunctionCall: { receiver_id, method_names, allowance } }`.
 *
 * These helpers are pure: the decision is testable from a stubbed RPC response, with no
 * network and no key file.
 */

export const FULL_ACCESS = 'FullAccess';

/** Render an RPC `permission` value the way a human needs to read it. */
export function describePermission(permission) {
  if (permission === FULL_ACCESS) return 'full access';

  if (permission && typeof permission === 'object' && permission.FunctionCall) {
    const { receiver_id: receiver, method_names: methods } = permission.FunctionCall;
    const who = receiver ?? '<unknown receiver>';
    // An empty method list in NEAR means "any method on this receiver", not "none".
    const what = methods?.length ? methods.join(', ') : '*';
    return `FunctionCall(${who}, ${what})`;
  }

  if (permission == null) return 'unknown (the RPC returned no permission)';
  return `unknown (${typeof permission === 'string' ? permission : JSON.stringify(permission)})`;
}

export function isFullAccess(permission) {
  return permission === FULL_ACCESS;
}

/**
 * Decide whether `--execute` may sign with this key.
 *
 * A full-access key is refused unless the operator explicitly opts in: an import needs only
 * `FunctionCall(__fastdata_kv)` on one receiver, so a key that can move funds, add keys or
 * delete the account is strictly more authority than the job requires.
 *
 * An unreadable permission is a warning, not a refusal: the RPC may simply be unreachable,
 * and without a permission the signature would fail on chain anyway.
 *
 * @param {object} opts
 * @param {unknown} opts.permission   the `permission` field from `view_access_key`
 * @param {string} [opts.keyPath]     shown in messages so the operator knows which file
 * @param {boolean} [opts.acceptFullAccess]
 * @returns {{allowed: boolean, reason: string|null, warning: string|null}}
 */
export function importKeyDecision({ permission, keyPath, acceptFullAccess = false }) {
  const where = keyPath ? ` (${keyPath})` : '';

  if (permission == null) {
    return {
      allowed: true,
      reason: null,
      warning: `could not read the permission of the signing key${where}; the RPC returned none.`,
    };
  }

  if (isFullAccess(permission) && !acceptFullAccess) {
    return {
      allowed: false,
      reason:
        `refusing to sign with a full-access key${where}. ` +
        'It can move funds, add keys and delete the account, while an import needs only ' +
        'FunctionCall(__fastdata_kv) on one receiver. Add a function-call key and keep this ' +
        'file out of ~/.near-credentials (docs/runbooks/keys.md). ' +
        'Re-run with --accept-full-access only if you accept that risk.',
      warning: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    warning: isFullAccess(permission)
      ? 'signing with a full-access key because --accept-full-access was passed.'
      : null,
  };
}
