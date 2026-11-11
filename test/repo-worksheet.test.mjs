import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, toCsv, parseCsv, worksheetRows, filledRows, applyWorksheet } from '../lib/repo-worksheet.mjs';
import { enrichmentFragment } from '../lib/import-plan.mjs';

const at = '2026-11-11T00:00:00.000Z';

test('toCsv/parseCsv round-trip commas, quotes and line breaks', () => {
  const rows = [{ ...Object.fromEntries(COLUMNS.map((c) => [c, ''])), name: 'Pay, "go"\nnow', submission_id: 's1' }];
  const back = parseCsv(toCsv(rows));
  assert.equal(back.length, 1);
  assert.equal(back[0].name, 'Pay, "go"\nnow');
  assert.equal(back[0].submission_id, 's1');
  assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n\r\n'), [{ a: '1', b: '2' }]);
});

test('worksheetRows: only projects with no repository anywhere; candidates first, then sites', () => {
  const projects = [
    { submission_id: 'a', name: 'Zed', demo_url: 'https://x.com/z/status/1' },
    { submission_id: 'b', name: 'Has', demo_url: 'https://x.com/h/status/2', repository_url: 'https://github.com/h/h' },
    { submission_id: 'c', name: 'Proposed', demo_url: 'https://x.com/p/status/3' },
    { submission_id: 'd', name: 'Site', demo_url: 'https://site.example' },
    { submission_id: 'e', name: 'Cand', demo_url: 'https://x.com/c/status/5', on_chain: false },
  ];
  const results = [
    { submission_id: 'a', status: 'ok', author: 'z', links: [{ url: 'https://youtu.be/v', kind: 'video' }] },
    { submission_id: 'c', status: 'ok', repository_url: 'https://github.com/p/p' },
    { submission_id: 'd', status: 'not-an-x-post' },
    { submission_id: 'e', status: 'ok', repository_candidates: ['https://github.com/c/one', 'https://github.com/c/two'] },
  ];
  const rows = worksheetRows(projects, results);
  assert.deepEqual(rows.map((r) => r.submission_id), ['e', 'd', 'a']);
  assert.equal(rows[0].candidates, 'https://github.com/c/one https://github.com/c/two');
  assert.equal(rows[0].page, '');
  assert.equal(rows[1].site_links, 'https://site.example');
  assert.equal(rows[1].x_post, '');
  assert.equal(rows[2].x_author, '@z');
  assert.equal(rows[2].page, 'https://nearhunt.xyz/p/a');
  assert.equal(rows[2].site_links, '');
});

test('filledRows: normalises repository URLs and reports what it will not accept', () => {
  const { entries, rejected } = filledRows([
    { submission_id: 'a', repository_url: 'github.com/Acme/Veto/tree/main' },
    { submission_id: 'b', repository_url: '' },
    { submission_id: 'c', repository_url: 'https://veto.app' },
    { submission_id: 'a', repository_url: 'https://github.com/acme/other' },
    { submission_id: '', repository_url: 'https://github.com/acme/x' },
  ]);
  assert.deepEqual(entries, [{ submission_id: 'a', repository_url: 'https://github.com/Acme/Veto' }]);
  assert.deepEqual(rejected.map((r) => r.reason), [
    'not a repository URL (https://github.com/owner/repo)', 'submission_id appears twice', 'row has no submission_id',
  ]);
});

test('applyWorksheet: fills empty repositories only, needs git ls-remote, and the importer accepts the row', () => {
  const repo = 'https://github.com/acme/veto';
  const results = [
    { submission_id: 'a', status: 'ok', repository_url: null, repository_candidates: [repo], enrichment: { method: 'x-thread', sources: ['https://x.com/a/status/1'], retrieved_at: 'earlier' } },
    { submission_id: 'b', status: 'ok', repository_url: 'https://github.com/b/b' },
    { submission_id: 'c', status: 'not-an-x-post' },
  ];
  const entries = [
    { submission_id: 'a', repository_url: repo },
    { submission_id: 'b', repository_url: 'https://github.com/b/other' },
    { submission_id: 'c', repository_url: 'https://github.com/c/c' },
    { submission_id: 'd', repository_url: 'https://github.com/d/gone' },
    { submission_id: 'new', repository_url: 'https://github.com/n/n' },
  ];
  const answered = new Map([[repo, true], ['https://github.com/b/other', true], ['https://github.com/c/c', true], ['https://github.com/d/gone', false], ['https://github.com/n/n', true]]);
  const { results: out, applied, skipped } = applyWorksheet(results, entries, { answered, retrievedAt: at });
  assert.deepEqual(applied, ['a', 'c', 'new']);
  assert.deepEqual(skipped.map((s) => s.submission_id), ['b', 'd']);
  assert.equal(results[0].repository_url, null, 'input rows are not mutated');
  const a = out.find((r) => r.submission_id === 'a');
  assert.equal(a.repository_url, repo);
  assert.deepEqual(a.repository_basis, ['owner']);
  assert.equal(a.enrichment.method, 'x-thread');
  assert.deepEqual(a.enrichment.sources, ['https://x.com/a/status/1', repo]);
  assert.equal(a.repository_candidates, undefined);
  const c = out.find((r) => r.submission_id === 'c');
  assert.equal(c.status, 'ok');
  assert.equal(c.enrichment.method, 'owner');
  assert.equal(out.find((r) => r.submission_id === 'b').repository_url, 'https://github.com/b/b');
  assert.equal(enrichmentFragment({ repository_url: null }, c).repository_url, 'https://github.com/c/c');
  assert.deepEqual(enrichmentFragment({ repository_url: 'https://github.com/x/y' }, c), {});
});
