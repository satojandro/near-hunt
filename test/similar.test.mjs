import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMILAR_LIMIT, similarProjects } from '../lib/similar.mjs';

const P = (id, tracks, name = id) => ({ submission_id: id, name, tracks });

test('most shared tracks first, never the project itself, never zero overlap', () => {
  const me = P('me', ['ai', 'defi', 'privacy']);
  const all = [
    me,
    P('one', ['ai']),
    P('three', ['ai', 'defi', 'privacy', 'games']),
    P('two', ['defi', 'privacy']),
    P('none', ['games']),
  ];
  const out = similarProjects(me, all);
  assert.deepEqual(out.map((x) => x.project.submission_id), ['three', 'two', 'one']);
  assert.deepEqual(out[0].shared, ['ai', 'defi', 'privacy']);
});

test('deterministic tie-break: fewer tracks, then name, then id; input order does not matter', () => {
  const me = P('me', ['ai']);
  const all = [P('z', ['ai'], 'Beta'), P('y', ['ai', 'games'], 'Alpha'), P('x', ['ai'], 'beta'), P('w', ['ai'], 'Alpha')];
  const a = similarProjects(me, all).map((x) => x.project.submission_id);
  const b = similarProjects(me, [...all].reverse()).map((x) => x.project.submission_id);
  assert.deepEqual(a, ['w', 'x', 'z', 'y']);
  assert.deepEqual(b, a);
});

test('limit, empty tracks, duplicates and junk', () => {
  const me = P('me', ['ai']);
  const many = Array.from({ length: 10 }, (_, i) => P(`p${i}`, ['ai']));
  assert.equal(SIMILAR_LIMIT, 4);
  assert.equal(similarProjects(me, many).length, 4);
  assert.equal(similarProjects(me, many, 2).length, 2);
  assert.deepEqual(similarProjects(P('me', []), many), []);
  assert.deepEqual(similarProjects(me, null), []);
  const dup = similarProjects(me, [P('a', ['ai', 'ai']), P('a', ['ai']), null, { name: 'no id' }]);
  assert.deepEqual(dup.map((x) => [x.project.submission_id, x.shared]), [['a', ['ai']]]);
});
