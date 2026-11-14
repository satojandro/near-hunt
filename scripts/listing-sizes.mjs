#!/usr/bin/env node
/**
 * Measure the project listing's stored sizes (NH-122), read-only.
 *
 * Walks mainnet once with the walker the cron uses, builds the listing exactly as it does, and
 * prints what each Redis key would hold: the plain JSON, and the stored value (gzip + base64, as
 * lib/snapshot.mjs `encodeSnapshot` writes it). The size figures in the comments of
 * lib/projects-store.ts, lib/projects.ts and lib/refresh-projects.mjs come from this command.
 *
 *   node scripts/listing-sizes.mjs
 *
 * Nothing is written anywhere: no chain, no Redis.
 */
import { readFileSync } from 'node:fs';
import { buildProjectsListing } from '../lib/listing.mjs';
import { listingDigest, walkProjects } from '../lib/refresh-projects.mjs';
import { encodeSnapshot } from '../lib/snapshot.mjs';

const hidden = JSON.parse(readFileSync(new URL('../data/hidden-projects.json', import.meta.url), 'utf8'));

const walk = await walkProjects();
const items = buildProjectsListing(walk.entries, hidden);
const fetched_at = new Date().toISOString();
const digest = listingDigest(items);

const heavy = { items, account: walk.account, fetched_at, digest };
const marker = { fetched_at, digest, rows: items.length };

const bytes = (s) => Buffer.byteLength(s, 'utf8');
const heavyPlain = bytes(JSON.stringify(heavy));
const heavyStored = bytes(encodeSnapshot(heavy));
const markerPlain = bytes(JSON.stringify(marker));
const markerStored = bytes(encodeSnapshot(marker));
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const perDay = 24 * 60;

console.log(`measured:        ${fetched_at} (${walk.pages} pages, ${walk.ms} ms)`);
console.log(`listing rows:    ${items.length}`);
console.log(`items key:       ${heavyPlain} B plain JSON (${kb(heavyPlain)}), ${heavyStored} B stored (${kb(heavyStored)})`);
console.log(`marker key:      ${markerPlain} B plain JSON, ${markerStored} B stored`);
console.log(
  `once a minute:   items ${((heavyStored * perDay) / 1024 / 1024).toFixed(0)} MB/day vs marker ` +
    `${((markerStored * perDay) / 1024).toFixed(0)} KB/day`,
);
