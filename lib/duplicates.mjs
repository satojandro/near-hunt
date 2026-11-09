/**
 * NH-96 step 4: flag possible duplicate submissions. Flag only: nothing here merges, hides or
 * writes anything. The owner reads the list.
 *
 * Two submissions are flagged when they share an identifying URL: the same repository, the same
 * X post, the same demo or the same builder link. URLs are compared after normalising (host case,
 * `www.`, trailing slash, `.git`, tracking parameters, the X handle). URLs that identify a
 * platform rather than a project (`dev.to`, a bare `youtube.com/watch`) are ignored.
 */

const TRACKING = /^(utm_[a-z_]+|ref|si|feature|fbclid|gclid|igshid|ref_src|ref_url|s|t|t_src|sharedUserId)$/i;
const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com']);
const GIT_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']);

/** Hosts whose bare root (or listed path) names a platform, not a project. */
const NOT_IDENTIFYING = new Set([
  'dev.to', 'medium.com', 'near.org', 'github.com', 'x.com', 'youtube.com', 'youtube.com/watch',
  't.me', 'discord.gg', 'nearblocks.io', 'testnet.nearblocks.io', 'etherscan.io', 'nearhackathon.com',
  'vercel.app', 'github.io', 'docs.near.org',
]);

/**
 * Comparison key for a URL, or null when the URL cannot identify a project.
 * @returns {{ key: string, kind: 'repository'|'x-post'|'url' } | null}
 */
export function urlKey(url) {
  if (typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);

  if (X_HOSTS.has(host)) {
    const i = parts.findIndex((p) => p === 'status' || p === 'statuses');
    const id = i >= 0 ? parts[i + 1] : null;
    return id && /^\d{1,20}$/.test(id) ? { key: `x.com/status/${id}`, kind: 'x-post' } : null;
  }
  if (GIT_HOSTS.has(host)) {
    if (parts.length < 2) return null;
    return { key: `${host}/${parts[0]}/${parts[1].replace(/\.git$/i, '')}`.toLowerCase(), kind: 'repository' };
  }
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  const path = parts.join('/');
  const search = u.searchParams.toString();
  const key = `${host}${path ? `/${path}` : ''}${search ? `?${search}` : ''}`;
  if (NOT_IDENTIFYING.has(key)) return null;
  return { key, kind: 'url' };
}

/**
 * Groups of two or more distinct submissions that share a key.
 *
 * @param {Array<{ submission_id: string, name: string, on_chain: boolean, urls: Array<{ field: string, url: string }> }>} subs
 * @returns {Array<{ key: string, kind: string, submissions: Array<{ submission_id: string, name: string, on_chain: boolean, fields: string[] }> }>}
 */
export function findDuplicates(subs) {
  const byKey = new Map();
  for (const s of subs) {
    for (const { field, url } of s.urls ?? []) {
      const k = urlKey(url);
      if (!k) continue;
      if (!byKey.has(k.key)) byKey.set(k.key, { key: k.key, kind: k.kind, members: new Map() });
      const g = byKey.get(k.key);
      const m = g.members.get(s.submission_id) ?? { submission_id: s.submission_id, name: s.name, on_chain: s.on_chain, fields: [] };
      if (!m.fields.includes(field)) m.fields.push(field);
      g.members.set(s.submission_id, m);
    }
  }
  const rank = { 'x-post': 0, repository: 1, url: 2 };
  return [...byKey.values()]
    .filter((g) => g.members.size >= 2)
    .map((g) => ({ key: g.key, kind: g.kind, submissions: [...g.members.values()].sort((a, b) => a.name.localeCompare(b.name) || a.submission_id.localeCompare(b.submission_id)) }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.submissions.length - a.submissions.length || a.key.localeCompare(b.key));
}

/**
 * Merge groups that share a submission into clusters, so "A~B by repo, B~C by demo" reads as
 * one cluster of three with both reasons.
 */
export function clusters(groups) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  for (const g of groups) for (const s of g.submissions) if (!parent.has(s.submission_id)) parent.set(s.submission_id, s.submission_id);
  for (const g of groups) {
    const [first, ...rest] = g.submissions.map((s) => s.submission_id);
    for (const r of rest) parent.set(find(r), find(first));
  }
  const out = new Map();
  for (const g of groups) {
    const root = find(g.submissions[0].submission_id);
    if (!out.has(root)) out.set(root, { submissions: new Map(), shared: [] });
    const c = out.get(root);
    c.shared.push({ kind: g.kind, key: g.key });
    for (const s of g.submissions) c.submissions.set(s.submission_id, { submission_id: s.submission_id, name: s.name, on_chain: s.on_chain });
  }
  return [...out.values()]
    .map((c) => ({ submissions: [...c.submissions.values()], shared: c.shared }))
    .sort((a, b) => b.submissions.length - a.submissions.length || a.submissions[0].name.localeCompare(b.submissions[0].name));
}

/** X handle of a post URL, lower-cased; null when the URL is not an X post. */
export function xAuthor(url) {
  try {
    const u = new URL(url);
    if (!X_HOSTS.has(u.hostname.toLowerCase().replace(/^www\./, ''))) return null;
    const [handle, status] = u.pathname.split('/').filter(Boolean);
    return status === 'status' && /^[A-Za-z0-9_]{1,15}$/.test(handle ?? '') ? handle.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Weaker signals, never called duplicates: submissions with the same name (case and spacing
 * ignored), and X accounts that submitted more than one project. Builders may legitimately ship
 * two projects, and many unrelated projects share a name.
 */
export function weakSignals(subs) {
  const group = (keyOf) => {
    const m = new Map();
    for (const s of subs) {
      const k = keyOf(s);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ submission_id: s.submission_id, name: s.name, on_chain: s.on_chain });
    }
    return [...m.entries()].filter(([, v]) => v.length > 1).map(([key, submissions]) => ({ key, submissions }))
      .sort((a, b) => b.submissions.length - a.submissions.length || a.key.localeCompare(b.key));
  };
  return {
    same_name: group((s) => (typeof s.name === 'string' ? s.name.trim().toLowerCase().replace(/\s+/g, ' ') : null)),
    same_x_account: group((s) => xAuthor((s.urls ?? []).find((u) => u.field === 'demo_url')?.url)),
  };
}
