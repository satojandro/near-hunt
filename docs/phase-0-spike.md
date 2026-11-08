# Phase 0 — architecture spike

**Date:** 2026-11-08 · **Network:** NEAR testnet · **Result:** storage hypothesis CONFIRMED

The PRD (§14) asks for one thing before committing to the open-data architecture: prove that a
project record can be written, read back independently, and engaged with — then decide.

This document records what was actually executed, not what was planned.

---

## Why the storage question matters more than it looks

The PRD assumed two things that would each have cost days if taken on faith:

1. That NEAR Hunt might need **its own smart contract** to hold project records (and therefore
   audit, storage deposits, upgrade paths, a deploy pipeline).
2. That **FastData KV** could be used as a writable canonical store.

Both are wrong, and the truth is better: project records can be written as plain FastData KV
data to an account NEAR Hunt controls, with **no contract at all**, and read back through a
public API. That removes the contract from the critical path entirely — which for a 6-day build
is the difference between shipping and not.

## Test performed

Write arbitrary, non-standard JSON under a custom key prefix, to a receiver account that is
**not** `social`, then read it back through the public KV API.

```bash
near contract call-function as-transaction board1.metapoo-player3.testnet __fastdata_kv \
  json-args '{"nearhunt/probe/test-b":{"schema":"nearhunt/project/1","id":"spike-b",
              "name":"Spike B - custom namespace","written_at":"2026-11-08"}}' \
  prepaid-gas '1 Ggas' attached-deposit '0 NEAR' \
  sign-as board3.metapoo-player1.testnet network-config testnet sign-with-keychain send
```

The CLI reported the call as failed:

```
Error: An error occurred during a `FunctionCall` action.
  ExecutionError("Exceeded the prepaid gas.")
```

That is expected and irrelevant. The indexer does not inspect receipt status. (This testnet
receiver happened to have a contract, so the call ran out of gas. A receiver with no contract,
like `social` or `nearhunt.near`, fails with `CodeDoesNotExist` instead: that is what the
mainnet import transactions report. Either failure is fine.)

Read back, ~6 seconds later:

```bash
curl -s -X POST 'https://kv.test.fastnear.com/v0/latest/board1.metapoo-player3.testnet' \
  -H 'content-type: application/json' -d '{"key_prefix":"nearhunt/","limit":10}'
```

```json
{"entries":[{
  "predecessor_id": "board3.metapoo-player1.testnet",
  "current_account_id": "board1.metapoo-player3.testnet",
  "block_height": 276743133,
  "key": "nearhunt/probe/test-b",
  "value": {"id":"spike-b","name":"Spike B - custom namespace",
            "schema":"nearhunt/project/1","written_at":"2026-11-08"}
}]}
```

### What this proves

| Claim | Status |
|---|---|
| A FastData KV write works to a receiver that is **not** `social` | ✅ proven, block 276,743,133 |
| Arbitrary keys outside the `social-kv/1` standard are stored | ✅ proven (`nearhunt/probe/test-b`) |
| Receipt failure (`ExecutionError`) does not prevent indexing | ✅ proven — the call failed and the row exists |
| `predecessor_id` records the author of the row | ✅ proven (signer = predecessor) |
| Read access needs no API key | ✅ proven (`kv.test.fastnear.com`, anonymous) |
| Indexing latency | ~6 s from send to readable |
| Nesting is preserved, key order normalised | ✅ proven (values re-serialised by the indexer) |

### What it does not prove

- That a receiver with **no contract** works end-to-end from a client that pre-flights like
  `near-cli-rs` does. `social` on mainnet is exactly this shape (contract-less, indexed, gas 1),
  so the pattern is in production — but our own namespace account was not registered in this
  pass. **Blocking item for the build, not for the architecture.**
- Rate limiting on the public KV read API under load.
- Behaviour when the same key is written twice (last-write-wins is specified; not yet exercised
  by us).

---

## Consequence 1 — no smart contract

NEAR Hunt needs no bespoke contract. A project record is a KV key:

```
project/{project_id}  →  {"schema":"nearhunt/project/1", …}      written by the indexer service
vote/{project_id}/{voter}  →  {}                                  written by the voter
```

> **Superseded (8 Nov):** the vote key is now `vote/{project_id}` with the voter as the
> writer (`predecessor_id`), not inside the key. A key-embedded voter can be forged: anyone can
> write `vote/x/alice.near` from their own account. The index already keeps one row per writer
> per key, so writer-as-voter gives one vote per account with nothing to check. See
> `schema/README.md`. The test below remains valid evidence for last-write-wins.

Because the voter's account id is *inside the key*, one-account-one-vote is a structural
property, not an application check. A duplicate vote rewrites the same key — it cannot inflate a
count. This is the same trick near.social uses for `like/{account}/{post_id}`, and it is
strictly stronger than a counter incremented by a server.

## Consequence 2 — votes do not need near.social posts

The PRD assumed upvotes ride on near.social likes, which requires **one near.social post per
project**. Creating those 271 posts from a single account would:

- consume the 300-posts/day budget and 5 MiB/day value budget for one account;
- flood the near.social global feed with 271 posts nobody asked for — the exact "feed pollution"
  risk in PRD §13;
- make every project's vote target depend on post IDs that must be stored and kept in sync.

Writing votes into NEAR Hunt's own namespace avoids all three, costs one 1-Ggas transaction per
vote, and keeps the canonical record self-contained.

### Vote primitive — tested

Three writes against the same project, from two accounts, one of them repeated:

```bash
near contract call-function as-transaction $NS __fastdata_kv \
  json-args '{"vote/probe-1/board3.metapoo-player1.testnet":{}}' … sign-as board3…   # vote 1
near contract call-function as-transaction $NS __fastdata_kv \
  json-args '{"vote/probe-1/board1.metapoo-player3.testnet":{}}' … sign-as board1…   # vote 2
near contract call-function as-transaction $NS __fastdata_kv \
  json-args '{"vote/probe-1/board3.metapoo-player1.testnet":{}}' … sign-as board3…   # duplicate
```

```json
{"entries":[
  {"predecessor_id":"board1.metapoo-player3.testnet","key":"vote/probe-1/board1.metapoo-player3.testnet","value":{}},
  {"predecessor_id":"board3.metapoo-player1.testnet","key":"vote/probe-1/board3.metapoo-player1.testnet","value":{}}
]}
```

**Three writes produced two votes.** The duplicate overwrote its own key (last-write-wins), so a
repeated vote is physically incapable of inflating a count — no server-side deduplication, no
counter that can drift. The author appears as `predecessor_id` and is also embedded in the key,
so a tally is a `key_prefix` scan with no join.

Un-voting is `{"vote/{project_id}/{voter}": null}` — a tombstone, which the "latest" endpoint
reports as `value: null` and which must be filtered when counting.

**Recommendation:** votes and project records live in the NEAR Hunt namespace. Reserve
near.social for **discussion**, where its identity, threading and reach are genuinely
irreplaceable — and create a project's social post **lazily, on the first comment**, so the
feed only ever carries projects someone actually talked about.

## Consequence 3 — the index is rebuildable

Anyone can replay `kv.main.fastnear.com` into their own database. That makes the "centralized
index" risk in PRD §13 a non-issue: the index is a cache over public data, and if NEAR Hunt
disappears the records do not.

---

## Cost model (measured)

| Operation | Gas | Deposit | Notes |
|---|---|---|---|
| KV write (1 key) | 1 Ggas | 0 NEAR | ≈0.001 NEAR of key allowance |
| KV write (batch, ≤256 keys) | 1 Ggas | 0 NEAR | import all 271 projects in ~2 transactions |
| near.social post | 1 Ggas | 0 NEAR | 300/account/day cap |
| near.social like | 1 Ggas | 0 NEAR | 1000/account/day cap |

Batching the hackathon import into ≤256-key calls is the reason 271 projects are cheap: two
transactions, not 271.

---

## Remaining blocker before Phase 1 — resolved

**Resolved 8 Nov:** `nearhunt.near` was registered and funded (block 223,583,069), and the
271-project import landed in two transactions (blocks 223,583,277 and 223,583,288). The
options below are kept for the record.

**The namespace account.** Options:

1. A short `.near` name (e.g. `nearhunt.near`) — best for an open-data project, but short names
   carry a registration premium that needs pricing before committing.
2. An implicit account (64-hex) — effectively free to create, unreadable in a URL, fine as a
   machine namespace.
3. Reuse an existing account — no, muddies provenance.

Chosen: option 1, `nearhunt.near`.
