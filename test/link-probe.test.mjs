import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHead, resolveHttps, decodeEntities, refuseReason, probeLink, linksToCheck, summarizeProbes, verdictOf,
} from '../lib/link-probe.mjs';
import { isXPost } from '../lib/project-view.mjs';

/** A fetch stub: url -> { status, headers, body }. Records every call. */
function stub(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = routes[url];
    if (r instanceof Error) throw r;
    if (!r) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: r.headers ?? { 'content-type': 'text/html; charset=utf-8' } });
  };
  return { fetchImpl, calls };
}

test('parseHead reads title and og:image, resolves relative images, decodes entities', () => {
  const html = `<html><head><title>
    Pay &amp; go &#8212; NearPocket</title>
    <meta content="/og.png" property="og:image"><meta property="og:title" content="ignored"></head>`;
  assert.deepEqual(parseHead(html, 'https://nearpocket.vercel.app/app/'), {
    title: 'Pay & go — NearPocket', og_image: 'https://nearpocket.vercel.app/og.png',
  });
});

test('parseHead falls back to og:title and twitter:image, drops non-https images', () => {
  assert.deepEqual(
    parseHead(`<meta property='og:title' content='Thing'><meta name="twitter:image" content="https://cdn.example/t.png">`, 'https://a.example'),
    { title: 'Thing', og_image: 'https://cdn.example/t.png' },
  );
  assert.equal(parseHead('<meta property="og:image" content="http://insecure.example/a.png">', 'https://a.example').og_image, null);
  assert.equal(parseHead('<meta property="og:image" content="javascript:alert(1)">', 'https://a.example').og_image, null);
  assert.deepEqual(parseHead('', 'https://a.example'), { title: null, og_image: null });
  assert.equal(parseHead(`<title>${'x'.repeat(500)}</title>`, 'https://a.example').title.length, 200);
});

test('resolveHttps and decodeEntities', () => {
  assert.equal(resolveHttps('img/a.png', 'https://a.example/x/'), 'https://a.example/x/img/a.png');
  assert.equal(resolveHttps('https://u:p@a.example/a.png', 'https://a.example'), null);
  assert.equal(decodeEntities('&lt;b&gt; &#x27;q&#39; &bogus;'), "<b> 'q' &bogus;");
});

test('refuseReason keeps the crawler off local and non-https targets', () => {
  assert.equal(refuseReason('https://example.com/a'), null);
  assert.equal(refuseReason('http://example.com'), 'not https');
  assert.equal(refuseReason('https://127.0.0.1/'), 'IP address');
  assert.equal(refuseReason('https://[::1]/'), 'IP address');
  assert.equal(refuseReason('https://localhost/'), 'local host name');
  assert.equal(refuseReason('https://intranet/'), 'local host name');
  assert.equal(refuseReason('https://box.internal/'), 'local host name');
  assert.equal(refuseReason('https://example.com:8443/'), 'non-default port');
  assert.equal(refuseReason('https://u:p@example.com/'), 'credentials in URL');
  assert.equal(refuseReason('nope'), 'not a URL');
});

test('probeLink: 200 HTML gives title and og:image; one request, honest user agent', async () => {
  const { fetchImpl, calls } = stub({
    'https://demo.example/': { body: '<title>Demo</title><meta property="og:image" content="/og.png">' },
  });
  const r = await probeLink('https://demo.example/', { fetchImpl });
  assert.equal(r.status, 'ok');
  assert.equal(r.http_status, 200);
  assert.equal(r.title, 'Demo');
  assert.equal(r.og_image, 'https://demo.example/og.png');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.match(calls[0].init.headers['user-agent'], /nearhunt-linkcheck/);
  assert.equal(verdictOf(r), 'live');
});

test('probeLink follows redirects by hand and refuses a redirect to a local host', async () => {
  const ok = stub({
    'https://a.example': { status: 301, headers: { location: 'https://www.a.example/' } },
    'https://www.a.example/': { body: '<title>A</title>' },
  });
  const r = await probeLink('https://a.example', ok);
  assert.equal(r.final_url, 'https://www.a.example/');
  assert.equal(r.redirects, 1);
  assert.equal(r.title, 'A');

  const bad = stub({ 'https://b.example': { status: 302, headers: { location: 'https://127.0.0.1/admin' } } });
  const b = await probeLink('https://b.example', bad);
  assert.equal(b.status, 'refused');
  assert.match(b.error, /^redirect: IP address/);
  assert.equal(bad.calls.length, 1);
});

test('probeLink caps redirect loops', async () => {
  const loop = stub({ 'https://l.example/': { status: 302, headers: { location: 'https://l.example/' } } });
  const r = await probeLink('https://l.example/', loop);
  assert.equal(r.status, 'unreachable');
  assert.equal(r.error, 'too many redirects');
});

test('verdicts: only 404/410 and a missing host count as gone; blocks and 5xx are unverified', async () => {
  const s = stub({
    'https://gone.example': { status: 404 },
    'https://cf.example': { status: 403 },
    'https://busy.example': { status: 429 },
    'https://sleep.example': { status: 503 },
    'https://yt.example': { status: 302, headers: { location: 'https://www.google.com/sorry/index?continue=x' } },
    'https://www.google.com/sorry/index?continue=x': { status: 200, body: '<title>Sorry</title>' },
    'https://slow.example': Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
  });
  const v = async (u) => verdictOf(await probeLink(u, s));
  assert.equal(await v('https://gone.example'), 'gone');
  assert.equal(await v('https://nxdomain.example'), 'gone');
  assert.equal(await v('https://cf.example'), 'unverified');
  assert.equal(await v('https://busy.example'), 'unverified');
  assert.equal(await v('https://sleep.example'), 'unverified');
  assert.equal(await v('https://yt.example'), 'unverified');
  assert.equal(await v('https://slow.example'), 'unverified');
  assert.equal(await v('http://plain.example'), 'unverified');
});

test('non-HTML responses are not parsed', async () => {
  const s = stub({ 'https://f.example/a.pdf': { headers: { 'content-type': 'application/pdf' }, body: '<title>no</title>' } });
  const r = await probeLink('https://f.example/a.pdf', s);
  assert.equal(r.status, 'ok');
  assert.equal(r.content_type, 'application/pdf');
  assert.equal(r.title, null);
});

test('linksToCheck: every links entry plus a non-X demo_url, de-duplicated', () => {
  const p = {
    demo_url: 'https://app.example',
    links: [{ url: 'https://app.example' }, { url: 'https://docs.example' }, 'https://plain.example', null],
  };
  assert.deepEqual(linksToCheck(p, isXPost).map((l) => [l.field, l.url]), [
    ['demo_url', 'https://app.example'], ['links', 'https://docs.example'], ['links', 'https://plain.example'],
  ]);
  assert.deepEqual(linksToCheck({ demo_url: 'https://x.com/a/status/1' }, isXPost), []);
});

test('summarizeProbes counts verdicts, titles, images and cross-host redirects', () => {
  const out = summarizeProbes([
    { url: 'https://a.example', final_url: 'https://www.a.example/', status: 'ok', title: 'A', og_image: 'https://a.example/i.png' },
    { url: 'https://b.example', final_url: 'https://b.example', status: 'http-error', http_status: 404 },
  ]);
  assert.deepEqual(out, {
    links: 2, by_verdict: { live: 1, gone: 1 }, by_status: { ok: 1, 'http-error': 1 },
    with_title: 1, with_og_image: 1, redirected_to_other_host: 1,
  });
});
