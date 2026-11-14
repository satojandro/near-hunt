import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearerMatches } from '../lib/bearer.mjs';

test('bearerMatches accepts exactly "Bearer <secret>"', () => {
  assert.equal(bearerMatches('Bearer s3cret', 's3cret'), true);
  assert.equal(bearerMatches('Bearer s3cre', 's3cret'), false, 'a prefix is not the secret');
  assert.equal(bearerMatches('Bearer s3cret ', 's3cret'), false);
  assert.equal(bearerMatches('bearer s3cret', 's3cret'), false);
  assert.equal(bearerMatches('s3cret', 's3cret'), false);
});

test('bearerMatches never matches without a secret or a header', () => {
  assert.equal(bearerMatches('Bearer ', ''), false, 'an unset secret must not open the route');
  assert.equal(bearerMatches('Bearer undefined', undefined), false);
  assert.equal(bearerMatches(null, 's3cret'), false);
  assert.equal(bearerMatches(undefined, 's3cret'), false);
});
