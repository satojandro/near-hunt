# NEAR Hunt — delivery plan and backlog to 14 Nov

**Updated:** 2026-11-08 · **Deadline:** 14 Nov 2026, 23:59 UTC · **Days left:** 6

Mockups for every page and flow referenced below (boards 1–9) are in [`mockups/`](mockups/README.md); the editable canvas is at
https://claude.ai/artifact/TheVd1qg4LzCRzStJvKPKe (private until shared).

## Where things stand (re-audited 2026-11-08 evening, by Hermes)

`nearhunt.near` has one funding transfer and ten project-import transactions:

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

**The chain matches the feed at write time.** 281 records on chain, all 281 valid against the
schema, 0 foreign rows, 0 tombstones; 265 carry the builder's own description and 98 a verified
repository. The 19-key correction was applied in tx `Bo5ktqRx…` — 18 descriptions that ended in a
dangling link label, plus the newest `AgentGuard` record — via `--refresh-enriched`. The feed has
since grown to **308**, so 27 records are pending a new approval (27 keys, 13,871 bytes, 1 tx).

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
| NH-43 | P1 | Comment counts on cards; "Most discussed" sort (counts from NH-44 rows). **Done with NH-44** — counts come from visible `comment/` rows (`countComments`), the tab is always shown, and a project with no comments sorts after every project that has one |
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
- The project has no git integration: deploys are `vercel --prod` from `main`. Node 26.x on Vercel
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
| NH-90 | P0 | Rewrite the README to match what runs: live URL, 3-command local run, what is on chain where |
| NH-91 | P0 | README names Baby Shark, and Baby Shark's README names NEAR Hunt |
| NH-92 | P0 | Demo video or screenshots, plus an X post tagging `@NEARProtocol` `#NEARHackathon` |
| NH-93 | P0 | Final dry-run import; a human approves and applies any diff | **Done 8 Nov** — 4 records applied in tx `8rX5McjBeiitsRAhQsY7sqWbTQ9nXXHBDYwCJyQuGhfk`, 4/4 verified against the indexer, schema 275/275 |
| NH-94 | P2 | "Support NEAR Hunt" link (footer and open data page) to a separate treasury account, labelled "supports the site, not any project" |

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

## Explicitly out of scope until after the 14th

AI scoring, Valkey and agent writes. Mainnet key prefixes are limited to `project/`, `vote/`,
`comment/` (NH-44) and `sponsor/` (NH-104) on `nearhunt.near`, plus standard near.social posts
(NH-40). `vote/` and `comment/` are written only by users from their own accounts. Submission and
`maker/` keys come after the MVP launch (NH-101, NH-105).

## Open decisions for the owner

Settled 9 Nov: comments on `nearhunt.near`, native additive `project/1`, submissions and claims after launch. Settled on 8 Nov: NEAR Connect for login (NH-30); NH-06 dropped; the NH-93 4-key import
applied; hosting and **DNS** are Hermes's — `nearhunt.xyz` was added to the `near-hunt` Vercel
project and points at it from Namecheap (apex `A 216.198.79.1` + `64.29.17.1`, `www` CNAME
`4b4d19b81c5a6949.vercel-dns-017.com`, 308 → apex); Vercel reports both domains
`configured_correctly` and the site serves over HTTPS. Still open:

1. **Treasury account** for NH-94: create one (e.g. `treasury.nearhunt.near`) with a key held by the owner, not Hermes. It never signs imports.
