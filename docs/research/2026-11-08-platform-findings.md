# Platform findings — 2026-11-08

Phase 0 research. Every claim below was checked against a primary source on 2026-11-08:
mainnet RPC, project documentation, published OpenAPI/source, or a live API response.
Quoted evidence is in the *Evidence* lines so a later reader can re-run it.

This document exists because the PRD (v0.2 §6.2, §14) treats its storage stack as a
hypothesis. Several parts of that hypothesis turned out to be wrong, and one turned out to be
better than written.

---

## Summary of corrections to PRD v0.2

| PRD says | Reality | Source |
|---|---|---|
| "FastData KV: candidate canonical store … subject to verifying custom-key writes" | FastData KV is a **read-only** query API over data already indexed from chain. It cannot be written to. | `kv-fastdata-server` README, live API |
| "NEAR Social (`social-kv/1`): likes and replies on `social.near`" | NEAR Social has moved to a **contract-less** account `social` and a FastData write path. There is no contract on `social` at all. | mainnet RPC, near.social/docs |
| Writes require social posts to be published and indexed | The transaction **always fails** (`CodeDoesNotExist`) by design and the indexer ignores receipt status. A client that checks receipt status will conclude every write failed. | near.social/docs |
| Import `description`, `repository_url`, team from the hackathon | The public submissions API exposes only `id`, `project_name`, `tracks[]`, `demo_url`. No description, no repo, no detail endpoint. | live API |

The one finding that *improves* on the PRD: FastData namespaces are keyed by **method-name
suffix**, not by receiver account, so NEAR Hunt can own its own namespace without deploying a
contract. See §3.

---

## 1. `social` has no contract — and that is the new standard

The legacy `social.near` SocialDB contract still exists, but it is not what current NEAR
Social clients use.

**Evidence — mainnet RPC (block 223,582,105):**

```
$ near view-account social
  code_hash:     11111111111111111111111111111111   ← no contract
  amount:        1019917433850000000000000          ← ~1.02M NEAR
  storage_usage: 182

$ near view-account social.near
  code_hash:     B5Yf5EquM36fGu3JNAD2K83fT6L4dpzcx8mYLnkjJJbS
  storage_usage: 410,089,633                        ← legacy SocialDB, 410 MB
```

`near.social/docs` states it directly: *"Receiver account: `social` (mainnet). Every write goes
to this account. There is no contract on it and none is needed."*

**Write path (`social-kv/1`):**

| Field | Value |
|---|---|
| receiver | `social` |
| method_name | `__fastdata_kv` |
| args | UTF-8 JSON object; each top-level key is one KV write (max 256 keys) |
| gas | `1` (minimum — larger attached gas burns allowance for no benefit) |
| deposit | `0` |

The receipt fails with `CodeDoesNotExist` because `social` has no code. This is expected and
must not be retried. Confirmation comes from the indexer, not the receipt:

```
GET https://api2.near.social/v1/tx/{tx_hash}
→ {"indexed":true,"actions":[{"status":"ok","keys":[{"key":"post/…","status":"ok"}]}]}
```

**Decision:** build on the `social` / FastData path. Treat `social.near`'s `set` method as
legacy and out of scope.

## 2. FastData KV is a read surface, not a store

**Evidence — `fastnear/kv-fastdata-server` README:** *"Read-only JSON API server for querying
Key-Value data indexed by kv-sub-indexer into ScyllaDB."*

**Evidence — anonymous read, no API key** (despite docs saying to send one):

```
POST https://kv.main.fastnear.com/v0/latest/social
     {"key_prefix":"post/","limit":3}

→ {"entries":[{"predecessor_id":"mobeor.near","current_account_id":"social",
               "block_height":217839954,"key":"post/1790723171783",
               "value":{"text":"Gif testing", …}}, …],
   "page_token":"eyJrIj…"}
```

Rows carry `predecessor_id` (the author), `current_account_id` (the receiver), block height
and the value. That is exactly the shape NEAR Hunt needs for votes: the author of a
`like/{account}/{post_id}` key is the voter, so deduplication is a property of the key, not
application logic.

**Important consequence:** "canonical storage" is the chain, and FastData KV is one (fast,
public) way to read it. Any durability or correctness claim about the store is really a claim
about NEAR consensus plus FastData's indexing, which is a much stronger position than a
database.

## 3. FastData namespaces generalise to any account (the load-bearing finding)

The sub-indexer does not filter on receiver account. It filters on a **suffix**:

**Evidence — `fastnear/fastdata-indexer`, `kv-sub-indexer/src/scylla_types.rs`:**

```rust
pub(crate) const SUFFIX: &str = "kv";
```

and `kv-sub-indexer/src/main.rs` reads `SuffixFetcherUpdate::FastData(fastdata)`, then persists
each top-level key of the JSON args with `current_account_id: fastdata.current_account_id`,
`predecessor_id: fastdata.predecessor_id`. There is no allowlist of receiver accounts anywhere
in the sub-indexer.

The standard's own limits are enforced by the indexer, silently, per key:
256 keys per call · key ≤ 1024 bytes · serialized value ≤ 262,144 bytes.

**Hypothesis this creates for NEAR Hunt:** a transaction calling `__fastdata_kv` on *our own*
account (e.g. `nearhunt.near`) with args `{"project/257": {...}}` is indexed under
`current_account_id = nearhunt.near` and is readable at:

```
POST https://kv.main.fastnear.com/v0/latest/nearhunt.near {"key_prefix":"project/"}
```

If that holds, project records are on-chain, versioned, permissionless to read, indexed by
existing infrastructure, and require **no smart contract and no storage deposit** — which is
strictly better than the PRD's "FastData KV or a conventional database" fallback.

**Status: unverified.** This is the single most important thing the spike must prove.

## 4. The hackathon has a public submissions API — but a thin one

**Evidence:**

```
GET https://nearhackathon.com/api/projects?page=1

{"projects":[{"id":"21996773-48fa-43e9-aedc-684fdd2e4425",
              "project_name":"Veto: on-chain spending firewall for AI agents on NEAR",
              "tracks":["security","agents"],
              "demo_url":"https://x.com/tarantinbv/status/2116528585829720403"}, …],
 "total":271,"page":1,"pageSize":8,"preview":false}
```

- `pageSize` is fixed at 8; passing `&pageSize=100` is ignored. 271 projects ⇒ 34 pages.
- `GET /api/projects/{id}` returns **404** (HTML error page, not JSON). There is no detail
  endpoint.
- `total` is live and moves (268 → 271 within hours). The importer must be idempotent on `id`
  and tolerate a growing set.

**Consequence for PRD §6.1:** `description`, `repository_url` and `team` cannot be imported
from this feed. Three honest options:

1. Launch with what exists: name, tracks, demo link — and let the demo post carry the pitch.
2. Enrich by following `demo_url` to the X post text (fragile, rate-limited, and it makes the
   index depend on X).
3. Ship `description` and `repository_url` as builder-editable fields introduced by a later
   claim flow.

Recommended: (1) for import, (3) as the durable answer. Do not promise imported descriptions
the source cannot supply.

## 5. Hackathon rules that constrain the build

From `nearhackathon.com` (2026-11-08):

- Development ends **14 Nov 2026 · 23:59 UTC**; judging and results 16–18 Nov.
- Submission requires a **public repository** and a **public X post** with a demo video or
  screenshots, tagging `@NEARProtocol` and `#NEARHackathon`.
- 13 tracks; NEAR Hunt targets **Open Innovation**, with a case for *Social Money* and
  *Agent Economy* (select every track that fits — still one submission).
- Screened by Claude Code & Codex for "runs and does what the README says"; then human judges.
  **The README is load-bearing.**
- *"One person can enter up to 2 different projects, if they are independent and each README
  names the other one."* — this is the rule that governs NEAR Hunt + Baby Shark. Both READMEs
  must name each other.

## 6. near.social as a design template

NEAR Hunt's "publish a `SKILL.md` so agents can discover projects" is not speculative — NEAR
Social already ships exactly that artefact at `https://near.social/skill.md`, along with a
machine-readable indexer API (`https://api2.near.social`):

```
GET /v1/feed/global                            latest posts
GET /v1/accounts/{account_id}/posts
GET /v1/posts/{account_id}/{post_id}/replies
GET /v1/search/posts?q=…
GET /v1/tx/{tx_hash}                           did my write land?
```

Two things to copy: the `{items, next_cursor}` envelope with `?cursor=`/`?limit=1..100`, and
the write-confirmation endpoint, which is the difference between a usable and an unusable API
for an agent.

## 7. Rate limits and etiquette (from the standard)

Per account per UTC day, applied by block time: **300 posts, 1000 likes, 300 reposts**, ≤ 5 MiB
of accepted value bytes, ≤ 5000 active follows. Writes over a limit are recorded but not
applied and reported as `rate_limited` by `/v1/tx`. Operators may hide accounts at read time.

For an importer this means: **never** publish 271 social posts on one account in one day. See
`docs/phase-0-spike.md` for the alternative.

---

## Open questions still unanswered

1. Does a `__fastdata_kv` call to a non-`social` account get indexed? *(spike, blocking)*
2. Do project posts appear in the global near.social feed, and can they be scoped to avoid
   flooding it? *(spike)*
3. What does an unauthenticated `POST /v0/latest` cost, rate-limit-wise, in practice? *(spike)*
4. Is `total` in the hackathon API stable enough to detect deletions, or only additions?
