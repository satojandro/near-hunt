/**
 * The owner's repository worksheet: a CSV of every project that still has no repository, which
 * the owner fills in by hand, and the merge of the filled sheet into an enrichment proposal.
 *
 * A URL typed here is the owner's decision, so it needs no evidence chain; it still has to be a
 * repository URL and answer `git ls-remote` (scripts/repo-worksheet.mjs checks that). Pure: no
 * network, no files.
 */
import { gitRepoUrl } from './link-label.mjs';

export const COLUMNS = ['repository_url', 'name', 'page', 'x_post', 'x_author', 'site_links', 'candidates', 'submission_id'];
export const SITE = 'https://nearhunt.xyz';
const SITE_KINDS = new Set(['demo', 'website', 'docs']);

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rows of objects -> CSV text with a header line. */
export function toCsv(rows, columns = COLUMNS) {
  return `${[columns, ...rows.map((r) => columns.map((c) => r[c]))].map((line) => line.map(cell).join(',')).join('\n')}\n`;
}

/** CSV text -> rows of objects keyed by the header line. Handles quotes, commas and line breaks in cells. */
export function parseCsv(text) {
  const lines = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      lines.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); lines.push(row); }
  const [header, ...body] = lines.filter((l) => l.some((c) => c.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((l) => Object.fromEntries(keys.map((k, i) => [k, (l[i] ?? '').trim()])));
}

/**
 * One worksheet row per project that has no repository on chain and none in the proposal.
 * Rows with candidates come first, then rows with a site to look at, then the rest.
 *
 * @param {Array<{submission_id: string, name?: string, demo_url?: string|null, repository_url?: string|null}>} projects chain records and pending feed submissions
 * @param {Array<object>} results the proposal's rows
 */
export function worksheetRows(projects, results) {
  const byId = new Map((results ?? []).map((r) => [r.submission_id, r]));
  const rows = [];
  for (const p of projects) {
    const r = byId.get(p.submission_id) ?? {};
    if (p.repository_url || r.repository_url) continue;
    const isX = typeof p.demo_url === 'string' && /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//.test(p.demo_url);
    const sites = [
      ...(p.demo_url && !isX ? [p.demo_url] : []),
      ...(r.links ?? []).filter((l) => SITE_KINDS.has(l?.kind)).map((l) => l.url),
    ];
    rows.push({
      repository_url: '',
      name: p.name ?? '',
      page: p.on_chain === false ? '' : `${SITE}/p/${p.submission_id}`,
      x_post: isX ? p.demo_url : '',
      x_author: r.author ? `@${r.author}` : '',
      site_links: [...new Set(sites)].join(' '),
      candidates: (r.repository_candidates ?? []).join(' '),
      submission_id: p.submission_id,
    });
  }
  const rank = (x) => (x.candidates ? 0 : x.site_links ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * The filled-in rows of a worksheet. A URL that is not a repository on a known git host is
 * reported, never guessed at.
 * @returns {{ entries: Array<{submission_id: string, repository_url: string}>, rejected: Array<{submission_id: string, value: string, reason: string}> }}
 */
export function filledRows(rows) {
  const entries = [];
  const rejected = [];
  const seen = new Set();
  for (const row of rows) {
    const value = (row.repository_url ?? '').trim();
    if (!value) continue;
    const id = (row.submission_id ?? '').trim();
    const repo = gitRepoUrl(/^https?:\/\//i.test(value) ? value.replace(/^http:/i, 'https:') : `https://${value}`);
    if (!id) rejected.push({ submission_id: id, value, reason: 'row has no submission_id' });
    else if (seen.has(id)) rejected.push({ submission_id: id, value, reason: 'submission_id appears twice' });
    else if (!repo) rejected.push({ submission_id: id, value, reason: 'not a repository URL (https://github.com/owner/repo)' });
    else { seen.add(id); entries.push({ submission_id: id, repository_url: repo }); }
  }
  return { entries, rejected };
}

/**
 * Put the owner's repositories into a proposal's rows. Only an empty `repository_url` is filled;
 * a row the crawler could not build (`not-an-x-post`, …) becomes a minimal `ok` row so the
 * importer applies it. `answered` is the `git ls-remote` result per URL.
 *
 * @returns {{ results: Array<object>, applied: string[], skipped: Array<{submission_id: string, reason: string}> }}
 */
export function applyWorksheet(results, entries, { answered, retrievedAt }) {
  const out = (results ?? []).map((r) => ({ ...r }));
  const byId = new Map(out.map((r) => [r.submission_id, r]));
  const applied = [];
  const skipped = [];
  for (const { submission_id, repository_url } of entries) {
    if (answered.get(repository_url) !== true) {
      skipped.push({ submission_id, reason: `git ls-remote did not answer for ${repository_url}` });
      continue;
    }
    let r = byId.get(submission_id);
    if (r?.repository_url) {
      skipped.push({ submission_id, reason: `proposal already has ${r.repository_url}` });
      continue;
    }
    if (!r || r.status !== 'ok') {
      const fresh = { submission_id, status: 'ok', enrichment: { method: 'owner', sources: [], retrieved_at: retrievedAt } };
      if (r) out[out.indexOf(r)] = fresh; else out.push(fresh);
      byId.set(submission_id, fresh);
      r = fresh;
    }
    r.repository_url = repository_url;
    r.repository_source = repository_url;
    r.repository_basis = ['owner'];
    r.repository_verified = true;
    r.repository_verified_at = retrievedAt;
    delete r.repository_candidates;
    r.enrichment = { method: 'owner', retrieved_at: retrievedAt, ...r.enrichment, sources: [...new Set([...(r.enrichment?.sources ?? []), repository_url])] };
    applied.push(submission_id);
  }
  return { results: out, applied, skipped };
}
