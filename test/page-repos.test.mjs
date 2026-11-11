import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reposInHtml, pagesOwnerMatches, readmeLinksBack, eligiblePages, readmesNeeded, applyPageRepos, fetchReadme,
} from '../lib/page-repos.mjs';
import { probeLink } from '../lib/link-probe.mjs';
import { captureStatus } from '../lib/thread-capture.mjs';

const REPO = 'https://github.com/acme/veto';
const PAGE = 'https://veto.vercel.app';
const live = (repos, extra = {}) => ({ verdict: 'live', final_url: null, repos, ...extra });
const row = (extra = {}) => ({
  submission_id: 's1',
  status: 'ok',
  repository_url: null,
  links: [{ url: PAGE, kind: 'demo' }],
  enrichment: { method: 'x-thread', sources: ['https://x.com/acme/status/1'] },
  ...extra,
});
const at = '2026-11-11T00:00:00.000Z';

test('reposInHtml: distinct repositories in order, deep links folded, GitHub\'s own pages dropped', () => {
  const html = `<a href="https://github.com/acme/veto/tree/main/src">code</a>
    <a href="https://github.com/Acme/Veto">again</a> <a href="https://github.com/features">no</a>
    <a href="https://www.github.com/other/thing.git">other</a> "https://github.com/acme"`;
  assert.deepEqual(reposInHtml(html), [REPO, 'https://github.com/other/thing']);
  assert.deepEqual(reposInHtml(null), []);
});

test('pagesOwnerMatches: only {owner}.github.io for that owner', () => {
  assert.equal(pagesOwnerMatches('https://Acme.github.io/veto/', REPO), true);
  assert.equal(pagesOwnerMatches('https://someone.github.io/veto/', REPO), false);
  assert.equal(pagesOwnerMatches('https://acme.vercel.app', REPO), false);
  assert.equal(pagesOwnerMatches('https://acme.github.io.evil.io', REPO), false);
});

test('readmeLinksBack: the whole host, not a parent domain or a longer name', () => {
  assert.equal(readmeLinksBack('Demo: https://VETO.vercel.app/app', PAGE), true);
  assert.equal(readmeLinksBack('Deployed on vercel.app', PAGE), false);
  assert.equal(readmeLinksBack('https://veto.vercel.app.evil.io', PAGE), false);
  assert.equal(readmeLinksBack('https://not-veto.vercel.app', PAGE), false);
  assert.equal(readmeLinksBack(null, PAGE), false);
});

test('eligiblePages: live project pages only, never one that redirected to another host', () => {
  const r = row({ links: [
    { url: PAGE, kind: 'demo' },
    { url: 'https://youtu.be/x', kind: 'video' },
    { url: 'https://moved.example', kind: 'website' },
    { url: 'https://down.example', kind: 'website' },
  ] });
  const probes = new Map([
    [PAGE, live([REPO])],
    ['https://youtu.be/x', live([REPO])],
    ['https://moved.example', live([REPO], { final_url: 'https://elsewhere.example/' })],
    ['https://down.example', { verdict: 'unverified', repos: [REPO] }],
  ]);
  assert.deepEqual(eligiblePages(r, probes), [{ url: PAGE, repos: [REPO] }]);
});

test('applyPageRepos: a page link alone is a candidate, never published', () => {
  const results = [row()];
  const stats = applyPageRepos(results, { probes: new Map([[PAGE, live([REPO])]]), repos: new Map([[REPO, true]]), verifiedAt: at });
  assert.equal(results[0].repository_url, null);
  assert.deepEqual(results[0].repository_candidates, [REPO]);
  assert.deepEqual(stats, { pages: 1, found: 1, promoted: 0, candidates: 1 });
});

test('applyPageRepos: a third-party page that happens to link a repository proposes nothing', () => {
  // The measured case: a record whose link is https://near.social, whose feed showed a stranger's repo.
  const results = [row({ links: [{ url: 'https://near.social', kind: 'website' }] })];
  const stranger = 'https://github.com/stranger/thing';
  applyPageRepos(results, {
    probes: new Map([['https://near.social', live([stranger])]]),
    readmes: new Map([[stranger, 'My project. No link to that site.']]),
    repos: new Map([[stranger, true]]),
    verifiedAt: at,
  });
  assert.equal(results[0].repository_url, null);
  assert.deepEqual(results[0].repository_candidates, [stranger]);
});

test('applyPageRepos: README links back -> published with the page as source', () => {
  const results = [row()];
  const stats = applyPageRepos(results, {
    probes: new Map([[PAGE, live([REPO])]]),
    readmes: new Map([[REPO, 'Live demo: https://veto.vercel.app']]),
    repos: new Map([[REPO, true]]),
    verifiedAt: at,
  });
  const r = results[0];
  assert.equal(r.repository_url, REPO);
  assert.equal(r.repository_source, PAGE);
  assert.deepEqual(r.repository_basis, ['readme-links-back']);
  assert.equal(r.repository_verified, true);
  assert.equal(r.repository_verified_at, at);
  assert.deepEqual(r.enrichment.sources, ['https://x.com/acme/status/1', PAGE]);
  assert.equal(stats.promoted, 1);
});

test('applyPageRepos: corroborated but git ls-remote did not answer -> not published', () => {
  const results = [row()];
  applyPageRepos(results, {
    probes: new Map([[PAGE, live([REPO])]]),
    readmes: new Map([[REPO, 'https://veto.vercel.app']]),
    repos: new Map([[REPO, false]]),
    verifiedAt: at,
  });
  assert.equal(results[0].repository_url, null);
  assert.deepEqual(results[0].repository_candidates, [REPO]);
});

test('applyPageRepos: github.io of the owner needs no README; the page settles ambiguous post candidates', () => {
  const pages = row({ links: [{ url: 'https://acme.github.io/veto', kind: 'website' }] });
  const other = 'https://github.com/acme/veto-demo';
  const ambiguous = row({ submission_id: 's2', repository_candidates: [REPO, other] });
  applyPageRepos([pages, ambiguous], {
    probes: new Map([['https://acme.github.io/veto', live([REPO])], [PAGE, live([REPO])]]),
    repos: new Map([[REPO, true]]),
    verifiedAt: at,
  });
  assert.equal(pages.repository_url, REPO);
  assert.deepEqual(pages.repository_basis, ['pages-owner']);
  assert.equal(ambiguous.repository_url, REPO);
  assert.deepEqual(ambiguous.repository_basis, ['builder-post-candidate']);
  assert.equal(ambiguous.repository_candidates, undefined);
});

test('applyPageRepos: two corroborated repositories -> none chosen; an existing repository is never replaced', () => {
  const second = 'https://github.com/acme/veto-contracts';
  const two = row();
  const has = row({ submission_id: 's3', repository_url: 'https://github.com/acme/original' });
  const readme = 'https://veto.vercel.app';
  applyPageRepos([two, has], {
    probes: new Map([[PAGE, live([REPO, second])]]),
    readmes: new Map([[REPO, readme], [second, readme]]),
    repos: new Map([[REPO, true], [second, true]]),
    verifiedAt: at,
  });
  assert.equal(two.repository_url, null);
  assert.deepEqual(two.repository_candidates, [REPO, second]);
  assert.equal(has.repository_url, 'https://github.com/acme/original');
});

test('readmesNeeded: only repositories the host or the posts do not already settle', () => {
  const results = [
    row(),
    row({ submission_id: 's2', links: [{ url: 'https://acme.github.io/veto', kind: 'website' }] }),
    row({ submission_id: 's3', repository_url: REPO }),
  ];
  const probes = new Map([[PAGE, live([REPO, 'https://github.com/x/y'])], ['https://acme.github.io/veto', live([REPO])]]);
  assert.deepEqual(readmesNeeded(results, probes).sort(), [REPO, 'https://github.com/x/y'].sort());
});

test('fetchReadme tries the usual names on the default branch and gives null when none answers', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return url.endsWith('/readme.md') ? new Response('hello') : new Response('', { status: 404 });
  };
  assert.equal(await fetchReadme(`${REPO}/tree/main`, { fetchImpl }), 'hello');
  assert.deepEqual(calls, [
    'https://raw.githubusercontent.com/acme/veto/HEAD/README.md',
    'https://raw.githubusercontent.com/acme/veto/HEAD/readme.md',
  ]);
  assert.equal(await fetchReadme(REPO, { fetchImpl: async () => new Response('', { status: 404 }) }), null);
  assert.equal(await fetchReadme('https://example.com/a/b', { fetchImpl }), null);
});

test('probeLink reports the repositories an HTML page links', async () => {
  const fetchImpl = async () => new Response(`<title>Veto</title><footer><a href="${REPO}">GitHub</a></footer>`, { headers: { 'content-type': 'text/html' } });
  const r = await probeLink(PAGE, { fetchImpl });
  assert.deepEqual(r.repos, [REPO]);
});

test('captureStatus: "no author replies" only when other posts were listed and read', () => {
  assert.equal(captureStatus({ listed: 4, read: 4, own: 1 }), 'ok');
  assert.equal(captureStatus({ listed: 4, read: 3, own: 0 }), 'no-author-replies');
  assert.equal(captureStatus({ listed: 0, read: 0, own: 0 }), 'no-replies-listed');
  assert.equal(captureStatus({ listed: 4, read: 0, own: 0 }), 'replies-unreadable');
});
