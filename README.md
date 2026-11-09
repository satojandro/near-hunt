# NEAR Hunt

**A human-first discovery and community voting layer for NEAR ecosystem projects.**

Built for the [NEAR Hackathon](https://nearhackathon.com) (1–14 Nov 2026), Open Innovation track.

NEAR Hunt turns a list of hackathon submissions into a browsable directory with a project
page, one-account-one-upvote, and threaded discussion — with every project record stored as
open, versioned JSON on NEAR itself, and a read-only API that lets AI agents discover
projects without browser automation.

> **Status: data layer live on mainnet; read-only web app deployed.** All 281 NEAR Hackathon
> submissions are stored as `nearhunt/project/1` records under `nearhunt.near` — ten import
> transactions plus the funding transfer, no smart contract, verified readable 281/281 through the
> public FastData indexer. 265 records now carry the builder's own description and 98 a verified
> repository, filled by a separate approval-gated enrichment pass. `nearhunt.near` also has a
> near.social profile that discloses the account is automated. The directory, project pages and
> connect/upvote flow are live at **https://nearhunt.xyz**. Comments moved from near.social replies
> to rows on `nearhunt.near` (NH-44): built and verified against `nearhunt.testnet`, **not yet
> deployed**. The account page, the indexer-outage states and the 390 px pass are merged and
> **deployed** (8 Nov); the
> [Day 3 signing and wallet checks](docs/runbooks/day3-signing-checklist.md) are still pending.
> Day 4 — the read-only JSON API (`/api/projects…`), `/SKILL.md` for agents and the `/open-data`
> page — is merged to `main` (PR #6) and **deployed** (8 Nov).
> See [`docs/phase-0-spike.md`](docs/phase-0-spike.md) and [`schema/`](schema/).

---

## Why

Hackathon submissions are public but hard to browse, compare or discuss. They leak away when
the event ends. NEAR Hunt gives each project a permanent URL, a durable community signal, and
a machine-readable record that outlives the hackathon.

## What it does (MVP)

- **Directory** — cards with name, description, tracks, links, upvote count; sort by newest
  or most upvoted; filter by track; search.
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
| Project records | FastData KV writes (`__fastdata_kv`) to `nearhunt.near` | **live on mainnet** (281 records) |
| Upvotes | `vote/{project_id}` keys written by the voter, so one vote per account | live (Day 2) |
| Reading records | `https://kv.main.fastnear.com`, scoped to records written by `nearhunt.near` | verified |
| Discussion | `comment/{project_id}/{ms}` rows in `nearhunt.near`, written by the commenter, signed with the login key (NH-44) | built, testnet-verified; not yet deployed |
| Public read API | Next.js route handlers over the same readers, `{items, next_cursor}` | live (Day 4, PR #6) |
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
  enrich.mjs                 enrichment proposal, link checks, duplicate flags (read-only)
  feed-watch.mjs / .sh       scheduled check: one line when the feed has new projects
  validate-schema.mjs        every live record against the schema, plus key/id invariants
  render-mockups.mjs         regenerates docs/mockups images and pages
test/                        unit tests (npm test)
data/
  submissions-snapshot.json  the source feed as read on 2026-11-08, for provenance
```

Run it:

```bash
npm install
npm run dev                             # http://localhost:3000
npm test                                # unit tests, no network
node scripts/import.mjs                 # dry run: diff the feed against chain; signs nothing
node scripts/import.mjs --execute --yes # write the diff (needs a key; see docs/runbooks/keys.md)
# New submissions, descriptions, media and links: docs/runbooks/new-submissions.md
npm run validate:schema                 # verify every record already on chain
```

The data layer and the read-only pages are live: **https://nearhunt.xyz** serves the directory and
project pages from mainnet records (apex `A 216.198.79.1` + `64.29.17.1`, `www` CNAME
`4b4d19b81c5a6949.vercel-dns-017.com` → 308 to the apex at Namecheap, verified by Vercel 8 Nov).
`https://near-hunt.vercel.app` is the same deployment and still answers. The old placeholder is
gone (its source stays in history at `4e0b5af`).

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
