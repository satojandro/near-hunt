# NEAR Hunt — delivery plan and backlog to 14 Nov

**Updated:** 2026-11-08 · **Deadline:** 14 Nov 2026, 23:59 UTC · **Days left:** 6

Mockups for every page and flow referenced below (boards 1–9) are in [`mockups/`](mockups/README.md); the editable canvas is at
https://claude.ai/artifact/TheVd1qg4LzCRzStJvKPKe (private until shared).

## Where things stand (re-audited 2026-11-08 evening, by Hermes)

`nearhunt.near` has exactly three transactions:

1. a 1 NEAR funding transfer (block 223,583,069);
2. 256 `project/…` records (block 223,583,277);
3. 15 `project/…` records (block 223,583,288).

**Nothing on chain needs undoing.** What's missing is the product itself, plus the guardrails
listed under Day 0.

The chain is now **behind** the feed. The hackathon feed has grown from 271 to **275**
submissions; the dry run finds 4 new, 0 changed, 271 unchanged, 0 missing:

```
+ project/e8d8d832-2a1f-4026-afba-111e6bd7316b  "NEAR Claim Check"
+ project/d7468e54-2c34-4138-8613-a587af2d3f1b  "Potluck"
+ project/a395a485-5c23-43ac-b1b5-5e27887c3124  "Swarmpad"
+ project/0328a53c-46b1-4ae4-a6be-c802af786094  "Q-day"
would write: 4 keys, 2051 bytes, 1 transaction
```

That write is **waiting on the owner** (NH-93) and must not happen until the key situation in
NH-06 is fixed — today the only key that can sign it is full-access.

Evidence for everything above, reproduced 8 Nov evening:

```bash
npm test                  # 23 pass, 0 fail
npm run validate:schema   # 271 records, 271 valid, 0 foreign rows, 0 tombstones
node scripts/import.mjs   # 4 new, 0 changed, 271 unchanged, 0 missing
node scripts/import.mjs --check-key   # every candidate key with its on-chain permission
near account list-keys nearhunt.near network-config mainnet now   # 1 key, full access
```

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where projects live | `nearhunt.near`, `project/{submission_id}` | Structured records. near.social ignores keys it doesn't recognise. |
| Where upvotes live | `nearhunt.near`, key `vote/{submission_id}`; the voter is the writer (`predecessor_id`) | The indexer keeps one row per writer per key, so one account gets one vote and nobody can vote as someone else. This replaces `vote/{id}/{voter}`. |
| Where comments live | **near.social**: replies to one post per project by `nearhunt.near` | They show up in feeds and notifications and grow near.social activity. This reverses the earlier "own namespace" recommendation. |
| Identity | near.social profiles (name, avatar, about) | People arrive with an identity they already have. |
| Projects as a near.social data object | **Out of hackathon scope** (owner agreed 8 Nov). The draft proposal stays in the repo; no `project/` writes to `social` before 14 Nov | See [`proposals/social-kv-project.md`](proposals/social-kv-project.md). |
| Domain | **nearhunt.xyz** (bought 8 Nov). Pages at `nearhunt.xyz/p/{submission_id}`, skill at `nearhunt.xyz/SKILL.md`, schema `$id` under `nearhunt.xyz/schema/` | Owner's decision |
| Donations to NEAR Hunt | A small "Support NEAR Hunt" link in the footer and on the open data page (NH-94, P2). It pays a **separate treasury account**, never `nearhunt.near`, and it never appears next to an upvote button | Low cost and on-brand, but it must not read as paying for votes, and the data-publishing key should not also hold funds |
| Sponsored placements | **Not before results are announced (18 Nov).** After that: one clearly labelled slot, outside the rankings, published on chain (NH-104) | Paid visibility during judging would undercut "votes are community signals" |
| Wallets | **Meteor** (web/extension/mobile) via wallet-selector. **MyNearWallet is dropped** — it entered sunset Phase 3 on 1 Nov 2026 and refuses every dApp request | Verified 8 Nov: `window.mnwSunset = {phase:3}`, `/sign` answers "MyNearWallet can no longer approve app requests". See [`spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md`](spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md) |
| Vote signing | **One wallet approval at login adds a function-call key** (receiver `nearhunt.near`, method `__fastdata_kv`); the app signs votes locally and treats the receipt's `CodeDoesNotExist` as success, confirmed by the KV read | Wallets do broadcast to a contract-less receiver, but a wallet-confirmed vote shows a failure dialog every time. Path and evidence: the NH-35 spike |

## Roadmap at a glance

| Day | Theme | Boards |
|---|---|---|
| 0 (8 Nov) | Guardrails and schema fixes — **code done; NH-06 keys blocked on the owner** | — |
| 1 (9 Nov) | Directory and project page, read-only (starts only after NH-06) | 1, 2, 5 |
| 2 (10 Nov) | Connect and upvote | 7, 2 |
| 3 (11 Nov) | near.social discussion, account page, states | 2, 3, 6, 8 |
| 4 (12 Nov) | Open data, API, SKILL.md, proposal draft | 4 |
| 5 (13 Nov) | README, demo, submission | — |
| 6 (14 Nov) | Buffer | — |

Priority: **P0** = needed to submit · **P1** = should ship · **P2** = only if time allows.
**Cut line:** if Day 3 slips, drop P2 items first, then NH-23, NH-50–53 and NH-15.

---

## Backlog

### Day 0 — guardrails (no board)

**Status (8 Nov evening):** NH-01 to NH-05 are **done and verified by Hermes**: `npm test`
is 23/23 green, `npm run validate:schema` reads 271/271 valid with 0 foreign rows, and the
importer dry run is idempotent (4 new, 0 changed, 271 unchanged). NH-07, NH-08 and NH-09
closed the same evening. NH-06 is **not started**: `nearhunt.near` has exactly one key on chain and it is
**full access**, and the agent machine holds two credential files for it (a flat one and a
directory), both carrying the master seed phrase. The steps are in
[`runbooks/keys.md`](runbooks/keys.md) — and the rule they encode is that the **Mini ends up
with no key at all**: the owner signs on the MacBook, the agent machine only reads.

| ID | P | Item | Done when |
|---|---|---|---|
| NH-01 | P0 | One `readProjects()` helper that reads `/v0/latest/nearhunt.near/nearhunt.near`; used in the importer, the validator, the app and the API | **Done** — `lib/kv.mjs`; rows from other writers are dropped even if the API returns them |
| NH-02 | P0 | Importer diffs against chain: writes only new or changed keys, keeps `updated_at` when the content is unchanged, requires `--execute --yes`, never tombstones | **Done** — `lib/import-plan.mjs` + 10 tests; a re-run with no changes writes nothing |
| NH-03 | P0 | `AGENTS.md`: no mainnet transaction without a dry-run diff a human has approved; every docs claim comes with the command that proves it | **Done** — file committed |
| NH-04 | P1 | Fix the docs drift (README table, spike "account undecided", the duplicated paragraph in the research doc) | **Done** |
| NH-05 | P1 | Schema touch-ups: real `$id`; optional `social_post` field (the project's near.social post reference); document that `source.url` is the generic listing; written specs for the `vote/` and near.social comment conventions | **Done** — `$id` is `nearhunt.xyz`; `npm run validate:schema` still passes 271/271 |
| NH-06 | P0 | The owner holds every key on the MacBook; the agent machine holds none. A `__fastdata_kv`-only function-call key signs imports (one for `nearhunt.near`; one for `social` later, in the Vercel env) | MacBook: `list-keys` shows a `FunctionCall` key and the full-access file sits outside `~/.near-credentials`. Mini: **no credential file for `nearhunt.near` at all**, so `--execute` cannot run there |
| NH-07 | P1 | `scripts/import.mjs` defaults to `~/.near-credentials/{net}/{account}.json`, but near-cli-rs `save-to-legacy-keychain` writes `~/.near-credentials/{net}/{account}/{public-key}.json`. Resolve both, or fail with the exact path it looked for | **Done** — `resolveKeyFile()` takes the flat file when present, else the newest `.json` in the account directory, and the error lists every path tried. `node scripts/import.mjs --check-key` resolves and parses the key without signing: it prints `~/.near-credentials/mainnet/nearhunt.near.json` here, and against a fake `HOME` with only a near-cli-rs directory it prints that nested file. `--key-file <dir>` works too |
| NH-08 | P2 | `scripts/render-mockups.mjs` needs Playwright + Chromium, which is not in `devDependencies` | **Done** — the Playwright dependency is gone: the script drives the installed Chrome/Chromium over the DevTools protocol using Node's built-in WebSocket, and exits with an install hint (or `CHROME_PATH`) when no browser is found. `npm run render:mockups` on this machine re-rendered all 9 boards; the generated `html/` is byte-identical to the committed files and every PNG keeps its exact 2× dimensions |
| NH-09 | P1 | The importer cannot tell a full-access key from a function-call key, and `resolveKeyFile()` prefers the flat file — so a leftover full-access credential silently signs an import. Query `view_access_key` for the resolved public key and print the permission; refuse to sign with full access unless `--accept-full-access` is passed | **Done** — `queryPermission()` reads `view_access_key` on the same RPC the importer already uses; `--check-key` prints each candidate file with `permission: full access` or `permission: FunctionCall(<receiver>, <methods>)` and marks the chosen one. Verified against `nearhunt.testnet`, where all three shapes resolve: the flat file `full access`, one nested key `FunctionCall(nearhunt.testnet, __fastdata_kv)`, one nested `full access`. `--execute --yes` with the flat full-access file plans the write, prints the candidates, then exits 1 with a refusal naming `docs/runbooks/keys.md`, before the signer is installed or a transaction built; `--accept-full-access` is the explicit override. The permission decision is unit-tested from stubbed RPC responses (8 new network-free tests; `npm test` is 23/23) |

### Board 1 — Directory (home) · Day 1

| ID | P | Item |
|---|---|---|
| NH-10 | P0 | App scaffold (Next.js on Vercel), header, nav, preview deploys |
| NH-11 | P0 | Project list from the KV API via NH-01, with a short server cache |
| NH-12 | P0 | Search by name. The empty result says why: names only, since the feed has no descriptions |
| NH-13 | P0 | Track filter chips with live counts |
| NH-14 | P0 | Sort by most upvoted and newest (by block height). "Most discussed" waits for NH-43 |
| NH-15 | P1 | "Live on near.social" sidebar from `GET api2.near.social/v1/hashtags/nearhunt` |
| NH-16 | P2 | "How it works on NEAR" and "Built for agents" cards |

### Board 2 — Project page · Days 1–3

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
| NH-30 | P0 | Wallet selector login. A function-call access key covers **one** receiver, so the login key targets `nearhunt.near` (votes, frequent) and near.social posts go through a wallet confirmation | **Meteor only** (MyNearWallet retired — NH-35). Login adds an FC key on `nearhunt.near` (`__fastdata_kv`) in one approval; logout revokes nothing on chain and clears local state |
| NH-31 | P0 | Upvote: write `{"vote/{id}": {}}` to `nearhunt.near`. The count updates instantly, is confirmed against the indexer, and rolls back on timeout. The receipt failure is expected and never retried | One account's vote counts once, however many times it votes |
| NH-32 | P0 | Remove an upvote: write `null` | Count drops; profile list updates |
| NH-33 | P0 | Tally: for each project, an exact-key query across writers, ignoring nulls and projects that don't exist; cached | Matches a manual KV query |
| NH-34 | P1 | After voting, a prefilled "Post to near.social" with `#nearhunt` and a link back | Post appears on near.social |
| NH-35 | P0 | **Spike first thing on Day 2:** do wallets accept a transaction to a receiver with no contract? If not, fall back to adding the function-call key at login | **Done 8 Nov** — yes: signed, broadcast, indexed; the receipt fails and the wallet only reports it afterwards. MyNearWallet is retired and removed. Decision + evidence: [`spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md`](spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md) |

### Board 2/6 — near.social discussion · Day 3

| ID | P | Item |
|---|---|---|
| NH-40 | P0 | Project posts from `nearhunt.near`, created by the server the first time someone opens a thread, plus a daily "spotlight" drip of at most 40. Never all 271 at once. The post reference is stored in `social_post` (NH-05) |
| NH-41 | P0 | Read the thread: `GET api2.near.social/v1/posts/nearhunt.near/{post_id}/replies` |
| NH-42 | P0 | Reply composer: `post/{ms}` with `reply_to`/`root`, plus the `reply/…` backlink in the same action; confirmed via `/v1/tx/{hash}` |
| NH-43 | P1 | Reply counts on cards; "Most discussed" sort |

### Board 3 — Account page · Day 3

| ID | P | Item |
|---|---|---|
| NH-50 | P1 | Profile header from `GET api2.near.social/v1/accounts/{id}` with an "Edit on near.social" link |
| NH-51 | P1 | My upvotes: `POST /v0/latest/nearhunt.near/{me}` with prefix `vote/` |
| NH-52 | P2 | My comments: the user's near.social posts filtered to NEAR Hunt threads |
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
| NH-90 | P0 | Rewrite the README to match what runs: live URL, 3-command local run, what is on chain where |
| NH-91 | P0 | README names Baby Shark, and Baby Shark's README names NEAR Hunt |
| NH-92 | P0 | Demo video or screenshots, plus an X post tagging `@NEARProtocol` `#NEARHackathon` |
| NH-93 | P0 | Final dry-run import; a human approves and applies any diff |
| NH-94 | P2 | "Support NEAR Hunt" link (footer and open data page) to a separate treasury account, labelled "supports the site, not any project" |

### After the hackathon

| ID | Item |
|---|---|
| NH-100 | Take the `project/` proposal to the near.social maintainers |
| NH-101 | Builder claim flow: builders publish their own `project/{slug}` on `social`; NEAR Hunt links it to the imported listing |
| NH-102 | Baby Shark "Fund this project" link (`external_campaigns`) |
| NH-103 | Optional near.social mirroring for every project, once there's a moderation story |
| NH-104 | Sponsored slot: one per page at most, labelled "Sponsored", never inside the ranked list and never affecting rank. Each placement is published as an on-chain record by NEAR Hunt (sponsor, dates, amount). No tracking scripts. Written sponsor policy first |

## Explicitly out of scope until after the 14th

AI scoring, Valkey, agent writes, funding links, claim flow, and any new mainnet key prefix
beyond `vote/` on `nearhunt.near` and standard near.social posts.

## Open decisions for the owner

1. **NH-06 keys, tonight.** Approve adding a `__fastdata_kv`-only function-call key for
   `nearhunt.near` (and one for `social`), then delete the full-access key file and the seed
   phrase from this machine. Until that happens, every write in this plan is signed by a key
   that can also drain the account.
2. **NH-93, the 4-key import.** Approve the diff shown above (`nearhunt.near`, 1 transaction,
   2051 bytes) so the directory can say 275/275 instead of 271/275.
3. **Hosting:** which Vercel account will serve nearhunt.xyz? (DNS points there on Day 1.)
4. **Treasury account** for NH-94: create one (e.g. `treasury.nearhunt.near`) with a key held by a human, not Hermes.
