import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlKey, findDuplicates, clusters, xAuthor, weakSignals } from '../lib/duplicates.mjs';

test('urlKey normalises the things that do not change identity', () => {
  assert.deepEqual(urlKey('https://x.com/alice/status/123?s=20'), { key: 'x.com/status/123', kind: 'x-post' });
  assert.equal(urlKey('https://twitter.com/ALICE_alt/status/123').key, 'x.com/status/123'); // handle ignored
  assert.deepEqual(urlKey('https://github.com/Owner/Repo.git'), { key: 'github.com/owner/repo', kind: 'repository' });
  assert.equal(urlKey('https://www.github.com/owner/repo/tree/main/src').key, 'github.com/owner/repo');
  assert.equal(urlKey('https://bitbucket.org/d/s').kind, 'repository');
  assert.equal(urlKey('https://www.App.example/demo/?utm_source=x&b=2&a=1#top').key, 'app.example/demo?a=1&b=2');
  assert.equal(urlKey('https://www.youtube.com/watch?v=abc&feature=youtu.be').key, 'youtube.com/watch?v=abc');
});

test('urlKey ignores URLs that name a platform rather than a project', () => {
  assert.equal(urlKey('https://dev.to'), null);
  assert.equal(urlKey('https://www.youtube.com/watch'), null);
  assert.equal(urlKey('https://github.com/owner'), null);
  assert.equal(urlKey('https://x.com/alice'), null);
  assert.equal(urlKey('https://near.org/'), null);
  assert.equal(urlKey('ftp://a.example/x'), null);
  assert.equal(urlKey('nope'), null);
  assert.equal(urlKey(null), null);
});

const sub = (id, name, urls, on_chain = true) => ({ submission_id: id, name, on_chain, urls });

test('findDuplicates flags distinct submissions sharing a repo, post or demo; never one submission alone', () => {
  const groups = findDuplicates([
    sub('a', 'Leash', [{ field: 'repository_url', url: 'https://github.com/x/leash' }, { field: 'links', url: 'https://leash.app' }]),
    sub('b', 'Leash v2', [{ field: 'links', url: 'https://github.com/X/Leash.git' }]),
    sub('c', 'Guard', [{ field: 'demo_url', url: 'https://x.com/u/status/9' }]),
    sub('d', 'Guard again', [{ field: 'demo_url', url: 'https://twitter.com/u/status/9?s=46' }], false),
    sub('e', 'Solo', [{ field: 'demo_url', url: 'https://solo.app' }, { field: 'links', url: 'https://solo.app/' }]),
    sub('f', 'Leash web', [{ field: 'demo_url', url: 'https://www.leash.app/' }]),
    sub('g', 'Blogger', [{ field: 'links', url: 'https://dev.to' }]),
    sub('h', 'Blogger 2', [{ field: 'links', url: 'https://dev.to/' }]),
  ]);
  assert.deepEqual(groups.map((g) => [g.kind, g.key, g.submissions.map((s) => s.submission_id)]), [
    ['x-post', 'x.com/status/9', ['c', 'd']],
    ['repository', 'github.com/x/leash', ['a', 'b']],
    ['url', 'leash.app', ['a', 'f']],
  ]);
  assert.equal(groups[0].submissions[1].on_chain, false); // pending feed submissions are included
  assert.deepEqual(groups[1].submissions[0].fields, ['repository_url']);
});

test('clusters joins overlapping groups and keeps every reason', () => {
  const c = clusters(findDuplicates([
    sub('a', 'A', [{ field: 'repository_url', url: 'https://github.com/x/r' }]),
    sub('b', 'B', [{ field: 'links', url: 'https://github.com/x/r' }, { field: 'demo_url', url: 'https://b.app' }]),
    sub('c', 'C', [{ field: 'links', url: 'https://b.app' }]),
    sub('d', 'D', [{ field: 'demo_url', url: 'https://x.com/q/status/1' }]),
    sub('e', 'E', [{ field: 'demo_url', url: 'https://x.com/r/status/1' }]),
  ]));
  assert.equal(c.length, 2);
  assert.deepEqual(c[0].submissions.map((s) => s.submission_id).sort(), ['a', 'b', 'c']);
  assert.deepEqual(c[0].shared.map((s) => s.key).sort(), ['b.app', 'github.com/x/r']);
  assert.deepEqual(c[1].submissions.map((s) => s.submission_id), ['d', 'e']);
  assert.deepEqual(clusters([]), []);
});

test('weak signals: same name and same X account are listed, never called duplicates', () => {
  const w = weakSignals([
    sub('a', 'AgentGuard', [{ field: 'demo_url', url: 'https://x.com/One/status/1' }]),
    sub('b', ' agentguard ', [{ field: 'demo_url', url: 'https://x.com/two/status/2' }]),
    sub('c', 'Tollgate', [{ field: 'demo_url', url: 'https://x.com/one/status/3' }]),
    sub('d', 'Solo', [{ field: 'demo_url', url: 'https://solo.app' }]),
  ]);
  assert.deepEqual(w.same_name.map((g) => [g.key, g.submissions.length]), [['agentguard', 2]]);
  assert.deepEqual(w.same_x_account.map((g) => [g.key, g.submissions.map((s) => s.submission_id)]), [['one', ['a', 'c']]]);
  assert.equal(xAuthor('https://x.com/a/status/1'), 'a');
  assert.equal(xAuthor('https://x.com/a'), null);
  assert.equal(xAuthor('https://example.com/a/status/1'), null);
});
