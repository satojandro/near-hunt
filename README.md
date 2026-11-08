# NEAR Hunt

**A human-first discovery and community voting layer for NEAR ecosystem projects.**

Built for the [NEAR Hackathon](https://nearhackathon.com) (1–14 Nov 2026), Open Innovation track.

NEAR Hunt turns a list of hackathon submissions into a browsable directory with a project
page, one-account-one-upvote, and threaded discussion — with every project record stored as
open, versioned JSON on NEAR itself, and a read-only API that lets AI agents discover
projects without browser automation.

> **Status: Phase 0 — architecture spike.** This repository currently contains the product
> spec and verified platform research. No application code yet; the storage decision is
> being proven before it is built on. See [`docs/research/`](docs/research/).

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
| Project records | FastData KV writes (`__fastdata_kv`) to a dedicated account | **verifying** |
| Reading records | `https://kv.main.fastnear.com` (public, no API key) | verified |
| Discussion + upvotes | near.social `social-kv/1` posts, replies and likes | verified standard, spike pending |
| Indexing | FastData indexer (no custom block scanning) | verified |
| Cache | Valkey, optional, never a source of truth | deferred |

Full detail, including the exact endpoints and the corrections this research forced on the
PRD's first draft: [`docs/research/2026-11-08-platform-findings.md`](docs/research/2026-11-08-platform-findings.md).

## Repository layout

```
docs/
  PRD.md                     product requirements (v0.2)
  research/                  verified platform findings, with evidence
```

Application code will appear once the Phase 0 spike passes (or the documented fallback is
chosen).

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
