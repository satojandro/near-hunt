/**
 * Pure helpers for the project page `/p/{submission_id}` (NH-20, NH-21). No network, no React,
 * so they can be unit-tested with `node --test`.
 */

import { KV_HOSTS } from './kv.mjs';

export const NOT_SUPPLIED = 'Not supplied';

/**
 * Block explorer used for the "written at block" link. Pikespeak was checked on 8 Nov 2026:
 * https://pikespeak.ai/block/223583277 renders that block and its `__fastdata_kv` call from
 * nearhunt.near. nearblocks.io answers automated checks with a Cloudflare challenge (403), so it
 * could not be verified and is not used.
 */
export const BLOCK_EXPLORER = 'https://pikespeak.ai/block/';

const EVENT_LABELS = { 'nearhackathon-2026': 'NEAR Hackathon 2026' };

/**
 * The URL as a string when it is a well-formed https URL without embedded credentials, else
 * null. Only URLs that pass this are rendered as links.
 * @param {unknown} url
 * @returns {string | null}
 */
export function safeHttpsUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return null;
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return null;
  return u.href;
}

/** Hostname without a leading `www.`; null for anything that is not a safe https URL. */
export function linkHost(url) {
  const safe = safeHttpsUrl(url);
  return safe ? new URL(safe).hostname.replace(/^www\./, '') : null;
}

/**
 * Readable link text: host plus path, query and hash, without the scheme, `www.` or a trailing
 * slash, e.g. `x.com/tarantinbv/status/2116528585829720403`.
 */
export function linkText(url) {
  const safe = safeHttpsUrl(url);
  if (!safe) return null;
  const u = new URL(safe);
  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
  return `${u.hostname.replace(/^www\./, '')}${path}${u.search}${u.hash}`;
}

/**
 * One row of the "Links" card.
 * - null/empty value -> `Not supplied`, no link
 * - https value -> link
 * - any other value (the schema forbids it, but be defensive) -> shown as plain text, never a link
 * @returns {{ label: string, href: string | null, text: string, supplied: boolean, note?: string }}
 */
export function linkRow(label, url) {
  if (url == null || (typeof url === 'string' && url.trim() === '')) {
    return { label, href: null, text: NOT_SUPPLIED, supplied: false };
  }
  const href = safeHttpsUrl(url);
  if (!href) return { label, href: null, text: String(url), supplied: true, note: 'Not linked: not an https URL' };
  return { label, href, text: linkText(href) ?? href, supplied: true };
}

const X_POST_RE = /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/;

/** True when the URL is a post on X (`x.com/{user}/status/{id}`), the hackathon's usual "demo". */
export function isXPost(url) {
  const safe = safeHttpsUrl(url);
  if (!safe) return false;
  const u = new URL(safe);
  return X_POST_RE.test(u.hostname.toLowerCase()) && /\/status(?:es)?\/\d{1,20}/.test(u.pathname);
}

/**
 * Label for one entry of a record's `links` array (NH-96 step 1). Only hosts whose kind is
 * certain get a specific label; everything else is a plain "Link" until step 3 labels it from
 * the probe results. Never "Demo" or "Website" by guesswork.
 */
export function extraLinkLabel(url) {
  const host = linkHost(url);
  if (!host) return 'Link';
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com' || host === 'loom.com') return 'Video';
  if (host === 't.me') return 'Telegram';
  if (host === 'discord.gg' || host === 'discord.com') return 'Discord';
  return 'Link';
}

/**
 * Rows for the "Links" card, in display order.
 *
 * - `demo_url` is shown as "Launch post on X" when it is an X post (269 of 281 records on
 *   9 Nov), because calling a tweet the demo is misleading.
 * - Every entry of the additive `links` array (NH-95/96: URLs the builder posted) gets a row,
 *   de-duplicated against the demo and repository URLs. Non-https entries are dropped.
 */
export function linkRows(project) {
  const rows = [];
  const xPost = isXPost(project.demo_url);
  rows.push(linkRow(xPost ? 'Launch post on X' : 'Demo', project.demo_url));
  rows.push(linkRow('Repository', project.repository_url));

  const seen = new Set([project.demo_url, project.repository_url].map((u) => safeHttpsUrl(u)).filter(Boolean));
  const extra = Array.isArray(project.links) ? project.links : [];
  for (const entry of extra) {
    const href = safeHttpsUrl(typeof entry === 'string' ? entry : entry?.url);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    rows.push({ ...linkRow(extraLinkLabel(href), href), note: 'Posted by the builder on X' });
  }

  rows.push({
    ...linkRow('Hackathon listing', project.source?.url),
    note: 'All submissions: the source has no per-project page',
  });
  return rows;
}

/** Description text, or an honest "Not supplied" explanation. */
export function descriptionView(description) {
  if (typeof description === 'string' && description.trim() !== '') {
    return { supplied: true, text: description };
  }
  return { supplied: false, text: `${NOT_SUPPLIED}. The hackathon feed publishes a name, tracks and a demo link, but no descriptions.` };
}

/** Display name of a source event; unknown slugs are shown as they are. */
export function eventLabel(event) {
  if (typeof event !== 'string' || event === '') return null;
  return EVENT_LABELS[event] ?? event;
}

/** `223583277` -> `223,583,277`; null for anything that is not a non-negative safe integer. */
export function formatBlockHeight(height) {
  if (!Number.isSafeInteger(height) || height < 0) return null;
  return String(height).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Explorer page for a block height, or null when the height is not usable. */
export function explorerBlockUrl(height) {
  if (!Number.isSafeInteger(height) || height <= 0) return null;
  return `${BLOCK_EXPLORER}${height}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO time -> `8 Nov 2026, 07:15 UTC` (always UTC, so server and client agree); null if invalid. */
export function formatUtc(iso) {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/**
 * Public GET URL of this exact row in the FastData KV API, scoped to rows the namespace account
 * wrote itself: `/v0/latest/{account}/{account}/{key}` (see schema/README.md). Checked on
 * 8 Nov 2026: the URL returns `{"entries":[row]}` with this row only.
 */
export function kvRecordUrl({ account, key, network = 'mainnet' }) {
  const host = KV_HOSTS[network];
  if (!host || typeof account !== 'string' || !/^[a-z0-9._-]{2,64}$/.test(account)) return null;
  if (typeof key !== 'string' || !key.startsWith('project/') || key.length <= 'project/'.length) return null;
  const id = key.slice('project/'.length);
  return `${host}/v0/latest/${account}/${account}/project/${encodeURIComponent(id)}`;
}

/**
 * Rows for the on-chain record card (NH-21). Missing values become `Not supplied`.
 * @returns {Array<{ label: string, value: string, href: string | null, mono?: boolean }>}
 */
export function recordRows(item) {
  const height = formatBlockHeight(item.block_height);
  const updated = formatUtc(item.updated_at);
  return [
    { label: 'Account', value: item.account || NOT_SUPPLIED, href: null, mono: true },
    { label: 'Key', value: item.key || NOT_SUPPLIED, href: null, mono: true },
    { label: 'Schema', value: item.schema || NOT_SUPPLIED, href: null, mono: true },
    { label: 'Written at block', value: height ?? NOT_SUPPLIED, href: height ? explorerBlockUrl(item.block_height) : null },
    { label: 'Record updated', value: updated ?? NOT_SUPPLIED, href: null },
  ];
}

/** Text for `<meta name="description">`. Never invents a description. */
export function metaDescription(item, labelFor = (t) => t) {
  const d = descriptionView(item.description);
  if (d.supplied) return d.text.length > 200 ? `${d.text.slice(0, 197)}…` : d.text;
  const tracks = (item.tracks ?? []).map(labelFor).join(', ');
  const event = eventLabel(item.source?.event);
  return [
    `${item.name}${event ? ` — a ${event} project` : ''}${tracks ? ` (${tracks})` : ''}.`,
    'An open record on NEAR mainnet, account nearhunt.near.',
  ].join(' ');
}
