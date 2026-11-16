import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubSlug, repoIsPublic, verifyRepos } from '../lib/repo-check.mjs';

// Every test injects both dependencies: `run` fakes the git transport, `fetchJson` fakes the REST
// fallback. Nothing here touches the network.
const noRest = async () => { throw new Error('HTTP 404'); };
const rest = (body) => async () => body;
const gitOk = async () => {};
const git403 = async () => { throw new Error('fatal: 403 Repository is disabled'); };

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
    { run, fetchJson: noRest },
  );
  assert.equal(out.get('https://github.com/a/one'), true);
  assert.equal(out.get('https://github.com/a/deleted'), false);
  assert.equal(out.size, 2, 'duplicates are checked once');
  assert.equal(seen.length, 2);
});

test('verifyRepos survives an empty list', async () => {
  const out = await verifyRepos([], { run: gitOk, fetchJson: noRest });
  assert.equal(out.size, 0);
});

test('git transport resolving is enough', async () => {
  assert.equal(await repoIsPublic('https://github.com/o/r', { run: gitOk, fetchJson: noRest }), true);
});

test('a repository whose git endpoint 403s but whose REST metadata is public counts as live', async () => {
  // NathanOyewole/sentinel: web page, raw README and API serve it, every clone refuses it.
  const live = await repoIsPublic('https://github.com/NathanOyewole/sentinel', {
    run: git403,
    fetchJson: rest({ private: false, disabled: false, default_branch: 'main' }),
  });
  assert.equal(live, true);
});

test('private, disabled or branchless repositories stay dead', async () => {
  for (const meta of [
    { private: true, disabled: false, default_branch: 'main' },
    { private: false, disabled: true, default_branch: 'main' },
    { private: false, disabled: false, default_branch: null },
  ]) {
    assert.equal(
      await repoIsPublic('https://github.com/o/r', { run: git403, fetchJson: rest(meta) }),
      false,
      JSON.stringify(meta),
    );
  }
});

test('a REST failure is not a pass', async () => {
  assert.equal(await repoIsPublic('https://github.com/o/gone', { run: git403, fetchJson: noRest }), false);
});

test('a non-GitHub URL gets no REST fallback', async () => {
  let asked = false;
  const live = await repoIsPublic('https://gitlab.com/o/r', {
    run: git403,
    fetchJson: async () => { asked = true; return { private: false }; },
  });
  assert.equal(live, false);
  assert.equal(asked, false);
});

test('verifyRepos maps every url through the same rule', async () => {
  const res = await verifyRepos(['https://github.com/o/a', 'https://github.com/o/b'], {
    run: async (url) => { if (url.endsWith('/b')) throw new Error('403'); },
    fetchJson: rest({ private: false, disabled: false, default_branch: 'main' }),
  });
  assert.equal(res.get('https://github.com/o/a'), true);
  assert.equal(res.get('https://github.com/o/b'), true);
});
