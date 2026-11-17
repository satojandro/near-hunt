import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveScore, groupByTrack, selectPicks, trackSlug } from '../lib/picks.mjs';

const R = (id, track, score, extra = {}) => ({
  project_id: id,
  name: extra.name ?? id,
  best_fit_track: track,
  gate_pass: true,
  weighted_score: score,
  human_score_override: null,
  scorecard: { one_line_thesis: `pitch ${id}` },
  near_primitives: ['NEAR Contracts'],
  judge_memo: 'private memo',
  peer_comparison: 'private comparison',
  ...extra,
});

test('cutoff plus the top project of every track', () => {
  const rows = [R('a', 'Games', '4.80'), R('b', 'Games', '4.20'), R('c', 'Social', '4.35'), R('d', 'Social', '4.10')];
  const ids = selectPicks(rows, { cutoff: 4.5 }).map((p) => p.submission_id);
  assert.deepEqual(ids, ['a', 'c']);
  assert.deepEqual(selectPicks(rows, { cutoff: 4.5, perTrackTop: false }).map((p) => p.submission_id), ['a']);
});

test('gate failures, hidden projects and NEAR Hunt itself are never picked', () => {
  const rows = [
    R('fail', 'Games', '4.9', { gate_pass: false }),
    R('hid', 'Games', '4.9'),
    R('self', 'Open Innovation', '5.0', { name: 'NEAR Hunt' }),
    R('ok', 'Games', '4.6'),
  ];
  const ids = selectPicks(rows, { hidden: { projects: [{ submission_id: 'hid' }] } }).map((p) => p.submission_id);
  assert.deepEqual(ids, ['ok']);
});

test('only projects with a listing, and the track top falls to the best listed one', () => {
  const rows = [R('unlisted', 'Games', '4.9'), R('listed', 'Games', '4.6'), R('low', 'Social', '4.3'), R('lower', 'Social', '4.2')];
  const ids = selectPicks(rows, { listed: ['listed', 'lower'] }).map((p) => p.submission_id);
  assert.deepEqual(ids, ['listed', 'lower']);
  assert.equal(selectPicks(rows).length, 3); // no `listed` given: no listing filter
});

test('the listing name replaces the reviewer name, and sorting follows it', () => {
  const rows = [R('a', 'T', '4.8', { name: 'near' }), R('b', 'T', '4.7', { name: 'zeta' })];
  const names = new Map([['a', 'Quiet Treasury'], ['b', '  ']]);
  assert.deepEqual(selectPicks(rows, { names }).map((p) => p.name), ['Quiet Treasury', 'zeta']);
});

test('one submission per duplicate cluster, the best scoring', () => {
  const rows = [R('x1', 'DeFi', '4.6'), R('x2', 'DeFi', '4.7'), R('y', 'DeFi', '4.55')];
  const duplicates = { clusters: [{ submissions: [{ submission_id: 'x1' }, { submission_id: 'x2' }] }] };
  assert.deepEqual(selectPicks(rows, { duplicates }).map((p) => p.submission_id).sort(), ['x2', 'y']);
});

test('public fields only, ordered by track then name, never by score', () => {
  const rows = [R('1', 'Zeta', '4.9', { name: 'beta' }), R('2', 'Alpha', '4.5', { name: 'Zed' }), R('3', 'Zeta', '4.6', { name: 'Alpha' })];
  const picks = selectPicks(rows);
  assert.deepEqual(picks.map((p) => p.name), ['Zed', 'Alpha', 'beta']);
  for (const p of picks) {
    assert.deepEqual(Object.keys(p).sort(), ['name', 'pitch', 'primitives', 'submission_id', 'track']);
  }
  assert.ok(!JSON.stringify(picks).includes('private'));
  assert.ok(!JSON.stringify(picks).includes('4.'));
});

test('the human override wins over the weighted score', () => {
  assert.equal(effectiveScore({ weighted_score: '4.2', human_score_override: '4.8' }), 4.8);
  assert.equal(effectiveScore({ weighted_score: '4.2', human_score_override: null }), 4.2);
  assert.equal(effectiveScore({}), null);
  const rows = [R('up', 'A', '4.0', { human_score_override: '4.7' }), R('top', 'A', '4.4'), R('down', 'B', '4.9', { human_score_override: '3.0' }), R('b2', 'B', '4.1')];
  assert.deepEqual(selectPicks(rows, { perTrackTop: false }).map((p) => p.submission_id), ['up']);
});

test('the result does not depend on input order', () => {
  const rows = [R('a', 'T', '4.6'), R('b', 'T', '4.6'), R('c', 'U', '4.2'), R('d', 'U', '4.2')];
  assert.deepEqual(selectPicks(rows), selectPicks([...rows].reverse()));
});

test('grouping and slugs', () => {
  const g = groupByTrack([{ track: 'A' }, { track: 'A' }, { track: 'B' }]);
  assert.deepEqual(g.map((x) => [x.track, x.items.length]), [['A', 2], ['B', 1]]);
  assert.equal(trackSlug('AI Security & Defense'), 'ai-security-defense');
  assert.deepEqual(selectPicks(null), []);
});
