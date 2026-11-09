// Is the deployed site actually working?
//
//   node scripts/site-health.mjs                 # silent on success, one line per failure
//   node scripts/site-health.mjs --base https://near-hunt.vercel.app
//   node scripts/site-health.mjs --verbose
//
// Why this exists (NH-110): the feed watcher runs the importer locally, so it says nothing about
// production. And a full KV outage returns **200 on `/`** (the Suspense boundary has already
// flushed the response — docs/PLAN.md B4), so an uptime monitor that only checks HTTP status
// reports green while every visitor sees the error page. Every check here asserts content.
//
// Read-only: no chain writes, no keys.
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'https://nearhunt.xyz' },
    verbose: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '15000' },
  },
});

const base = values.base.replace(/\/$/, '');
const timeoutMs = Number(values.timeout);
const failures = [];
const notes = [];

async function get(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'nearhunt-site-health/1 (+https://nearhunt.xyz)' },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  const body = await res.text();
  return { url, status: res.status, body };
}

function fail(check, detail) {
  failures.push(`${check}: ${detail}`);
}

// 1. The API answers with real records. A 200 is not enough: an outage still renders an error
//    page, and the API is what every agent reads.
let submissionId = null;
try {
  const r = await get('/api/projects?limit=1&sort=newest');
  if (r.status !== 200) fail('api', `HTTP ${r.status}`);
  else {
    let json;
    try {
      json = JSON.parse(r.body);
    } catch {
      fail('api', 'response is not JSON');
    }
    if (json) {
      const item = json.items?.[0];
      const total = json.meta?.total;
      if (!item?.submission_id) fail('api', 'no items[0].submission_id');
      else submissionId = item.submission_id;
      if (typeof total !== 'number' || total < 100) fail('api', `meta.total is ${JSON.stringify(total)}`);
      if (json.meta?.stale === true) notes.push('api: serving a stale copy');
      if (values.verbose) console.log(`ok api: ${total} records, first ${submissionId}`);
    }
  }
} catch (err) {
  fail('api', err instanceof Error ? err.message : String(err));
}

// 2. A project page renders. The KV outage path sets <body id="__next_error__">, so that string is
//    the tell; the og:title confirms the metadata path ran with a real record.
if (submissionId) {
  try {
    const r = await get(`/p/${encodeURIComponent(submissionId)}`);
    if (r.status !== 200) fail('project page', `HTTP ${r.status}`);
    else if (r.body.includes('__next_error__')) fail('project page', 'rendered the error boundary');
    else if (!r.body.includes('og:title')) fail('project page', 'no og:title in the HTML');
    else if (values.verbose) console.log(`ok project page: /p/${submissionId}`);
  } catch (err) {
    fail('project page', err instanceof Error ? err.message : String(err));
  }
}

// 3. The front page serves HTML and its share card (NH-109). Cheap, and it catches a broken build
//    that still returns 200.
try {
  const r = await get('/');
  if (r.status !== 200) fail('home', `HTTP ${r.status}`);
  else if (r.body.includes('__next_error__')) fail('home', 'rendered the error boundary');
  else if (!r.body.includes('og:image')) fail('home', 'no og:image (share card missing)');
  else if (values.verbose) console.log('ok home');
} catch (err) {
  fail('home', err instanceof Error ? err.message : String(err));
}

// 4. The open data page, which is what the judging-facing API story links to.
try {
  const r = await get('/open-data');
  if (r.status !== 200) fail('open-data', `HTTP ${r.status}`);
  else if (values.verbose) console.log('ok open-data');
} catch (err) {
  fail('open-data', err instanceof Error ? err.message : String(err));
}

for (const n of notes) console.log(`NEAR Hunt site health: ${n}`);
if (failures.length > 0) {
  console.log(`NEAR Hunt site health FAILED on ${base}: ${failures.join('; ')}`);
} else if (values.verbose) {
  console.log(`NEAR Hunt site health: all checks passed on ${base}`);
}
// Exit 0 either way, like the feed watcher: the cron job delivers stdout, and a crash-prone job
// is worse than a quiet one that always reports through the same channel.
process.exit(0);
