import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitRepoUrl, cueBefore, linkIndex, labelLink, kindLabel, applyLinkChecks } from '../lib/link-label.mjs';
import { linksFromChain } from '../lib/enrichment.mjs';

test('gitRepoUrl: owner/repo on known git hosts only', () => {
  assert.equal(gitRepoUrl('https://bitbucket.org/dualrail-builder/near-safespend'), 'https://bitbucket.org/dualrail-builder/near-safespend');
  assert.equal(gitRepoUrl('https://gitlab.com/a/b/-/tree/main'), 'https://gitlab.com/a/b');
  assert.equal(gitRepoUrl('https://github.com/a/b.git'), 'https://github.com/a/b');
  assert.equal(gitRepoUrl('https://bitbucket.org/onlyowner'), null);
  assert.equal(gitRepoUrl('https://a.github.io/b'), null);
  assert.equal(gitRepoUrl('http://gitlab.com/a/b'), null);
});

test('labelLink: the host settles video, explorer, article, community and docs', () => {
  const k = (u) => labelLink(u).kind;
  assert.equal(k('https://www.youtube.com/watch?v=x'), 'video');
  assert.equal(k('https://youtu.be/x'), 'video');
  assert.equal(k('https://nearblocks.io/address/a.near'), 'explorer');
  assert.equal(k('https://testnet.nearblocks.io/address/a.testnet'), 'explorer');
  assert.equal(k('https://sepolia.etherscan.io/tx/0x1'), 'explorer');
  assert.equal(k('https://medium.com/@a/b'), 'article');
  assert.equal(k('https://dev.to'), 'article');
  assert.equal(k('https://t.me/x'), 'community');
  assert.equal(k('https://gov.near.org/t/x/1'), 'community');
  assert.equal(k('https://docs.example.com'), 'docs');
  assert.equal(labelLink('https://youtu.be/x', { cue: 'demo' }).kind_basis, 'host'); // host beats the cue
});

test('labelLink: builder cue, then URL, then default "website"', () => {
  assert.deepEqual(labelLink('https://sealed.edycu.dev', { cue: 'demo' }), { kind: 'demo', kind_basis: 'builder' });
  assert.deepEqual(labelLink('https://x.example/app/'), { kind: 'demo', kind_basis: 'url' });
  assert.deepEqual(labelLink('https://demo.example.com'), { kind: 'demo', kind_basis: 'url' });
  assert.deepEqual(labelLink('https://aegis-demo-beta.vercel.app'), { kind: 'demo', kind_basis: 'url' });
  assert.deepEqual(labelLink('https://example.com/docs/start'), { kind: 'docs', kind_basis: 'url' });
  assert.deepEqual(labelLink('https://nearpocket.vercel.app'), { kind: 'website', kind_basis: 'default' });
  assert.deepEqual(labelLink('https://demolition.example'), { kind: 'website', kind_basis: 'default' });
  assert.equal(labelLink('https://bitbucket.org/a/b').repo, 'https://bitbucket.org/a/b');
  assert.equal(labelLink('nope').kind, 'website');
});

test('cueBefore: only the words right before the link, on the same line', () => {
  const at = (t, needle) => cueBefore(t, t.indexOf(needle));
  assert.equal(at('Repo: github.com/e/s Live: sealed.edycu.dev Video: youtu.be/x', 'sealed'), 'demo');
  assert.equal(at('Repo: github.com/e/s Live: sealed.edycu.dev Video: youtu.be/x', 'youtu'), 'video');
  assert.equal(at('Try it: usestyx.xyz Public sample: usestyx.xyz/try-demo', 'usestyx.xyz Public'), 'demo');
  assert.equal(at('Docs → docs.example.com', 'docs.example'), 'docs');
  assert.equal(at('Check out the demo video we made and our site https://a.example', 'https://a'), 'website');
  assert.equal(at('We built a demo.\nhttps://a.example', 'https://a'), null); // a sentence, not a label
  assert.equal(at('Live demo 👇\nhttps://a.example', 'https://a'), 'demo'); // label on the line above
  assert.equal(at('Demo:\n\n\nhttps://a.example', 'https://a'), null); // too far
  assert.equal(at('This demo is great because reasons https://a.example', 'https://a'), null); // not adjacent
  assert.equal(at('Demo 👉 https://a.example', 'https://a'), 'demo');
  assert.equal(cueBefore('x', -1), null);
});

test('linkIndex finds a link by entity indices or by its display form', () => {
  assert.equal(linkIndex({ text: 'Live: https://t.co/abc', entities: { urls: [{ expanded_url: 'https://a.example', indices: [6, 22] }] } }, 'https://a.example'), 6);
  assert.equal(linkIndex({ text: 'Live: sealed.edycu.dev ok' }, 'https://sealed.edycu.dev'), 6);
  assert.equal(linkIndex({ text: 'Live: https://www.a.example/x' }, 'https://a.example/x'), 6);
  // Code-point indices: each emoji is one code point but two UTF-16 units.
  const t = { text: '🚀 Live demo 👇\nhttps://t.co/x', entities: { urls: [{ expanded_url: 'https://a.example', indices: [14, 28] }] } };
  assert.equal(t.text.slice(linkIndex(t, 'https://a.example')), 'https://t.co/x');
  assert.equal(cueBefore(t.text, linkIndex(t, 'https://a.example')), 'demo');
  assert.equal(linkIndex({ text: 'nothing here' }, 'https://a.example'), -1);
  assert.equal(linkIndex({}, 'https://a.example'), -1);
});

test('linksFromChain labels links from the builder\'s own words', () => {
  const t = { id_str: '1', user: { screen_name: 'e' }, text: 'Live: sealed.edycu.dev Video: youtu.be/sEMg3q7gG5k',
    // Shape of a browser-captured thread post after mergeThread(): display text plus entities.
    entities: { urls: [{ expanded_url: 'https://sealed.edycu.dev' }, { expanded_url: 'https://youtu.be/sEMg3q7gG5k' }] } };
  assert.deepEqual(linksFromChain([t]).map((l) => [l.url, l.kind, l.kind_basis]), [
    ['https://sealed.edycu.dev', 'demo', 'builder'],
    ['https://youtu.be/sEMg3q7gG5k', 'video', 'host'],
  ]);
});

test('applyLinkChecks: attaches checks, keeps gone links, promotes one answering repo', () => {
  const results = [
    {
      status: 'ok', author: 'dual', repository_url: null, enrichment: { sources: ['https://x.com/dual/status/9'] },
      links: [
        { url: 'https://bitbucket.org/d/s', source_post_id: '7', kind: 'website', kind_basis: 'host', repo: 'https://bitbucket.org/d/s' },
        { url: 'https://dead.example', source_post_id: '7', kind: 'website', kind_basis: 'default' },
        { url: 'https://unchecked.example', source_post_id: '7', kind: 'demo', kind_basis: 'url' },
      ],
    },
    { status: 'ok', repository_url: 'https://github.com/a/b', links: [{ url: 'https://gitlab.com/x/y', repo: 'https://gitlab.com/x/y', kind: 'website', kind_basis: 'host' }] },
    { status: 'not-an-x-post' },
  ];
  const probes = new Map([
    ['https://bitbucket.org/d/s', { verdict: 'live', http_status: 200, checked_at: 'T' }],
    ['https://dead.example', { verdict: 'gone', http_status: 404, checked_at: 'T' }],
  ]);
  const repos = new Map([['https://bitbucket.org/d/s', true], ['https://gitlab.com/x/y', true]]);
  const stats = applyLinkChecks(results, { probes, repos, verifiedAt: 'V' });
  assert.deepEqual(stats, { checked: 2, repositories_promoted: 1 });
  const [a, b] = results;
  assert.equal(a.links.length, 3);
  assert.deepEqual(a.links[0], { url: 'https://bitbucket.org/d/s', source_post_id: '7', kind: 'repository', kind_basis: 'host', check: { verdict: 'live', http_status: 200, checked_at: 'T' } });
  assert.deepEqual(a.links[1].check, { verdict: 'gone', http_status: 404, checked_at: 'T' });
  assert.equal(a.links[2].check, undefined);
  assert.equal(a.repository_url, 'https://bitbucket.org/d/s');
  assert.equal(a.repository_source, 'https://x.com/dual/status/7');
  assert.equal(a.repository_verified_at, 'V');
  // An existing repository_url is never replaced.
  assert.equal(b.repository_url, 'https://github.com/a/b');
  assert.equal(b.links[0].kind, 'repository');
  assert.ok(!('repo' in b.links[0]));
});

test('kindLabel', () => {
  assert.equal(kindLabel('explorer'), 'On-chain');
  assert.equal(kindLabel('demo'), 'Demo');
  assert.equal(kindLabel(undefined), 'Link');
});
