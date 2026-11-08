import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABOUT_MAX,
  accountUpvotes,
  fetchAccountProfile,
  normaliseAccountProfile,
  nsToMs,
  readAccountVoteRows,
} from '../lib/account.mjs';

// Shaped like `GET https://api2.near.social/v1/accounts/mob.near` and `/root.near` on 2026-11-08.
const MOB = {
  account_id: 'mob.near', has_profile: true, name: 'Eugene The Dream', about: 'Founder of near.social and fastnear.com',
  avatar_url: 'https://main.fastfs.io/mob.near/social/media/16bf.webp',
  links: {}, counts: { followers: 48, following: 129, posts: 4 }, joined_at: 1790730707115,
};
const NO_PROFILE = {
  account_id: 'root.near', has_profile: false, name: null, about: null, avatar: null, avatar_url: null,
  links: {}, counts: { followers: 17, following: 0, posts: 0 }, joined_at: null,
};

test('normaliseAccountProfile: name, https avatar, about, counts', () => {
  assert.deepEqual(normaliseAccountProfile(MOB, 'mob.near'), {
    account_id: 'mob.near', name: 'Eugene The Dream', avatar_url: MOB.avatar_url, has_profile: true,
    about: 'Founder of near.social and fastnear.com', followers: 48, posts: 4,
  });
  assert.deepEqual(normaliseAccountProfile(NO_PROFILE, 'root.near'), {
    account_id: 'root.near', name: null, avatar_url: null, has_profile: false, about: null, followers: 17, posts: 0,
  });
  assert.deepEqual(normaliseAccountProfile(null, 'a.near'), {
    account_id: 'a.near', name: null, avatar_url: null, has_profile: false, about: null, followers: null, posts: null,
  });
});

test('normaliseAccountProfile: never trusts the response account id, drops non-https avatars and odd counts', () => {
  const p = normaliseAccountProfile({ ...MOB, account_id: 'evil.near', avatar_url: 'http://x/a.png', counts: { followers: '12', posts: -1 } }, 'mob.near');
  assert.equal(p.account_id, 'mob.near');
  assert.equal(p.avatar_url, null);
  assert.equal(p.followers, 12);
  assert.equal(p.posts, null);
});

test('normaliseAccountProfile: about is plain text, one line, truncated', () => {
  const p = normaliseAccountProfile({ about: '<script>alert(1)</script>Hi **there**\n\nsecond line' }, 'a.near');
  assert.ok(!p.about.includes('<'));
  assert.ok(!p.about.includes('\n'));
  assert.match(p.about, /Hi there second line/);
  const long = normaliseAccountProfile({ about: 'word '.repeat(200) }, 'a.near').about;
  assert.ok(Array.from(long).length <= ABOUT_MAX + 1);
  assert.ok(long.endsWith('…'));
});

test('fetchAccountProfile: one request, never throws, rejects invalid ids', async () => {
  const calls = [];
  const ok = await fetchAccountProfile('mob.near', {
    fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => MOB }; },
  });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.profile.name, 'Eugene The Dream');
  assert.equal(calls[0].url, 'https://api2.near.social/v1/accounts/mob.near');
  assert.ok(calls[0].init.signal);

  const down = await fetchAccountProfile('mob.near', { fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(down.status, 'error');
  assert.equal(down.profile.account_id, 'mob.near');
  assert.equal(down.profile.name, null);

  const http = await fetchAccountProfile('mob.near', { fetchImpl: async () => ({ ok: false, status: 502 }) });
  assert.equal(http.status, 'error');

  await assert.rejects(() => fetchAccountProfile('NOT_VALID', { fetchImpl: async () => assert.fail('no fetch') }));
});

test('readAccountVoteRows: writer-scoped vote/ prefix read, foreign rows dropped', async () => {
  const calls = [];
  const rows = await readAccountVoteRows({
    accountId: 'alice.near',
    account: 'nearhunt.near',
    network: 'mainnet',
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        json: async () => ({
          entries: [
            { predecessor_id: 'alice.near', key: 'vote/a', value: {}, block_height: 1 },
            { predecessor_id: 'mallory.near', key: 'vote/b', value: {}, block_height: 2 },
          ],
        }),
      };
    },
  });
  assert.equal(calls[0].url, 'https://kv.main.fastnear.com/v0/latest/nearhunt.near/alice.near');
  assert.equal(calls[0].body.key_prefix, 'vote/');
  assert.deepEqual(rows.map((r) => r.key), ['vote/a']);
  assert.throws(() => readAccountVoteRows({ accountId: 'Bad Id' }));
});

test('readAccountVoteRows: a KV failure rejects (the page shows "unavailable", not an empty list)', async () => {
  await assert.rejects(() =>
    readAccountVoteRows({ accountId: 'alice.near', fetchImpl: async () => ({ ok: false, status: 503 }) }),
  );
});

const P = (id, name = id) => ({ submission_id: id, name, tracks: [] });

test('accountUpvotes: active votes by this writer on live projects, newest block first', () => {
  const rows = [
    { predecessor_id: 'alice.near', key: 'vote/old', value: {}, block_height: 10, block_timestamp: 1_000_000_000 },
    { predecessor_id: 'alice.near', key: 'vote/new', value: {}, block_height: 30, block_timestamp: 3_000_000_000 },
    { predecessor_id: 'alice.near', key: 'vote/withdrawn', value: null, block_height: 40 },
    { predecessor_id: 'alice.near', key: 'vote/array', value: [], block_height: 41 },
    { predecessor_id: 'alice.near', key: 'vote/nested/x', value: {}, block_height: 42 },
    { predecessor_id: 'alice.near', key: 'vote/', value: {}, block_height: 43 },
    { predecessor_id: 'alice.near', key: 'vote/ghost', value: {}, block_height: 44 },
    // Another writer claiming to be alice inside the value: not alice's vote.
    { predecessor_id: 'mallory.near', key: 'vote/mid', value: { voter: 'alice.near' }, block_height: 50 },
    { predecessor_id: 'alice.near', key: 'vote/mid', value: {}, block_height: 20 },
  ];
  const projects = [P('old'), P('new'), P('mid'), P('withdrawn'), P('array')];
  const out = accountUpvotes(rows, 'alice.near', projects);
  assert.deepEqual(out.map((v) => v.id), ['new', 'mid', 'old']);
  assert.equal(out[0].project.submission_id, 'new');
  assert.equal(out[0].block_height, 30);
  assert.equal(out[0].block_timestamp, 3_000_000_000);
  assert.equal(out[1].block_timestamp, null);
});

test('accountUpvotes: latest row per key wins; ties broken by id', () => {
  const rows = [
    { predecessor_id: 'a.near', key: 'vote/x', value: {}, block_height: 5 },
    { predecessor_id: 'a.near', key: 'vote/x', value: null, block_height: 6 },
    { predecessor_id: 'a.near', key: 'vote/c', value: {}, block_height: 7 },
    { predecessor_id: 'a.near', key: 'vote/b', value: {}, block_height: 7 },
  ];
  assert.deepEqual(accountUpvotes(rows, 'a.near', [P('x'), P('b'), P('c')]).map((v) => v.id), ['b', 'c']);
  assert.deepEqual(accountUpvotes(null, 'a.near', null), []);
});

test('nsToMs', () => {
  assert.equal(nsToMs(1794130685534821468), 1794130685534);
  assert.equal(nsToMs(null), null);
  assert.equal(nsToMs('x'), null);
});
