import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOT_SUPPLIED, safeHttpsUrl, linkHost, linkText, linkRow, linkRows, descriptionView, eventLabel,
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
  assert.deepEqual(rows.map((r) => r.label), ['Demo', 'Repository', 'Hackathon listing']);
  assert.equal(rows[1].text, NOT_SUPPLIED);
  assert.equal(rows[2].href, 'https://nearhackathon.com/#submissions');
  assert.match(rows[2].note, /no per-project page/);
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
