import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TRACK_TINT, tintClass, tintIndex } from '../lib/tints.mjs';

// The mapping is a design decision from docs/mockups/themes/README.md §3, not a derived value.
test('track tints follow the mockup table', () => {
  const expected = {
    security: 1, agents: 2, privacy: 3, business: 4, realworld: 5, open: 6,
    defi: 5, thesis: 6, swarms: 2, nfts: 6, games: 1, social: 4, memecoins: 3,
  };
  assert.deepEqual(TRACK_TINT, expected);
});

test('every track slug the site labels has a tint, and tints stay in 1..6', () => {
  const labelled = ['agents', 'business', 'defi', 'games', 'memecoins', 'nfts', 'open',
    'privacy', 'realworld', 'security', 'social', 'swarms', 'thesis'];
  for (const slug of labelled) {
    const n = tintIndex(slug);
    assert.ok(n >= 1 && n <= 6, `${slug} → ${n}`);
    assert.equal(tintClass(slug), `tint-${n}`);
  }
});

test('an unknown track still renders, in tint 1', () => {
  assert.equal(tintIndex('quantum'), 1);
  assert.equal(tintClass('quantum'), 'tint-1');
  assert.equal(tintIndex(undefined), 1);
});
