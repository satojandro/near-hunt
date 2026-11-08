# Day 4 API contract (NH-60, shared by NH-61/62/63)

Read-only. Every route is `GET`, answers JSON, sends `Access-Control-Allow-Origin: *`, and has a
short `Cache-Control: public, s-maxage=…, stale-while-revalidate=…`. No route signs or writes
anything. Data comes only through the existing readers: `getProjects()` (lib/projects.ts → `readProjects`,
writer-scoped to `nearhunt.near`), `getVoteCounts()/getVoters()` (lib/votes.ts, voter = `predecessor_id`),
and `fetchThread`/`fetchReplyCounts` (lib/discussion.mjs).

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
| `GET /api/projects/{id}/discussion?cursor=&limit=` | `{items: Reply[], next_cursor, meta: {root, thread_url}}`; `root: null` and empty items when the project has no `social_post` yet |

`sort`: `newest` (default; block height desc, then name), `votes` (count desc), `name`.
`track`: exact track slug. `q`: case-insensitive substring on name and description.

`ProjectSummary` = the `ListingItem` fields (record fields + `submission_id`, `key`, `account`,
`block_height`, `block_timestamp`) plus `votes: number | null` (null when the vote read failed) and
`url` (`https://nearhunt.xyz/p/{submission_id}`). `Project` = `ProjectSummary` plus
`record_url` (the KV single-key URL `https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/{id}`).

`meta` on `/api/projects`: `{ total, fetched_at, stale, votes_available, source: { account: "nearhunt.near", prefix: "project/", network: "mainnet" } }`.

## Public files

- `public/SKILL.md` → served at `/SKILL.md` (NH-61).
- Open data page at `/open-data` (NH-62), linked from the header nav.
