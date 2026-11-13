# Day 4 API contract (NH-60, shared by NH-61/62/63)

**Status:** merged to `main` in PR #6 (merge commit `df7ac8c`, 9 Nov) and deployed to production the
same day (`near-hunt-k15gdqx9a`). Verified live on `https://near-hunt.vercel.app`: pagination ends at
281 items, 400/404 codes as documented, `access-control-allow-origin: *` on every route.

Read-only. Every route is `GET`, answers JSON, sends `Access-Control-Allow-Origin: *`, and has a
short `Cache-Control: public, s-maxage=…, stale-while-revalidate=…`. No route signs or writes
anything. Data comes only through the existing readers: `getProjects()` (lib/projects.ts → `readProjects`,
writer-scoped to `nearhunt.near`), `getVoteCounts()/getVoters()` (lib/votes.ts, voter = `predecessor_id`),
and comment reads (`lib/comments.mjs`, `lib/comments.ts`).

## Envelope

Every list: `{ "items": [...], "next_cursor": string | null }`, the near.social shape. Page with
`?cursor=` (opaque, pass back verbatim) and `?limit=` (1–100, default 50). Lists may add one more
top-level key, `meta`, never more.

Errors: `{ "error": "<code>", "message": "<text>" }` with codes `not_found` (404), `bad_request`
(400, invalid limit/cursor/sort), `unavailable` (503, the indexer is down and there is no copy).

## Routes

| Route | Returns |
|---|---|
| `GET /api/projects?track=&sort=&q=&cursor=&limit=` | `{items: ProjectSummary[], next_cursor, meta}` |
| `GET /api/projects/{id}` | `Project` (single object, no envelope); 404 if no live record |
| `GET /api/projects/{id}/votes?cursor=&limit=` | `{items: [{account_id, block_height}], next_cursor, meta}` latest vote first |
| `GET /api/projects/{id}/discussion?cursor=&limit=` | `{items: Comment[], next_cursor, meta: {total, source, policy_url}}`, oldest first and flat (`reply_to` links a reply) |

`sort`: `newest` (default; block height desc, then name), `votes` (count desc), `comments` (visible comment count desc; NH-118), `name`. `upvoted` and `discussed`, the directory's URL names, are accepted as `votes` and `comments`.
`track`: exact track slug. `q`: case-insensitive substring on name and description.

`ProjectSummary` = the `ListingItem` fields (record fields + `submission_id`, `key`, `account`,
`block_height`, `block_timestamp` — nanoseconds as an exact decimal string) plus `votes: number | null` (null when the vote read failed) and
`url` (`https://nearhunt.xyz/p/{submission_id}`). `Project` = `ProjectSummary` plus
`record_url` (the KV single-key URL `https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/{id}`).

`meta` on `/api/projects`: `{ total, fetched_at, stale, votes_available, comments_available, source: { account: "nearhunt.near", prefix: "project/", network: "mainnet" } }`.

## Public files

- `public/SKILL.md` → served at `/SKILL.md` (NH-61).
- Open data page at `/open-data` (NH-62), linked from the header nav.

## As built (NH-60, `d2ff086`): choices the contract left open

- `sort` is `newest | votes | comments | name`, plus the aliases `upvoted` and `discussed`. Any other value → 400. (As first built there was no comments sort; NH-118 added it on 11 Nov, with `comments` on each list item and `meta.comments_available`. A failed comment read gives `comments: null` and newest order.)
- An unknown `track` → empty list, not an error. `q` ignores case and accents.
- Vote read failure: `/api/projects` and `/{id}` give `votes: null` and `meta.votes_available: false`
  (`sort=votes` falls back to newest); `/votes` answers 503.
- `/votes` meta: `{total, source: {account, prefix: "vote/", network}}`, latest vote first.
- `/discussion` (NH-44, 9 Nov): the project's `comment/` rows on `nearhunt.near`, oldest first,
  flat, hidden comments absent; offset cursors like the other lists (the near.social `s:` cursor is
  gone). `meta` is `{total, source: {account, prefix: "comment/", network}, policy_url}`. Every
  project takes comments, so `items: []` is a real empty discussion; 503 when the rows cannot be
  read. `author` is the row's `predecessor_id`; `ref` is `{author}/{id}`, what `reply_to` points at.
- Saved copies (NH-120, 13 Nov): when the indexer does not answer, vote and comment rows may come
  from the last copy that was read. That is never presented as current. `/api/projects` meta adds
  `votes_stale`, `votes_fetched_at`, `comments_stale` and `comments_fetched_at`; `/votes` and
  `/discussion` meta add `stale` and `fetched_at`. `*_available: false` (or 503) still means there
  was no copy at all. `/api/projects/{id}` has no envelope, so its `votes` carries no flag: use
  `/votes` when the age matters.
- Cursors: base64url of `o:<offset>` for every list, discussion included; a malformed or foreign
  cursor is `bad_request`.
- Cache-Control `s-maxage`: projects 60 s, votes 20 s, discussion 30 s; errors `no-store`.
  OPTIONS → 204.
