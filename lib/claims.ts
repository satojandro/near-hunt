import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { claimKey, githubHosts, parseClaims } from './claims.mjs';
import type { Claim } from './claims.mjs';
import { LINK_TTL_SECONDS, isLinkCode, linkedAccount, makerKey, rowLinks } from './claim-link.mjs';
import type { MakerRow } from './claim-link.mjs';
import { readLatest } from './kv.mjs';
import { NETWORK, VOTE_ACCOUNT } from './network.mjs';

// NH-119: the I/O half of GitHub-verified claims. What is stored and why: lib/claims.mjs.

// Same store and the same three spellings as the view counter (app/api/views/route.ts).
const REST_URL =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ??
  process.env.UPSTASH_REDIS_REST_URL ??
  process.env.KV_REST_API_URL;
const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  process.env.KV_REST_API_TOKEN;

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
// Overridable only behind CLAIMS_TEST_HOSTS=1: see githubHosts (lib/claims.mjs) for why.
const hosts = githubHosts(process.env);
export const GITHUB_WEB = hosts.web;
export const GITHUB_API = hosts.api;

/** Claims need both the OAuth app and the store. Without either the card shows no button. */
export const claimsConfigured = Boolean(REST_URL && REST_TOKEN && CLIENT_ID && CLIENT_SECRET);
export const githubClientId = CLIENT_ID ?? '';

async function redis(command: (string | number)[], timeoutMs = 4000) {
  const res = await fetch(REST_URL as string, {
    method: 'POST',
    headers: { authorization: `Bearer ${REST_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return res.json();
}

/**
 * The verified makers of one listing. `available: false` when the store is not configured or did
 * not answer: the page then shows no makers rather than "nobody has claimed this".
 */
export async function getClaims(submissionId: string): Promise<{ claims: Claim[]; available: boolean }> {
  if (!REST_URL || !REST_TOKEN) return { claims: [], available: false };
  try {
    return { claims: parseClaims(await redis(['HGETALL', claimKey(submissionId)], 2500)), available: true };
  } catch (err) {
    console.error('[claims] read failed:', err instanceof Error ? err.message : err);
    return { claims: [], available: false };
  }
}

export async function saveClaim(submissionId: string, claim: Claim): Promise<void> {
  await redis(['HSET', claimKey(submissionId), String(claim.github_id), JSON.stringify(claim)]);
}

export async function removeClaim(submissionId: string, githubId: number): Promise<void> {
  await redis(['HDEL', claimKey(submissionId), String(githubId)]);
}

async function githubJson(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'near-hunt-claims',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`github ${path.split('/')[1]} ${res.status}`);
  return res.json();
}

/**
 * Exchange the OAuth `code`, ask GitHub who this is and what they may do on `slug`, then revoke
 * the token. The token never leaves this function.
 */
export async function githubIdentity(
  { code, verifier, redirectUri, slug }: { code: string; verifier: string; redirectUri: string; slug: string | null },
): Promise<{ user: unknown; repo: unknown }> {
  const res = await fetch(`${GITHUB_WEB}/login/oauth/access_token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, code_verifier: verifier, redirect_uri: redirectUri }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null;
  const token = body?.access_token;
  if (!res.ok || typeof token !== 'string' || !token) {
    throw new Error(`github token exchange failed: ${typeof body?.error === 'string' ? body.error : res.status}`);
  }
  try {
    const user = await githubJson('/user', token);
    // A repository that is gone or went private answers 404: no basis, not an error.
    const repo = slug ? await githubJson(`/repos/${slug}`, token).catch(() => null) : null;
    return { user, repo };
  } finally {
    // Best effort: the token has no scopes and is not kept, but there is no reason to leave it valid.
    await fetch(`${GITHUB_API}/applications/${CLIENT_ID}/token`, {
      method: 'DELETE',
      headers: {
        authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'near-hunt-claims',
      },
      body: JSON.stringify({ access_token: token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------
// Linking a NEAR account (steps 2-4, lib/claim-link.mjs)
// ---------------------------------------------------------------------------------------------

export interface PendingLink { id: string; github_id: number; github_login: string; code: string }

const linkStoreKey = (secret: string) => `nh:claimlink:${createHash('sha256').update(secret).digest('hex')}`;

/**
 * Step 2: after a passed GitHub check, issue the one-time code. Returns the cookie secret; the
 * store keeps only its hash, so a leaked store cannot be turned into a cookie.
 */
export async function issueLink(submissionId: string, claim: Claim): Promise<string> {
  const secret = randomBytes(32).toString('base64url');
  const link: PendingLink = {
    id: submissionId, github_id: claim.github_id, github_login: claim.github_login,
    code: randomBytes(16).toString('hex'),
  };
  await redis(['SET', linkStoreKey(secret), JSON.stringify(link), 'EX', LINK_TTL_SECONDS]);
  return secret;
}

export async function pendingLink(secret: string | undefined): Promise<PendingLink | null> {
  if (!secret || secret.length > 128 || !REST_URL || !REST_TOKEN) return null;
  try {
    const raw = (await redis(['GET', linkStoreKey(secret)]))?.result;
    const l = typeof raw === 'string' ? JSON.parse(raw) : null;
    return l && typeof l.id === 'string' && Number.isInteger(l.github_id) && isLinkCode(l.code) ? l : null;
  } catch {
    return null;
  }
}

/** Current `maker/{id}` rows, every writer. Read from the same account and network as votes. */
async function makerRows(submissionId: string, writer?: string): Promise<MakerRow[]> {
  const rows = await readLatest({
    account: VOTE_ACCOUNT, network: NETWORK, key: makerKey(submissionId), writer,
    fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000) }),
  });
  return rows.map(({ key, predecessor_id, value }) => ({ key, predecessor_id, value }));
}

/**
 * Step 3: the GitHub-checked browser (cookie `secret`) says "my NEAR account is `account`". True
 * only if the index shows that account's own row with the issued code. Then the claim gets the
 * account and the code, and the one-time link is spent.
 */
export async function confirmLink(secret: string | undefined, account: string): Promise<'linked' | 'pending' | 'expired'> {
  const link = await pendingLink(secret);
  if (!link) return 'expired';
  const rows = await makerRows(link.id, account);
  if (!rowLinks(rows, { submissionId: link.id, account, code: link.code })) return 'pending';

  const raw = (await redis(['HGET', claimKey(link.id), String(link.github_id)]))?.result;
  const [claim] = parseClaims({ result: [String(link.github_id), typeof raw === 'string' ? raw : ''] });
  // The GitHub claim was removed in the meantime: nothing to link to.
  if (!claim) return 'expired';
  await saveClaim(link.id, { ...claim, near_account: account, link_code: link.code });
  await redis(['DEL', linkStoreKey(secret as string)]);
  return 'linked';
}

/**
 * Step 4: claims as the page shows them. `near_account` survives only while that account's
 * current row still carries the claim's code; `link_code` never leaves the server.
 */
export async function getPublicClaims(
  submissionId: string,
): Promise<{ claims: Array<Omit<Claim, 'link_code'>>; available: boolean }> {
  const { claims, available } = await getClaims(submissionId);
  let rows: MakerRow[] = [];
  if (claims.some((c) => c.near_account)) {
    // If the index cannot be read, no account is shown: unknown is not "linked".
    rows = await makerRows(submissionId).catch(() => []);
  }
  return {
    available,
    claims: claims.map(({ link_code, near_account, ...c }) => {
      const account = linkedAccount({ near_account, link_code }, rows, submissionId);
      return account ? { ...c, near_account: account } : c;
    }),
  };
}
