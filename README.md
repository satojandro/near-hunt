# NEAR Hunt

**The Product Hunt of NEAR: a human-first discovery and community voting layer for NEAR
ecosystem projects.**

Built for the [NEAR Hackathon](https://nearhackathon.com) (1–14 Nov 2026), Open Innovation track.
Live at **https://nearhunt.xyz**.

[![CI](https://github.com/satojandro/near-hunt/actions/workflows/ci.yml/badge.svg)](https://github.com/satojandro/near-hunt/actions/workflows/ci.yml)

More than 800 projects shipped at this hackathon, and the only way to see them was a list of names
and links. So we built the thing we wanted ourselves, and people showed up: **109 NEAR accounts
have signed upvotes on chain from their own wallets**, builders are discussing each other's work in
the comments, and builders have filed twelve corrections to their own listings
([the correction issues](https://github.com/satojandro/near-hunt/issues?q=is%3Aissue+correction)).
This is not a demo waiting for users. Open https://nearhunt.xyz and look at who is voting. Every
figure is in [Status](#status-measured-13-nov-2026) with the command that reproduces it.

NEAR Hunt turns the hackathon's list of submissions into a browsable directory: a page per
project, one upvote per NEAR account, and threaded comments.

- **No smart contract.** Every project record, vote and comment is a plain key-value row on NEAR
  mainnet under `nearhunt.near`. Nothing to deploy, nothing to audit.
- **Your vote is yours.** The voter is whoever signed the row: one account, one vote, and nobody
  can vote or comment as you.
- **It feels like a normal app.** One wallet approval at login, then votes and comments sign with
  no pop-ups.
- **Fully open.** Read everything straight from mainnet without our server. If nearhunt.xyz
  vanished tomorrow, the community's votes would still be there.
- **Agent-ready.** A read-only JSON API and a [`SKILL.md`](public/SKILL.md) let an AI agent
  browse, shortlist and verify every record against the chain by itself.

## Status (measured 13 Nov 2026)

| What | Number | Reproduce |
|---|---|---|
| Project records on mainnet, written by `nearhunt.near` | 814 | `npm run validate:schema` |
| Projects listed on the site (one is on the [hide list](data/hidden-projects.json)) | 813 | `curl -s "https://nearhunt.xyz/api/projects?limit=1"` → `meta.total` |
| Records with the builder's own description / a repository / media | 766 / 444 / 733 | count the fields in `readProjects()` from [`lib/kv.mjs`](lib/kv.mjs) |
| Upvotes on chain, and the accounts that cast them | 152 rows (131 active, 21 removed), 109 accounts | `vote/` rows, see [Read the chain directly](#3-read-the-chain-directly-no-near-hunt-server-involved) |
| Comments on chain | 30 rows (28 active, 2 deleted), 20 accounts | `comment/` rows, same call |
| Unit tests | 388 pass | `npm test` |

These numbers move: the hackathon feed is still open and people are still voting.

Known gaps, so nobody finds them by surprise:

- `npm run validate:schema` currently reports **2 invalid records of 814**:
  `project/1ca01819-1a03-4a49-81d7-eb5755db0fea` and
  `project/fc122909-2cd5-4d03-ae5d-7df09aa93f1d` have an `http://` `demo_url` where the schema
  wants `https://`. They are the links as the builders submitted them. Correcting them is a
  mainnet write that waits for the owner's approval.
- `node scripts/import.mjs` (a dry run) shows 4 feed submissions not yet on chain. Imports are
  applied in approved batches, so the directory can trail the feed by a few records.
- The wallet checks in the [Day 3 checklist](docs/runbooks/day3-signing-checklist.md) (section C)
  are not ticked off. The vote and comment rows above were written by real accounts through the
  live site, but the checklist's wallet-by-wallet pass has not been done.
- One upvote per account is not sybil-proof: NEAR accounts are free to create. Votes are a
  community signal, not judging, and every voter is listed by account on the project page.

## Try it

### 1. On the live site

| Do | See |
|---|---|
| Open https://nearhunt.xyz | The directory: a count of projects, search, track filters, and one card per project |
| Click **Newest**, then **Most upvoted** | The projects reorder; most upvoted is the default |
| Scroll to the end of the list and click **Show 50 more** | Fifty more cards appear below, numbered on from 51 |
| Click a track pill, e.g. **DeFi**, or type in the search box | The list narrows; the URL carries the filter, so it can be shared |
| Click a project name | Its page: description, media from the builder's X post, links, the **On-chain record** card (account, key, block height), who upvoted, and the discussion |
| Click **View JSON** on that card | The raw record as read from mainnet |
| Click **Connect NEAR account**, pick a wallet, then click an upvote arrow | The count goes up by one, and your account appears under **Upvoted by**. The vote is a `vote/{project_id}` row you signed. Needs a mainnet NEAR account |
| Write a comment on a project page while connected | It appears in the discussion, as a `comment/{project_id}/{ms}` row you signed |
| Open https://nearhunt.xyz/open-data | The dataset card, the endpoints, and a sample record |

### 2. Through the API (no key, no wallet)

```bash
# Top projects by upvotes. See: {"items":[...],"next_cursor":...,"meta":{"total":813,...}}
curl -s "https://nearhunt.xyz/api/projects?sort=votes&limit=3"

# One project. See: its nearhunt/project/1 record plus block_height, votes and url
curl -s "https://nearhunt.xyz/api/projects/4b1d7196-ba55-494a-8ccb-3daf0087744e"

# Who upvoted a project. See: a list of account ids with the block of each vote
curl -s "https://nearhunt.xyz/api/projects/c1c7b574-850a-4f47-9af9-22a49339df07/votes"

# The guide an agent reads first. See: markdown describing every endpoint
curl -s "https://nearhunt.xyz/SKILL.md"
```

`sort` is `newest` (default), `votes`, `comments` or `name`; `limit` is 1–100. The full contract is in
[`public/SKILL.md`](public/SKILL.md) and [`docs/api-contract-day4.md`](docs/api-contract-day4.md).

### 3. Read the chain directly (no NEAR Hunt server involved)

```bash
# One project record. See: {"entries":[{"predecessor_id":"nearhunt.near","key":"project/4b1d…","value":{…}}]}
curl -s "https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/4b1d7196-ba55-494a-8ccb-3daf0087744e"

# Every vote row, from every voter. See: entries whose predecessor_id is the voter
curl -s -X POST "https://kv.main.fastnear.com/v0/latest/nearhunt.near" \
  -H 'content-type: application/json' -d '{"key_prefix":"vote/","limit":200}'
```

Change `vote/` to `comment/` for comments. More in [`schema/README.md`](schema/README.md).

### 4. Run it locally

Needs Node 20.9 or newer and network access (the app reads mainnet; it needs no keys and no
environment variables).

```bash
npm install
npm run dev               # open http://localhost:3000 and see the same directory as the live site
npm test                  # see: pass 388, fail 0
npm run typecheck         # see: no errors
npm run build             # see: the route table, ending with /wallet-manifest.json
npm run validate:schema   # see: every live record checked against the schema (2 invalid today, above)
node scripts/import.mjs   # see: a dry-run diff of the feed against the chain; it signs nothing
```

Writing to mainnet (`node scripts/import.mjs --execute --yes`) needs a key for `nearhunt.near` and
the owner's approval of the dry-run diff: see [`AGENTS.md`](AGENTS.md) and
[`docs/runbooks/keys.md`](docs/runbooks/keys.md). View counts and analytics are optional and off
unless the variables in [`.env.example`](.env.example) are set.

## Why

Hackathon submissions are public but hard to browse, compare or discuss, and they leak away when
the event ends. Two weeks of work by hundreds of builders deserves better than a list. NEAR Hunt
gives each project a permanent URL, a durable community signal, and a machine-readable record
that outlives the hackathon.

The hackathon ends on 14 Nov. NEAR Hunt doesn't: next is open submissions (NH-101 in
[`docs/PLAN.md`](docs/PLAN.md), not built yet), so any NEAR project can get a launch day and a
community to cheer it on.

## What it does (MVP)

- **Directory** — cards with name, the first lines of the builder's description, tracks, demo
  host, comment count and upvote count; most upvoted first, or newest or most discussed; filter by
  track; search. Fifty cards at a time, with a "Show 50 more" link.
- **Project page** — permanent URL, full description, source submission link, GitHub and demo
  links, upvote control, threaded discussion.
- **Voting and comments** — connect a NEAR account, one active upvote per account per project.
  Comments are `comment/{id}/{ms}` rows signed with the same login key; only the author can delete
  one. Anonymous browsing always works. Votes are community signals, never official judging.
- **Open data** — a versioned `nearhunt/project/1` JSON record per project, fetchable
  independently of the frontend.
- **Agent surface** — a documented read-only API plus a `SKILL.md` so an operator can tell an
  agent "read NEAR Hunt's skill and shortlist ten projects worth investigating."

Explicitly **not** in the MVP: AI scoring, crowdfunding, escrow, token rewards, agent write
access, and any custom smart contract.

## Architecture

The design goal is that project metadata lives on NEAR as plain key-value data, readable by
anyone, with no bespoke contract to deploy or audit.

| Concern | Choice | Status |
|---|---|---|
| Project records | FastData KV writes (`__fastdata_kv`) to `nearhunt.near` | **live on mainnet** |
| Upvotes | `vote/{project_id}` keys written by the voter, so one vote per account | live |
| Reading records | `https://kv.main.fastnear.com`, scoped to records written by `nearhunt.near` | verified |
| Discussion | `comment/{project_id}/{ms}` rows in `nearhunt.near`, written by the commenter, signed with the login key (NH-44) | live |
| Public read API | Next.js route handlers over the same readers, `{items, next_cursor}` | live |
| Indexing | FastData indexer (no custom block scanning) | verified |
| Smart contract | none — deliberately | proven unnecessary |
| Cache | Valkey, optional, never a source of truth | deferred |
| Web app | Next.js 16 app router at the repo root; reads through `lib/projects.ts` with a 60 s server cache | live at `nearhunt.xyz` |

No contract, no storage deposits, no custom indexer: the canonical record is the chain, and
the read API is a cache that anyone can rebuild.

Full detail, including the exact endpoints and the corrections this research forced on the
PRD's first draft: [`docs/research/2026-11-08-platform-findings.md`](docs/research/2026-11-08-platform-findings.md).

## Repository layout

```
AGENTS.md                    rules for AI agents (mainnet writes need a human)
.github/workflows/ci.yml     typecheck, unit tests and build on every push to main and every PR
docs/
  PLAN.md                    roadmap and ticketed backlog to 14 Nov
  PRD.md                     product requirements (v0.2)
  api-contract-day4.md       the public read API: envelope, routes, as-built choices
  agent-tests/               NH-63 runs: an agent given only the URL, output verbatim
  mockups/                   every page and flow, as images, HTML and source
  proposals/                 the near.social project/ proposal (after the hackathon)
  runbooks/keys.md           function-call keys for the importer
  runbooks/new-submissions.md  new projects → enriched records: the repeatable cycle
  phase-0-spike.md           the storage spike: what was executed and what it proved
  research/                  verified platform findings, with evidence
schema/
  nearhunt-project-1.schema.json   the canonical project record, JSON Schema 2020-12
  README.md                        how to read records from chain, and the rules
types/
  nearhunt.ts                TypeScript mirrors of the record and the KV envelope
app/                         Next.js 16 app router: directory (/) and project page (/p/[id])
  robots.txt, sitemap.ts      where crawlers may go, and every listed page (NH-116)
  api/projects/              read-only JSON API (NH-60): list, one, /votes, /discussion
  open-data/                 the open data page (NH-62): dataset card, endpoints, sample record
  components/                cards, search, sort and track controls, sidebar
public/SKILL.md              the agent guide served at /SKILL.md (NH-61)
lib/
  kv.mjs                     reads from the KV API, scoped to the writer; exact timestamps
  projects.ts                cached server read used by both pages
  listing.mjs                drops tombstones and malformed rows, adds chain provenance
  directory.mjs              search, track filter, sort and URL state
  api.mjs                    the read API's pure logic: params, cursors, sort, pagination, bodies
  votes.mjs                  vote rows: one active vote per writer, tallies, voters
  comments.mjs               comment rows: keys, validation, threading, hide list, write/confirm
  comments.ts                cached server reads for the discussion page and counts
  discussion.mjs             near.social post builders (NH-40 promotion), validated
  project-view.mjs           project-page helpers: safe links, record rows, metadata
  social.mjs                 the #nearhunt sidebar feed, validated and reduced to plain text
  import-plan.mjs            diff of feed vs chain: what the importer would write
  enrichment.mjs             builder's X post → description, repository, links, media (no AI)
  media.mjs                  images/video posters from the X post, validated for the Media card
  link-probe.mjs             visit a link once: verdict, HTTP status, title, og:image
  link-label.mjs             what a link is (demo, website, video, …) and why
  duplicates.mjs             submissions sharing a repo, X post or demo (flags only)
scripts/
  import.mjs                 hackathon feed → on-chain project records (dry run by default)
  capture-threads.mjs        the builder's own replies under a submitted post (read-only)
  enrich.mjs                 enrichment proposal, link checks, duplicate flags (read-only)
  feed-watch.mjs / .sh       scheduled check: one line when the feed has new projects
  validate-schema.mjs        every live record against the schema, plus key/id invariants
  render-mockups.mjs         regenerates docs/mockups images and pages
test/                        unit tests (npm test)
data/
  submissions-snapshot.json  the source feed as read on 2026-11-08, for provenance
```

## How it was built (AI disclosure)

Most of the code, tests and documentation in this repository was written by AI coding agents,
directed and reviewed by the project owner:

- **Claude Code** (Anthropic) wrote most of the application, libraries and tests. Its commits
  carry a `Co-Authored-By: Claude` trailer: `git log --grep "Co-Authored-By: Claude" --oneline`.
- **Hermes**, the owner's agent on the operator machine, merges branches, deploys, and runs the
  importer. Its work is committed under the owner's git identity.

The owner sets the scope ([`docs/PLAN.md`](docs/PLAN.md)), takes the product decisions recorded
there, and approves every mainnet write before it is signed. The rules the agents work under are
in [`AGENTS.md`](AGENTS.md): no mainnet transaction without a human approving the exact diff, and
no claim in the docs without the command that reproduces it.

Two things are deliberately **not** AI:

- Project descriptions, links and media are copied from the builder's own X post by fixed rules
  ([`lib/enrichment.mjs`](lib/enrichment.mjs)). No model writes or rewrites project content.
- Nothing is scored or ranked by AI. Order comes from upvotes, comments and block height.

The work was done between 8 and 14 Nov 2026, inside the hackathon window (`git log --reverse`).
Dependencies are listed in [`package.json`](package.json); the main ones are Next.js, React,
`near-api-js` and NEAR Connect.

## Related project — Baby Shark

NEAR Hunt and **Baby Shark** are separate repositories, products and hackathon submissions,
each independently useful and functional.

- **NEAR Hunt** owns discovery, project metadata, community voting and discussion.
- **Baby Shark** owns funding campaigns, escrow, milestones and disbursement authorization.

NEAR Hunt never custodies funds and never adjudicates milestones. A Baby Shark campaign may
later reference a NEAR Hunt project ID and be surfaced as a clearly-labelled *Fund This
Project* link that opens the campaign page — no shared backend required.

## License

MIT — see [LICENSE](LICENSE).
