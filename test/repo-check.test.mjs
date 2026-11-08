import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubSlug, verifyRepos } from '../lib/repo-check.mjs';

test('githubSlug accepts repository URLs only', () => {
  assert.equal(githubSlug('https://github.com/alice/project'), 'alice/project');
  assert.equal(githubSlug('https://www.github.com/alice/project/'), 'alice/project');
  assert.equal(githubSlug('https://github.com/alice/project.git'), 'alice/project');
  assert.equal(githubSlug('https://gitlab.com/alice/project'), null);
  assert.equal(githubSlug('https://github.com/alice'), null);
  assert.equal(githubSlug(null), null);
});

test('verifyRepos reports reachable and missing repositories', async () => {
  const seen = [];
  const run = async (url) => {
    seen.push(url);
    if (url.includes('/deleted')) throw new Error('not found');
  };
  const out = await verifyRepos(
    ['https://github.com/a/one', 'https://github.com/a/deleted', 'https://github.com/a/one', null],
    { run },
  );
  assert.equal(out.get('https://github.com/a/one'), true);
  assert.equal(out.get('https://github.com/a/deleted'), false);
  assert.equal(out.size, 2, 'duplicates are checked once');
  assert.equal(seen.length, 2);
});

test('verifyRepos survives an empty list', async () => {
  const out = await verifyRepos([], { run: async () => {} });
  assert.equal(out.size, 0);
});
