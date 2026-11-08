import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImportOutput, hasPending, pendingMessage } from '../lib/feed-watch.mjs';

const output = (newCount, changed = 0) => `
source:  https://nearhackathon.com/api/projects
fetched: 283 projects (source reports 283)
chain:   280 project rows written by nearhunt.near on mainnet

plan:
  new:              ${newCount}
  changed:          ${changed}
  unchanged:        ${280 - newCount}
  missing from feed 0  (reported only, never deleted)
  deleted on chain  0  (tombstoned on purpose, not recreated)
`;

test('parses the importer counts', () => {
  assert.deepEqual(parseImportOutput(output(3)), {
    feed: 283,
    chain: 280,
    create: 3,
    changed: 0,
    unchanged: 277,
  });
});

test('nothing new means a silent tick', () => {
  const parsed = parseImportOutput(output(0));
  assert.equal(hasPending(parsed), false);
  assert.equal(pendingMessage(parsed), '');
});

test('new or changed records produce one actionable line', () => {
  assert.equal(hasPending(parseImportOutput(output(2, 1))), true);
  const msg = pendingMessage(parseImportOutput(output(2, 1)));
  assert.match(msg, /2 new, 1 changed/);
  assert.match(msg, /chain 280, feed 283/);
  assert.match(msg, /owner approval/);
});

test('unparseable output is not mistaken for a pending feed', () => {
  assert.equal(parseImportOutput('boom'), null);
  assert.equal(hasPending(null), false);
  assert.equal(pendingMessage(null), '');
});
