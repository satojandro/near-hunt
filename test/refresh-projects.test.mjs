import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECTS_MEMORY_TTL_MS,
  PROJECTS_RETRY_BACKOFF_MS,
  REFRESH,
  advanceFromMarker,
  isProjectsMarker,
  isProjectsSnapshot,
  listingDigest,
  liveRefreshDue,
  liveWalkCoolingDown,
  resolveProjectsSnapshot,
  walkProjects,
} from '../lib/refresh-projects.mjs';

/**
 * The walker (NH-122) is the only reader of the project listing now, and it runs unattended once a
 * minute. What these tests pin down: it walks every page, it keeps only rows `nearhunt.near` wrote
 * under `project/`, one bad page is retried instead of failing the walk, and the two stored keys
 * cannot answer with a copy fresher than they can prove.
 */

const ACCOUNT = 'nearhunt.near';
const URL_MAIN = `https://kv.main.fastnear.com/v0/latest/${ACCOUNT}/${ACCOUNT}`;

const row = (key, { writer = ACCOUNT, height = 1 } = {}) => ({
  predecessor_id: writer,
  current_account_id: ACCOUNT,
  block_height: height,
  key,
  value: { schema: 'nearhunt/project/1' },
});

/** A Response stand-in: only `ok`, `status` and `text()` are used by the walk. */
const page = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const failing = (status) => ({ ok: false, status, text: async () => '' });

/** One stub that answers each call from `pages` in order and records what it was sent. */
function stub(...pages) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const next = pages.shift();
    if (!next) throw new Error('stub: unexpected extra request');
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchImpl };
}

test('walkProjects follows page tokens and drops rows nearhunt.near did not write', async () => {
  const { calls, fetchImpl } = stub(
    page({ entries: [row('project/a'), row('project/b', { writer: 'stranger.near' })], page_token: 'tok-2' }),
    page({ entries: [row('vote/c'), row('project/d', { height: 2 })] }),
  );

  const out = await walkProjects({ fetchImpl });

  assert.equal(out.pages, 2);
  assert.deepEqual(out.entries.map((e) => e.key), ['project/a', 'project/d']);
  assert.equal(calls.length, 2);
  // The scoped endpoint is `${account}/${writer}` and the filter the API applies is the prefix.
  assert.equal(calls[0].url, URL_MAIN);
  assert.deepEqual(calls[0].body, { limit: REFRESH.limit, key_prefix: 'project/' });
  assert.deepEqual(calls[1].body, { limit: REFRESH.limit, key_prefix: 'project/', page_token: 'tok-2' });
  // A hung indexer must not hold the walk forever.
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.cache, 'no-store');
});

test('walkProjects retries a page instead of failing the whole walk', async () => {
  const { calls, fetchImpl } = stub(
    failing(502),
    page({ entries: [row('project/a')] }),
  );

  const out = await walkProjects({ fetchImpl, limits: { retryDelayMs: 1 } });

  assert.equal(out.pages, 1);
  assert.equal(out.entries.length, 1);
  assert.equal(calls.length, 2, 'one retry for the failed page');
});

test('walkProjects names the page it gave up on', async () => {
  const { fetchImpl } = stub(
    page({ entries: [row('project/a')], page_token: 'tok-2' }),
    new Error('The operation was aborted due to timeout'),
    new Error('The operation was aborted due to timeout'),
  );

  await assert.rejects(
    walkProjects({ fetchImpl, limits: { retryDelayMs: 1 } }),
    /KV page 2 failed after 2 attempts: The operation was aborted due to timeout/,
  );
});

test('walkProjects passes a build-time dynamic-usage marker through untouched', async () => {
  // Next throws this from any no-store fetch while prerendering: it means "this route is dynamic",
  // not "the indexer is down". Wrapping it (or retrying it) turns a quiet build note into a scary
  // log line and a wasted request.
  const marker = Object.assign(new Error('Dynamic server usage: Route / could not be rendered'), {
    digest: 'DYNAMIC_SERVER_USAGE',
  });
  const { calls, fetchImpl } = stub(marker);

  await assert.rejects(walkProjects({ fetchImpl, limits: { retryDelayMs: 1 } }), (err) => {
    assert.equal(err.digest, 'DYNAMIC_SERVER_USAGE');
    assert.doesNotMatch(err.message, /KV page/);
    return true;
  });
  assert.equal(calls.length, 1, 'not retried: it would fail identically');
});

test('walkProjects refuses an unknown network rather than guessing a host', async () => {
  await assert.rejects(walkProjects({ network: /** @type {any} */ ('devnet') }), /unknown network/);
});

test('listingDigest is content identity: row order and values count, nothing else', () => {
  const a = [{ submission_id: 'a', name: 'One' }];
  const b = [{ submission_id: 'a', name: 'One' }];
  assert.equal(listingDigest(a), listingDigest(b));
  assert.match(listingDigest(a), /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(listingDigest(a), listingDigest([{ submission_id: 'a', name: 'Two' }]));
  assert.notEqual(listingDigest(a), listingDigest([{ submission_id: 'a', name: 'One' }, { submission_id: 'b' }]));
});

test('isProjectsSnapshot accepts the stored shape and nothing that cannot be trusted', () => {
  const ok = { items: [], fetched_at: '2026-11-14T18:32:28.278Z', account: ACCOUNT };
  assert.equal(isProjectsSnapshot(ok), true);
  assert.equal(isProjectsSnapshot({ ...ok, digest: 'sha256:abc' }), true, 'the writer adds a digest');
  assert.equal(isProjectsSnapshot({ ...ok, items: 'not an array' }), false);
  assert.equal(isProjectsSnapshot({ ...ok, fetched_at: 'whenever' }), false);
  assert.equal(isProjectsSnapshot({ items: [], fetched_at: ok.fetched_at }), false, 'account is required');
  assert.equal(isProjectsSnapshot(null), false);
});

test('isProjectsMarker rejects a value that cannot date the copy', () => {
  const ok = { fetched_at: '2026-11-14T18:32:28.278Z', digest: 'sha256:abc', rows: 1680 };
  assert.equal(isProjectsMarker(ok), true);
  assert.equal(isProjectsMarker({ ...ok, digest: undefined }), false);
  assert.equal(isProjectsMarker({ ...ok, rows: '1680' }), false);
  assert.equal(isProjectsMarker({ ...ok, fetched_at: 'yesterday' }), false);
  assert.equal(isProjectsMarker([]), false);
});

test('resolveProjectsSnapshot dates the copy by the latest good walk, not the last rewrite', () => {
  const copy = {
    items: [{ submission_id: 'a' }],
    account: ACCOUNT,
    fetched_at: '2026-11-14T12:00:00.000Z',
  };
  // The items have not changed for six hours, but the walker saw the chain a minute ago: the
  // listing *is* current as of that walk.
  const fresh = resolveProjectsSnapshot(copy, { fetched_at: '2026-11-14T18:00:00.000Z', digest: 'sha256:x', rows: 1 });
  assert.equal(fresh.fetched_at, '2026-11-14T18:00:00.000Z');
  assert.deepEqual(fresh.items, copy.items);

  // A marker older than the copy (a stale write landing late) must not make the copy look older.
  const older = resolveProjectsSnapshot(copy, { fetched_at: '2026-11-14T11:00:00.000Z', digest: 'sha256:x', rows: 1 });
  assert.equal(older.fetched_at, copy.fetched_at);

  // No marker at all (a value written before the marker existed) still dates itself.
  assert.equal(resolveProjectsSnapshot(copy, null).fetched_at, copy.fetched_at);
  // No copy anywhere: nothing to serve.
  assert.equal(resolveProjectsSnapshot(null, { fetched_at: copy.fetched_at }), null);
});

test('resolveProjectsSnapshot carries the copy digest so the marker alone can vouch for it later', () => {
  const copy = { items: [], account: ACCOUNT, fetched_at: '2026-11-14T12:00:00.000Z', digest: 'sha256:a' };
  assert.equal(resolveProjectsSnapshot(copy, null).digest, 'sha256:a');
  const { digest, ...noDigest } = copy;
  assert.equal('digest' in resolveProjectsSnapshot(noDigest, null), false);
});

test('advanceFromMarker: an unchanged listing re-walked later costs no heavy read', () => {
  const memory = { items: [{ submission_id: 'a' }], account: ACCOUNT, fetched_at: '2026-11-14T12:00:00.000Z', digest: 'sha256:a' };
  // The walker re-read the same rows a minute later: same items, newer time, nothing downloaded.
  const same = advanceFromMarker(memory, { fetched_at: '2026-11-14T12:01:00.000Z', digest: 'sha256:a', rows: 1 });
  assert.equal(same.fetched_at, '2026-11-14T12:01:00.000Z');
  assert.equal(same.items, memory.items);
  // A marker that is not newer: the memory copy as it is.
  assert.equal(advanceFromMarker(memory, { fetched_at: '2026-11-14T11:59:00.000Z', digest: 'sha256:b', rows: 1 }), memory);
  // New rows on chain: the heavy copy must be read.
  assert.equal(advanceFromMarker(memory, { fetched_at: '2026-11-14T12:01:00.000Z', digest: 'sha256:b', rows: 2 }), null);
  // A memory copy with no digest cannot be vouched for by the marker.
  const { digest, ...unknown } = memory;
  assert.equal(advanceFromMarker(unknown, { fetched_at: '2026-11-14T12:01:00.000Z', digest: 'sha256:a', rows: 1 }), null);
  // Nothing in memory, or no marker: read the copy.
  assert.equal(advanceFromMarker(null, { fetched_at: '2026-11-14T12:01:00.000Z', digest: 'sha256:a', rows: 1 }), null);
  assert.equal(advanceFromMarker(memory, null), null);
});

test('liveRefreshDue: only without a store marker, only for an aged copy, at most once a minute', () => {
  const now = Date.parse('2026-11-14T12:10:00.000Z');
  const old = { fetched_at: new Date(now - 5 * 60_000).toISOString() };
  const young = { fetched_at: new Date(now - 10_000).toISOString() };
  // No store answering: an old copy is refreshed by this instance, or it would never change.
  assert.equal(liveRefreshDue({ snapshot: old, storeAnswered: false, lastAttemptAt: 0, now }), true);
  // A working store: the walker owns freshness; an old copy is labelled, not re-walked per request.
  assert.equal(liveRefreshDue({ snapshot: old, storeAnswered: true, lastAttemptAt: 0, now }), false);
  // A copy younger than one walk interval is current enough.
  assert.equal(liveRefreshDue({ snapshot: young, storeAnswered: false, lastAttemptAt: 0, now }), false);
  // A walk attempted moments ago (and failed) is not repeated per visitor.
  assert.equal(liveRefreshDue({ snapshot: old, storeAnswered: false, lastAttemptAt: now - 5_000, now }), false);
  assert.equal(
    liveRefreshDue({ snapshot: old, storeAnswered: false, lastAttemptAt: now - PROJECTS_MEMORY_TTL_MS, now }),
    true,
  );
  // No copy at all is the cold-start path in getProjects, not this one.
  assert.equal(liveRefreshDue({ snapshot: null, storeAnswered: false, lastAttemptAt: 0, now }), false);
});

test('walkProjects gives up within its overall budget instead of running past the platform limit', async () => {
  // Each page answers, slowly. Per-page limits alone would let the walk go on; the budget stops it.
  const slow = (body) => async () => {
    await new Promise((r) => setTimeout(r, 30));
    return page(body);
  };
  const answers = [
    slow({ entries: [row('project/a')], page_token: 'tok-2' }),
    slow({ entries: [row('project/b')], page_token: 'tok-3' }),
    slow({ entries: [row('project/c')] }),
  ];
  let calls = 0;
  const fetchImpl = async () => answers[calls++]();

  await assert.rejects(
    walkProjects({ fetchImpl, limits: { walkBudgetMs: 45, retryDelayMs: 1 } }),
    /KV walk ran out of its 45 ms budget at page 3/,
  );
  assert.equal(calls, 2, 'no request is started once the budget is spent');
});

test('walkProjects cuts each attempt to what is left of the budget', async () => {
  const signals = [];
  const fetchImpl = async (_url, init) => {
    signals.push(init.signal);
    // A request that never answers. AbortSignal.timeout's timer does not keep the event loop alive,
    // so a ref'd guard timer does (and fails the test if the budget never fires).
    return new Promise((_, reject) => {
      const guard = setTimeout(() => reject(new Error('budget never aborted the request')), 2_000);
      init.signal.addEventListener('abort', () => {
        clearTimeout(guard);
        reject(init.signal.reason);
      });
    });
  };
  const started = Date.now();
  await assert.rejects(walkProjects({ fetchImpl, limits: { walkBudgetMs: 60, perPageTimeoutMs: 15_000, retryDelayMs: 1 } }));
  assert.ok(Date.now() - started < 1_000, 'aborted by the 60 ms budget, not the 15 s page timeout');
  assert.equal(signals.length >= 1, true);
});

test('liveWalkCoolingDown pauses request-path walks for a few seconds after a failure', () => {
  const now = 1_000_000;
  assert.equal(liveWalkCoolingDown({ lastFailedAt: 0, now }), false, 'never failed');
  assert.equal(liveWalkCoolingDown({ lastFailedAt: now - 1_000, now }), true);
  assert.equal(liveWalkCoolingDown({ lastFailedAt: now - PROJECTS_RETRY_BACKOFF_MS, now }), false);
});
