/**
 * GitHub-verified project claims (NH-119).
 *
 * What a claim says: "the GitHub account {login} controls this listing's repository, and asked to
 * be shown as a contact for it". Not more: controlling a repository is not proof of authorship,
 * and the page words it that way. It is checked, not asserted: the person signs in to GitHub (OAuth), and
 * GitHub itself says who they are and what they may do on the repository in the record's
 * `repository_url`. A listing without a GitHub repository cannot be claimed this way.
 *
 * Where it lives: Upstash Redis (the store the view counter already uses), one hash per listing,
 * one field per GitHub account. It is NOT on chain and no NEAR key signs anything: the server
 * holds no NEAR key, and NH-105's `maker/` rows are a separate, later step.
 *
 * What is kept: GitHub login, numeric id, the repository, how ownership was established, and the
 * time. All of it is already public on GitHub. The OAuth token is used for two API calls inside
 * the callback and then dropped: never stored, never sent to the browser.
 *
 * A NEAR account can then be linked to the claim with a row that account signs: lib/claim-link.mjs.
 *
 * This file is the pure part (no network, no env) so it is unit tested; lib/claims.ts does the I/O.
 */
import { createHash } from 'node:crypto';
import { githubSlug } from './repo-check.mjs';
import { isLinkCode, isNearAccountId } from './claim-link.mjs';

export const CLAIM_COOKIE = 'nh_claim';
/** Seconds a started claim may take to come back from GitHub. */
export const CLAIM_STATE_TTL_SECONDS = 600;
export const CLAIM_ACTIONS = /** @type {const} */ (['claim', 'remove']);

const ID_RE = /^[0-9a-z-]{8,64}$/i;
const STATE_RE = /^[0-9a-f]{32}$/;
const VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/;
const LOGIN_RE = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

/** Redis hash holding one listing's claims: field = GitHub numeric id, value = JSON record. */
export function claimKey(submissionId) {
  if (typeof submissionId !== 'string' || !ID_RE.test(submissionId)) {
    throw new Error(`not a submission id: ${String(submissionId)}`);
  }
  return `nh:claims:${submissionId.toLowerCase()}`;
}

/** `owner/repo` of the listing's GitHub repository, or null when it has none (not claimable). */
export function claimableRepo(project) {
  return githubSlug(project?.repository_url ?? null);
}

/**
 * Cookie value tying the browser that started a claim to the callback that finishes it. `verifier`
 * is the PKCE secret: GitHub only exchanges the code for whoever holds it, i.e. this browser.
 */
export function encodeState({ state, action, id, verifier }) {
  return `${state}.${action}.${id}.${verifier}`;
}

/** PKCE S256: the challenge sent to GitHub for a verifier kept in the cookie. */
export function pkceChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * @param {unknown} cookie
 * @returns {{ state: string, action: 'claim'|'remove', id: string, verifier: string } | null}
 */
export function decodeState(cookie) {
  if (typeof cookie !== 'string') return null;
  const [state, action, id, verifier, ...rest] = cookie.split('.');
  if (
    rest.length || !STATE_RE.test(state ?? '') || !CLAIM_ACTIONS.includes(action) || !ID_RE.test(id ?? '') ||
    !VERIFIER_RE.test(verifier ?? '')
  ) return null;
  return { state, action, id, verifier };
}

/** Constant-time comparison of the `state` GitHub returned with the one in the cookie. */
export function sameState(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * GitHub's authorization page. No `scope`: the token can read public information only, which is
 * all the check needs, and the consent screen says so.
 */
export function authorizeUrl({ base = 'https://github.com', clientId, redirectUri, state, verifier }) {
  const u = new URL('/login/oauth/authorize', base);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', pkceChallenge(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('allow_signup', 'false');
  return u.toString();
}

/**
 * Does this GitHub user control this repository? Both arguments are GitHub API bodies fetched
 * with the user's own token (`GET /user`, `GET /repos/{owner}/{repo}`), so `repo.permissions` is
 * that user's permission on the repository.
 *
 * - `owner`: the repository belongs to the user's own account (compared by numeric id: logins
 *   can be renamed and reused).
 * - `collaborator`: someone else's or an organisation's repository on which the user can push.
 *   Read access is not enough: everyone has it on a public repository.
 *
 * @returns {'owner' | 'collaborator' | null}
 */
export function ownershipBasis(user, repo) {
  if (!Number.isInteger(user?.id) || !repo || typeof repo !== 'object') return null;
  if (repo.owner?.id === user.id) return 'owner';
  const p = repo.permissions;
  if (p && (p.admin === true || p.maintain === true || p.push === true)) return 'collaborator';
  return null;
}

/** The record stored for a verified claim. Throws on a GitHub body that is not a user. */
export function claimRecord({ user, repo, basis, now = new Date() }) {
  if (!Number.isInteger(user?.id) || typeof user.login !== 'string' || !LOGIN_RE.test(user.login)) {
    throw new Error('not a GitHub user');
  }
  if (basis !== 'owner' && basis !== 'collaborator') throw new Error('no ownership basis');
  return {
    github_id: user.id,
    github_login: user.login,
    repository: typeof repo?.full_name === 'string' ? repo.full_name : null,
    basis,
    verified_at: now.toISOString(),
  };
}

/**
 * Parse a Redis REST `HGETALL` reply (`{"result": ["field", "json", …]}`) into claims, oldest
 * first. Anything malformed is dropped: a bad row must never render as a maker.
 */
export function parseClaims(json) {
  const flat = Array.isArray(json?.result) ? json.result : [];
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    let c;
    try {
      c = JSON.parse(flat[i + 1]);
    } catch {
      continue;
    }
    if (
      !Number.isInteger(c?.github_id) || String(c.github_id) !== String(flat[i]) ||
      typeof c.github_login !== 'string' || !LOGIN_RE.test(c.github_login) ||
      (c.basis !== 'owner' && c.basis !== 'collaborator') ||
      typeof c.verified_at !== 'string' || Number.isNaN(Date.parse(c.verified_at))
    ) continue;
    // The NEAR link is kept only as a pair: an account without its code can never be shown.
    const linked = isNearAccountId(c.near_account) && isLinkCode(c.link_code);
    out.push({
      github_id: c.github_id,
      github_login: c.github_login,
      repository: typeof c.repository === 'string' ? c.repository : null,
      basis: c.basis,
      verified_at: c.verified_at,
      ...(linked ? { near_account: c.near_account, link_code: c.link_code } : {}),
    });
  }
  return out.sort((a, b) => a.verified_at.localeCompare(b.verified_at));
}

/** Outcomes the callback reports back to the project page as `?claim=…`. */
export const CLAIM_OUTCOMES = Object.freeze({
  verified: 'Checked with GitHub. You are now shown as a contact for this project.',
  removed: 'Your claim was removed.',
  not_owner: 'That GitHub account does not own this repository and cannot push to it, so nothing was recorded.',
  denied: 'GitHub sign-in was cancelled. Nothing was recorded.',
  expired: 'The sign-in took too long or was started in another browser. Please try again.',
  not_claimable: 'This listing has no GitHub repository to check against.',
  error: 'The check could not be completed. Nothing was recorded; please try again.',
});

/** The message for a `?claim=` value, or null for anything unknown. */
export function outcomeMessage(code) {
  return typeof code === 'string' && Object.hasOwn(CLAIM_OUTCOMES, code) ? CLAIM_OUTCOMES[code] : null;
}
