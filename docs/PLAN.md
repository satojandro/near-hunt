# NEAR Hunt — delivery plan and backlog to 14 Nov

**Updated:** 2026-11-09 · **Deadline:** 14 Nov 2026, 23:59 UTC · **Days left:** 6

Mockups for every page and flow referenced below (boards 1–9) are in [`mockups/`](mockups/README.md); the editable canvas is at
https://claude.ai/artifact/TheVd1qg4LzCRzStJvKPKe (private until shared).

## Where things stand (re-audited 2026-11-09 after the NH-96 write, by Hermes)

`nearhunt.near` has one funding transfer and twenty-three project-import transactions:

1. a 1 NEAR funding transfer (block 223,583,069);
2. 256 `project/…` records (block 223,583,277);
3. 15 `project/…` records (block 223,583,288);
4. 4 `project/…` records — tx `8rX5McjBeiitsRAhQsY7sqWbTQ9nXXHBDYwCJyQuGhfk`
   (`NEAR Claim Check`, `Potluck`, `Swarmpad`, `Q-day`);
5. 5 `project/…` records — tx `79cSKJkLzZw7mbpaKGFMrX5fpRjkxwcCrgbiNNekhVMF`
   (`SpendGuard`, `AgentGuard`, `Hallmark`, `Autonomous Treasury Mesh`, `near-agent-guard`);
6–10. the enrichment write, 265 keys in five batches, all applied 8 Nov after the owner approved
   that exact diff:
   `SMarR1rfceWC7xkSoJNaMHMughbhN9chLXELUQsMCs5` (65), `7qX3V7XeFRqgMyGKtHN1rUPZsb9n4d3AGn3xR5JTp5ZF` (64),
   `GqM47JwJ4tdS9NpiQttyZhcvGj7uzagXEyszXVoX2ZS` (63), `8sANNYHH6kyfDBXTCMsEbjnh2BSvj5fvJjsJeQZskjvC` (63),
   `Gom4MYrHpgZ7pGvTqSQoUwMLZcFRdBZbV5u5HTcyEqVQ` (10);
11. 19-key correction — tx `Bo5ktqRxYFu6Bik4GLDU8pPnyk5bCu8WdnpKZebcAkmY` (18 descriptions with a
    dangling `Repo:`/`Demo:` label plus the newest `AgentGuard` record).
12. The NH-96 enrichment write, 257 keys in six batches, 9 Nov. The owner approved these exact
    numbers after the dry run printed them verbatim (`257 keys, 337616 bytes, 6 transaction(s)`),
    and the execute run reprinted the same numbers before signing:
    `5weeMimTDTFeURnRxKPBgin4vS3mohGsTYJZZUgAtBrS` (48), `HkxpLGGMFanZWU227iECne2CHt7mU7BowvXcXQbeXqHu` (48),
    `HQGWrwyRbYxPgQxgDBAHdiRigJHmg5p9BTS61M7rEajJ` (48), `6owv4LrZ5K1xbKmbrTtUA2wRYQrjmoTedLBFpUSqZfPe` (49),
    `8f3uiyonG66Qs6RdUng1X1vgW7cxq9RYLVtHW7RwrMjM` (48), `HCCkXj44yMFV8AjM1pXUwSqoYfdNmMidr6NCbX4styUm` (16).
    Importer output: `verified: 257/257 written keys read back`. Fields written: `media` 251,
    `links` 96, `repository_url` 1 (SafeSpend, `bitbucket.org/dualrail-builder/near-safespend`),
    `enrichment` 257; no description changed. Signed with the FullAccess key: no importer
    function-call key exists on chain (see below), and the owner chose `--accept-full-access` for
    this batch rather than adding one first.

13. The 55 pending feed submissions, 9 Nov, creation-only (`--enrichment
    data/enrichment/proposal-pending-55.json`, no `--updates-only`): 55 keys, 64,284 bytes, 2
    transactions — `EEeMQeBrymz7oS9p5iA2KH2eiNDV8FW7LPCX4r7Lbn8W` (54) and
    `8M7MrTBYWPNNqE8cW7hvaPL3bzQe632qaTX4gp26qzoA` (1). Importer output `verified: 55/55 written
    keys read back`; `changed: 0` on the existing 281 before the write. Of the 55: 47 carry the
    builder's own description, 43 `media` (49 items), 14 a verified repository, 18 labelled and
    checked `links`; 5 were `not-an-x-post` and 3 `post-unavailable`, so they carry feed fields
    only. Signed with the FullAccess key under the same explicit choice as batch 12.

14. Repositories recovered from the builders' replies, 9 Nov (NH-96c), owner-approved for
    `70 keys, 109373 bytes, 2 tx`: `AHNbKXxpfY2XPQkTMz3YzzKNPfyYJYYnEF2JoZHxU5Eq` (41) and
    `GBa9v6X99sj1SNUesye2zcoz1sGJDoJpHWyKcruf8iNm` (29). Importer output `verified: 70/70 written
    keys read back` (41/70 on the first two attempts, 70/70 on the third); re-run prints
    `changed: 0, unchanged: 336`. Fields: `repository_url` 43, `links` 58 (additions only, no URL
    removed), `enrichment` 70; no description changed. Signed with the FullAccess key.

15. The 9 new feed submissions, 9 Nov, creation-only: `9 keys, 4713 bytes, 1 transaction` —
    `27W5Sw6fx2aP9EA3vMnXNZs7H3FMP9Umfo8qjywfdfzo`. The owner authorized this exact diff ("import 9
    new projects") after the dry run printed it twice, 20 minutes apart, with `changed: 0` both
    times (feed 345, chain 336). Names: `Four Horsemen of the Memepocalypse`, `Nearfund`, `NearJev`,
    `The Daily Swarm`, `Hushmark`, `Bag worker`, `Ashes of the Ninth Heaven`, `Contri`,
    `Digi Swarm Treasury`. Importer output: `verified: 9/9 written keys read back` (0/9 on attempts
    1–2, 9/9 on attempt 3). Signed with the FullAccess key: still no importer function-call key on
    chain, same explicit `--accept-full-access` choice as batches 12–14.

    **Correction (same day):** batch 15 was run as a plain `--execute` from the feed instead of the
    runbook's `--enrichment data/enrichment/proposal.json` path, so the nine records landed with
    feed fields only — `media` 0, `links` 0, `repository_url` 0, no `enrichment` — and their pages
    had no Media card. Batch 16 fixes that. Creating records outside the runbook's cycle is the
    mistake; steps 2–4 are what make a record complete.

16. The nine batch-15 records enriched, plus the two submissions that arrived since, 9 Nov:
    `11 keys, 14711 bytes, 1 transaction` — `7kWNKvr2x6heq1ZzttDZM9KXjHqi9QGb1FPJfstRCRNf`.
    Importer output `verified: 11/11 written keys read back` (5/11 on attempt 1, 11/11 on attempt
    2). Pipeline as written in [`runbooks/new-submissions.md`](runbooks/new-submissions.md):
    `threads:capture` (189 threads walked, 3 usable new replies), `enrich` (347 projects, 323
    recoverable, 305 with media, 163 repositories checked with `git ls-remote` — 160 answered, 3
    dropped), `enrich:links` (213 URLs: 194 live, 19 http-error), `enrich:duplicates` (one cluster,
    not these: `NEAR: On The Evidence` and `Pump Rider` share `pump-rider.netlify.app`). Each of the
    nine now carries the builder's own description and one **video** (poster URL, duration,
    `post_url`), rendered as a playable X embed on `/p/{id}`; `repository_url` for 5, labelled
    `links` for 3. `MintCheck` (with repository) and `Agentguard` were created already enriched
    rather than feed-only. Signed with the FullAccess key under the same explicit choice.

17. The 40 new feed submissions and 10 changes, 10 Nov — the first batch run through the cycle
    exactly as the runbook writes it. Dry run: `new: 40, changed: 10, unchanged: 337,
    missing from feed 0, deleted on chain 0`; `50 keys, 64248 bytes, 2 transaction(s)`. The owner
    approved **that** diff after it was built twice (feed 382 then 387; the second build added five
    submissions — `NearJar`, `Purser`, `$YAP`, `Petri`, `ShowUp` — and the approval was asked again
    at the new numbers rather than reused). Execute ran behind a guard: a fresh dry run had to print
    `50 keys, 64248 bytes, 2 transaction(s)` before the signed run was allowed to start. Transactions:
    `7gLPKnSsiqBzYj6HCT7KiCwAG6zbPkXTsU4GwT14f6n` (49 keys) and
    `4GubWDQpuCwWMQKbfaZGJ1kLLHy4iNCmBwnrKSehqXKh` (1 key). Importer output
    `verified: 50/50 written keys read back` (49/50 on attempt 1, 50/50 on attempt 2).
    Of the 40 new records: **38 carry the builder's own description, 37 `media`, 12 a verified
    repository, 10 labelled `links`**; 2 (`NEAR-Midnight Privacy Bridge`, `VIGIL`) are feed fields
    only because their `demo_url` is not an X post. The 10 changes: `tracks` 4 (Terra matcher,
    IntentWatch, NEARpedia, Grind District), `demo_url` 4 (Nims and Q-day moved to a newer X post
    from the same builder; Kinwarden and Lantern Caravan traded a live `duckdns.org` demo for the
    builder's newer X post link), and 2 enrichment gains (`repository_url` for Payproof Global and
    Agentguard; Agentguard also gains one `links` entry that is already 404 and is kept, marked, per
    policy). Pipeline output this round: `threads:capture` walked 185 threads (1 usable new reply;
    6 posts gone, 72 with no author reply), `enrich` covered 387 projects (361 recoverable, 342 with
    media, 177 repositories checked — 174 answered, 3 dropped), `enrich:links` 217 URLs (194 live,
    22 unverified, 1 gone), `enrich:duplicates` the same single known cluster. Signed with the
    FullAccess key under `--accept-full-access`, as in batches 12–16.

    **One defect this batch introduced, reported not hidden:** the feed gives `VIGIL`
    (`1ca01819-1a03-4a49-81d7-eb5755db0fea`) the `demo_url`
    `http://paypilot-approval-wallet.lovable.app/`, which the schema rejects (`/demo_url must match
    pattern "^https://"`). The importer copies feed-owned fields verbatim, so the record went to
    chain invalid. It is the only such submission in the feed (388 read 10 Nov), and the `http` URL
    301-redirects to `https://paypilot-approval-wallet.lovable.app/`, which answers 200. Fixing it
    means either normalising the scheme on the record (a one-off write with its own approval) or
    teaching the importer to reject/normalise a non-https `demo_url` before it plans a write; both
    are owner decisions and neither has been done.

18. The 25 new feed submissions and 35 changes, 10 Nov — the round that fixed the two recurring
    gaps (missed repositories, missed media). Dry run approved by the owner: `new: 25, changed: 35,
    unchanged: 352`; `60 keys, 92327 bytes, 2 transaction(s)`. **Only the first transaction landed**:
    `GVcAbpVHWzRs8oHBKn6NNGMCjae55q5XcLCTy5Z2FsFK` (44 keys = the 25 creates + 19 corrections).
    The importer printed `sent 2/2: 2A5CVDX6xyKKrjugwMYa3Bqz9vmdtGyGkDWjYWzCvpAG (16 keys)` and then
    `verified: 44/60`, and an audit proved why: the access key's nonce went `…025 → …026`, one
    increment for two transactions. `sendBatch` re-read the key at `optimistic` finality, which still
    reported the pre-batch nonce milliseconds after the first broadcast, so the second transaction was
    signed with a nonce already used; the RPC accepted it (`send_tx` with `wait_until: NONE`) and the
    chain dropped it. **Fix:** the importer keeps its own counter (greater of the node's nonce and the
    one it used last, plus one). The same round also replaced `rpc.mainnet.near.org`, which now
    answers every call with a deprecation `-429`, with `https://free.rpc.fastnear.com`
    (`NEAR_RPC_URL` overrides). Of the 25 new records: **25 descriptions, 22 media sets, 11 verified
    repositories**. Pipeline: `capture-threads --gaps-only --include-pending` walked 250 records
    (94 with author replies, 133 with none, 6 posts gone, 17 not X posts), `enrich` covered 412
    submissions (388 recoverable, 370 with media, 208 verified repositories after `git ls-remote` on
    209), `enrich:links` 238 URLs (194 live, 22 unverified, 1 gone).

19. The 17-key completion, 10 Nov — the 16 corrections the dropped transaction carried plus the one
    submission that arrived in the feed meanwhile (`Semilla1 NEAR Thesis`, `4909e0ef…`). Dry run,
    approved by the owner at these exact numbers after the chain moved: `new: 1, changed: 16`;
    `17 keys, 29759 bytes, 1 transaction` —
    `5Pzeto9QruoyDXYnqhjR6656NLG8UUby2QmG3abtAFFZ`. Importer output `verified: 17/17 written keys
    read back`, transaction `FINAL`. Fields: `repository_url` 9, `links` 11, `media` 4 (7 items; the
    builders' screenshots in their own replies), `description` 2 (both were `null` on chain, so no
    builder- or owner-set value was replaced). Afterwards: **413 records on chain, 412 valid**,
    `0 new, 0 changed, 413 unchanged`, 0 foreign rows, 0 tombstones. The single invalid record is
    still `VIGIL` from batch 17. Signed with the FullAccess key under the same `--accept-full-access`
    choice as batches 12–17.

20. The 86 new feed submissions and 3 changes, 11 Nov — the largest batch so far, and **the first one
    to lose a transaction since the nonce counter was added in batch 18**, in the opposite direction.
    Dry run approved by the owner at `new: 86, changed: 3, unchanged: 410`; `89 keys, 122467 bytes,
    2 transaction(s)`. Execute reprinted the same numbers, then:
    `sent 1/2: 4oYqw1tpvJh3kUNzUQKmHNvQTwkQQ43QFmQEUZsMbh5k (47 keys)`,
    `sent 2/2: Co8gtGn4xN78fdmQjBTHjuX3PVp4SxruApD5eFCYTYFQ (42 keys)`, `verified: 42/89`.
    An audit of the chain found the **first** transaction was the one lost: `tx` returns
    `NOT_OBSERVED` on both `free.rpc.fastnear.com` and `rpc.mainnet.near.org`, nearblocks has no such
    transaction, and the access key's nonce advanced by exactly one (`…028 → …029`) for two
    transactions. The second batch landed at block 223,986,432 — 39 creates and all 3 corrections.
    The remainder was then re-run as a strict subset of the approved write
    (`47 keys, 62841 bytes, 1 transaction`), which landed as
    `4pFcW33FRT18gCpUba5hW8AdXCPoDDaVsJKKFndKCo42`, importer output `verified: 47/47 written keys
    read back`.

    **Open defect, reported not hidden:** in batch 18 the *second* transaction was dropped and the
    first landed; here the *first* was dropped and the second landed. The counter alone does not
    prevent this because `sendTransactionAsync` (`wait_until: NONE`) returns on acceptance, not
    inclusion: if the later-nonce transaction reaches a validator first, the access key's nonce
    advances past the earlier one and the earlier transaction is then invalid and silently dropped —
    the RPC still reports both as "sent". The durable fix is to wait for inclusion (not execution)
    of each batch before signing the next, so no nonce can be overtaken; that is a change to
    `sendBatch` and has not been made.

    Of the 86 new records: **84 carry the builder's own description, 81 `media`, 43 a verified
    repository, 34 labelled and checked `links`**. The 3 corrections: `Marks` gained
    `repository_url` (`github.com/amdonatusprince/Marks-on-Near`) and provenance; `Semilla1 NEAR
    Thesis` gained its description, that repository and one video poster; `Krypt`'s feed-owned
    `demo_url` moved from the still-live `https://krypt-app-nine.vercel.app/` (HTTP 200 when
    checked) to the builder's X launch post, so its page label changes from "Demo" to "Launch post
    on X" — no URL is kept on the record for the app. Pipeline: `threads:capture` walked 303
    records (200 reused from cache, 39 fresh captures with author replies, 45 with none, 18 not X
    posts, 1 gone), `enrich` covered 499 submissions (473 recoverable, 452 with media, 254
    repositories checked with `git ls-remote` — 251 answered, 3 dropped), `enrich:links` 281 URLs
    (240 ok, 26 http-error, 2 real 404s kept and marked, 25 unverified and not reported as dead),
    `enrich:duplicates` one cluster (still `NEAR: On The Evidence` / `Pump Rider`, both long on
    chain, reported only). Signed with the FullAccess key under the same `--accept-full-access`
    choice as batches 12–19; no importer function-call key exists on chain yet.

    **After batch 20, read back from the indexer:** **499 project rows**, 0 foreign rows,
    0 tombstones, 499 distinct ids; `npm run validate:schema` reports **498 valid and 1 invalid**
    (`VIGIL`, unchanged from batch 17, still the builder's `http://` demo URL); the importer dry run
    prints `new: 0, changed: 0, unchanged: 499`, so feed and chain are level at 499. `npm test`
    320/320 before the write.

    **Both defects from this batch were addressed the same day, in code rather than by re-running
    more carefully.** (a) `sendBatch` now calls `sendTransactionUntil(tx, 'INCLUDED')` instead of
    `sendTransactionAsync` (`wait_until: NONE`): no batch is signed until the previous one is in a
    block, so a later nonce can no longer overtake an earlier one, and a broadcast that is not
    confirmed stops the run with the transaction hash instead of proceeding. The by-design
    `CodeDoesNotExist` receipt is unaffected — `INCLUDED` does not wait for execution. This is
    untested against a real multi-batch import (the next import is its first exercise); `npm test`
    is 322/322. (b) `FASTNEAR_API_KEY` is now honoured: `lib/kv.mjs` sends
    `Authorization: Bearer …` on every KV page read (optional — no header at all when unset) and the
    importer switches to the keyed host `https://rpc.mainnet.fastnear.com` when the variable is
    present, `NEAR_RPC_URL` still winning. Measured on the live endpoints: `rpc.mainnet.fastnear.com`
    answers `200` without a key and `403` with an unrecognized one, so the header is honoured there;
    `kv.main.fastnear.com` answers `200` either way, so a bad key is not a failure signal on reads.
    Two unit tests cover the header. **Not wired to a secret yet:** `bws` is installed on the
    importer machine but has no access token in the shell, so imports still run anonymously against
    the free tier until `FASTNEAR_API_KEY` is exported for the run.

**Media and repositories, the two recurring gaps, now closed structurally (10 Nov):**
`capture-threads.mjs` reads the author's replies for the media they carry (it used to throw
`mediaDetails` away), orders a record's media as submitted post → replies in thread order →
ancestors, and covers feed submissions that are not on chain yet (`--include-pending`), which is
where a new project's repository usually lives. `--gaps-only` selects records missing a repository
**or** a media set, and a capture (including "no author reply") is reused for 7 days so a scheduled
run does not re-crawl the same pages. Not recoverable, stated rather than hidden: 7 records name a
repository that X truncated mid-name (`Code: github.com/neromtoobad/cr…`), 1 is genuinely ambiguous
(`Antibody`: `Himess/antibody` and `Himess/antibody-immune-demo`), and 180 recoverable records still
have no repository the builder published anywhere X renders to us.


**After batches 12–14, read back from the indexer:** **336 records, all 336 valid** against the
schema, 0 foreign rows, 0 tombstones; 312 carry the builder's own description, **156 a verified
repository**, 294 `media`, 164 with links. 180 records still have no repository: the builder
published none that X renders to us (68 captured threads had no author reply, 17 `demo_url`s are not
X posts, 6 posts are gone). 15 records still keep unlabelled links (see NH-96: the 8 Nov correction
dropped their provenance, so `--refresh-enriched` refuses them). Re-running any import prints
`changed: 0, unchanged: 336`; the feed and the chain are level at 336.

**After batch 15, read back from the indexer:** **345 project rows, all 345 valid** against
`nearhunt/project/1`, 345 distinct ids, 0 tombstones (`npm run validate:schema`); the dry run now
prints `new: 0, changed: 0, unchanged: 345`.

**After batch 16, read back from the indexer:** **347 project rows, all 347 valid** against
`nearhunt/project/1`, 347 distinct ids, 0 tombstones (`npm run validate:schema`); the importer dry
run with the proposal prints `new: 0, changed: 0, unchanged: 347`.

**After batch 17, read back from the indexer (10 Nov):** **387 project rows**, 0 foreign rows,
0 tombstones, 387 distinct ids; `npm run validate:schema` reports **386 valid and 1 invalid** — the
`VIGIL` `demo_url` case above, the only record on chain that fails the schema and the first the
import has produced. The importer dry run with the proposal printed `new: 1, changed: 0,
unchanged: 387` immediately afterwards (the feed had already reached 388), so one new submission is
waiting for the next approval.


**The site serves 386 of those 387** since batch 17 (10 Nov): one record is on the owner's hide list
(`data/hidden-projects.json`, `fa54da13-…` "777 giros gratis", a gambling referral). Hiding is a
repo change, not a chain write — the record is untouched on chain and `/api/projects` reports
`meta.total: 386`. `npm run validate:schema` and the importer still see all 387.

**The 19-key correction** was applied in tx `Bo5ktqRx…` — 18 descriptions that ended in a dangling
link label, plus the newest `AgentGuard` record — via `--refresh-enriched`.

**Importer key (state on 12 Nov):** the scoped key now exists. Owner-approved on 12 Nov,
`near account add-key nearhunt.near grant-function-call-access --allowance '0.25 NEAR'
--contract-account-id nearhunt.near --function-names __fastdata_kv` added
`ed25519:2WMyEz8FTeywPbziEhTxJhpHuViUENp1bDQ5uFFwgTeA` (FunctionCall, receiver `nearhunt.near`,
`__fastdata_kv`) in tx `AA7pbAPeA5phsCbp664Sg8o3PAsgBFeH5D8Z1Kz2Zipc`, and the two FullAccess
credential files were moved to `~/.near-credentials-archive/` (mode 600) so the importer resolves
the scoped key first: `node scripts/import.mjs --check-key` prints
`permission: FunctionCall(nearhunt.near, __fastdata_kv)`. Batches 12–21 were signed with the
FullAccess key under `--accept-full-access` (the key did not exist then); batch 22 is the first
scoped signing. `runbooks/keys.md` carries the same state.

**near.social identity is now set up** (both owner-approved on 8 Nov): a function-call key
`ed25519:2ozjdhsUK6iAAWrGtizUtqkx8ms9FSDzKBwedMSa2gaW` scoped to receiver `social` with methods
`__fastdata_kv`/`__fastdata_fastfs` and a 0.25 NEAR allowance (tx `CJEvxUwy…`; secret at
`~/.near-credentials/mainnet/social-keys/nearhunt.near-social.json`, mode 600, never committed),
and the profile — name, automated-disclosure about, website — in tx `544jUhRV…`
(`GET /v1/accounts/nearhunt.near` → `has_profile:true`, posts 0).

The read-only product is built and deployed at **https://nearhunt.xyz** (Day 1; the same deployment
also answers at `near-hunt.vercel.app`), and Day 2's
connect + upvote is merged and deployed. Day 3 — near.social discussion, the account page, the
outage and stale-data states, the 390 px pass and the vote-count refresh — is **merged to `main`**
(PR #4, merge commit `3a7189f`, 9 Nov), built, verified and **deployed to production on 8 Nov**.
The remaining gates in
[`runbooks/day3-signing-checklist.md`](runbooks/day3-signing-checklist.md) (A2–A3, B1–B4, C1–C5,
D1–D2) are a human's, not the code's: real-wallet signing checks and the NH-40 post batch.
Day 4 (the read-only JSON API, `SKILL.md`, the open data page) is **merged to `main`** in PR #6
(merge commit `df7ac8c`, 9 Nov) and **deployed to production** (`k15gdqx9a`), so it needed nothing
signed. What is missing is NH-63's Hermes run against the live site, Day 5, and the NH-40 posts.
The domain is done: `nearhunt.xyz` is verified on Vercel and answers in production (8 Nov), and
`www` 308-redirects to the apex.
Keys for `nearhunt.near` live on the operator's
machine by the owner's decision of 8 Nov — the gate is approval of each write, not the machine.

Evidence, reproduced 8 Nov evening after the enrichment write; the test count and the NH-40 dry run
were re-run on the merged `main` (`3a7189f`):

```bash
npm test                  # 196 pass, 0 fail
node scripts/social-posts.mjs   # NH-40 dry run: 40 posts / 40 tx / 10,917 bytes; --execute exits 2
npm run validate:schema   # 281 records on chain, 281 valid, 0 foreign rows, 0 tombstones
node scripts/import.mjs   # 0 new, 0 changed, 281 unchanged — nothing to write
node scripts/import.mjs --enrichment data/enrichment/proposal.json --refresh-enriched   # 19 keys, 18,944 bytes, 1 tx — pending
node scripts/import.mjs --social-posts data/social-posts.json   # after A2: fills social_post only, never replaces one
node scripts/import.mjs --check-key   # every candidate key with its on-chain permission
near account list-keys nearhunt.near network-config mainnet now   # 1 key, full access
```

21. The 120 new feed submissions and 40 changes, 12 Nov — the first batch whose approval covered the
    **kind** of write instead of byte-exact numbers, because the feed outran the approval round-trip.
    The cycle started at `feed:check`: 93 new, 8 changed (chain 499, feed 592). That same morning the
    unmerged crawler branch `claude/brave-euler-8pzsph` was merged (`bf46f68`): the thread cache had
    been reused forever, so a builder's later replies were never re-read; the branch also adds
    NH-96d repository discovery from the builder's own demo page. `threads:capture --refresh` then
    walked 356 threads (272 projects with captured posts, 189 `ok`), `enrich` covered 596 proposals
    (565 recoverable, 325 repositories — **23 of them corroborated from 31 demo pages**, links 279,
    media 543), `enrich:links` 310 URLs (278 live, 27 unverified, 5 gone), `enrich:duplicates` still
    the one known cluster (`NEAR: On The Evidence` / `Pump Rider`).

    **Defect found and fixed mid-cycle:** one deleted post threw out of `captureThread` and killed
    the whole crawl — two runs died, at 60/354 and 310/356, with `FAILED: status 404`. A 404 on the
    submitted post is now recorded as `post-unavailable` (`c7ec2cd`, two tests; the script runs
    `main()` only when executed directly so the capture function is testable).

    **The approval drift, recorded because it is the point of this batch:** the dry run was approved
    at `new: 100, changed: 32` / `132 keys, 184833 bytes, 3 tx`; ten minutes later it recomputed to
    141 keys, then 155, and the executed run printed `new: 120, changed: 40, unchanged: 459` /
    `160 keys, 209263 bytes, 4 transaction(s)` at feed 619. The owner's instruction was to finish the
    batch rather than chase the number ("STOP FUCKING INTERRUPTING RUNS IF NEW PROJECTS COME IN"),
    so `AGENTS.md` §1 and `runbooks/new-submissions.md` §5–§6 were changed in this same commit: a yes
    covers the kind of write (account, prefix, new submissions + corrections), signing stops only if
    the kind changes (other account or prefix, tombstones, key changes, an enrichment overwrite), and
    the numbers the write actually did are reported afterwards. A later batch takes whatever arrived.

    Transactions, all four included (43 + 47 + 56 + 14 = 160 keys):
    `14NLiciQmv2ueRuAkX3NSTsprzy95wk3HtNDUXWroXKh`, `HSMH3ZWMnbTpqrzEc9Q5uNnWnRtXzcQbGQ4zjcUs4WqY`,
    `C5anFhiy6Ejxwt6zu6CfVeRmDGXgBfNbBzhcmSZPPdMk`, `FptpoD7cRecdxpgCZQrhwxAak5oT1MWXtqJjBwQwVqaW`.
    Importer output `verified: 160/160 written keys read back` (157/160 on attempt 1, 160/160 on
    attempt 2). **This is the first run that exercises the `INCLUDED` nonce fix from batch 20
    against a real multi-batch import, and the lost-transaction defect did not recur: 4/4 landed.**
    Of the 120 new records, 100 were built into the proposal (description from the builder, media,
    51 with labelled links, 44 with a verified repository); the last 20 arrived after the enrichment
    build and carry feed fields only — the next cycle enriches them. The 40 changes are 21
    `repository_url` + provenance gains (the demo-page promotions), 8 feed-side `tracks`/`demo_url`
    edits, 1 rename, 1 `description`/`links`/`media` gain, rest unchanged-origin. Signed with the
    FullAccess key under the explicit owner choice for this batch ("use full access key now, we can
    create function key later"); still no importer function-call key on chain.

    **After batch 21, read back from the indexer (12 Nov):** **619 project rows, 0 foreign rows,
    0 tombstones, 619 distinct ids**; the feed is level with the chain (`new: 0, changed: 0,
    unchanged: 619`). `npm run validate:schema` reports **617 valid and 2 invalid**, both copies of
    one feed defect: `VIGIL` (`http://paypilot-approval-wallet.lovable.app/`, from batch 17) and
    `IntentFolio` (`fc122909-…`, `http://x.com/intentfolio/status/…`, new here) — the feed gives a
    non-`https` `demo_url` and the importer copies feed-owned fields verbatim. Reported, not fixed:
    normalising the scheme is a one-off write with its own approval, and rejecting it in the planner
    is an owner decision. `npm test` 354/354.

22. **Builder corrections from the issue queue, 12 Nov.** Three `Correction:` issues were open
    against the listing — `#17` Loca, `#13` QuorumGuard, `#11` Grind District — all asking for a
    repository that existed but had never been captured; two also asked for extra links. Applied as
    `node scripts/import.mjs --enrichment data/enrichment/corrections-issues.json --updates-only
    --refresh-enriched`: the file is built from the issues, and every URL in it answered before the
    write (`git ls-remote` for the three repositories, `probeLink` for the app, the video and the new
    domain). `--updates-only` is what keeps this a corrections batch — the feed had 8 new submissions,
    none of them written here. `--refresh-enriched` was needed only so Grind District's existing
    `links` array could gain `grinddistrict.app` while keeping the `vercel.app` one; provenance is
    `enrichment.method: builder-issue` with the issue and the repository as sources.

    Fields: Loca +`repository_url`; QuorumGuard +`repository_url`, +live app (demo), +2-minute video;
    Grind District +`repository_url`, +`grinddistrict.app` (website). One transaction,
    `AUBVamvbtahA9QaC9mrpaP3WQTCaEUYuisj9R77Bqsv` (3 keys, 4765 bytes), signed with the scoped
    `ed25519:2WMyE…` FunctionCall key on `__fastdata_kv` — **the first import that needed no
    FullAccess and no `--accept-full-access`**. `verified: 3/3 written keys read back`; the three
    pages were then read through `nearhunt.xyz` and show the new links. `npm run validate:schema`
    617/619 (the same two `http://` `demo_url` feed defects), `npm test` 361/361. All three issues
    answered and closed.

23. The 60 new feed submissions and 28 changes, 12 Nov — batch 23, run through the runbook's cycle
    exactly. Dry run shown to the owner and approved at `new: 54, changed: 28, unchanged: 591`;
    `82 keys, 108027 bytes, 2 transaction(s)`. The execute run recomputed first (the feed had moved
    to 679): `new: 60, changed: 28, unchanged: 591`; `88 keys, 111216 bytes, 2 transaction(s)` —
    growth during the approval, covered by the approval's *kind*, reported here as what actually
    landed. Transactions, both `FINAL`:
    `H7KPHP3ihE9gHmdJaVUt4WKCxcycj2hA5Ff1VPRYtHjZ` (46 keys) and
    `8QXPCxFhYxSfkG5j1iSwhuPuyb3qfVi6UpuQXvqNJ66v` (42 keys). Importer output
    `verified: 88/88 written keys read back` (75/88 on attempt 1). Signed with the scoped
    `ed25519:2WMyE…` FunctionCall key on `__fastdata_kv` — no FullAccess, no
    `--accept-full-access`.

    Of the 60 new records: **47 carry the builder's own description, 47 `media` (65 items), 26 a
    verified repository, 23 labelled and checked `links`, 47 `enrichment` provenance**. 13 are
    feed-only: 11 arrived in the feed *after* the enrichment build (late X posts, enrichable next
    cycle) and 2 have a non-X `demo_url`. The 28 changes are fills, never overwrites: `description`
    17, `repository_url` 9, `links` 12, `media` 16, `enrichment` 19, and **no changed record had a
    non-null description before** (checked against chain before asking). The remaining changes are
    feed-owned: `demo_url` 5 (Galeon moved from YouTube to its X post; Robin Arcades from a live
    `jakeronthia.github.io` page to its X post, so its label is now "Launch post on X"), `name` 3
    (`Busari Ibraheem (Dappest Dev)`→`Emporium`, `Private Health Reading`→`DNA Confidential`,
    `NEAR Sentinel`→`NEAR Sentinel: Did It Land?`), `tracks` 2.

    Pipeline this round: `threads:capture --gaps-only --include-pending` walked 353 threads (263
    reused from cache, 22 fresh captures with author replies, 18 with none, 25 no-replies-listed, 24
    not X posts, 1 post gone); `enrich` covered 669 submissions (632 recoverable, 606 with media, 341
    repositories through `git ls-remote` — 338 answered, 3 dropped; 118 new link visits; 30 demo
    pages read, 19 repositories corroborated and promoted); `enrich:links` 388 URLs (**352 live, 30
    unverified, 6 gone**); `enrich:duplicates` the one known cluster (`NEAR: On The Evidence` /
    `Pump Rider` share `pump-rider.netlify.app`, both long on chain — reported only). The 6 `gone`
    links are 3 `testnet.nearblocks.org` transaction links whose host no longer resolves
    (`ENOTFOUND`), `tutnarezki5-dotcom.github.io/agentguard` (404), one `njump.me` note (404) and
    `trope.fun` (`ENOTFOUND`); they stay on the records and the page marks them. The 30 `unverified`
    are crawler blocks and timeouts, not dead links.

    **After batch 23, read back from the indexer:** **679 project rows**, 0 foreign rows,
    0 tombstones, 679 distinct ids; the importer dry run prints `new: 0, changed: 0, unchanged:
    679`, so feed and chain are level at 679. `npm run validate:schema` reports **677 valid and 2
    invalid** — the same two records batch 22 left (`VIGIL` `1ca01819…` and `IntentFolio`
    `fc122909…`, both feed-owned `http://` `demo_url`s), so this batch introduced no new schema
    defect. `npm test` 380/380.

24. **The 85 new feed submissions and 12 changes, 13 Nov — batch 24, and the first batch driven by the
    scheduled cycle.** `scripts/enrich-cycle.mjs` (threads → enrich → duplicates → import dry run) now
    runs from a cron job every three hours; it is read-only and silent until a batch is ready to
    approve. Dry run: `85 new, 12 changed`, `97 keys, 131632 bytes, 3 transaction(s)`; the owner
    approved that diff in the conversation ("Yes, sign the import"). Execute reprinted the same
    numbers and signed: `9Boc33e7zxLwVRhk6DRsjK2TvrMMMfQio2skxqojXutU` (47),
    `CXwr6fPCoj8rDrrfF2667qcMWRHwxZjDy7TPrRw9q7s3` (46),
    `FH2hUpjQ7uUrLJfjF6XtQMHwudRUnD7U8AHKseAmFLMn` (4). Importer output: `verified: 97/97 written keys
    read back` (76/97 on the first indexer attempt). Signed with the FunctionCall key
    (`FunctionCall(nearhunt.near, __fastdata_kv)`) — no full-access key was used.

    Coverage of the 85 pending records: **description 82/85, media 79/85, repository 44/85**.
    Pipeline this round: `threads:capture --gaps-only --include-pending`, `enrich` over the chain and
    feed, `enrich:links` 388 URLs (**352 live, 30 unverified, 6 gone** — 3 `testnet.nearblocks.org`
    tx links, `tutnarezki5-dotcom.github.io/agentguard`, one `njump.me` note, `trope.fun`),
    `enrich:duplicates` **2 clusters / 4 submissions** (`NEAR: On The Evidence` and `Pump Rider` share
    a URL; `Sylic AI` submitted twice), plus 23 same-name and 72 same-X-account weak-signal groups.

    **Flagged to the owner:** the weak signals are dominated by coordinated "agent guard" submissions —
    `AgentGuard` ×11, `Leash` ×7, `Tripwire` ×5, `Allowance` ×4, `Mandate` ×4, plus `IntentGuard`,
    `Tollgate`, `Aegis`, `SpendGuard`, `PayGuard` — with 72 accounts each submitting two projects.
    Nothing was hidden or merged; that remains the owner's decision.

    **After batch 24, read back:** **764 project rows**; the importer dry run prints `new: 1,
    changed: 0, unchanged: 764` (one submission, `FOUND`, arrived after the write — the scheduled
    cycle picks it up). `npm run validate:schema` reports **762 valid and 2 invalid**, the same two
    feed-owned `http://` `demo_url` records batch 22 left (`VIGIL` `1ca01819…`, `IntentFolio`
    `fc122909…`), so this batch introduced no new schema defect.

25. **The five builder corrections from the issue queue, 13 Nov.** `#27` Emporium, `#26` Veto,
    `#25` Nearfund, `#24` Umbra, `#23` NearHr — every one asking for the same thing: a repository
    the builder had published, that the feed never carried. Applied as
    `node scripts/import.mjs --enrichment data/enrichment/corrections-issues.json --updates-only`;
    no `--refresh-enriched` was needed because `repository_url` was null on all five, and the one
    record that already had `links` (Umbra) is not touched by a repository correction.

    Each URL was corroborated before the write, not taken from the issue: `git ls-remote` answered
    for all five, `gh api repos/{owner}/{repo}` returned a non-archived repo whose description names
    the same project, and the README was read for each — "Emporium, NEAR edition" (agent shop paid
    in USDC on NEAR), "a NEAR vault where every AI-agent payment needs a second signer that can only
    say no" (Veto), "a fundraising platform on NEAR" (Nearfund), "Umbra is private social trading
    with public proof", "HR payroll and crypto invoicing on NEAR" (NearHr). `#27` and `#26` were
    filed by the repository owner under the same X post the listing already carries; the other three
    come from GitHub accounts matching the recording X authors (`obiJohnbosco163` ↔ `@Johnbosco_OG`,
    `sugoidaowarrior` ↔ `@SugoiDaowarrior`).

    Fields: five records gain `repository_url` and nothing else — checked field by field before
    signing, `description`, `media` (1, 1, 1, 4 and 1 items) and Umbra's `links` all unchanged.
    `enrichment` moves to `method: builder-issue` with the issue and the repository appended to the
    sources that were already there, and `fields` accumulating `repository_url`. Dry run `5 keys,
    7598 bytes, 1 transaction(s)`; `--updates-only` kept the 7 (then 8) new feed submissions out of
    the batch. One transaction, `DWUjCmxKWj7MFxUw9wiNUSpeFikeLCiFEz5WpWw8Yj6a` (5 keys), signed with
    the scoped `ed25519:2WMyE…` FunctionCall key on `__fastdata_kv` — no full-access key.

    **Read back:** `verified: 5/5 written keys read back`, and the five records re-read from the
    indexer independently show `repository_url` set with `enrichment.method: builder-issue`. The
    importer then prints `new: 8, changed: 0, unchanged: 764` — the corrections left no residue.
    `npm run validate:schema` 762/764, the same two feed-owned `http://` `demo_url` defects, so this
    batch added none; `npm test` 380/380. All five pages were then fetched through `nearhunt.xyz`
    and each shows its GitHub link. The five issues were answered and closed.

26. **The 26 new feed submissions, 13 Nov — batch 25, signed from the scheduled cycle's own report.**
    The `near-hunt-enrich-cycle` job (`ba3f66d1e6aa`, every 180m, in the default profile's cron
    store) ran at 09:20 and printed an approval-ready report: `chain 764 · feed 789 · new 25 ·
    changed 0`, `would write 25 keys, 33515 bytes`. The owner approved that batch; the dry run at
    signing time had grown to `new: 26` because one more submission (`That Invoice`) arrived in
    between — a growing feed is the normal case, so the write went ahead and the numbers reported
    here are the ones the transaction actually did.

    The importer truncates its create list to 20 (`+ … 6 more`), so the plan was recomputed in full
    with `planImport` over all 790 feed projects — **the feed API is 8 per page and fetch-all needs
    the `?page=N` loop**, a plain `fetch` silently reviews 8. Result: **26 creates, 0 updates, 0
    missing from feed**, which is the useful part: no existing record was written, so nothing a
    builder supplied could be overwritten or reverted. Carry: description **25/26**, media
    **23/26**, links **10/26**, repository **9/26**; `That Invoice` arrived after the enrich build,
    so it lands with feed fields only and is enriched next cycle.

    One transaction, `GpVcysCvZY2g62dwHtLmTCYcmT2uQowmTRvQYbvDyMCb` (26 keys, 34034 bytes), signed
    with the scoped `ed25519:2WMyE…` FunctionCall key on `__fastdata_kv` — no full-access key.
    `verified: 26/26 written keys read back` (0/26 on the first indexer attempt, which is the
    indexer's usual lag, not a partial write).

    **Read back:** **790 project rows**, 790 with a value, **0 tombstones**; the 26 records written
    at `2026-11-12T22:43:52Z` carry exactly the counts above. The importer then prints `new: 0,
    changed: 0, unchanged: 790`, so the batch left no residue. `npm run validate:schema` **788/790**,
    the same two feed-owned `http://` `demo_url` defects (`VIGIL`, `IntentFolio`), so this batch added
    none; `npm test` 380/380.

27. **The 24 new submissions and 1 enrichment fill, 13 Nov — batch 26, the 12:32 cycle.** The
    `near-hunt-enrich-cycle` job fired at 12:32:50 (its 12:20 slot, a tick late) and reported
    `chain 790 · feed 809 · new 19 · changed 1`, `20 keys, 23692 bytes`, `status: ok`. By the time
    the dry run ran at 13:31 the feed had 814 submissions, so the write was **24 creates + 1
    update = 25 keys, 26237 bytes**.

    The one update is the useful detail: `That Invoice` (`b52c1225…`), the submission that arrived
    after batch 25's enrich build, gained its `description` and `media` for the first time — both
    were `null` before, so the fill overwrote nothing a builder or an earlier run had put there.
    `changed: 1` on a batch like this is normally exactly that, and it is worth checking one by one
    rather than trusting the count.

    One transaction, `7UJW6tpgHguvU2xcjguQhDEAtdFAn4wJsefeauqPKw1s` (25 keys), signed with the scoped
    `ed25519:2WMyE…` FunctionCall key on `__fastdata_kv`. `verified: 25/25 written keys read back`
    (0/25 on the first indexer attempt).

    **Read back:** **814 project rows**, 0 tombstones; the 25 records carry description **15/25**,
    media **14/25**, links **9/25**, repository **13/25**. The other 10 landed with feed fields only
    — they are submissions that arrived after the 01:25Z enrich build, so the next cycle enriches
    them. The importer then prints `new: 1, changed: 0, unchanged: 814` (one more submission arrived
    during the write). `npm run validate:schema` **812/814**, the same two feed-owned `http://`
    `demo_url` defects; `npm test` 380/380.

28. **The 39 new submissions and 29 changes, 13 Nov — batch 28, the evening cycle.** The feed watch
    job fired at 19:10 (`chain 820 · feed 857 · 37 new, 13 changed`); the enrich build behind the
    batch was the 18:47–18:55 AEDT run (`threads.json`, `proposal.json` over **851** projects, 808
    `status: ok`), so the write was **39 creates + 29 updates = 68 keys, 83293 bytes, 2
    transactions** by the time the dry run fetched the feed (**859** submissions). The feed grew from
    851 to 859 while the approval was being read, which is normal and not a stop condition: the
    late records land with feed fields only.

    The plan was audited record by record with `planImport` before signing, not from the importer's
    truncated list. The 29 updates split: **11 feed-owned `tracks`** changes, **8 `demo_url`** moved
    by the builder to a newer post, and **10 enrichment fills** (`description` `null → text`,
    `repository_url` `null → url`, plus `media`/`links`/`enrichment` where they were absent). **No
    builder-written value was overwritten** — every description/repository/media change went from
    null/undefined to a value, which is the check that matters on a batch of this shape.

    Two transactions, both signed with the scoped `ed25519:2WMyE…` FunctionCall key on
    `__fastdata_kv`: `AcXsUKAzgqkS7yZVUUwxbipiTCf8qENHEAyjUtYwTUJ1` (54 keys) and
    `CYb5KiTaJ8Du9NzXzbVP17Y7EbPZoPyenwG2YVmfyvfs` (14 keys). `verified: 68/68 written keys read
    back` (57/68 on the first indexer attempt).

    **Read back from the indexer:** **859 project rows**, 0 tombstones. The 39 new records carry
    description **29/39**, media **28/39**, links **12/39**, repository **11/39**, `enrichment`
    **29/39**. The other 10 are submissions that arrived after the 18:53Z enrich build — 8 of them
    are X posts (enrichable next cycle: Spade, Grudgebound, RESCORA, obiba, Mvikeli, Inkwell,
    KwesPay, Tender) and 2 are not X posts at all (BaitNet, Cowrie), whose feed fields are their
    correct end state. The importer's re-run then prints `new: 0, changed: 0, unchanged: 859`.
    `npm run validate:schema` **859/859 valid, 0 invalid** — the two feed-owned `http://` `demo_url`
    defects (`VIGIL`, `IntentFolio`) are gone after batch 27's corrections, so this batch introduced
    no new schema defect. `npm test` 400/400.

29. **The 47 new submissions and 9 null-fills, 13 Nov — batch 29, the late-evening cycle.** The feed
    watch fired at 21:50 (`chain 859 · feed 898 · 39 new`), and by the dry run at 22:21 the feed had
    **904** submissions: **45 creates + 9 updates = 54 keys**. Two more submissions arrived before the
    signature, so the write was **47 creates + 9 updates = 56 keys, 2 transactions** — the approval
    covered the kind of write, and the extra records landed with feed fields only.

    The enrich build behind this batch was the 22:02–22:10 AEDT run (`proposal.json` over **901**
    projects, 856 `status: ok`), not the 18:53 one behind batch 28.

    The 9 updates are **pure null-fills**, checked one by one: the eight batch-28 late X arrivals
    (Spade, obiba, KwesPay, Inkwell, RESCORA, Tender, Grudgebound, Mvikeli) gained `description`,
    `media` and some `links`/`repository_url` for the first time, and `SealedSwarm` (`dbedb794…`)
    gained `repository_url` + `links` plus a second source post on its existing `enrichment` — its
    `description` and `media` were untouched. Nothing a builder or an earlier run wrote was
    replaced.

    Two transactions, signed with the scoped `ed25519:2WMyE…` FunctionCall key on `__fastdata_kv`:
    `A8ibmCikFBmVsJJgddLAUxUSWMupsouVu2GAkDLkTwtG` (48 keys) and
    `7Dt7pJLzhgAQwKUd5MZFnSoYcBdoSZbYx9kjtmVw8zb3` (8 keys). `verified: 56/56 written keys read
    back` (50/56 on the first indexer attempt).

    **Read back:** **906 project rows**, 0 tombstones. The 47 new records carry description
    **40/47**, media **38/47**, links **19/47**, repository **21/47**, `enrichment` **40/47**. Of the
    7 without enrichment, 6 have an X `demo_url` (Shark and Co, Sendler Dash — the two that arrived
    after the 22:08Z build — plus Plote, Canon, House Rules, Polypus Keys, whose `demo_url` the feed
    changed after the build) and 1 has no X post at all (Guildhall). The importer's re-run prints
    `new: 0, changed: 0, unchanged: 906`. `npm run validate:schema` **906/906 valid, 0 invalid**;
    `npm test` 400/400.

30. **Unattended batch, 2026-11-13 — 96 new submission(s) and 6 null-fill(s), 102 key(s).** Signed by the scheduled cycle under the owner's standing authorization (14 Nov 2026): creates and null-fills only, chain 906 → 1002. The guard in `lib/auto-sign.mjs` passed with 17 null-fill(s), 0 feed-owned change(s) and 6 metadata change(s), and **no value another writer set was replaced**.

   3 transaction(s): `AKJxpxvDFetYSvqYEebs8SPnZb41bFtYhmU3qXUN2EYM`, `HJo7H6yS7u2Wh4sRqJVifkMD8bCnWfBMYs4NRJ5samx4`, `FJjw6j7CNSgW3kv5EeE3xi5Yd3uPiTjrf3c5U9vNZU8G`. `verified: 102/102`.

   **Read back:** 1002 project rows; the 96 new records carry description 95/96, media 93/96, links 54/96, repository 56/96. The importer's re-run prints `new: 0, changed: 0`; `npm run validate:schema` 1002/1002; `npm test` 412/412.

31. **Unattended corrections batch, 2026-11-13 — 1 record(s) from 2 builder issue(s), 1 key(s).** Signed by the issues cycle under the owner's second authorization (14 Nov 2026): **links and repository only**, every change traceable to an issue and corroborated (`git ls-remote` + README for a repository, a probed verdict for a link). Description and media text is never signed unattended.

   Issues: #34, #35. 1 transaction(s): `7gLPnFjCXA4FCwyEvfjt2SX8ajzixRPxLWgnydppfEpH`. `verified: 1/1`.

   **Read back:** 1002 project rows; 1/1 of the corrected records now carry a repository and 1/1 carry links. The importer's re-run prints `new: 0, changed: 0`; `npm run validate:schema` 1002/1002; `npm test` 420/420.

**Correction to entry 31 — batch 31a, and the process failure behind it (recorded 14 Nov 2026).**

The corrections run started at 02:52 AEDT read `data/enrichment/corrections-issues.json` (Hermit, issues
#34/#35), computed the plan and passed it to the guard, which allowed **one record**. The batch file was
then rewritten *while that run was in flight* (the Euthyna + EmployAI batch, issues #33/#29/#31), and the
importer re-reads the file at write time. So the transaction signed was the **new** file while the guard
had approved the **old** one:

- tx `6zJQDHjsJdeHToGBzdrAEFonXjCU9X8o9cGLU92iywWU` — 2 keys, FINAL, 0.00009 NEAR burnt:
  `project/a17e6cec…` (Euthyna, repository) and `project/bec43a1d…` (EmployAI, repository + demo link).
  Both values were corroborated by hand (`git ls-remote` + the repo READMEs naming the project, the link
  probed live 200) and both are inside the authorization's kind, so the **data** is correct. The
  **integrity guarantee** was not: the guard judged different bytes than the ones signed.

The run was stopped before it could claim on the issues that Hermit had landed (it had not), and the
Hermit batch was then signed again through the fixed path (entry 31, tx `7gLPnFjC…`). Fixes, in
`scripts/corrections-cycle.mjs`:

1. the signing lock is taken **before** the batch file is read — a second run (import or corrections)
   cannot start, and the refresh/record steps cannot interleave;
2. the batch is **snapshotted** to `.git/corrections-signing.json` and the importer signs that file, so an
   edit mid-run cannot change what is written;
3. after the write the importer's key count is compared with the approved plan's, and a mismatch is
   reported instead of recorded as success.

Issues #33, #29 and #31 were answered with the tx and closed by hand after the fact; #32 (repository
disabled by GitHub, 403) and #30/#36 (description text) were commented and left open for the owner.

32. **Unattended batch, 2026-11-13 — 51 new submission(s) and 2 null-fill(s), 53 key(s).** Signed by the scheduled cycle under the owner's standing authorization (14 Nov 2026): creates and null-fills only, chain 1002 → 1054. The guard in `lib/auto-sign.mjs` passed with 4 null-fill(s), 0 feed-owned change(s) and 2 metadata change(s), and **no value another writer set was replaced**.

   2 transaction(s): `BA2uYGZMdjEHBZfFHVCRkzGyQi4F89u25LUGRNjCTMcY`, `Bb6aXJLZPPSUK77zZ6LoiNLoZWkixLYbz7t9WFZZZMfe`. `verified: 54/54`.

   **Read back:** 1054 project rows; the 51 new records carry description 49/51, media 48/51, links 26/51, repository 24/51. The importer's re-run prints `new: 0, changed: 0`; `npm run validate:schema` 1054/1054; `npm test` 420/420.

33. **Unattended corrections batch, 2026-11-13 — 1 record(s) from 1 builder issue(s), 1 key(s).** Signed by the issues cycle under the owner's second authorization (14 Nov 2026): **links and repository only**, every change traceable to an issue and corroborated (`git ls-remote` + README for a repository, a probed verdict for a link). Description and media text is never signed unattended.

   Issues: #37. 1 transaction(s): `BB8YPeYM7es2tauBmjnrBtPPGvMU4zVcDX9kJ5j4WDkF`. `verified: 1/1`.

   **Read back:** 1054 project rows; 1/1 of the corrected records now carry a repository and 1/1 carry links. The importer's re-run prints `new: 0, changed: 0`; `npm run validate:schema` 1054/1054; `npm test` 420/420.

34. **Unattended corrections batch, 2026-11-13 — 2 record(s) from 2 builder issue(s), 2 key(s).** Signed by the issues cycle under the owner's second authorization (14 Nov 2026): **links and repository only**, every change traceable to an issue and corroborated (`git ls-remote` + README for a repository, a probed verdict for a link). Description and media text is never signed unattended.

   Issues: #40, #39. 1 transaction(s): `2mCDu7BeS4k2wyFz5yJnZ6WjUoTwZSRJtbhE5UDdSFfj`. `verified: 2/2`.

   **Read back:** 1054 project rows; 2/2 of the corrected records now carry a repository and 2/2 carry links. The importer's re-run prints `new: 0, changed: 0`; `npm run validate:schema` 1054/1054; `npm test` 420/420.

35. **Unattended batch, 2026-11-13 — 59 new submission(s) and 3 null-fill(s), 62 key(s).** Signed by the scheduled cycle under the owner's standing authorization (14 Nov 2026): creates and null-fills only, chain 1054 → 1113. The guard in `lib/auto-sign.mjs` passed with 10 null-fill(s), 0 feed-owned change(s) and 3 metadata change(s), and **no value another writer set was replaced**.

   2 transaction(s): `8E6gWmxMECPs7XntgWie9c5ZkDdNjBgNwA8tD1X22jGR`, `FNggHn5kRwSNTSK3idsiK9ZEmrZYFHMTuJWswPws127S`. `verified: 62/62`.

   **Read back:** 1113 project rows; the 59 new records carry description 50/59, media 50/59, links 19/59, repository 19/59. The importer's re-run prints `new: 0, changed: 0`; `npm run validate:schema` 1113/1113; `npm test` 420/420.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where projects live | `nearhunt.near`, `project/{submission_id}` | Structured records. near.social ignores keys it doesn't recognise. |
| Where upvotes live | `nearhunt.near`, key `vote/{submission_id}`; the voter is the writer (`predecessor_id`) | The indexer keeps one row per writer per key, so one account gets one vote and nobody can vote as someone else. This replaces `vote/{id}/{voter}`. |
| Where comments live | **`nearhunt.near`** (owner, 9 Nov): `comment/{submission_id}/{ms}` → `{ text, reply_to? }`, written by the commenter; the author is the row's `predecessor_id` (NH-44) | Signs with the login key like a vote: no wallet pop-up, no failure dialog, no starter post per project, so every project takes comments from launch. Replaces the near.social replies decision (NH-41/42); comments no longer appear in near.social feeds. Profiles stay on near.social |
| Submissions and claims | **After the MVP launch** (owner, 9 Nov): NH-101 and NH-105 | Launch while the hackathon is in the news; the listing, votes and comments are enough for a first version |
| Identity | near.social profiles (name, avatar, about) | People arrive with an identity they already have. |
| Project data object | **NEAR Hunt native, on `nearhunt.near`** (owner, 9 Nov). `nearhunt/project/1` stays and grows **additively**: new optional fields only, no renames, no `project/2`, no migration. Community submissions (later) get a sibling schema `nearhunt/submission/1` on `nearhunt.near`; claims are `maker/{writer}/{key}` rows by the maker. Nothing is written to `social` as project data | The schema already accepts extra fields (`additionalProperties: true`); renames would force a mainnet rewrite of every record and break `/api` and `SKILL.md` readers. near.social activity is low and BOS-style composability is gone, so a shared near.social record buys little |
| Domain | **nearhunt.xyz** (bought 8 Nov). Pages at `nearhunt.xyz/p/{submission_id}`, skill at `nearhunt.xyz/SKILL.md`, schema `$id` under `nearhunt.xyz/schema/` | Owner's decision |
| Donations to NEAR Hunt | A small "Support NEAR Hunt" link in the footer and on the open data page (NH-94, P2). It pays a **separate treasury account**, never `nearhunt.near`, and it never appears next to an upvote button | Low cost and on-brand, but it must not read as paying for votes, and the data-publishing key should not also hold funds |
| Sponsored placements | **Built before the 14th (NH-104), switched on no earlier than 18 Nov** (results). One clearly labelled slot, outside the rankings, published on chain. Turning it on during judging needs a new owner decision | Paid visibility during judging would undercut "votes are community signals" |
| Wallets | **Meteor** (web/extension/mobile) via wallet-selector. **MyNearWallet is dropped** — it entered sunset Phase 3 on 1 Nov 2026 and refuses every dApp request | Verified 8 Nov: `window.mnwSunset = {phase:3}`, `/sign` answers "MyNearWallet can no longer approve app requests". See [`spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md`](spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md) |
| Vote signing | **One wallet approval at login adds a function-call key** (receiver `nearhunt.near`, method `__fastdata_kv`); the app signs votes locally and treats the receipt's `CodeDoesNotExist` as success, confirmed by the KV read | Wallets do broadcast to a contract-less receiver, but a wallet-confirmed vote shows a failure dialog every time. Path and evidence: the NH-35 spike |

## Roadmap at a glance

| Day | Theme | Boards |
|---|---|---|
| 0 (8 Nov) | Guardrails and schema fixes — **code done** | — |
| 1 (9 Nov) | Directory and project page, read-only — **code done** | 1, 2, 5 |
| 2 (10 Nov) | Connect and upvote | 7, 2 |
| 3 (11 Nov) | near.social discussion, account page, states | 2, 3, 6, 8 |
| 4 (12 Nov) | Open data, API, SKILL.md, proposal draft | 4 |
| 5 (13 Nov) | README, demo, submission | — |
| 6 (10 Nov) | MVP: comments on `nearhunt.near` (NH-44), hidden links shown (NH-96 step 1), import the pending records | 2, 6 |
| 7 (11 Nov) | **MVP launch (target, owner confirms)**: README, demo, X post (NH-90–NH-92); NH-96 enrichment | — |
| 8 (12 Nov) | After launch, P2 only: NH-102, NH-103, NH-104 | 1, 2, 4 |
| — (13 Nov) | Hackathon submission (uses the launch material) | — |
| 9 (14 Nov) | Buffer | — |

Priority: **P0** = needed to submit · **P1** = should ship · **P2** = only if time allows.
**Cut line:** if Day 3 slips, drop P2 items first, then NH-23, NH-50–53 and NH-15.
**MVP launch first (owner, 9 Nov).** The launch needs NH-44, NH-96 step 1, the pending import and
NH-90–NH-92. NH-102–NH-104 are P2 and stop first if anything slips; NH-100, NH-101 and NH-105 wait
until after the launch.

---

## Backlog

### Day 0 — guardrails (no board)

**Status (8 Nov evening):** NH-01 to NH-05 are **done and verified by Hermes**: `npm test`
is 58/58 green, `npm run validate:schema` reads 275/275 valid with 0 foreign rows, and the
importer dry run was idempotent at that time (0 new, 0 changed, 275 unchanged); the feed has
since grown to 277 (see Where things stand). NH-07, NH-08 and NH-09
closed the same evening. **NH-06 was withdrawn by the owner on 8 Nov**: keys for
`nearhunt.near` stay where the importer runs, and the gate is prior authorization of each write, not
machine custody. See [`runbooks/keys.md`](runbooks/keys.md).

| ID | P | Item | Done when |
|---|---|---|---|
| NH-01 | P0 | One `readProjects()` helper that reads `/v0/latest/nearhunt.near/nearhunt.near`; used in the importer, the validator, the app and the API | **Done** — `lib/kv.mjs`; rows from other writers are dropped even if the API returns them |
| NH-02 | P0 | Importer diffs against chain: writes only new or changed keys, keeps `updated_at` when the content is unchanged, requires `--execute --yes`, never tombstones | **Done** — `lib/import-plan.mjs` + 10 tests; a re-run with no changes writes nothing |
| NH-03 | P0 | `AGENTS.md`: no mainnet transaction without a dry-run diff a human has approved; every docs claim comes with the command that proves it | **Done** — file committed |
| NH-04 | P1 | Fix the docs drift (README table, spike "account undecided", the duplicated paragraph in the research doc) | **Done** |
| NH-05 | P1 | Schema touch-ups: real `$id`; optional `social_post` field (the project's near.social post reference); document that `source.url` is the generic listing; written specs for the `vote/` and near.social comment conventions | **Done** — `$id` is `nearhunt.xyz`; `npm run validate:schema` passes 275/275 |
| NH-06 | — | ~~Keys must leave the agent machine~~ | **Withdrawn by the owner, 8 Nov 2026.** Keys stay on the operator's machine; every mainnet write needs prior authorization for that specific write. Recorded in `AGENTS.md` §2 and `runbooks/keys.md` |
| NH-07 | P1 | `scripts/import.mjs` defaults to `~/.near-credentials/{net}/{account}.json`, but near-cli-rs `save-to-legacy-keychain` writes `~/.near-credentials/{net}/{account}/{public-key}.json`. Resolve both, or fail with the exact path it looked for | **Done** — `resolveKeyFile()` takes the flat file when present, else the newest `.json` in the account directory, and the error lists every path tried. `node scripts/import.mjs --check-key` resolves and parses the key without signing: it prints `~/.near-credentials/mainnet/nearhunt.near.json` here, and against a fake `HOME` with only a near-cli-rs directory it prints that nested file. `--key-file <dir>` works too |
| NH-08 | P2 | `scripts/render-mockups.mjs` needs Playwright + Chromium, which is not in `devDependencies` | **Done** — the Playwright dependency is gone: the script drives the installed Chrome/Chromium over the DevTools protocol using Node's built-in WebSocket, and exits with an install hint (or `CHROME_PATH`) when no browser is found. `npm run render:mockups` on this machine re-rendered all 9 boards; the generated `html/` is byte-identical to the committed files and every PNG keeps its exact 2× dimensions |
| NH-09 | P1 | The importer cannot tell a full-access key from a function-call key, and `resolveKeyFile()` prefers the flat file — so a leftover full-access credential silently signs an import. Query `view_access_key` for the resolved public key and print the permission; refuse to sign with full access unless `--accept-full-access` is passed | **Done** — `queryPermission()` reads `view_access_key` on the same RPC the importer already uses; `--check-key` prints each candidate file with `permission: full access` or `permission: FunctionCall(<receiver>, <methods>)` and marks the chosen one. Verified against `nearhunt.testnet`, where all three shapes resolve: the flat file `full access`, one nested key `FunctionCall(nearhunt.testnet, __fastdata_kv)`, one nested `full access`. `--execute --yes` with the flat full-access file plans the write, prints the candidates, then exits 1 with a refusal naming `docs/runbooks/keys.md`, before the signer is installed or a transaction built; `--accept-full-access` is the explicit override. The permission decision is unit-tested from stubbed RPC responses (8 new network-free tests; `npm test` is 23/23) |

### Day 1 status (8 Nov, by Claude; merged by Hermes)

Code for NH-10–NH-16, NH-20 and NH-21 is on `main`. Read-only: nothing was signed or written, and
no key was present on the machine that built it. Hosting and deploys are Hermes's (owner decision,
8 Nov).

```bash
npm test                  # 58 pass, 0 fail
npm run typecheck         # exit 0
npm run build             # routes: ƒ /, ƒ /p/[id]
npm run validate:schema   # 275 records on chain, all conform to nearhunt/project/1
node scripts/import.mjs   # dry run: 2 new (feed 277), 0 changed, 275 unchanged — nothing signed
```

Notes from building it, with the evidence in the commit messages:
- Votes do not exist until NH-33, so "Newest" is the default sort and every count shows 0
  in a box that cannot be clicked. Most records share two block heights, so "Newest" is
  mostly alphabetical today.
- NH-15 uses `api2.near.social/v1/hashtags/nearhunt` (0 posts today; empty state shown). The
  `near-social-js` SDK the NEAR docs recommend reads the legacy index and returned only post
  pointers, so it was not added.
- NH-21 "View JSON" links to `GET kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/{id}`
  (a single row, writer-scoped). Block heights link to Pikespeak because nearblocks.io answers
  automated checks with a Cloudflare challenge.
- For Day 2 (NH-30): the `near-dapp` skill and the NEAR docs recommend NEAR Connect
  (`@hot-labs/near-connect`, `near-connect-hooks`) over Wallet Selector. **Decided 8 Nov: NEAR
  Connect**, and the skills win on any mismatch with this plan (AGENTS.md §2a). The
  `near-api-js` skill documents v7 while `package.json` pins ^5.1.1; the upgrade belongs with
  NH-30, where wallet code first needs it.
- Known gap, found in review: if the KV API is unreachable the directory and project pages return
  500. The near.social sidebar degrades to a "not responding" note, but the project read has no
  error state. Cover it with the Day 3 states (NH-80/82) before the demo.
- The `web/` placeholder was retired in the merge; its source stays in history at `4e0b5af`.
  Production now serves the Next app at `near-hunt.vercel.app`.

### Record enrichment — NH-95 (policy decided 8 Nov)

**Owner decision:** publish the builder's own X-post text **verbatim** as the project's
`description` (the "About" card), and a repository URL **only when it answers `git ls-remote`** at
proposal time. No AI rewriting, no repository guessed from a name. Sources are stored on the record
(`description_source`, `repository_source`, `enrichment.sources`); a builder can ask for removal and
the owner rewrites the record.

**Status: applied 8 Nov, corrected the same evening.** The 265-key diff (1 new record + 264
enriched) landed in five transactions — `SMarR1rf…`, `7qX3V7Xe…`, `GqM47JwJ…`, `8sANNYHH…`,
`Gom4MYrH…` — and all 265 keys read back from the indexer. A 19-key correction
(`Bo5ktqRx…`) then fixed 18 descriptions where removing a t.co link left a dangling
`Repo:`/`Demo:` label and enriched the newest `AgentGuard` record. **265 records now carry the
builder's own description and 98 a verified repository.** `--refresh-enriched` permits that rewrite
only for fields an earlier enrichment run set — it never touches a builder-supplied value.

#### NH-96 — link enrichment, no AI (owner, 9 Nov) · Days 6–7 · P1

Same policy as NH-95: verbatim builder text, a repository only when it answers `git ls-remote`,
nothing written by a model. Read-only until the owner approves the importer diff.

Gaps it targets, counted 9 Nov with `readProjects()`: 281 records; 16 without a description;
183 without a verified repository; 111 with unlabelled `links` from the X post; 269 whose
`demo_url` is the X post itself; none with an image.

| Step | What | Done when |
|---|---|---|
| 1 | Show the `links` array on `/p/{id}`. Today `linkRows()` in `lib/project-view.mjs` renders only `demo_url` and `repository_url`, so e.g. Aegis hides `aegis-demo-beta.vercel.app` | Every record with `links` shows them; unit test |
| 2 | `scripts/enrich.mjs --links`: visit each link once; record HTTP status, page `<title>` and `og:image` | Proposal file lists one row per link with its result; no network writes |
| 3 | Label links: a GitHub URL that answers `git ls-remote` becomes the repository; other hosts become website or demo; unreachable links are kept and marked | The verified-repository count is re-measured and stated with the command |
| 4 | Flag possible duplicates: different submissions sharing a repository or demo URL. Flag only, never merge | List in the proposal for the owner to read |
| 5 | Importer dry run of the result; the owner approves the exact diff before `--execute --yes` | Diff applied, read back from the indexer, `npm run validate:schema` clean |

New fields are additive (the schema allows extra properties), so no existing field is renamed or
removed. Images are referenced by URL, never copied.

**Status 9 Nov (Claude, branch `claude/keen-galileo-6c7py0`), built and tested, not deployed, nothing signed:**

- **Step 1 done.** `linkRows()` renders every `links` entry (de-duplicated, https only, labelled
  Video/Telegram/Discord only when the host makes it certain, otherwise "Link"). A `demo_url` that
  is an X post is labelled "Launch post on X" instead of "Demo". Unit tests in
  `test/project-view.test.mjs`.
- **Media (owner request in session, 9 Nov; extends step 2).** The X syndication payload that
  `enrich.mjs` already fetches carries the post's media. `lib/media.mjs` keeps only
  `pbs.twimg.com` image URLs (photos, plus video *posters*), at most 4, each with its `post_url`.
  `/p/{id}` shows them in a Media card. **Owner request later the same day (NH-96b):** a video
  plays in place, through X's own player iframe (`platform.twitter.com/embed/Tweet.html?id=…`), so
  the demo is visible without leaving the page. No X script (`widgets.js`) is loaded, no video file
  is copied and none is hotlinked: the payload's mp4 was tried first and rejected — X's CDN 403s a
  foreign `Referer`, a 302 out of a route is followed but fails to demux
  (`MEDIA_ELEMENT_ERROR: Format error`), and a streaming proxy puts the bytes on our bandwidth. The
  frame URL is built by `lib/media.mjs`'s `tweetEmbedUrl` and sized 550×560 (480 tall on mobile); a
  missing post leaves the poster and the "Open the post" link, never an empty box. The first image also becomes the page's `og:image`. The importer fills `media` only
  when it is empty, and `enrichment.fields`/`sources` now accumulate, so adding media keeps the
  existing `description` provenance.
- **Measured:** `node scripts/enrich.mjs --threads data/enrichment/threads.json --out data/enrichment/proposal-nh96.json`
  gives 251 of 281 projects with media (224 video posters, 75 photos). The dry run
  `node scripts/import.mjs --enrichment data/enrichment/proposal-nh96.json` gives 54 new (feed now 335),
  251 changed, 30 unchanged; 305 keys, 345,922 bytes, 6 tx. The 251 changes touch only `media` and
  `enrichment`. **Superseded by the 257-key batch, which was applied 9 Nov (batch 12 below).**
- **Step 2 done (9 Nov).** `node scripts/enrich.mjs --links` visits every `links` entry and every
  non-X `demo_url` once (`lib/link-probe.mjs`: one GET, redirects followed by hand, each hop checked,
  IP literals, local names, non-https and odd ports refused, 512 KB read cap, honest user agent).
  Report: `data/enrichment/links.json`, one row per link with `verdict`, HTTP status, final URL,
  `<title>` and `og:image`. Run against mainnet, 281 records (the committed report): **132 links
  (131 distinct); 124 live, 1 gone, 7 unverified; 122 with a title, 40 with an `og:image`; 5 redirect
  to another host.** `verdict` is `gone` only for 404/410 or a missing host. Crawler blocks
  (401/403/429, a google.com/sorry page), 5xx and timeouts are `unverified` and must not be
  reported as dead links. The unverified ones: the two bare `youtube.com/watch` links (429 from the
  run's IP), nearblocks ×2, etherscan, medium and afun.mx (403 to crawlers). Runs vary: an earlier
  run the same hour had OATH's youtu.be link rate-limited and keyproof.onrender.com at 503 (a
  sleeping free host), and both answered on the re-run.
- **Bug found and fixed on the way:** `linksFromChain()` rebuilt URLs from host + path, so it dropped
  every query string. On chain since 8 Nov, Charter and Sealed Exploit link to a bare
  `youtube.com/watch` with no video. Queries are now kept, minus tracking parameters (`utm_*`, `ref`,
  `si`, `feature`, …), and the de-duplication key includes the query. Re-running the proposal
  corrects 3 records' `links` (Charter and Sealed Exploit get their `?v=` back; DeepSea Hunter
  drops a duplicate entry). Those values were set by enrichment, so `--refresh-enriched` may fix them:
  `node scripts/import.mjs --enrichment data/enrichment/proposal-nh96.json --refresh-enriched --updates-only`
  gives 251 keys, 318,152 bytes, 6 tx, touching only `media` (251), `links` (3) and `enrichment`;
  no description or repository changes. **Superseded by the 257-key batch, applied 9 Nov.**
- **For the owner, not acted on:** the one `gone` link (near-agent-guard's `njump.me/…%20…`) is
  two URLs glued by a space in the source thread. Sealed Exploit's `https://dev.to` is a bare domain
  because X truncated the path. The record "777 giros gratis" (`fa54da13…`) links to a gambling site
  with a referral code (`afun.mx/?ch=…`) and looks like spam. Per AGENTS.md §1 nothing is tombstoned;
  whether to hide it is your call.
- **Step 3 done (9 Nov).** `lib/link-label.mjs` labels every proposed link with `kind` and
  `kind_basis`, strongest evidence first: the host (YouTube is a video, nearblocks an explorer); the
  builder's own word right before the link ("Demo:", "Live:", "Try it:", "Website:", nearest first,
  only separators in between); the URL (`demo.` host, `/app` path); otherwise `website`. Each link
  also carries its step-2 `check`. Links on non-GitHub git hosts are checked with `git ls-remote`
  and become `repository`. A record without a repository gets one only when exactly one such repo
  answered. The Links card shows the label, and a `gone` link says "Did not answer when checked on
  …"; `unverified` shows nothing.
  - **Verified repositories: 98 → 99.** SafeSpend (`efc90a1e…`) linked
    `bitbucket.org/dualrail-builder/near-safespend`, which answers `git ls-remote`. The count comes
    from `node scripts/enrich.mjs --threads data/enrichment/threads.json --out data/enrichment/proposal-nh96.json`
    (`with repository: 99`). 98 are on chain today.
  - **Labels on the 120 proposed links:** website 85, demo 22, video 3, explorer 3, community 3,
    article 2, docs 1, repository 1. By basis: default 84, builder 21, host 12, url 3. All 21
    builder labels were read against the post text by hand and match it.
  - **Bug fixed:** X gives link positions in code points and JS indexes UTF-16, so an emoji earlier
    in a post shifted the position and cut the cue window short. `linkIndex` now converts.
  - **Dry run:** `node scripts/import.mjs --enrichment data/enrichment/proposal-nh96.json --refresh-enriched --updates-only`
    gives 257 keys, 337,616 bytes, 6 tx. Fields: `media` 251, `links` 96 (labels and checks;
    Charter and Sealed Exploit get their `?v=` back), `repository_url` 1 (SafeSpend), `enrichment`
    257. No description changes and no provenance dropped. **Pending owner approval; replaces the
    earlier 251-key batch.**
  - **Not labelled, needs an owner decision:** 15 records keep unlabelled links (the page falls back
    to host-only labels). All 15 were written at block 223,641,089 by the 8 Nov correction. The
    importer then *replaced* `enrichment.fields` with `["description"]`, so their links lost their
    enrichment provenance, and `--refresh-enriched` rightly refuses to touch them. The accumulate
    fix above stops this recurring. Restoring them needs a one-off rule (e.g. allow a refresh when
    `enrichment.sources` already cites the link's post) that the owner approves.
  - Not fixed: `schema/README.md` lists `repository_source` and `repository_verified_at`, but the
    importer has never written them; on chain, provenance is `enrichment.sources`.
- **NH-96c carried repos out of the replies (9 Nov, owner request).** Of 336 records only 113 had a
  `repository_url`. The cause was structural: the syndication payload carries a post and its
  *ancestors*, so `enrich.mjs` could walk up a thread but never down, and builders put the code link
  in their first reply ("Code: github.com/…"). `scripts/capture-threads.mjs` (`npm run
  threads:capture`) now reads the server-rendered status page — an honest user agent is served the
  conversation, so no API key and no browser are needed — keeps only the author's own replies, and
  writes them with real post ids and expanded URLs into `data/enrichment/threads.json`.
  - Crawl: 223 records without a repository → 132 threads captured (46 already on file), 68 with no
    author reply rendered, 17 whose `demo_url` is not an X post, 6 posts gone.
  - Result: **113 → 156 records with a verified repository** (+43), 0 ambiguous (several repos in
    one thread stays null), and 42 records gain 58 links from the replies (no link is removed).
    Dry run: 70 keys, 109,373 bytes, 2 tx, 266 unchanged, 0 new. Heir
    (`f8ed5c05…`) is the worked example: the submitted post has only the demo link, the author's
    reply has `github.com/ZSP111/Heir`, and `git ls-remote` answers.
  - Limit, stated rather than hidden: 180 records still have no repository, because the builder
    published none that X renders to us.
- **Step 4 done (9 Nov).** `node scripts/enrich.mjs --duplicates` (`lib/duplicates.mjs`) compares
  all 335 submissions (281 on chain plus the proposal's repositories and links, and the 54 pending in
  the feed). It flags any two that share a repository, X post, demo or builder link, after
  normalising host case, `www.`, trailing slash, `.git`, tracking parameters and the X handle.
  Platform URLs such as `dev.to` or a bare `youtube.com/watch` are ignored. Report:
  `data/enrichment/duplicates.json`. Flags only; nothing is merged, hidden or written.
  - **Result: 0 shared URLs, 0 possible duplicates.** An independent raw check of exact
    `repository_url`, `demo_url` and X status id on chain also finds none. Detection is covered by
    `test/duplicates.test.mjs` (5 tests, e.g. one X post under two handles, `Repo.git` vs `repo`).
  - **Weak signals, listed but not called duplicates:** 12 names are used by more than one
    submission (AgentGuard ×6, Leash ×4, Tollgate ×3, Tripwire ×3, …), all from different builders
    with different repositories. 26 X accounts submitted two projects each, all with different
    names, so there are no hidden resubmissions.
- **NH-96 is complete: code merged and the import applied.** PR #9 merged as `bd509c7` and
  deployed to production as `near-hunt-l8tegfh98`.
  - **Applied 9 Nov (batch 12 in "Where things stand"):** the 257-key batch. Account
    `nearhunt.near`, prefix `project/`, 257 keys, 337,616 bytes, 6 tx; fields `media` (251),
    `links` (96), `repository_url` (1, SafeSpend), `enrichment` (257); no description changes.
    Command, run from `main` by the key holder (Hermes):
    `node scripts/import.mjs --enrichment data/enrichment/proposal-nh96.json --refresh-enriched --updates-only`
    printed those numbers, then the same command with `--execute --yes --accept-full-access` wrote
    them and the indexer read back 257/257. `data/enrichment/proposal-nh96.json` stays frozen; do
    not regenerate it. The `--accept-full-access` flag was the owner's explicit choice because no
    importer function-call key exists on chain (see "Where things stand").
  - **The new feed records were approved separately and written 9 Nov** (batch 13: 55 records, 2
    tx) — see "Where things stand". Still not approved: restoring labels on the 15 records, and
    anything about "777 giros gratis".
  - **From now on:** new submissions follow
    [`runbooks/new-submissions.md`](runbooks/new-submissions.md). `npm run enrich` now also covers
    feed submissions not yet on chain, so they are created already enriched in one approved write.
    A scratch run on 9 Nov showed 311 proposals for 335 submissions; the 54 pending ones would be
    created with 46 descriptions, 42 media sets and 14 verified repositories.

### Board 1 — Directory (home) · Day 1

**Status: done 8 Nov** — NH-10–NH-16 are on `main`; evidence in the Day 1 status block above.
Production deploy done 8 Nov at `https://nearhunt.xyz` (and `https://near-hunt.vercel.app`); the
domain's DNS is configured and verified (see Open decisions).

| ID | P | Item |
|---|---|---|
| NH-10 | P0 | App scaffold (Next.js), header, nav. Hosting and preview deploys: Hermes |
| NH-11 | P0 | Project list from the KV API via NH-01, with a short server cache |
| NH-12 | P0 | Search by name. The empty result says why: names only, since the feed has no descriptions |
| NH-13 | P0 | Track filter chips with live counts |
| NH-14 | P0 | Sort by most upvoted and newest (by block height). "Most discussed" waits for NH-43 |
| NH-15 | P1 | "Live on near.social" sidebar from `GET api2.near.social/v1/hashtags/nearhunt` |
| NH-16 | P2 | "How it works on NEAR" and "Built for agents" cards |

### Board 2 — Project page · Days 1–3

**Status: NH-20 and NH-21 done 8 Nov.** NH-22–NH-24 remain for Days 2–3.

| ID | P | Item |
|---|---|---|
| NH-20 | P0 | `/p/{submission_id}`: title, tracks, links, and null fields shown as "Not supplied" |
| NH-21 | P1 | On-chain record card (account, key, schema, block) and a "View JSON" link |
| NH-22 | P1 | "Upvoted by" avatars (vote rows plus near.social profiles) |
| NH-23 | P2 | Similar projects (shared tracks) |
| NH-24 | P2 | Claim call-to-action, copy only ("coming after the hackathon"), linked to the proposal |

### Board 7 — Connect and upvote flow · Day 2

| ID | P | Item | Done when |
|---|---|---|---|
| NH-30 | P0 | Wallet login with **NEAR Connect** (`@hot-labs/near-connect` + `near-connect-hooks`, per the `near-dapp` skill; replaces Wallet Selector, owner decision 8 Nov). A function-call access key covers **one** receiver, so the login key targets `nearhunt.near` (votes, frequent) and near.social posts go through a wallet confirmation | Login and logout work in at least two NEAR Connect wallets (e.g. HOT and Meteor) |
| NH-31 | P0 | Upvote: write `{"vote/{id}": {}}` to `nearhunt.near`. The count updates instantly, is confirmed against the indexer, and rolls back on timeout. The receipt failure is expected and never retried | One account's vote counts once, however many times it votes |
| NH-32 | P0 | Remove an upvote: write `null` | Count drops; profile list updates |
| NH-33 | P0 | Tally: for each project, an exact-key query across writers, ignoring nulls and projects that don't exist; cached | Matches a manual KV query |
| NH-34 | P1 | After voting, a prefilled "Post to near.social" with `#nearhunt` and a link back | Post appears on near.social |
| NH-35 | P0 | **Spike first thing on Day 2:** do wallets accept a transaction to a receiver with no contract? If not, fall back to adding the function-call key at login | **Done 8 Nov** — yes: signed, broadcast, indexed; the receipt fails and the wallet only reports it afterwards. MyNearWallet is retired and removed. Decision + evidence: [`spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md`](spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md) |

### Board 2/6 — discussion · Day 3, replaced on Day 6

**9 Nov (owner): comments move to `nearhunt.near` (NH-44).** NH-41/42 (near.social replies) are
built and deployed but superseded: no project has a starter post, so none can take comments. NH-40
is no longer needed for discussion; it stays as an optional promotion drip (P2).

| ID | P | Item |
|---|---|---|
| NH-40 | P2 | *(Promotion only since 9 Nov.)* Project posts from `nearhunt.near`: a daily "spotlight" drip of at most 40, never all 281 at once. Per near.social's skill.md (social-kv/1, AGENTS.md §2a) a post is `{"post/{ms}": {text}}` sent with `__fastdata_kv` to receiver **`social`** (mainnet only), gas 1 Ggas, deposit 0, confirmed via `/v1/tx/{hash}`. The post reference is stored in `social_post` (NH-05) via `scripts/import.mjs --social-posts`. **Prep done 8 Nov:** `scripts/social-posts.mjs` prints the batch and has no execute path; posting is Hermes's after approval ([`runbooks/day3-signing-checklist.md`](runbooks/day3-signing-checklist.md)), and it needs a function-call key scoped to `social`, which is a separate approval. "Created by the server the first time someone opens a thread" is **not built**: it needs a server-held `nearhunt.near` key, which is an owner decision |
| NH-41 | P0 | Read the thread: `GET api2.near.social/v1/posts/nearhunt.near/{post_id}/replies` |
| NH-42 | P0 | Reply composer: `post/{ms}` with `reply_to`/`root`, plus the `reply/{root_author}/{root_id}/{ms}` backlink in the same action; confirmed via `/v1/tx/{hash}` |
| NH-43 | P1 | Comment counts on cards; "Most discussed" sort (counts from NH-44 rows). **Done and live 9 Nov (`ffc491f`)** — every directory card shows its count (0 is data once the read succeeded; nothing when the rows cannot be read), the project's On-chain record card adds "N signed key(s)", and "Most discussed" orders by visible comments with projects that have none last. Evidence: `npm test` 248/248 (2 new directory tests); live: 281 cards carry a count, Tripwire's card and record card read 2, `/?sort=discussed` puts Tripwire first, `/api/projects/bb739197-…/discussion` returns `meta.total: 2` by `alejandro.near` |
| NH-44 | P0 | **Comments on `nearhunt.near`.** Write `{"comment/{submission_id}/{ms}": {"text": "…", "reply_to": "{account}/{ms}"?}}` with the login key (`__fastdata_kv`, receiver `nearhunt.near`), exactly like a vote: no wallet pop-up, the receipt's `CodeDoesNotExist` is expected, confirm by KV read. Read with `key_prefix` `comment/{submission_id}/` across writers; the author is `predecessor_id`, never a value field. Plain text, ≤ 2,000 characters; `null` deletes (author only). Show near.social name and avatar. A NEAR Hunt hide list (repo file) and a one-page comment policy ship with it, since anyone can write. Replaces the Discussion card's near.social source and the "#nearhunt on near.social" empty state with "Start the discussion". `/api/projects/{id}/discussion` and `SKILL.md` switch to the new rows. NH-52 "my comments" reads prefix `comment/` for the user. **Done and live 9 Nov — merged `f11ea7e`, deployed `near-hunt-dggp40cj3`.** `lib/comments.mjs` (keys, 2,000-char validation in code points, threading, hide list, send/confirm, `created_at` capped at block time), `lib/comments.ts` (15 s read cache, 60 s counts), `data/hidden-comments.json`, `/comment-policy`, new Discussion UI with replies and author-only delete, `/api/.../discussion` now offset-paged comment rows, directory counts from `comment/` rows. Evidence: `npm test` 246/246, `npm run typecheck` and `npm run build` clean. Testnet round trip: `near contract call-function as-transaction nearhunt.testnet __fastdata_kv json-args '{"comment/nh44-smoke-2026-11-09/1794240000001":{…}}' … send` → expected `CodeDoesNotExist`, row read back at block 276851681 through `readProjectCommentRows`; writing `null` to the same key left `rows: 1, visible: 0`. Live after deploy: `curl -s -o /dev/null -w '%{http_code}' https://nearhunt.xyz/comment-policy` → 200; `/api/projects/de2b5217-8d85-4052-a0d2-0e8e8066c2a5/discussion` → `{"items":[],…,"meta":{"total":0,"source":{"prefix":"comment/"},"policy_url":"https://nearhunt.xyz/comment-policy"}}`; the project page renders "Start the discussion" and the policy link. NH-52 still to do |

**near.social write contract** (NH-40 promotion posts only since 9 Nov; `https://near.social/skill.md`, checked 8 Nov): receiver `social`,
method `__fastdata_kv`, gas `1 Ggas`, deposit 0. The receipt always fails with `CodeDoesNotExist`
because `social` has no contract — the write is still indexed, so never retry; confirm with
`GET https://api2.near.social/v1/tx/{hash}` and handle `indexed:false`, `rate_limited` and `invalid`
(NH-83). Reply args are `{ "post/{ms}": { text, reply_to, root }, "reply/{root_author}/{root_id}/{ms}": {} }`.
Limits per account per UTC day: 300 posts, 5 MiB; the 40/day drip fits. The account now has a
`social`-scoped function-call key and a profile that discloses automation, so NH-40 is unblocked on
infrastructure — the remaining work is the server-side posting path itself.

### Board 3 — Account page · Day 3

| ID | P | Item |
|---|---|---|
| NH-50 | P1 | Profile header from `GET api2.near.social/v1/accounts/{id}` with an "Edit on near.social" link |
| NH-51 | P1 | My upvotes: `POST /v0/latest/nearhunt.near/{me}` with prefix `vote/` |
| NH-52 | P2 | My comments: the account's `comment/` rows (the near.social-posts version is obsolete since NH-44), newest first, with the project name and a link to the comment | **Done and live 9 Nov (`ea5c582`, deploy `qk08lbdb4`)** — `readAccountCommentRows` (writer-scoped `comment/` prefix) + `accountComments` in `lib/account.mjs`; the Comments tab joins rows with live projects, drops deletions, empty text, hide-list entries and projects no longer in the feed, and uses the project page's own `created_at`/text rules. `CommentsList` shows project, text (5-line clamp), "Commented … · block N" and a link to the anchor. A read failure says so; the tab loads only when selected. Evidence: `npm test` 252/252 (4 new account tests); live `https://nearhunt.xyz/u/alejandro.near?tab=comments` → 200 with the Tripwire comment, an unknown account → the empty state, and `/p/bb739197-…` carries `id="c-alejandro.near-1794187016743"` so the link lands |
| NH-53 | P1 | Remove a vote from the list (reuses NH-32) |

### Boards 5 and 6 — Mobile · Day 3 polish

| ID | P | Item |
|---|---|---|
| NH-70 | P0 | Responsive pass at 390 px: chips scroll, no horizontal page scroll, touch targets of at least 44 px |
| NH-71 | P1 | Sticky upvote bar on the mobile project page |

### Board 8 — States · Day 3

| ID | P | Item |
|---|---|---|
| NH-80 | P0 | Loading skeletons |
| NH-81 | P0 | Empty search and empty filter states |
| NH-82 | P1 | "Data from N minutes ago" banner when the indexer is slow; pending votes kept visible |
| NH-83 | P1 | near.social `rate_limited` / `invalid` statuses from `/v1/tx` shown clearly, draft kept |

### Board 4 — Open data and agents · Day 4

**Status (9 Nov): NH-60, NH-61, NH-62 and NH-64 are built and merged to `main`** in PR #6
(merge commit `df7ac8c`). NH-63 has one of its two runs. The shared API shape is in
[`api-contract-day4.md`](api-contract-day4.md). Read-only: nothing was signed or written.

**Deployed to production on 8 Nov** (`near-hunt-k15gdqx9a-…`, Vercel project `near-hunt`, Node.js
26.x runtime). Checked live on `https://near-hunt.vercel.app` after the deploy:

- `/`, `/open-data`, `/SKILL.md` (200, `text/markdown`) and `/api/projects` (200) all answer.
- `/api/projects?limit=100` pages 100 + 100 + 81 = **281**, `meta.total: 281`, `stale: false`.
- `limit=0`, `sort=hot`, `cursor=zzz` → 400 `bad_request`; an unknown id → 404 `not_found`;
  `access-control-allow-origin: *` on every route.
- `/votes` for Aegis → `alejandro.near @ 223642127`; `/api/projects/{Veto}` → `block_timestamp`
  `"1794135497728714191"` exact, `record_url` pointing at the KV API.
- `/open-data` renders 281 records, 258 KB, 10 distinct block heights.
- ~~The project has no git integration: deploys are `vercel --prod` from `main`.~~ **Corrected 9 Nov
  (owner):** the project is now git-linked to `satojandro/near-hunt` — `vercel git connect` answers
  "already connected to your project" — so a push to `main` builds and deploys production
  automatically. `vercel --prod` from a checkout stays as the emergency path only: running both on
  one change creates competing production deployments. Node 26.x on Vercel
  means `JSON.parse`'s reviver source text exists, so `parseKvJson` keeps exact digits there.

Re-verified on the merged `main` (`df7ac8c`), 9 Nov:

```bash
npm test                  # 217 pass, 0 fail (17 new in test/api.test.mjs, 4 for block_timestamp)
npm run typecheck         # exit 0
npm run build             # adds ƒ /open-data and ƒ /api/projects, /[id], /[id]/votes, /[id]/discussion
npm run validate:schema   # 281 records, all conform to nearhunt/project/1
node scripts/import.mjs   # 29 new (feed 310), 0 changed, 281 unchanged — pending approval, not part of Day 4
```

- **NH-60:** on a local `next start` against mainnet, `/api/projects?limit=100` pages 100 + 100 + 81 = 281
  and ends with `next_cursor:null`. `/votes` for Aegis returns `alejandro.near` at block 223,642,127.
  An unknown id returns 404 `not_found`, and `limit=0` or a bad cursor returns 400. Choices the contract
  left open are listed under "As built" in the contract file. The main ones: there is no
  "discussed" sort, an unknown track returns an empty list, and a failed vote read gives `votes:null`.
  `/discussion` is empty for every project until NH-40 posts exist.
- **NH-61:** `/SKILL.md` serves `text/markdown`. Its direct-to-chain curls were run against mainnet.
- **NH-62 and NH-64:** `/open-data` shows live dataset values (281 records, 258 KB, 10 distinct
  block heights) and links the draft proposal. It was checked at 1280 px and 390 px, with no
  horizontal scroll at 390 px. An "Open data" nav link was added, but `globals.css` hides
  `.site-nav` at ≤640 px, so phones don't see it (true of "Projects" too).
- **NH-63 run 1 (a fresh Claude agent, URL only):** it shortlisted ten from 4 HTTP requests and
  checked 2 records and 1 vote on chain against the API. Output:
  [`agent-tests/2026-11-08-nh-63-claude-shortlist.md`](agent-tests/2026-11-08-nh-63-claude-shortlist.md).
  Its feedback was applied to SKILL.md: the stale "no votes" line, `demo_url` is usually the X post
  (real links are in `links`), near-duplicate submissions, the vote value, and where
  `repository_url` comes from. **Still open: the Hermes run against the deployed site.**
- **Fixed:** `block_timestamp` (ns) is above 2^53, so `res.json()` rounded it in every KV read.
  `lib/kv.mjs` `parseKvJson` keeps the API's exact digits as a decimal string, vote tie-breaks
  compare them as BigInt, and the server cache keys moved to `-v2`. Live check, Veto:
  `/api/projects/21996773-…` → `"1794135497728714191"`, equal to the KV API's own digits.
- Found, not fixed: the schema README's "Cost of the whole dataset" still says 275
  records / 128,270 bytes.

| ID | P | Item |
|---|---|---|
| NH-60 | P0 | `GET /api/projects`, `/api/projects/{id}`, `/votes`, `/discussion`, using the `{items, next_cursor}` envelope |
| NH-61 | P0 | `public/SKILL.md`: quick-reference table first, read-only, provenance rules |
| NH-62 | P1 | Open data page (board 4) |
| NH-63 | P1 | Agent test: "Read NEAR Hunt's skill and shortlist ten projects", run with Hermes and one other agent |
| NH-64 | P2 | Link the existing `project/` proposal draft from the open data page (doc only, no on-chain writes) |

### Day 5 — submission

| ID | P | Item |
|---|---|---|
| NH-90 | P0 | Rewrite the README to match what runs: live URL, 3-command local run, what is on chain where | **Done 11 Nov** — status table with a reproducing command per number (499 on chain, 498 listed), "do X, see Y" steps for the site, the API, the chain and a local run, known gaps stated, and an AI disclosure section. CI added (`.github/workflows/ci.yml`: typecheck, test, build). Checked: `npm test` 320/320, `npm run typecheck`, `npm run build`; `npm run validate:schema` still reports 1 invalid record (`project/1ca01819-…`, `http://` demo_url), which the README states. |
| NH-91 | P0 | README names Baby Shark, and Baby Shark's README names NEAR Hunt |
| NH-92 | P0 | Demo video or screenshots, plus an X post tagging `@NEARProtocol` `#NEARHackathon` |
| NH-93 | P0 | Final dry-run import; a human approves and applies any diff | **Done 8 Nov** — 4 records applied in tx `8rX5McjBeiitsRAhQsY7sqWbTQ9nXXHBDYwCJyQuGhfk`, 4/4 verified against the indexer, schema 275/275 |
| NH-94 | P2 | "Support NEAR Hunt" link (footer and open data page) to a separate treasury account, labelled "supports the site, not any project" |

### Live-traffic hardening — NH-106…NH-110 (9 Nov, owner request)

Shaped the day the demo went out on X, before visitors could hit the gaps. Everything here is
read-only or display-only: **no chain writes, no keys.**

| ID | P | Item | Status |
|---|---|---|---|
| NH-106 | P1 | The header nav is `display:none` at ≤640 px, so phones had no route to `/open-data` or the correction form. Footer now carries Projects, Open data, Comment policy and Report a problem at 44 px targets | **Done** — `app/globals.css` `.footer-links`, `app/layout.tsx` |
| NH-107 | P1 | Builders arriving had no way to report a wrong/missing description or repository. Public issue form `.github/ISSUE_TEMPLATE/correction.yml`, prefilled from `/p/{id}` | **Done** — `lib/links.mjs` `correctionUrl()`, linked from `ClaimCard` |
| NH-108 | P1 | **Project hide list.** `data/hidden-projects.json`, applied in `getProjects()` — the one funnel every reader passes through — so a hidden listing leaves the directory, the API, `/open-data` and its own page (404). Matches `submission_id` only, keeps a written reason, never tombstones (AGENTS.md §1) | **Done** — `lib/listing.mjs` `filterHidden()` + 5 tests. First entry: `fa54da13-…` "777 giros gratis" (gambling referral, owner-approved hide). Served count 336 → **335**; the record stays on chain |
| NH-109 | P1 | The front page had **no `og:`/`twitter:` tags at all** — the URL the demo post links rendered as a bare text card while `/p/{id}` pages had rich cards. Metadata + 1200×630 share cards for `/` and `/open-data`, rendered without a new npm dependency | **Done** — `app/page.tsx`, `app/open-data/page.tsx`, `scripts/render-og.mjs` → `public/og/{home,open-data}.png` |
| NH-110 | P1 | Production had no monitor: the existing cron runs the **local** importer, and a KV outage returns **200 on `/`** (B4), so a status-only check is green through an outage. `scripts/site-health.mjs` asserts the API body, a project page (`__next_error__` is the tell), the home `og:image` and `/open-data` | **Done** — silent when healthy, one line naming the failed check. Cron `near-hunt site health`, every 10 min, `no_agent` |
| NH-111 | P2 | Aggregate, cookie-free page counting (Umami Cloud free: 1 site, 100k events/mo, no consent banner). Loads only when `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set, restricted to production hosts; events `wallet_connect`, `vote`, `unvote`, `comment`, `outbound_click` (kind: repository/demo/video/website) | **Live 9 Nov** (`dvihn35hh`), website `7bafa9f5-…1747`. Verified in a browser: `script.js` 200, two `POST gateway.umami.is/api/send` 200, and a clicked demo link delivered `{"name":"outbound_click","data":{"host":"x.com","kind":"demo"}}`. The wallet-dependent events are wired but unexercised in production |
| NH-112 | P1 | **People strip** on the directory: everyone with a live vote or comment, with near.social avatars, from `vote/` + `comment/` rows across all writers. Deliberately **not** a login count — signing in writes nothing to the chain. Copy: "N people have voted or commented **recently** — join them!", where recently is a real 7-day window on `block_timestamp` (`PARTICIPANT_WINDOW_MS`), so the number can fall as well as rise. "join them!" opens the NEAR Connect picker and hides once signed in. Deleted rows don't count; a failed read hides the strip rather than showing 0; fallback avatars are two initials so a letter cannot read as a count | **Live 9 Nov** (`hjj2spwlq`, `c2s06it18`). `lib/participants.mjs` (9 tests), `lib/participants.ts` (60 s cache revalidated by votes and comments), `app/components/{Participants,JoinLink}.tsx`. Checked at 390 px: text "3 people have voted or commented recently — join them!", 390/390 no overflow, clicking opens the wallet picker with no console error |
| NH-113 | P2 | **Per-listing page views.** "People open a project and leave without voting" is a signal worth showing. `GET/POST /api/views` over Upstash Redis REST (two integer keys per path: all-time + UTC day), counting once per browser session via sessionStorage — no cookies, no IP, no identifier. Only `/p/{id}` and `/u/{account}` paths are storable; everything else is a 400 | **Live 9 Nov** (`f66hgs0nx`). The Vercel Marketplace integration injects `UPSTASH_REDIS_REST_KV_REST_API_URL/_TOKEN`; `UPSTASH_REDIS_REST_URL/_TOKEN` and `KV_REST_API_URL/_TOKEN` are read too. Verified against the real database: GET 0 → POST 1 → GET 1, profile path 1, and one browser session navigating twice adds exactly 1 (`before 3 → afterFirst 4 → afterSecond 4`, page shows "4 views") |

Why analytics is compatible with NH-104's "no tracking scripts": the counter is aggregate,
sets no cookies and collects no identifiers — it is not ad tracking, and the footer says so
when it is on. No Sentry: NH-110 covers the failure that would actually bite during judging.

Evidence (9 Nov):

```bash
npm test                  # 296 pass, 0 fail (5 new for the hide list)
npm run typecheck         # exit 0
npm run build             # adds /open-data share card; /p/[id] unchanged
node scripts/site-health.mjs --verbose   # against production, before deploy: fails on
                                         # "home: no og:image" — the gap it exists to catch
# local `next start -p 3311`, after build:
#   /p/fa54da13-… → 404 ; /api/projects meta.total 335 ; q=777 → 0 hits
#   / → og:image https://nearhunt.xyz/og/home.png, footer nav rendered
#   umami script absent and no privacy line while the id is unset
```

### Days 7–8 — after launch, P2 (owner, 8–9 Nov)

The rules in `AGENTS.md` are unchanged: every mainnet write below still needs its own approved
dry run, and nothing here lets an agent write on anyone's behalf.

**Funding and mirroring (12 Nov)**

| ID | P | Item | Done when | Depends on / approval |
|---|---|---|---|---|
| NH-102 | P2 | Baby Shark "Fund this project" link: fill `external_campaigns` (already in the schema) from Baby Shark campaigns that name a submission, and render it as an outbound link on `/p/{id}` | Each linked campaign opens the right Baby Shark page; no NEAR Hunt account holds funds | Baby Shark must expose campaigns with a submission reference. Filling the field is an import change, so it is a mainnet write with its own dry run and approval |
| NH-103 | P2 | Optional near.social mirroring (promotion; comments live on `nearhunt.near`). **Moderation story first:** a written policy (what is mirrored, who can ask for removal, how a post is retracted) in `docs/runbooks/` | Policy merged; mirroring runs through the NH-40 drip | Each post batch is an owner approval (AGENTS.md §1). The drip cap stays at 40/day, so mirroring all 308 projects does **not** finish by the 14th: at most about 200 more posts fit from 10 to 14 Nov |

**Sponsored slot, built but off (12 Nov)**

| ID | P | Item | Done when | Depends on / approval |
|---|---|---|---|---|
| NH-104 | P2 | Sponsored slot: one per page at most, labelled "Sponsored", never inside the ranked list and never affecting rank. Each placement is published as an on-chain record by NEAR Hunt (sponsor, dates, amount). No tracking scripts. Written sponsor policy first | Policy merged; slot renders from a record on **testnet**, behind a flag that is off in production | New key prefix `sponsor/` on `nearhunt.near` (allowed below). Going live is not before 18 Nov (Decisions taken). Each placement record is a mainnet write with its own approval |


### After the MVP launch (owner, 9 Nov)

Submissions and claims wait until the first version is live. Designs are settled (see Decisions
taken); build starts after launch.

| ID | P | Item | Done when | Depends on / approval |
|---|---|---|---|---|
| NH-101 | — | **Open submission** (Product Hunt's "hunt"): any signed-in account submits a project it did not necessarily build. The submitter is the record's `predecessor_id` and is shown as "submitted by {account}", never as its maker. Same fields as `nearhunt/project/1` minus `source` and `tracks`; `team` may list makers, shown as "listed by {submitter}". `/submit` form plus the new listings in the directory next to the imported ones | A testnet account submits a project; it appears in the directory and on `/p/…` with its submitter; a second submission of the same project from another account shows both, flagged as a possible duplicate | Users sign their own writes; no agent writes. Stored on `nearhunt.near` as `project/{slug}` rows under schema `nearhunt/submission/1` (owner, 9 Nov); votes on them use `vote/{writer}/{slug}`. Anyone can submit, so NEAR Hunt needs a hide list and a written policy for it before launch (shared with NH-103's moderation story). Submissions are read by a new reader next to `readProjects()` that keeps each row's `predecessor_id` (AGENTS.md §3 covers imported records only) |
| NH-105 | — | **Claim** (Product Hunt's "I'm a maker"): a maker confirms they built a listed project, whoever submitted it, including the 308 imported listings. The maker writes `maker/{writer}/{key}` → `{}` on `nearhunt.near` from their own account; a listing shows "made by {account}" only for accounts that wrote the edge. A claimed maker can then publish their own description, which NEAR Hunt shows ahead of the submitter's. Replaces NH-24's "coming after the hackathon" copy | A testnet maker claims an imported listing and a community submission; both show the maker, and an edge written for a project that does not exist is ignored | Makers sign their own writes. **Self-claims are unverified** until ownership can be checked (a candidate: an OutLayer TEE check that the repo README or announcement post names the account): the badge reads "claimed by {account}, unverified" until then. Depends on NH-101 for community listings; works on imported listings without it |
| NH-100 | P2 | Publish `nearhunt/project/1` (and later `nearhunt/submission/1`) as an open, documented format: the schema file, `SKILL.md` and `/open-data` already describe it. Offering it to the near.social maintainers is optional and no longer on the critical path; [`proposals/social-kv-project.md`](proposals/social-kv-project.md) is kept as background | Schema docs list every additive field in use (today `links` and `enrichment` are accepted but undocumented) | Owner approves any outside post |
| NH-115 | P1 | **Directory first impression** (owner asked for the next improvement, 11 Nov). (1) Default sort is **Most upvoted**: `/` used to open on Newest, which inside one import batch is alphabetical and showed fifty zero-vote cards first; there are now 55 vote rows from 24 accounts to show. `/?sort=newest` still works; a bare `/` link now means most upvoted. (2) Cards show the record's **description**, clamped to two lines. (3) The list renders **50 cards at a time** with a "Show 50 more" link (`?show=100`, a plain link, scroll position kept); search, track and sort changes start again from the first page. | **Built 11 Nov, not deployed.** Local `next start` against mainnet: `/` HTML 1,810,147 → 261,981 bytes, DOM nodes 12,900 → 1,548; clicking the link takes 50 → 100 cards with `scrollY` unchanged; `/?show=500` renders all 498 and no link. `npm test` 323/323, `npm run typecheck`, `npm run build`. | Owner merges; a push to `main` deploys |
| NH-116 | P2 | **Site basics** (owner, 11 Nov). `/favicon.ico`, `/robots.txt` and `/sitemap.xml` returned 404 and the only security header was HSTS. Adds `app/favicon.ico`, `app/icon.svg` (the header's brand mark; follows the system colour scheme) and `app/apple-icon.png`; a static `app/robots.txt` that allows everything except `/api/views` and points agents at `/SKILL.md`; `app/sitemap.ts` with the fixed pages and one entry per listed project (hidden ones absent, `/u/…` left out, fixed pages only if the indexer is down); and `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy` on every route in `next.config.mjs`. **No full Content-Security-Policy**: the wallet selector, X's embed and the analytics script load from other origins, and a wrong policy would break signing. | **Built 11 Nov, not deployed.** Local `next start`: the five URLs answer 200 with the right content types; the sitemap has 502 `<loc>` (4 + 498) and no `fa54da13`; `curl -sI /` shows the four headers; the API keeps `access-control-allow-origin: *`; in a browser the wallet selector opens and X's embed frame loads. `npm test` 323/323, typecheck, build. | Owner merges; a push to `main` deploys |
| NH-117 | P1 | **Hydration error on project pages with comments** (found 11 Nov). `CommentItem` rendered an `<li>` and `CommentsSection` wrapped it in another `<li>`. Nested `<li>` is invalid HTML, the browser re-parents the inner one, and React's hydration fails (error #418), so the page is thrown away and rendered again in the browser. `CommentItem`'s root is now a `<div>`; the `id="c-…"` anchor and the classes are unchanged. | **Built 11 Nov, not deployed.** Before: `https://nearhunt.xyz/p/c1c7b574-850a-4f47-9af9-22a49339df07` logs `Minified React error #418`; `next dev` names the nested `<li>`. After, in `next dev`: no console or page errors on that page, `/`, a project without comments, `/u/alejandro.near` and `/open-data`; the discussion section measures the same 768 × 756.5 px as production. `npm test` 323/323, typecheck, build. | Owner merges; a push to `main` deploys |
| NH-118 | P2 | **View-counter limits and the site's sort names in the API** (owner, 11 Nov). (1) `POST /api/views` had no limit, so a loop could set any listing's number and fill the store with made-up paths. It stores no identifier and still does not, so the limits are on the counter: 12 adds a minute and 2,000 a day per path, 240 a minute across all paths (`VIEW_LIMITS`, `lib/views.mjs`), and a `/p/{id}` is counted only if it is a listed project. Past a limit the answer is the current number with `counted: false`. This bounds inflation; it does not make the number unforgeable, which would need an identifier (an owner decision, since the footer says none is kept). (2) `/api/projects` accepts `sort=upvoted` (= `votes`) and `sort=discussed` (= the new `comments` sort), list items carry `comments`, and `meta` carries `comments_available`. | **Built 11 Nov, not deployed.** Local `next start` with a stand-in for Upstash's REST API (not the real store): 14 POSTs to one listed project in a minute → 12 counted, 2 `counted:false`, total 12; an unlisted id and the hidden id → `counted:false`, nothing stored; limiter keys get a 120 s expiry. `sort=upvoted` returns the same three as `sort=votes`, `sort=discussed` the same as `sort=comments`, `sort=loudest` a 400 naming all six. `npm test` 328/328, typecheck, build. | Owner merges; a push to `main` deploys |
| NH-119 | P1 | **Claim a project with GitHub sign-in** (owner request, 11 Nov; first step of the owner's "GitHub identity linking & project claiming" spec, and the ownership check NH-105 was waiting for). A "Claim this project" button on `/p/{id}` posts to `/api/claim/start`, GitHub's OAuth sign-in returns to `/api/claim/callback`, and the server asks GitHub, with that person's own token, who they are and what they may do on the record's `repository_url`. The account is recorded if it **owns the repository** (numeric id) or **can push to it**; read access is not enough. Stored in the Upstash store the view counter uses, hash `nh:claims:{submission_id}`, one field per GitHub id: `{github_id, github_login, repository, basis, verified_at}`. **Nothing is written to chain and no NEAR key is involved.** The token asks for no scope, is used for two API calls, revoked and never stored or sent to the browser. `state` + PKCE S256 in an httpOnly cookie; start is POST and same-origin only. The card says "controls this project's repository", not "verified maker": repository control is not proof of authorship. Several accounts can be listed; "Remove my claim" repeats the sign-in and deletes that account's row. Listings without a GitHub repository show no button and point at the correction form. Code: `lib/claims.mjs` (rules, unit tested), `lib/claims.ts`, `app/api/claim/*`, `ClaimCard`. | **Built 11 Nov, not deployed, not yet run against real GitHub** (needs the owner's OAuth App: `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, see `.env.example`). Local `next start` against mainnet records, with one stand-in server for github.com, api.github.com and Upstash: owner → listed as "owns"; account with push → "can push to"; stranger → `claim=not_owner`, nothing stored; cancelled sign-in → `claim=denied`; remove → row deleted; callback without the cookie → `claim=expired`; `GET /api/claim/start` 405; cross-origin POST 403; token revoked after each exchange; the stand-in refuses the exchange unless the PKCE verifier matches. `npm test` 340/340 (`test/claims.test.mjs`), typecheck, build. **To confirm on real GitHub:** that `GET /repos/{owner}/{repo}` returns `permissions` for a token with no scope (the owner path does not depend on it). | Owner creates the OAuth App and sets the two variables in Vercel; owner merges. **Not built, owner decisions (spec §14):** one GitHub account per NEAR account across projects, a single primary contact, and a review queue |
| NH-119b | P1 | **Link a NEAR account to a GitHub-checked claim** (owner approved the design in session, 11 Nov: "proceed with step 2-4"). There is no server-side NEAR session, and anyone can write any row to `nearhunt.near`, so the link is made by joining three things. (2) After a passed GitHub check the server issues a one-time code for that GitHub account and listing, held in the store under the hash of an httpOnly, SameSite=Strict cookie (30 min). (3) The person's NEAR account writes **`maker/{submission_id}` → `{ "code": "…" }`** on `nearhunt.near`, signed with the login key like a vote; the same browser then calls `POST /api/claim/link`, and the server stores the account and code on the claim only if the index shows that account's own row (`predecessor_id`) carrying the issued code. (4) On every read, `getPublicClaims` shows the account only while its current row still carries the claim's code, so a `null` written by the account unlinks it, and a row from anyone else, or with any other code, is ignored. The code is public once on chain; confirming needs the cookie. The step is optional and the card says the link stays in public history. **This replaces NH-105's unverified `maker/{writer}/{key}` → `{}` edge**: the key is `maker/{submission_id}` (the writer is `predecessor_id`, as for votes). Code: `lib/claim-link.mjs`, `lib/claims.ts`, `app/api/claim/link`, `LinkNearAccount`. | **Built 11 Nov, not deployed.** Run on **testnet** (`NEXT_PUBLIC_NEAR_NETWORK=testnet`, rows on `nearhunt.testnet`, a throwaway account `nhclaim1794424631589.testnet`, GitHub and the store still stand-ins): confirm before any row → `pending`; after a row with a code the server did not issue (tx `d1k5EmGkK9F2Rvwsbg14bKxhLfah4Zd9sTYqeJrjYg8`) → `pending`; after the right row (tx `2DGF8PnFLKgvqHuesqaKxiyshWcBS8ZFtbyG6gTcbLVi`) without the cookie → `expired`, cross-origin → 403, with the cookie → `linked` and `/p/{id}` shows the account; a second confirm → `expired` (code spent); after the account wrote `null` (tx `EN8AA64SQfUSdmDVvHRnzP3c3d37NAX1bAr5J7nHcNM3`) the page no longer shows it; the code never appears in the page HTML. In a browser the step appears after a claim and asks to sign in with NEAR. **Not run:** the wallet signing the row in a browser (the script signed with a key directly), and nothing on mainnet. `npm test` 346/346, typecheck, build. | Owner merges. First mainnet `maker/` row will be written by a user, not an agent |

| NH-114 | P2 | **Themes**: Light (today), Dark, Golden Hour and Darkroom from one token set, plus the header/footer picker (`System` default, stored per visitor in `localStorage`, never on chain, never in analytics). Spec and mockups: `docs/mockups/themes/README.md`; tokens in `app/globals.css`. Front end only: no chain reads or writes change | Every page renders in all four themes on desktop and at 390 px; `node docs/mockups/themes/contrast.mjs` exits 0; `npm test` and `npm run typecheck` pass; Light keeps today's values apart from the neutral letter tiles the tint table specifies | None. Built 9 Nov; the only open question is whether Light keeps the old five-colour avatar palette (change the Light `--tint-*` values) |
| NH-120 | P1 | **Saved copies of votes, comments and people, labelled as such** (owner asked why the site was not loading, 13 Nov; recorded after the fact for `7caf431` and `c2fc9e5`, which shipped without a ticket, and for the review fixes that followed). When the FastData KV API times out, each read falls back to its last good copy in Upstash (`lib/snapshot.mjs`, `lib/snapshot-store.ts`) instead of blanking the page. **Rule: a copy is never presented as current.** `copyIsStale` (`lib/freshness.mjs`) labels a copy when a read failed after it was read, when it is older than 5 minutes, or when its time is unusable; this covers the warm-instance case, where Next's cache keeps serving an expired entry after a failed background re-read. The label reaches the directory status line (votes, and comment counts on every sort), the people strip, "Upvoted by", the discussion, `/u/{account}` (which falls back to the all-accounts rows, still filtered by `predecessor_id`) and the API meta (`votes_stale`, `comments_stale`, `*_fetched_at`; `stale` and `fetched_at` on `/votes` and `/discussion`). Cache keys carry a version that changes with the cached shape, and a cached value of the wrong shape falls through to the stored copy. Also in `c2fc9e5`: `app/icon.png`, so `/icon.png` answers. **Importer rule (owner, 13 Nov):** an `http://` `demo_url` from the feed is upgraded to `https://` (`httpsDemoUrl`, `lib/import-plan.mjs`); only the scheme changes. | **Built 13 Nov.** `npm test` 400/400, typecheck, build. Local `next start` with an in-memory store and the KV host switched to 503 on a *warm* instance: directory shows "upvote counts as of …" and "comment counts as of …", people strip "(a saved copy, …)", project page and `/u/{account}` show the saved-copy notes, API meta `votes_stale: true`; after the host answers again every label clears within one revalidation. `node scripts/import.mjs` dry run lists `project/1ca01819…` and `project/fc122909…` as `changed: demo_url`. | **Shipped 13 Nov.** Merged as `510fd60` (PR #28) and deployed; `nearhunt.xyz` serves `votes_stale` / `comments_stale` / `*_fetched_at` in `/api/projects` meta (checked live, `04:06Z`), and the warm-instance case was re-tested after the merge. The two `demo_url` corrections were applied on mainnet with the owner's "go" in tx `EWoEWUF96tBxX33wVTJcWGnNdibZv8TXv35KWjedD2EW`: 8 keys (6 new submissions from the feed + the 2 corrections), 8/8 read back at block `224312219`. After the write: `npm run validate:schema` **820/820 valid, 0 invalid**; `node scripts/import.mjs` dry run **new 0, changed 0, unchanged 820**. The invalid records that made the §6 gate noisy are gone. |

## Explicitly out of scope until after the 14th

AI scoring, Valkey and agent writes. Mainnet key prefixes are limited to `project/`, `vote/`,
`comment/` (NH-44), `maker/` (NH-119, owner 11 Nov) and `sponsor/` (NH-104) on `nearhunt.near`,
plus standard near.social posts (NH-40). `vote/`, `comment/` and `maker/` are written only by users
from their own accounts. Submission keys come after the MVP launch (NH-101).

## Open decisions for the owner

Settled 9 Nov: comments on `nearhunt.near`, native additive `project/1`, submissions and claims after launch. Settled on 8 Nov: NEAR Connect for login (NH-30); NH-06 dropped; the NH-93 4-key import
applied; hosting and **DNS** are Hermes's — `nearhunt.xyz` was added to the `near-hunt` Vercel
project and points at it from Namecheap (apex `A 216.198.79.1` + `64.29.17.1`, `www` CNAME
`4b4d19b81c5a6949.vercel-dns-017.com`, 308 → apex); Vercel reports both domains
`configured_correctly` and the site serves over HTTPS. Still open:

1. **Treasury account** for NH-94: create one (e.g. `treasury.nearhunt.near`) with a key held by the owner, not Hermes. It never signs imports.
