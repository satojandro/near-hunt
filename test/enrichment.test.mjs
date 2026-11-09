import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorChain,
  buildEnrichment,
  chooseRepo,
  cleanTweetText,
  descriptionFromChain,
  githubRepoFromUrl,
  linksFromChain,
  repoFromChain,
  repoFromText,
  reposFromChain,
  summarize,
  tweetIdFromUrl,
} from '../lib/enrichment.mjs';

const tweet = (id, handle, text, urls = []) => ({
  id_str: String(id),
  text,
  user: { screen_name: handle },
  entities: { urls: urls.map((expanded_url) => ({ expanded_url })) },
});

test('tweetIdFromUrl accepts x and twitter status links only', () => {
  assert.equal(tweetIdFromUrl('https://x.com/alice/status/2116873925716320288?s=20'), '2116873925716320288');
  assert.equal(tweetIdFromUrl('https://twitter.com/alice/statuses/123'), '123');
  assert.equal(tweetIdFromUrl('https://mobile.twitter.com/alice/status/9'), '9');
  assert.equal(tweetIdFromUrl('https://x.com/alice'), null);
  assert.equal(tweetIdFromUrl('https://example.com/alice/status/9'), null);
  assert.equal(tweetIdFromUrl(null), null);
});

test('githubRepoFromUrl normalises a repo and rejects product pages', () => {
  assert.equal(githubRepoFromUrl('https://github.com/Owner/Repo'), 'https://github.com/Owner/Repo');
  assert.equal(githubRepoFromUrl('https://www.github.com/Owner/Repo/'), 'https://github.com/Owner/Repo');
  assert.equal(githubRepoFromUrl('https://github.com/Owner/Repo/tree/main/src'), 'https://github.com/Owner/Repo');
  assert.equal(githubRepoFromUrl('https://github.com/Owner/Repo.git'), 'https://github.com/Owner/Repo');
  assert.equal(githubRepoFromUrl('https://github.com/features/actions'), null);
  assert.equal(githubRepoFromUrl('https://github.com/topics/ai'), null);
  assert.equal(githubRepoFromUrl('https://gist.github.com/a/b'), null);
  assert.equal(githubRepoFromUrl('https://gitlab.com/a/b'), null);
  assert.equal(githubRepoFromUrl('not a url'), null);
});

test('cleanTweetText drops t.co links and leading mentions, keeps the pitch', () => {
  const raw = '  @NEARProtocol @NearBuilders  Live demo: prompt-injection drain blocked. Repo: https://t.co/abc123 ';
  assert.equal(cleanTweetText(raw), 'Live demo: prompt-injection drain blocked.');
  assert.equal(cleanTweetText('AT&T &amp; more'), 'AT&T & more');
  assert.equal(cleanTweetText(null), '');
});

test('cleanTweetText removes a dangling link label left by t.co removal', () => {
  assert.equal(cleanTweetText('Built at the hackathon. Repo: https://t.co/x'), 'Built at the hackathon.');
  assert.equal(cleanTweetText('Pitch here. Demo: Code: https://t.co/x'), 'Pitch here.');
  assert.equal(cleanTweetText('Repo: https://t.co/x'), '');
  // a sentence that merely mentions GitHub keeps its last word
  assert.equal(cleanTweetText('The code is open source on GitHub'), 'The code is open source on GitHub');
});

test('authorChain keeps only the submitted post author', () => {
  const chain = [tweet(1, 'alice', 'root'), tweet(2, 'bob', 'stranger'), tweet(3, 'Alice', 'follow-up')];
  assert.deepEqual(authorChain(chain, 'alice').map((t) => t.id_str), ['1', '3']);
  assert.deepEqual(authorChain(chain, 'carol'), []);
});

test('repoFromChain takes the first repository the author linked', () => {
  const chain = [
    tweet(1, 'alice', 'root', ['https://x.com/alice/status/1']),
    tweet(2, 'bob', 'stranger repo', ['https://github.com/bob/not-alices']),
    tweet(3, 'alice', 'Repo: github.com/alice/project', ['https://github.com/alice/project']),
  ];
  const repo = repoFromChain(authorChain(chain, 'alice'));
  assert.equal(repo.repository_url, 'https://github.com/alice/project');
  assert.equal(repo.source_post_id, '3');
  assert.equal(repo.source_url, 'https://x.com/alice/status/3');
});

test('linksFromChain keeps product links and drops github/x/img hosts', () => {
  const chain = [
    tweet(1, 'alice', 'root', [
      'https://t.co/short',
      'https://x.com/alice/status/1',
      'https://github.com/alice/project',
      'https://pbs.twimg.com/media/x.jpg',
      'https://demo.example.com/app/?ref=x',
      'https://demo.example.com/app/',
    ]),
  ];
  const links = linksFromChain(chain);
  assert.deepEqual(links.map((l) => l.url), ['https://demo.example.com/app']);
});

test('linksFromChain keeps a meaningful query and drops only tracking parameters (NH-96)', () => {
  // Charter and Sealed Exploit were published as a bare youtube.com/watch on 8 Nov.
  const links = linksFromChain([
    tweet(1, 'alice', 'root', [
      'https://www.youtube.com/watch?v=YTom8Vb9i1E&feature=youtu.be',
      'https://www.youtube.com/watch?v=sEMg3q7gG5k&si=abc',
      'https://app.example.com/?utm_source=x&utm_medium=social',
      'https://medium.com/@a/post-1?sharedUserId=a',
    ]),
  ]);
  assert.deepEqual(links.map((l) => l.url), [
    'https://www.youtube.com/watch?v=YTom8Vb9i1E',
    'https://www.youtube.com/watch?v=sEMg3q7gG5k',
    'https://app.example.com',
    'https://medium.com/@a/post-1',
  ]);
});

test('descriptionFromChain prefers the root post and refuses tiny text', () => {
  const chain = [tweet(1, 'alice', 'A real pitch for the project.'), tweet(2, 'alice', 'short')];
  assert.equal(descriptionFromChain(chain).description, 'A real pitch for the project.');
  assert.equal(descriptionFromChain([tweet(1, 'alice', 'hi')]), null);
});

test('buildEnrichment returns provenance and nothing invented', () => {
  const project = { submission_id: 'abc', name: 'AgentGuard', demo_url: 'https://x.com/dark/status/20?s=20' };
  const chain = [
    tweet(10, 'dark', 'Root pitch about guarded agent wallets.', ['https://github.com/Night-Etrenal/agentguard-near']),
    tweet(20, 'dark', 'Live demo on NEAR testnet.', []),
  ];
  const out = buildEnrichment(project, { chain, retrieved_at: '2026-11-08T00:00:00.000Z' });
  assert.equal(out.status, 'ok');
  assert.equal(out.description, 'Root pitch about guarded agent wallets.');
  assert.equal(out.description_source, 'https://x.com/dark/status/10');
  assert.equal(out.repository_url, 'https://github.com/Night-Etrenal/agentguard-near');
  assert.equal(out.repository_source, 'https://x.com/dark/status/10');
  assert.deepEqual(out.enrichment.sources, ['https://x.com/dark/status/10']);
  assert.equal(out.enrichment.method, 'x-thread');
});

test('buildEnrichment is honest when there is nothing to add', () => {
  const demo = { submission_id: 'a', name: 'A', demo_url: 'https://demo.example.com' };
  assert.equal(buildEnrichment(demo, { chain: [], retrieved_at: 'x' }).status, 'not-an-x-post');

  const empty = buildEnrichment(
    { submission_id: 'b', name: 'B', demo_url: 'https://x.com/a/status/1' },
    { chain: [tweet(1, 'alice', 'hi')], retrieved_at: 'x' },
  );
  assert.equal(empty.status, 'nothing-recoverable');
});

test('summarize counts only ok rows for field coverage', () => {
  const out = summarize([
    { status: 'ok', description: 'x', repository_url: 'r', links: [{ url: 'u' }] },
    { status: 'ok', description: 'x', repository_url: null, links: [] },
    { status: 'not-an-x-post' },
  ]);
  assert.deepEqual(out, {
    projects: 3,
    ok: 2,
    with_description: 2,
    with_repository: 1,
    with_links: 1,
    with_media: 0,
    by_status: { ok: 2, 'not-an-x-post': 1 },
  });
});

test('repoFromText reads link-card titles as well as plain URLs', () => {
  assert.equal(repoFromText('Code: github.com/alice/project'), 'https://github.com/alice/project');
  assert.equal(repoFromText('GitHub - alice/project: a demo'), 'https://github.com/alice/project');
  assert.equal(repoFromText('GitHub - features/actions'), null);
  assert.equal(repoFromText('no links here'), null);
});

test('several unrelated repos are left ambiguous instead of guessed', () => {
  const chain = [
    tweet(1, 'alice', 'core', ['https://github.com/Boyun-Protocol/Boyun-core']),
    tweet(2, 'alice', 'skills', ['https://github.com/Boyun-Protocol/Boyun-skills']),
  ];
  const pick = chooseRepo(reposFromChain(chain));
  assert.equal(pick.ambiguous, true);
  assert.deepEqual(pick.candidates, [
    'https://github.com/Boyun-Protocol/Boyun-core',
    'https://github.com/Boyun-Protocol/Boyun-skills',
  ]);
});

test('an explicit "repo" cue wins over several candidates', () => {
  const chain = [
    tweet(1, 'alice', 'docs', ['https://github.com/alice/docs']),
    tweet(2, 'alice', 'Repo: https://github.com/alice/app', ['https://github.com/alice/app']),
  ];
  const pick = chooseRepo(reposFromChain(chain));
  assert.equal(pick.repository_url, 'https://github.com/alice/app');
  assert.equal(pick.ambiguous, false);
});

test('a repository name X cut short with an ellipsis is not a repository', () => {
  // Seen in the 8 Nov browser crawl: "Code: github.com/Adelekejr/Gide… #NEARHackathon"
  assert.equal(repoFromText('Live: gideon-near.vercel.app Code: github.com/Adelekejr/Gide… #NEARHackathon'), null);
  assert.equal(repoFromText('Code: github.com/Adelekejr/Gide... more'), null);
  // a later, complete mention in the same text still counts
  assert.equal(
    repoFromText('github.com/a/Gide… full link: github.com/a/Gideon'),
    'https://github.com/a/Gideon',
  );
  // a sentence-ending full stop is not part of the name
  assert.equal(repoFromText('Code is at github.com/a/b.'), 'https://github.com/a/b');
  const chain = [tweet(1, 'ade', 'Code: https://github.com/Adelekejr/Gide… #NEARHackathon')];
  assert.equal(repoFromChain(chain), null);
});

test('captured thread posts without a real id cite the submitted post, never a made-up URL', () => {
  const project = { submission_id: 'gid', name: 'Gideon', demo_url: 'https://x.com/ade/status/30' };
  const chain = [
    tweet(30, 'ade', 'Gideon checks NEAR addresses before you send.'),
    tweet('thread-1', 'ade', 'Repo: github.com/ade/gideon'),
    tweet('thread-links', 'ade', '', ['https://gideon-near.vercel.app/']),
  ];
  const out = buildEnrichment(project, { chain, retrieved_at: '2026-11-08T00:00:00.000Z' });
  assert.equal(out.repository_url, 'https://github.com/ade/gideon');
  assert.equal(out.repository_source, 'https://x.com/ade/status/30');
  assert.ok(out.enrichment.sources.every((u) => /\/status\/\d+$/.test(u)), out.enrichment.sources.join(' '));
  assert.deepEqual(out.links, [{ url: 'https://gideon-near.vercel.app', source_post_id: '30' }]);
});
