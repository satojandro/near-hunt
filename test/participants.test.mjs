// NH-112: the people strip counts signed rows, not logins. These tests pin the two things that
// could make the number dishonest: counting deleted rows, and counting strangers' junk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { participantsFrom, participantsLabel } from '../lib/participants.mjs';

const row = (predecessor_id, key, value = {}, block_height = 100) => ({ predecessor_id, key, value, block_height });

test('one account with three votes is one participant', () => {
  const out = participantsFrom([
    row('alice.near', 'vote/a'),
    row('alice.near', 'vote/b'),
    row('alice.near', 'vote/c'),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].votes, 3);
  assert.equal(out[0].comments, 0);
});

test('votes and comments from different accounts are counted separately', () => {
  const out = participantsFrom([
    row('alice.near', 'vote/a', {}, 10),
    row('bob.near', 'comment/a/1', { text: 'hi' }, 20),
    row('bob.near', 'vote/b', {}, 30),
  ]);
  assert.deepEqual(out.map((p) => [p.account_id, p.votes, p.comments]), [
    ['bob.near', 1, 1],
    ['alice.near', 1, 0],
  ]);
});

test('most recently active first, ties by account id', () => {
  const out = participantsFrom([
    row('zoe.near', 'vote/a', {}, 5),
    row('alice.near', 'vote/b', {}, 5),
    row('mia.near', 'vote/c', {}, 9),
  ]);
  assert.deepEqual(out.map((p) => p.account_id), ['mia.near', 'alice.near', 'zoe.near']);
});

test('a deleted vote or comment is not participation', () => {
  const out = participantsFrom([
    row('gone.near', 'vote/a', null),
    row('gone.near', 'comment/a/1', null),
    row('here.near', 'vote/b', {}),
  ]);
  assert.deepEqual(out.map((p) => p.account_id), ['here.near']);
});

test('rows of any other kind are ignored', () => {
  const out = participantsFrom([
    row('squatter.near', 'project/abc', {}),
    row('squatter.near', 'sponsor/x', {}),
    row('stranger.near', 'vote-like-but-not', {}),
  ]);
  assert.equal(out.length, 0);
});

test('malformed rows never throw', () => {
  assert.deepEqual(participantsFrom(undefined), []);
  assert.deepEqual(participantsFrom([null, {}, { predecessor_id: 5, key: 'vote/a' }, { key: 'vote/a' }]), []);
});

test('the label says what was signed, recently, and never "logged in"', () => {
  assert.equal(participantsLabel(0), null);
  assert.equal(participantsLabel(1), '1 person has voted or commented recently');
  assert.equal(participantsLabel(12), '12 people have voted or commented recently');
  assert.doesNotMatch(participantsLabel(12) ?? '', /log/i);
});

test('the window drops rows signed before it and rows with no date', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  const ns = (iso) => String(Date.parse(iso)) + '000000';
  const rows = [
    { predecessor_id: 'old.near', key: 'vote/a', value: {}, block_height: 1, block_timestamp: ns('2026-10-01T00:00:00Z') },
    { predecessor_id: 'new.near', key: 'vote/b', value: {}, block_height: 2, block_timestamp: ns('2026-11-09T11:00:00Z') },
    { predecessor_id: 'undated.near', key: 'vote/c', value: {}, block_height: 3 },
  ];
  const out = participantsFrom(rows, { sinceMs: now - 7 * 24 * 60 * 60 * 1000 });
  assert.deepEqual(out.map((p) => p.account_id), ['new.near']);
});

test('no window means every dated and undated live row counts', () => {
  const rows = [
    { predecessor_id: 'a.near', key: 'vote/a', value: {}, block_height: 1 },
    { predecessor_id: 'b.near', key: 'comment/a/1', value: { text: 'x' }, block_height: 2 },
  ];
  assert.equal(participantsFrom(rows).length, 2);
});
