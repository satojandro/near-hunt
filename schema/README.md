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

# a page of them
curl -s -X POST "https://kv.main.fastnear.com/v0/latest/nearhunt.near" \
  -H 'content-type: application/json' \
  -d '{"key_prefix":"project/","limit":200}'
```

The URL shape is `/v0/latest/{current_account_id}/{predecessor_id}/{key}` — both account
ids are `nearhunt.near`, which looks redundant and is not: the index is keyed by who wrote
the row as well as where it lives.

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

## Why it is versioned this way

The version lives in the `schema` field and in the key namespace, not in a `version: 1`
property. A breaking change introduces `nearhunt/project/2` under a new prefix rather than
mutating the meaning of this one, so old readers keep working and the two shapes can coexist
during migration. This is the same choice near.social made with `post2/`.

## Cost of the whole dataset

271 records, 139,421 bytes, in two transactions. No contract, no storage deposit — the
records are FastData KV writes, which the indexer captures whether or not the receipt
succeeds (it never does: `nearhunt.near` has no contract).
