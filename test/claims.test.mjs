// NH-119: GitHub-verified claims. The rules that decide who is shown as a maker, without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeUrl, claimKey, claimRecord, claimableRepo, decodeState, encodeState, outcomeMessage,
  ownershipBasis, parseClaims, sameState,
} from '../lib/claims.mjs';

const ID = '81245941-74f3-49b1-a897-4524fec4f0bf';
const STATE = '0123456789abcdef0123456789abcdef';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const user = { id: 42, login: 'octo-maker' };

test('only a listing with a GitHub repository is claimable', () => {
  assert.equal(claimableRepo({ repository_url: 'https://github.com/Octo/Repo.git' }), 'Octo/Repo');
  assert.equal(claimableRepo({ repository_url: 'https://gitlab.com/octo/repo' }), null);
  assert.equal(claimableRepo({ repository_url: null }), null);
  assert.equal(claimableRepo(null), null);
});

test('store keys accept submission ids only', () => {
  assert.equal(claimKey(ID.toUpperCase()), `nh:claims:${ID}`);
  assert.throws(() => claimKey('x'));
  assert.throws(() => claimKey(`${ID}/../other`));
});

test('the state cookie round-trips and rejects anything else', () => {
  const cookie = encodeState({ state: STATE, action: 'remove', id: ID, verifier: VERIFIER });
  assert.deepEqual(decodeState(cookie), { state: STATE, action: 'remove', id: ID, verifier: VERIFIER });
  for (const bad of [undefined, '', `${STATE}.claim.${ID}`, `${STATE}.steal.${ID}.${VERIFIER}`, `short.claim.${ID}.${VERIFIER}`, `${STATE}.claim.${ID}.short`, `${cookie}.extra`]) {
    assert.equal(decodeState(bad), null);
  }
});

test('state comparison is exact', () => {
  assert.equal(sameState(STATE, STATE), true);
  assert.equal(sameState(STATE, STATE.replace('0', '1')), false);
  assert.equal(sameState(null, STATE), false);
  assert.equal(sameState('', ''), true);
});

test('the authorization URL asks for no scope and carries the PKCE challenge', () => {
  const u = new URL(authorizeUrl({ clientId: 'abc', redirectUri: 'https://nearhunt.xyz/api/claim/callback', state: STATE, verifier: VERIFIER }));
  // RFC 7636 appendix B: this verifier hashes to this challenge.
  assert.equal(u.searchParams.get('code_challenge'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.search.includes(VERIFIER), false);
  assert.equal(u.origin + u.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'), 'abc');
  assert.equal(u.searchParams.get('state'), STATE);
  assert.equal(u.searchParams.get('redirect_uri'), 'https://nearhunt.xyz/api/claim/callback');
  assert.equal(u.searchParams.has('scope'), false);
});

test('the repository owner is a maker, by numeric id not by name', () => {
  assert.equal(ownershipBasis(user, { owner: { id: 42, login: 'renamed' } }), 'owner');
  assert.equal(ownershipBasis(user, { owner: { id: 7, login: 'octo-maker' } }), null);
});

test('push access on someone else\'s repository counts; read access does not', () => {
  const repo = (permissions) => ({ owner: { id: 7 }, permissions });
  assert.equal(ownershipBasis(user, repo({ admin: false, push: true, pull: true })), 'collaborator');
  assert.equal(ownershipBasis(user, repo({ admin: true })), 'collaborator');
  assert.equal(ownershipBasis(user, repo({ maintain: true })), 'collaborator');
  assert.equal(ownershipBasis(user, repo({ admin: false, push: false, pull: true })), null);
  assert.equal(ownershipBasis(user, repo({ push: 'true' })), null);
  assert.equal(ownershipBasis(user, repo(undefined)), null);
});

test('no repository or no user means no basis', () => {
  assert.equal(ownershipBasis(user, null), null);
  assert.equal(ownershipBasis(null, { owner: { id: 42 } }), null);
  assert.equal(ownershipBasis({ login: 'x' }, { owner: {} }), null);
});

test('a claim record holds public GitHub facts only', () => {
  const rec = claimRecord({
    user: { ...user, email: 'private@example.com', name: 'Real Name' },
    repo: { full_name: 'octo-maker/repo' }, basis: 'owner', now: new Date('2026-11-11T12:00:00Z'),
  });
  assert.deepEqual(rec, {
    github_id: 42, github_login: 'octo-maker', repository: 'octo-maker/repo', basis: 'owner',
    verified_at: '2026-11-11T12:00:00.000Z',
  });
  assert.throws(() => claimRecord({ user: { id: 1, login: '<script>' }, repo: {}, basis: 'owner' }));
  assert.throws(() => claimRecord({ user, repo: {}, basis: null }));
});

test('stored claims are parsed oldest first and bad rows are dropped', () => {
  const row = (o) => JSON.stringify({ github_id: 42, github_login: 'octo-maker', basis: 'owner', verified_at: '2026-11-11T12:00:00.000Z', ...o });
  const claims = parseClaims({ result: [
    '42', row({}),
    '9', row({ github_id: 9, github_login: 'early', basis: 'collaborator', verified_at: '2026-11-10T00:00:00.000Z' }),
    '5', row({ github_id: 6 }),                      // field and record disagree
    '8', row({ github_id: 8, github_login: 'a b' }), // not a login
    '3', row({ github_id: 3, basis: 'friend' }),
    '2', 'not json',
  ] });
  assert.deepEqual(claims.map((c) => c.github_login), ['early', 'octo-maker']);
  assert.deepEqual(parseClaims({ result: null }), []);
  assert.deepEqual(parseClaims(undefined), []);
});

test('only known outcomes produce a message', () => {
  assert.match(outcomeMessage('verified'), /contact/);
  assert.equal(outcomeMessage('<b>hi</b>'), null);
  assert.equal(outcomeMessage('constructor'), null);
  assert.equal(outcomeMessage(undefined), null);
});
