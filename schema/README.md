# `nearhunt/project/1` — the project record

One record per project. Open, versioned, and readable by anyone without going through the
NEAR Hunt website.

| | |
|---|---|
| Schema | [`nearhunt-project-1.schema.json`](nearhunt-project-1.schema.json) (JSON Schema 2020-12) |
| TypeScript | [`../types/nearhunt.ts`](../types/nearhunt.ts) |
| Namespace | `nearhunt.near` |
| Storage key | `project/{source.submission_id}` |
| Written by | [`../scripts/import.mjs`](../scripts/import.mjs) |
| Verified by | `npm run validate:schema` (checks every live record) |

## Read a record

No API key, no wallet, no website:

```bash
# one project
curl -s "https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/21996773-48fa-43e9-aedc-684fdd2e4425"

# a page of them — note the account appears twice: namespace, then writer
curl -s -X POST "https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near" \
  -H 'content-type: application/json' \
  -d '{"key_prefix":"project/","limit":200}'
```

The URL shape is `/v0/latest/{current_account_id}/{predecessor_id}/{key}` — both account
ids are `nearhunt.near`, which looks redundant and is not: the index is keyed by who wrote
the row as well as where it lives.

**Always read projects scoped to the writer.** Anyone can write a `project/…` key into the
`nearhunt.near` namespace from their own account; the indexer stores it with their account as
`predecessor_id`. `/v0/latest/nearhunt.near` (no writer) returns those rows too. Only rows whose
`predecessor_id` is `nearhunt.near` are NEAR Hunt records. `lib/kv.mjs` does this for you, and
`npm run validate:schema` reports any foreign rows it finds.

## A record

```json
{
  "schema": "nearhunt/project/1",
  "id": "nearhackathon-2026:21996773-48fa-43e9-aedc-684fdd2e4425",
  "source": {
    "event": "nearhackathon-2026",
    "submission_id": "21996773-48fa-43e9-aedc-684fdd2e4425",
    "url": "https://nearhackathon.com/#submissions"
  },
  "name": "Veto: on-chain spending firewall for AI agents on NEAR",
  "description": null,
  "tracks": ["security", "agents"],
  "repository_url": null,
  "demo_url": "https://x.com/tarantinbv/status/2116528585829720403",
  "external_campaigns": [],
  "updated_at": "2026-11-08T07:15:21.835Z"
}
```

## Enrichment fields

The importer only owns the fields the hackathon feed supplies. A separate, approval-gated pass
(`scripts/enrich.mjs`) fills the unknowns from the builder's own X post and thread. These fields
are additions allowed by `additionalProperties: true`; they are not part of the versioned schema
object, and a consumer that ignores them loses nothing.

| Field | Meaning |
|---|---|
| `description` | The builder's own post text, verbatim and cleaned (t.co and leading @mentions removed). Also used by the "About" card. |
| `description_source` | X post URL the text came from. |
| `repository_url` | A GitHub repository the builder linked, only when `git ls-remote` answered at proposal time. |
| `repository_source` | X post URL that linked the repository. |
| `repository_verified_at` | ISO time of that liveness check. |
| `repository_unverified` | A linked repository that did not answer; kept for review, never published in `repository_url`. |
| `repository_candidates` | Several unrelated repos were linked, so `repository_url` stays null rather than guessing. |
| `links` | Other product URLs the builder posted, `{ url, source_post_id }`. |
| `enrichment` | Provenance: `{ method, sources: [post URLs], retrieved_at, fields }`. |

Policy: no AI rewriting, no repository guessed from a name. A builder can ask for their text to be
removed — the owner rewrites the record, which updates the latest value (the older value remains in
public history).

## Rules that matter when you consume this

**Null means unknown, never empty.** The hackathon feed publishes only a name, tracks and a
demo link, so `description` and `repository_url` are `null` on every imported record. A
consumer that renders `null` as `""` invents an absence of content where the truth is
"nobody supplied it yet". Do not guess a repository from the project name.

**`value: null` is a tombstone.** The KV API returns deleted keys with a null value; they
must be filtered out, not read as an empty project.

**Ordering comes from the chain, not the payload.** `updated_at` is a property of the record
written by the importer. If you need to know what changed and when, use `block_height` from
the indexer or the `/v0/history/` endpoints. Client clocks are not evidence.

**Provenance is not ownership.** `source` says where the data came from. A future claim flow
lets a builder add their own fields; it must never rewrite `source`.

**Unknown fields are legal.** `additionalProperties` is `true` and consumers must ignore
fields they do not recognise — that is how this schema grows without breaking readers.

## Other keys and conventions

### Upvotes — `vote/{submission_id}` in `nearhunt.near`

| | |
|---|---|
| Written by | the voter, from their own account |
| Value | `{}` = active upvote · `null` = withdrawn |
| Voter | the row's `predecessor_id` (not part of the key) |

The index keeps one latest row per writer per key, so an account holds at most one vote per
project however many times it writes, and nobody can vote as someone else. Count a project's
votes with an exact-key read across all writers:

```bash
curl -s -X POST "https://kv.main.fastnear.com/v0/latest/nearhunt.near" \
  -H 'content-type: application/json' \
  -d '{"key":"vote/21996773-48fa-43e9-aedc-684fdd2e4425"}'
```

Count rows whose value is an object; skip `null`. Ignore votes for ids that have no project
record. One account's votes: `POST /v0/latest/nearhunt.near/{account}` with
`{"key_prefix":"vote/"}`.

### Comments — `comment/{submission_id}/{ms}` in `nearhunt.near`

| | |
|---|---|
| Written by | the commenter, from their own account, with the login key (`__fastdata_kv`) |
| Value | `{ "text": "…", "reply_to": "{author}/{id}"? }` · `null` = deleted by its author |
| Author | the row's `predecessor_id` (not part of the key) |

`ms` is the writer's Unix time in milliseconds. The index keeps one latest row per writer per key,
so only the author can change or delete their comment, and two writers can use the same `ms`
without colliding. Plain text, at most 2,000 characters. Read one project's discussion with a
prefix read across writers:

```bash
curl -s -X POST "https://kv.main.fastnear.com/v0/latest/nearhunt.near" \
  -H 'content-type: application/json' \
  -d '{"key_prefix":"comment/21996773-48fa-43e9-aedc-684fdd2e4425/","limit":200}'
```

A reply's `reply_to` is `{author}/{id}` of the comment it answers (one level; answers to answers
are shown under the same top-level comment). Deleted rows and rows on NEAR Hunt's hide list
(`data/hidden-comments.json`, matched on project + author + id) are not shown or counted. NEAR Hunt
cannot delete a comment and never writes under `comment/`; the policy is at
<https://nearhunt.xyz/comment-policy>.

## Why it is versioned this way

The version lives in the `schema` field and in the key namespace, not in a `version: 1`
property. A breaking change introduces `nearhunt/project/2` under a new prefix rather than
mutating the meaning of this one, so old readers keep working and the two shapes can coexist
during migration. This is the same choice near.social made with `post2/`.

## Cost of the whole dataset

275 records, 128,270 bytes of record JSON, in three transactions. No contract, no storage
deposit — the
records are FastData KV writes, which the indexer captures whether or not the receipt
succeeds (it never does: `nearhunt.near` has no contract).

Reproduce both numbers:

```bash
npm run validate:schema

node -e "import('./lib/kv.mjs').then(async({readProjects})=>{
  const rows=await readProjects();
  console.log(rows.length, rows.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r.value)),0));
})"
```
