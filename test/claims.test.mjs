// NH-119: GitHub-verified claims. The rules that decide who is shown as a maker, without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeUrl, claimKey, claimRecord, claimableRepo, claimRowLabel, decodeState, encodeState,
  githubHosts, outcomeMessage, ownershipBasis, parseClaims, sameState,
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

// --- Linking a NEAR account (lib/claim-link.mjs) ---------------------------------------------
import { isNearAccountId, linkedAccount, makerKey, makerTransaction, rowLinks, sendMakerRow } from '../lib/claim-link.mjs';

const CODE = 'ab'.repeat(16);
const row = (o = {}) => ({ key: `maker/${ID}`, predecessor_id: 'alice.near', value: { code: CODE }, ...o });

test('the maker write is one zero-deposit call to the vote account', () => {
  const tx = makerTransaction({ account: 'nearhunt.near', submissionId: ID, code: CODE });
  assert.equal(tx.receiverId, 'nearhunt.near');
  assert.deepEqual(tx.actions[0].params.args, { [`maker/${ID}`]: { code: CODE } });
  assert.equal(tx.actions[0].params.methodName, '__fastdata_kv');
  assert.equal(tx.actions[0].params.deposit, '0');
  assert.throws(() => makerTransaction({ account: 'nearhunt.near', submissionId: ID, code: 'nope' }));
  assert.throws(() => makerKey('a/b'));
});

test('a row links only its own writer, this project and the issued code', () => {
  const q = { submissionId: ID, account: 'alice.near', code: CODE };
  assert.equal(rowLinks([row()], q), true);
  assert.equal(rowLinks([row({ predecessor_id: 'mallory.near' })], q), false, 'someone else copied the code');
  assert.equal(rowLinks([row({ value: { code: 'cd'.repeat(16) } })], q), false, 'a code the server did not issue');
  assert.equal(rowLinks([row({ value: { code: CODE, account: 'alice.near' }, predecessor_id: 'mallory.near' })], q), false, 'an account id inside the value is not the writer');
  assert.equal(rowLinks([row({ key: 'maker/00000000-other' })], q), false, 'another project');
  assert.equal(rowLinks([row({ value: null })], q), false, 'withdrawn');
  assert.equal(rowLinks([row({ value: [CODE] })], q), false);
  assert.equal(rowLinks([], q), false);
  assert.equal(rowLinks(null, q), false);
  assert.equal(rowLinks([row()], { ...q, account: 'Not An Account' }), false);
});

test('a stored link is shown only while the chain still agrees', () => {
  const claim = { near_account: 'alice.near', link_code: CODE };
  assert.equal(linkedAccount(claim, [row()], ID), 'alice.near');
  assert.equal(linkedAccount(claim, [row({ value: null })], ID), null);
  assert.equal(linkedAccount(claim, [], ID), null);
  assert.equal(linkedAccount({ near_account: 'alice.near' }, [row()], ID), null);
  assert.equal(linkedAccount({}, [row()], ID), null);
});

test('stored claims keep the NEAR link only as a valid pair', () => {
  const base = { github_id: 42, github_login: 'octo-maker', basis: 'owner', verified_at: '2026-11-11T12:00:00.000Z' };
  const parse = (extra) => parseClaims({ result: ['42', JSON.stringify({ ...base, ...extra })] })[0];
  assert.equal(parse({ near_account: 'alice.near', link_code: CODE }).near_account, 'alice.near');
  assert.equal('near_account' in parse({ near_account: 'alice.near' }), false);
  assert.equal('near_account' in parse({ near_account: '<img>', link_code: CODE }), false);
});

test('account ids', () => {
  for (const ok of ['alice.near', 'a-b_c.testnet', '0'.repeat(64)]) assert.equal(isNearAccountId(ok), true, ok);
  for (const bad of ['', 'A.near', 'a..near', '.near', 'a b', 'x'.repeat(65), null]) assert.equal(isNearAccountId(bad), false, String(bad));
});

test('sending falls back to the wallet once when the login key is gone, and never resends otherwise', async () => {
  const tx = makerTransaction({ account: 'nearhunt.near', submissionId: ID, code: CODE });
  let calls = 0;
  const failing = async () => { calls++; throw new Error('AccessKeyDoesNotExist'); };
  const wallet = async () => { calls++; return { transaction: { hash: 'abc' }, status: { Failure: { ActionError: { kind: { FunctionCallError: { CompilationError: { CodeDoesNotExist: {} } } } } } } }; };
  const sent = await sendMakerRow({ send: failing, fallbackSend: () => wallet, transaction: tx });
  assert.equal(sent.kind, 'written');
  assert.equal(calls, 2);
  const declined = await sendMakerRow({ send: async () => { throw new Error('User rejected the request'); }, fallbackSend: () => wallet, transaction: tx });
  assert.equal(declined.kind, 'rejected');
  assert.equal(calls, 2);
});

/**
 * The GitHub hosts decide where `client_secret` and the user's code are sent, and where the
 * ownership answer comes from. A stray override in a deployment would let a stand-in API approve
 * any claim for any repository, so the override must be impossible without the test flag.
 */
test('the GitHub hosts are not overridable without the test flag', () => {
  const hostile = {
    GITHUB_OAUTH_BASE_URL: 'https://github.example.test',
    GITHUB_API_BASE_URL: 'https://api.github.example.test',
  };
  assert.deepEqual(githubHosts(hostile), {
    web: 'https://github.com',
    api: 'https://api.github.com',
  });
  assert.deepEqual(githubHosts({ ...hostile, CLAIMS_TEST_HOSTS: '0' }), {
    web: 'https://github.com',
    api: 'https://api.github.com',
  });
  // The flag is what a stand-in run sets; it is not something a deployment has any use for.
  assert.deepEqual(githubHosts({ ...hostile, CLAIMS_TEST_HOSTS: '1' }), {
    web: 'https://github.example.test',
    api: 'https://api.github.example.test',
  });
  assert.deepEqual(githubHosts(undefined), { web: 'https://github.com', api: 'https://api.github.com' });
});

/**
 * The card lays a claim row out as spans separated by CSS `gap`, which the accessibility tree does
 * not see, so the row read as one word: "@aliceowns … on 2026-11-11NEAR account …". This label is
 * the row's accessible name; it is pinned here so a restyle cannot quietly drop it back.
 */
test('a claim row reads as punctuated sentences, not one word', () => {
  const owner = {
    github_login: 'alice', basis: 'owner', verified_at: '2026-11-11T09:00:00.000Z',
  };
  assert.equal(
    claimRowLabel(owner),
    '@alice owns the repository, checked with GitHub on 2026-11-11.',
  );
  assert.equal(
    claimRowLabel({ ...owner, basis: 'collaborator' }),
    '@alice can push to the repository, checked with GitHub on 2026-11-11.',
  );
  assert.equal(
    claimRowLabel({ ...owner, near_account: 'alice.near' }),
    '@alice owns the repository, checked with GitHub on 2026-11-11. NEAR account alice.near, linked by a row that account signed.',
  );
  // Never "@undefined", "NaN" or a date glued to the next word: even a malformed row reads as a
  // sentence, and it never borrows "owns".
  assert.equal(claimRowLabel(null), '@ is listed for the repository, checked with GitHub on .');
  assert.doesNotMatch(claimRowLabel(null), /undefined|NaN/);
  // The date may end a sentence, but never run straight into the next word.
  assert.doesNotMatch(claimRowLabel(owner), /\d{4}-\d{2}-\d{2}(?![.\s])/);
  assert.match(claimRowLabel({ ...owner, near_account: 'alice.near' }), /\d{2}\. NEAR account/);
});
