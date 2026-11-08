# NEAR Hunt

**A human-first discovery and community voting layer for NEAR ecosystem projects.**

Built for the [NEAR Hackathon](https://nearhackathon.com) (1–14 Nov 2026), Open Innovation track.

NEAR Hunt turns a list of hackathon submissions into a browsable directory with a project
page, one-account-one-upvote, and threaded discussion — with every project record stored as
open, versioned JSON on NEAR itself, and a read-only API that lets AI agents discover
projects without browser automation.

> **Status: data layer live on mainnet.** All 271 NEAR Hackathon submissions are stored as
> `nearhunt/project/1` records under `nearhunt.near` — two transactions, no smart contract,
> verified readable 271/271 through the public FastData indexer. The web app is next.
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
  Anonymous browsing always works. Votes are community signals, never official judging.
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
| Project records | FastData KV writes (`__fastdata_kv`) to `nearhunt.near` | **live on mainnet** (271 records) |
| Upvotes | `vote/{project_id}` keys written by the voter, so one vote per account | designed, not built |
| Reading records | `https://kv.main.fastnear.com`, scoped to records written by `nearhunt.near` | verified |
| Discussion | near.social `social-kv/1` replies to one post per project | designed, not built |
| Indexing | FastData indexer (no custom block scanning) | verified |
| Smart contract | none — deliberately | proven unnecessary |
| Cache | Valkey, optional, never a source of truth | deferred |

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
  mockups/                   every page and flow, as images, HTML and source
  proposals/                 the near.social project/ proposal (after the hackathon)
  runbooks/keys.md           function-call keys for the importer
  phase-0-spike.md           the storage spike: what was executed and what it proved
  research/                  verified platform findings, with evidence
schema/
  nearhunt-project-1.schema.json   the canonical project record, JSON Schema 2020-12
  README.md                        how to read records from chain, and the rules
types/
  nearhunt.ts                TypeScript mirrors of the record and the KV envelope
lib/
  kv.mjs                     reads from the KV API, scoped to the writer
  import-plan.mjs            diff of feed vs chain: what the importer would write
scripts/
  import.mjs                 hackathon feed → on-chain project records (dry run by default)
  validate-schema.mjs        every live record against the schema, plus key/id invariants
  render-mockups.mjs         regenerates docs/mockups images and pages
test/                        unit tests (npm test)
data/
  submissions-snapshot.json  the source feed as read on 2026-11-08, for provenance
```

Run it:

```bash
npm install
npm test                                # unit tests, no network
node scripts/import.mjs                 # dry run: diff the feed against chain, writes nothing
node scripts/import.mjs --execute --yes # write the diff (needs a key; see docs/runbooks/keys.md)
npm run validate:schema                 # verify every record already on chain
```

The data layer is live; the web app (`web/`) is the next thing to be built against it.

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
