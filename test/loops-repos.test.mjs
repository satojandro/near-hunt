import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectUrlsFromSitemap,
  jsonLdBlocks,
  parseProjectPage,
  joinRows,
  toWorksheetCsv,
} from '../scripts/loops-repos.mjs';

/**
 * The shape of a real `loops.house/explore-projects/<slug>` page, cut down to the two JSON-LD blocks
 * the parser reads. Taken from `https://www.loops.house/explore-projects/tesorero-88a01` on
 * 17 Nov 2026: `sameAs` carries the builder's own repository and the submitted demo post, and the
 * breadcrumb names the event.
 */
const PAGE = `<!doctype html><html><head><title>Tesorero | Loops House</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"CreativeWork","name":"Tesorero","description":"Tesorero","url":"https://www.loops.house/explore-projects/tesorero-88a01","datePublished":"2026-11-16T10:22:57.299Z","sameAs":["https://github.com/josefranciscocruzcorro/near-hackaton","https://x.com/JoseFra49220812/status/2121765709235835050"]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Loops House","item":"https://www.loops.house/"},{"@type":"ListItem","position":2,"name":"NEAR HACKATHON","item":"https://www.loops.house/near-hackathon"},{"@type":"ListItem","position":3,"name":"Tesorero","item":"https://www.loops.house/explore-projects/tesorero-88a01"}]}</script>
</head><body>Tesorero</body></html>`;

test('a project page yields its repository, its submitted demo post and its event', () => {
  const p = parseProjectPage(PAGE, { url: 'https://www.loops.house/explore-projects/tesorero-88a01' });
  assert.equal(p.name, 'Tesorero');
  assert.equal(p.slug, 'tesorero-88a01');
  assert.equal(p.event, 'NEAR HACKATHON');
  assert.equal(p.repository_url, 'https://github.com/josefranciscocruzcorro/near-hackaton');
  assert.equal(p.demo_url, 'https://x.com/JoseFra49220812/status/2121765709235835050');
  assert.deepEqual(p.links, []);
});

test('a page with no structured data is skipped instead of guessed at', () => {
  assert.equal(parseProjectPage('<html><body>nothing</body></html>', { url: 'https://www.loops.house/explore-projects/x-1' }), null);
  // A malformed block does not throw.
  assert.deepEqual(jsonLdBlocks('<script type="application/ld+json">{oops</script>'), []);
});

test('only project pages come out of the sitemap', () => {
  const xml = `<urlset><url><loc>https://www.loops.house/</loc></url>
    <url><loc>https://www.loops.house/explore-projects/tesorero-88a01</loc></url>
    <url><loc>https://www.loops.house/blog/x</loc></url>
    <url><loc>https://www.loops.house/explore-projects/tesorero-88a01</loc></url></urlset>`;
  assert.deepEqual(projectUrlsFromSitemap(xml), ['https://www.loops.house/explore-projects/tesorero-88a01']);
});

/**
 * The join is the whole point: 1102 records have no repository and the X crawl cannot find one,
 * while the same submissions on Loops House publish it next to the post NEAR Hunt already stores.
 */
test('join matches on the submitted post first, then the demo URL, then a unique name', () => {
  const records = [
    { submission_id: 'a', name: 'Tesorero', demo_url: 'https://x.com/JoseFra49220812/status/2121765709235835050?a=1&s=20' },
    { submission_id: 'b', name: 'Site Only', demo_url: 'https://site-only.vercel.app' },
    { submission_id: 'c', name: 'Held', demo_url: 'https://x.com/someone/status/2121765709235835051' },
    { submission_id: 'd', name: 'Already', demo_url: 'https://x.com/x/status/2121765709235835052', repository_url: 'https://github.com/x/already' },
  ];
  const loops = [
    { name: 'Tesorero', url: 'https://www.loops.house/explore-projects/tesorero-88a01', demo_url: 'https://x.com/JoseFra49220812/status/2121765709235835050', repository_url: 'https://github.com/jfcc/tesorero' },
    { name: 'Site Only', url: 'u2', demo_url: 'https://site-only.vercel.app', repository_url: 'https://github.com/y/site-only' },
    { name: 'Held', url: 'u3', demo_url: 'https://x.com/other/status/2121765709235835059', repository_url: 'https://github.com/z/held' },
    { name: 'Already', url: 'u4', demo_url: 'https://x.com/x/status/2121765709235835052', repository_url: 'https://github.com/x/already2' },
  ];
  const matches = joinRows(loops, records);
  const byId = new Map(matches.map((m) => [m.record.submission_id, m]));
  assert.equal(byId.get('a').basis, 'same-post', 'the x post joins even with share params on the record');
  assert.equal(byId.get('b').basis, 'same-demo');
  assert.equal(byId.get('c').basis, 'same-name');
  assert.equal(byId.has('d'), false, 'a record that already has a repository is never re-signed');
});

test('a name shared by two projects on either side is not an identity', () => {
  const records = [
    { submission_id: 'r1', name: 'Twin', demo_url: 'https://x.com/a/status/2121765709235835051' },
    { submission_id: 'r2', name: 'Twin', demo_url: 'https://x.com/b/status/2121765709235835052' },
  ];
  const loops = [
    { name: 'Twin', url: 'l1', demo_url: 'https://x.com/a/status/2121765709235835051', repository_url: 'https://github.com/a/twin' },
    { name: 'Twin', url: 'l2', demo_url: 'https://x.com/c/status/2121765709235835053', repository_url: 'https://github.com/c/twin' },
  ];
  const matches = joinRows(loops, records);
  // r1 still joins on its own post; r2 has no identity left and is left alone.
  assert.deepEqual(matches.map((m) => [m.record.submission_id, m.basis]), [['r1', 'same-post']]);
});

test('the worksheet keeps one URL per row and labels the basis', () => {
  const csv = toWorksheetCsv([
    { record: { submission_id: 'a', name: 'Tesorero', demo_url: 'https://x.com/u/status/2121765709235835051' }, loop: { repository_url: 'https://github.com/jfcc/tesorero' }, basis: 'same-post' },
  ]);
  const [header, row] = csv.trim().split('\n');
  assert.equal(header, 'repository_url,name,page,x_post,x_author,site_links,candidates,submission_id');
  assert.match(row, /^https:\/\/github\.com\/jfcc\/tesorero,Tesorero,https:\/\/nearhunt\.xyz\/p\/a,https:\/\/x\.com\/u\/status\/2121765709235835051,,,same-post,a$/);
});
