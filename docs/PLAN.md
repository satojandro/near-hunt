# NEAR Hunt — delivery plan and backlog to 14 Nov

**Updated:** 2026-11-08 · **Deadline:** 14 Nov 2026, 23:59 UTC · **Days left:** 6

Mockups for every page and flow referenced below (boards 1–9) are in [`mockups/`](mockups/README.md); the editable canvas is at
https://claude.ai/artifact/TheVd1qg4LzCRzStJvKPKe (private until shared).

## Where things stand (audited 2026-11-08)

`nearhunt.near` has exactly three transactions:

1. a 1 NEAR funding transfer (block 223,583,069);
2. 256 `project/…` records (block 223,583,277);
3. 15 `project/…` records (block 223,583,288).

The 271 records match the source snapshot and the live feed, and 271/271 validate against
the schema. **Nothing on chain needs undoing.** What's missing is the product itself, plus the
guardrails listed under Day 0.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where projects live | `nearhunt.near`, `project/{submission_id}` | Structured records. near.social ignores keys it doesn't recognise. |
| Where upvotes live | `nearhunt.near`, key `vote/{submission_id}`; the voter is the writer (`predecessor_id`) | The indexer keeps one row per writer per key, so one account gets one vote and nobody can vote as someone else. This replaces `vote/{id}/{voter}`. |
| Where comments live | **near.social**: replies to one post per project by `nearhunt.near` | They show up in feeds and notifications and grow near.social activity. This reverses the earlier "own namespace" recommendation. |
| Identity | near.social profiles (name, avatar, about) | People arrive with an identity they already have. |
| Projects as a near.social data object | **Out of hackathon scope** (owner agreed 8 Nov). The draft proposal stays in the repo; no `project/` writes to `social` before 14 Nov | See [`proposals/social-kv-project.md`](proposals/social-kv-project.md). |

## Roadmap at a glance

| Day | Theme | Boards |
|---|---|---|
| 0 (8 Nov) | Guardrails and schema fixes | — |
| 1 (9 Nov) | Directory and project page, read-only | 1, 2, 5 |
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

| ID | P | Item | Done when |
|---|---|---|---|
| NH-01 | P0 | One `readProjects()` helper that reads `/v0/latest/nearhunt.near/nearhunt.near`; used in the importer, the validator, the app and the API | Rows written by other accounts never appear as projects; the validator lists them as warnings |
| NH-02 | P0 | Importer diffs against chain: writes only new or changed keys, keeps `updated_at` when the content is unchanged, requires `--execute --yes`, never tombstones | A re-run with no changes sends 0 transactions |
| NH-03 | P0 | `AGENTS.md`: no mainnet transaction without a dry-run diff a human has approved; every docs claim comes with the command that proves it | File committed |
| NH-04 | P1 | Fix the docs drift (README table, spike "account undecided", the duplicated paragraph in the research doc) | Docs match the chain |
| NH-05 | P1 | Schema touch-ups: real `$id`; optional `social_post` field (the project's near.social post reference); document that `source.url` is the generic listing; written specs for the `vote/` and near.social comment conventions | `npm run validate:schema` still passes on 271/271 |
| NH-06 | P0 | Hermes and the server get a function-call key limited to `__fastdata_kv` (one key for `nearhunt.near`, one for `social`); the full-access key stays with a human | Keys added; full-access key removed from the agent |

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
| NH-30 | P0 | Wallet selector login. A function-call access key covers **one** receiver, so the login key targets `nearhunt.near` (votes, frequent) and near.social posts go through a wallet confirmation | Login and logout work in Meteor and MyNearWallet |
| NH-31 | P0 | Upvote: write `{"vote/{id}": {}}` to `nearhunt.near`. The count updates instantly, is confirmed against the indexer, and rolls back on timeout. The "wallet will say failed" warning is shown | One account's vote counts once, however many times it votes |
| NH-32 | P0 | Remove an upvote: write `null` | Count drops; profile list updates |
| NH-33 | P0 | Tally: for each project, an exact-key query across writers, ignoring nulls and projects that don't exist; cached | Matches a manual KV query |
| NH-34 | P1 | After voting, a prefilled "Post to near.social" with `#nearhunt` and a link back | Post appears on near.social |
| NH-35 | P0 | **Spike first thing on Day 2:** do wallets accept a transaction to a receiver with no contract? If not, fall back to adding the function-call key at login | Decision recorded |

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

### After the hackathon

| ID | Item |
|---|---|
| NH-100 | Take the `project/` proposal to the near.social maintainers |
| NH-101 | Builder claim flow: builders publish their own `project/{slug}` on `social`; NEAR Hunt links it to the imported listing |
| NH-102 | Baby Shark "Fund this project" link (`external_campaigns`) |
| NH-103 | Optional near.social mirroring for every project, once there's a moderation story |

## Explicitly out of scope until after the 14th

AI scoring, Valkey, agent writes, funding links, claim flow, and any new mainnet key prefix
beyond `vote/` on `nearhunt.near` and standard near.social posts.

## Open decisions for the owner

1. **Hosting:** which Vercel account or domain? (This blocks NH-05's `$id` and the SKILL.md URL.)
