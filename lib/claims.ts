import 'server-only';
import { claimKey, parseClaims } from './claims.mjs';
import type { Claim } from './claims.mjs';

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
/** Overridable so the flow can be exercised against a stand-in; unset in production. */
export const GITHUB_WEB = process.env.GITHUB_OAUTH_BASE_URL || 'https://github.com';
export const GITHUB_API = process.env.GITHUB_API_BASE_URL || 'https://api.github.com';

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
