import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchProfiles, normaliseProfile, profileApiUrl, profileUrl } from '../lib/social.mjs';

// Shaped like `GET https://api2.near.social/v1/accounts/mob.near` and `/root.near` on 2026-11-08.
const MOB = {
  account_id: 'mob.near', has_profile: true, name: 'Eugene The Dream', about: 'Founder of near.social and fastnear.com',
  avatar: 'fastfs://mob.near/social/media/16bf6b5c883730a8b4a6aaaa256aa08ec594933f1fe875f668ad18ba13b49f6c.webp',
  avatar_url: 'https://main.fastfs.io/mob.near/social/media/16bf6b5c883730a8b4a6aaaa256aa08ec594933f1fe875f668ad18ba13b49f6c.webp',
  links: {}, counts: { followers: 48, following: 129, posts: 4 }, joined_at: 1790730707115,
};
const NO_PROFILE = {
  account_id: 'root.near', has_profile: false, name: null, about: null, avatar: null, avatar_url: null,
  links: {}, counts: { followers: 17, following: 0, posts: 0 }, joined_at: null,
};

test('profile urls', () => {
  assert.equal(profileApiUrl('mob.near'), 'https://api2.near.social/v1/accounts/mob.near');
  assert.equal(profileUrl('mob.near'), 'https://near.social/mob.near');
});

test('normaliseProfile keeps name and https avatar, and the requested account id', () => {
  assert.deepEqual(normaliseProfile(MOB, 'mob.near'), {
    account_id: 'mob.near', name: 'Eugene The Dream', avatar_url: MOB.avatar_url,
  });
  assert.deepEqual(normaliseProfile(NO_PROFILE, 'root.near'), { account_id: 'root.near', name: null, avatar_url: null });
  // A response naming a different account does not change who we asked about.
  assert.equal(normaliseProfile({ ...MOB, account_id: 'evil.near' }, 'mob.near').account_id, 'mob.near');
  // Non-https avatars are dropped.
  assert.equal(normaliseProfile({ avatar_url: 'javascript:alert(1)' }, 'a.near').avatar_url, null);
  assert.equal(normaliseProfile({ avatar_url: 'http://x.example/a.png' }, 'a.near').avatar_url, null);
  assert.deepEqual(normaliseProfile(null, 'a.near'), { account_id: 'a.near', name: null, avatar_url: null });
});

test('fetchProfiles: one request per valid unique account, order kept, cache + timeout options', async () => {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const body = url.endsWith('/mob.near') ? MOB : NO_PROFILE;
    return { ok: true, json: async () => body };
  };
  const r = await fetchProfiles(['mob.near', 'root.near', 'mob.near', 'Bad Id'], { fetchImpl: impl });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.profiles.map((p) => [p.account_id, p.name]), [['mob.near', 'Eugene The Dream'], ['root.near', null]]);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.next.revalidate, 600);
});

test('fetchProfiles never throws: partial failure keeps the account, total failure is status error', async () => {
  const partial = async (url) => {
    if (url.endsWith('/mob.near')) return { ok: true, json: async () => MOB };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const r1 = await fetchProfiles(['mob.near', 'root.near'], { fetchImpl: partial });
  assert.equal(r1.status, 'ok');
  assert.deepEqual(r1.profiles[1], { account_id: 'root.near', name: null, avatar_url: null });

  const down = async () => { throw new TypeError('fetch failed'); };
  const r2 = await fetchProfiles(['mob.near', 'root.near'], { fetchImpl: down });
  assert.equal(r2.status, 'error');
  assert.deepEqual(r2.profiles.map((p) => p.account_id), ['mob.near', 'root.near']);

  assert.deepEqual(await fetchProfiles([], { fetchImpl: down }), { status: 'ok', profiles: [] });
});
