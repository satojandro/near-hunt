import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOT_SUPPLIED, safeHttpsUrl, linkHost, linkText, linkRow, linkRows, descriptionView, eventLabel, isXPost, extraLinkLabel, linkNote,
  formatBlockHeight, explorerBlockUrl, formatUtc, kvRecordUrl, recordRows, metaDescription,
} from '../lib/project-view.mjs';

const ID = '21996773-48fa-43e9-aedc-684fdd2e4425';
const item = (extra = {}) => ({
  schema: 'nearhunt/project/1', id: `nearhackathon-2026:${ID}`,
  name: 'Veto: on-chain spending firewall for AI agents on NEAR', description: null,
  tracks: ['security', 'agents'], repository_url: null,
  demo_url: 'https://x.com/tarantinbv/status/2116528585829720403', external_campaigns: [],
  source: { event: 'nearhackathon-2026', submission_id: ID, url: 'https://nearhackathon.com/#submissions' },
  updated_at: '2026-11-08T07:15:21.835Z',
  submission_id: ID, key: `project/${ID}`, account: 'nearhunt.near',
  block_height: 223583277, block_timestamp: 1794122153750786652, ...extra,
});

test('safeHttpsUrl accepts https only and rejects credentials and junk', () => {
  assert.equal(safeHttpsUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHttpsUrl('http://example.com'), null);
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpsUrl('https://user:pw@example.com'), null);
  assert.equal(safeHttpsUrl('not a url'), null);
  assert.equal(safeHttpsUrl(''), null);
  assert.equal(safeHttpsUrl(null), null);
  assert.equal(safeHttpsUrl(42), null);
});

test('linkHost and linkText drop scheme, www and trailing slash', () => {
  assert.equal(linkHost('https://www.github.com/near/x'), 'github.com');
  assert.equal(linkText('https://x.com/tarantinbv/status/2116528585829720403'), 'x.com/tarantinbv/status/2116528585829720403');
  assert.equal(linkText('https://www.example.com/'), 'example.com');
  assert.equal(linkText('https://example.com/a/'), 'example.com/a');
  assert.equal(linkText('https://nearhackathon.com/#submissions'), 'nearhackathon.com#submissions');
  assert.equal(linkHost('http://example.com'), null);
});

test('linkRow: null is Not supplied, non-https is text only, https is a link', () => {
  assert.deepEqual(linkRow('Repository', null), { label: 'Repository', href: null, text: NOT_SUPPLIED, supplied: false });
  assert.equal(linkRow('Repository', '  ').text, NOT_SUPPLIED);
  const bad = linkRow('Demo', 'javascript:alert(1)');
  assert.equal(bad.href, null);
  assert.equal(bad.text, 'javascript:alert(1)');
  assert.ok(bad.note);
  const ok = linkRow('Demo', 'https://example.com/demo');
  assert.equal(ok.href, 'https://example.com/demo');
  assert.equal(ok.text, 'example.com/demo');
});

test('linkRows labels the source URL as the generic listing', () => {
  const rows = linkRows(item());
  // The fixture's demo_url is an X post, so it is labelled as such rather than "Demo".
  assert.deepEqual(rows.map((r) => r.label), ['Launch post on X', 'Repository', 'Hackathon listing']);
  assert.equal(rows[1].text, NOT_SUPPLIED);
  assert.equal(rows[2].href, 'https://nearhackathon.com/#submissions');
  assert.match(rows[2].note, /no per-project page/);
});

test('NH-96 step 1: a non-X demo keeps the "Demo" label', () => {
  const rows = linkRows(item({ demo_url: 'https://app.example.com' }));
  assert.equal(rows[0].label, 'Demo');
  assert.equal(rows[0].href, 'https://app.example.com/');
});

test('NH-96 step 1: every builder link is shown, de-duplicated, https only', () => {
  const rows = linkRows(item({
    repository_url: 'https://github.com/a/b',
    links: [
      { url: 'https://aegis-demo-beta.vercel.app', source_post_id: '1' },
      { url: 'https://www.youtube.com/watch?v=abc', source_post_id: '1' },
      { url: 'https://t.me/aegis', source_post_id: '1' },
      { url: 'https://aegis-demo-beta.vercel.app', source_post_id: '2' }, // duplicate
      { url: 'https://github.com/a/b', source_post_id: '1' }, // same as repository_url
      { url: 'http://insecure.example', source_post_id: '1' }, // not https: dropped
      { url: 'javascript:alert(1)' },
      null,
      'https://plain-string.example',
    ],
  }));
  assert.deepEqual(rows.map((r) => r.label), [
    'Launch post on X', 'Repository', 'Link', 'Video', 'Telegram', 'Link', 'Hackathon listing',
  ]);
  assert.equal(rows[2].href, 'https://aegis-demo-beta.vercel.app/');
  assert.equal(rows[2].text, 'aegis-demo-beta.vercel.app');
  assert.match(rows[2].note, /builder/);
  assert.equal(rows[5].href, 'https://plain-string.example/');
  assert.ok(rows.every((r) => r.href === null || r.href.startsWith('https://')));
});

test('NH-96 step 3: labelled links use their kind; a gone link says so, unverified says nothing', () => {
  const rows = linkRows(item({
    links: [
      { url: 'https://sealed.edycu.dev', kind: 'demo', kind_basis: 'builder', check: { verdict: 'live', http_status: 200, checked_at: '2026-11-09T02:00:00.000Z' } },
      { url: 'https://nearblocks.io/address/a.near', kind: 'explorer', kind_basis: 'host', check: { verdict: 'unverified', http_status: 403, checked_at: '2026-11-09T02:00:00.000Z' } },
      { url: 'https://njump.me/x', kind: 'website', kind_basis: 'default', check: { verdict: 'gone', http_status: 404, checked_at: '2026-11-09T02:00:00.000Z' } },
    ],
  }));
  assert.deepEqual(rows.slice(2, 5).map((r) => r.label), ['Demo', 'On-chain', 'Website']);
  assert.equal(rows[2].note, 'Posted by the builder on X');
  assert.equal(rows[3].note, 'Posted by the builder on X');
  assert.equal(rows[4].note, 'Did not answer when checked on 9 Nov 2026 (HTTP 404). Posted by the builder on X');
  assert.equal(rows[4].href, 'https://njump.me/x'); // kept, never dropped
  assert.equal(linkNote('https://plain.example'), 'Posted by the builder on X');
});

test('isXPost and extraLinkLabel', () => {
  assert.equal(isXPost('https://x.com/a/status/123'), true);
  assert.equal(isXPost('https://twitter.com/a/status/123'), true);
  assert.equal(isXPost('https://x.com/a'), false);
  assert.equal(isXPost('https://notx.com/a/status/1'), false);
  assert.equal(isXPost('http://x.com/a/status/1'), false);
  assert.equal(extraLinkLabel('https://youtu.be/x'), 'Video');
  assert.equal(extraLinkLabel('https://discord.gg/x'), 'Discord');
  assert.equal(extraLinkLabel('https://somewhere.app'), 'Link');
  assert.equal(extraLinkLabel('nope'), 'Link');
});

test('descriptionView never renders null as empty', () => {
  const none = descriptionView(null);
  assert.equal(none.supplied, false);
  assert.match(none.text, /^Not supplied/);
  assert.equal(descriptionView('').supplied, false);
  assert.deepEqual(descriptionView('Hello'), { supplied: true, text: 'Hello' });
});

test('eventLabel maps known events and passes unknown ones through', () => {
  assert.equal(eventLabel('nearhackathon-2026'), 'NEAR Hackathon 2026');
  assert.equal(eventLabel('other-event'), 'other-event');
  assert.equal(eventLabel(undefined), null);
});

test('formatBlockHeight and explorerBlockUrl', () => {
  assert.equal(formatBlockHeight(223583277), '223,583,277');
  assert.equal(formatBlockHeight(0), '0');
  assert.equal(formatBlockHeight(-1), null);
  assert.equal(formatBlockHeight(1.5), null);
  assert.equal(formatBlockHeight('5'), null);
  assert.equal(explorerBlockUrl(223583277), 'https://pikespeak.ai/block/223583277');
  assert.equal(explorerBlockUrl(0), null);
  assert.equal(explorerBlockUrl(null), null);
});

test('formatUtc is deterministic UTC', () => {
  assert.equal(formatUtc('2026-11-08T07:15:21.835Z'), '8 Nov 2026, 07:15 UTC');
  assert.equal(formatUtc('nope'), null);
  assert.equal(formatUtc(undefined), null);
});

test('kvRecordUrl is scoped to the namespace account as writer', () => {
  assert.equal(
    kvRecordUrl({ account: 'nearhunt.near', key: `project/${ID}` }),
    `https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/${ID}`,
  );
  assert.equal(kvRecordUrl({ account: 'nearhunt.near', key: 'project/a b' }), 'https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/a%20b');
  assert.equal(kvRecordUrl({ account: 'nearhunt.near', key: 'vote/x' }), null);
  assert.equal(kvRecordUrl({ account: 'nearhunt.near', key: 'project/' }), null);
  assert.equal(kvRecordUrl({ account: '../evil', key: 'project/x' }), null);
  assert.match(kvRecordUrl({ account: 'nearhunt.testnet', key: 'project/x', network: 'testnet' }), /^https:\/\/kv\.test\.fastnear\.com\//);
});

test('recordRows lists account, key, schema, block and updated_at', () => {
  const rows = recordRows(item());
  assert.deepEqual(rows.map((r) => r.value), [
    'nearhunt.near', `project/${ID}`, 'nearhunt/project/1', '223,583,277', '8 Nov 2026, 07:15 UTC',
  ]);
  assert.equal(rows[3].href, 'https://pikespeak.ai/block/223583277');
  const missing = recordRows(item({ block_height: undefined, updated_at: 'bad' }));
  assert.equal(missing[3].value, NOT_SUPPLIED);
  assert.equal(missing[3].href, null);
  assert.equal(missing[4].value, NOT_SUPPLIED);
});

test('metaDescription never invents a description', () => {
  const d = metaDescription(item(), (t) => t.toUpperCase());
  assert.match(d, /^Veto: .* — a NEAR Hackathon 2026 project \(SECURITY, AGENTS\)\./);
  assert.ok(!/firewall that/i.test(d));
  assert.equal(metaDescription(item({ description: 'Real text' })), 'Real text');
  assert.equal(metaDescription(item({ description: 'x'.repeat(300) })).length, 198);
});
