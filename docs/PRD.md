# NEAR Hunt — Product Requirements Document

**Status:** Draft v0.2 · **Date:** 8 November 2026 · **Phase:** Hackathon MVP

## 1. Product summary
NEAR Hunt is an open discovery and community engagement layer designed to integrate with independent funding, governance, analytics, and other builder services. It is a human-first discovery and community voting platform for NEAR ecosystem projects, launching with public submissions from the current NEAR Hackathon. It presents projects in a Product Hunt / Hacker News-style directory while reusing NEAR Social's shared social infrastructure where technically supported. A documented read-only API and agent skill make project discovery accessible to AI agents without making agent participation a prerequisite for launch.

## 2. Problem and opportunity
Hackathon submissions are publicly accessible but difficult to browse, compare, discuss and surface through community recommendations. NEAR Hunt creates a single browsable directory and community layer, with open project metadata and portable engagement as its architectural goal.

## 3. Goals and non-goals
**MVP goals:** import public submissions; offer fast browsing, filtering and project pages; enable one upvote per authenticated user and project discussions; expose stable project URLs and machine-readable records; validate NEAR Social / FastData integration before broad rollout.

**Non-goals for MVP:** AI-generated scoring or automated reviews, built-in crowdfunding, escrow, milestone verification, financial incentives, token rewards, official judging, advanced reputation, agent write access, a custom smart contract, and a generalized ecosystem-wide project submission workflow.

## 4. Target users
- **Explorer / voter:** finds interesting projects and upvotes or comments.
- **Builder:** shares a canonical project page and receives feedback.
- **Curator:** filters and sorts submissions to discover promising work.
- **Agent operator (secondary):** points an agent at a public skill file and read-only project API.

## 5. MVP user experience
**Directory:** project cards with name, short description, track, links, upvote count and optional thumbnail; sort by newest and most upvoted; filter by track; search by name and description.

**Project detail:** permanent URL; description; source hackathon listing; GitHub and demo links; category/track; upvote control and count; threaded discussion; share link.

**Authentication:** connect a NEAR account before voting or commenting. Anonymous users can browse. Make transaction signing and any fees explicit in the UI.

**Social behavior:** one active upvote per NEAR account per project; users can remove an upvote if supported by the chosen social primitive; comments appear with author identity and timestamp. Votes are community signals, not official hackathon judging.

**Accessibility:** mobile-friendly, keyboard-accessible, fast-loading, with clear empty, error and pending-transaction states.

## 6. Data architecture (proposed; requires proof of concept)
### 6.1 Canonical project object
Define an open, versioned schema such as `nearhunt/project/1`. Example:

```json
{
  "schema": "nearhunt/project/1",
  "id": "nearhackathon-2026:submission-257",
  "source": {
    "event": "nearhackathon-2026",
    "submission_id": "257",
    "url": "https://nearhackathon.com/"
  },
  "name": "Example Project",
  "description": "Example description",
  "track": "AI Agents",
  "repository_url": "https://github.com/example/project",
  "demo_url": "https://example.com",
  "social_post_ref": null,
  "external_campaigns": [],
  "updated_at": "2026-11-08T00:00:00Z"
}
```

*Illustrative data only; identifiers and URL fields must be populated from actual submissions.*

### 6.2 Proposed storage responsibilities
- **FastData KV:** candidate canonical store for structured project records, subject to verifying custom-key writes, retrieval, access control, discoverability and durability.
- **NEAR Social (`social-kv/1`):** candidate source of truth for project-post likes and replies. Each project maps to one canonical social post if tests confirm compatible semantics.
- **Read/index service:** maintains project listing, search and aggregated vote counts. Could be a lightweight index backed by FastData queries; a conventional database is a fallback if cross-record discovery or queries prove insufficient.
- **Valkey:** optional cache for hot rankings and project views, not a durable source of truth.
- **FastNEAR indexing:** use existing indexed APIs where possible; do not scan all blocks or introduce custom event processing without need.

### 6.3 Key relationships
`Hackathon → Submission → Project → Social post → Likes / Replies`

Projects are distinct from social posts. Social posts provide engagement, while versioned project objects provide structured metadata. Preserve the source submission ID for idempotent imports. Decide whether the importer or original builder controls metadata updates; document provenance and moderation rules.

### 6.4 Important open technical questions
1. Do custom FastData keys work reliably through the intended write path, and what are the real permissions, costs and limits?
2. Can external clients create posts, likes and replies with stable identifiers and retrieve them efficiently?
3. Do project posts appear in the general NEAR Social feed? Can they be scoped or tagged without unwanted feed flooding?
4. Can likes be used safely as upvotes (uniqueness, unlike, ordering, spam prevention)?
5. How will all project records be discovered and indexed without relying on one opaque central registry?
6. What are the operational guarantees for reindexing, deletion, editing and source synchronization?

**Do not treat these integrations as verified until the proof of concept passes.**

## 7. Submission ingestion
- Import public project metadata from the hackathon directory using a documented feed/API if available; otherwise implement a respectful importer subject to site terms.
- Deduplicate by source event and submission ID.
- Preserve original links and attribution; show last synced time.
- Handle updates, removals and invalid URLs gracefully.
- Do not publish hundreds of social posts until feed behavior and rate limits are tested.

## 8. Agent compatibility — read-only MVP
Publish a stable, documented API, for example:

- `GET /api/projects?track=&sort=&cursor=`
- `GET /api/projects/{id}`
- `GET /api/projects/{id}/discussion` (if public data is available)

Publish `SKILL.md` describing purpose, endpoints, pagination, data provenance, rate limits and how to cite source links. Optionally add `agents.md` for discovery. An operator should be able to tell Hermes: “Read NEAR Hunt's skill and shortlist ten projects worth investigating.” Agents can read and analyze; agent-authored reviews and votes are deferred.

## 9. Functional requirements and acceptance criteria
| Priority | Requirement | Acceptance criterion |
|---|---|---|
| P0 | Import submissions | Re-running import updates records without duplicates. |
| P0 | Directory | Visitors can browse, search, filter by track and sort by newest/upvotes. |
| P0 | Project page | Every imported project has a stable URL and working source links where available. |
| P0 | NEAR identity | Anonymous browsing works; authenticated users can attempt social actions with explicit signing. |
| P0 | Upvotes | Duplicate active upvotes from one account do not increase the count. |
| P0 | Comments | Authenticated users can post and view project-linked discussion. |
| P0 | Social integration | One project, one post, one like and one reply can be written and read back. |
| P1 | Open project schema | Versioned JSON object can be fetched independently of the frontend. |
| P1 | Agent API / skill | A third-party agent can list and inspect projects without browser automation. |
| P1 | Caching | Rankings and pages remain responsive under expected launch traffic. |

## 10. Delivery plan
**Phase 0 — Architecture spike (first):** verify a custom project record, canonical social post, like and reply end-to-end; measure write cost, latency, limits and feed visibility. Record a go/no-go decision for FastData as canonical storage.

**Phase 1 — Human MVP:** import projects; launch responsive directory and detail pages; integrate NEAR login, upvotes and comments; add basic moderation and abuse controls.

**Phase 2 — Open data and agents:** publish project schema, read-only API and `SKILL.md`; test with Hermes and one other agent; publish integration examples.

**Phase 3 — Later:** allow builder claims and edits, broader ecosystem submissions, agent reviews and optional agent identities. Keep human votes and agent opinions visibly separate.

## 11. Ecosystem integrations — Baby Shark
NEAR Hunt and Baby Shark remain **separate repositories, products, and hackathon submissions**, each independently useful. NEAR Hunt owns project discovery, metadata, community voting, and discussion. Baby Shark owns funding campaigns, escrow, milestone definitions, AI-assisted milestone assessments, and disbursement authorization. NEAR Hunt must never custody funds or adjudicate milestones.

**Shared identity:** A Baby Shark campaign may reference the canonical `nearhunt/project/1` project ID, while retaining its own campaign ID. Use a simple external campaign URL for the first integration; no shared backend or synchronous dependency is required. External URLs must be validated and clearly labeled.

**Phase 1.5 — External funding link (optional, after human MVP):** Add an optional `external_campaigns` mapping or equivalent project metadata field and show a **Fund This Project** link only for verified, explicitly associated Baby Shark campaigns. The link opens the corresponding Baby Shark campaign; no funds move through NEAR Hunt. If campaign verification is not ready, omit the button rather than link to an untrusted destination.

**Post-MVP:** Optionally display funding totals and milestone status from Baby Shark's public API or verifiable records, with provenance and freshness indicators. These are not requirements for launch.

**Hackathon positioning:** Each repository must demonstrate standalone functionality; disclose related submissions, reused components, and cross-project integration as required by the official rules. Eligibility for separate prizes is subject to organizer confirmation.

## 12. Metrics
- Imported projects and sync completeness.
- Unique human visitors and project-detail views.
- Connected accounts; distinct voters; votes per project.
- Comments and project share/referral traffic.
- Median page load and API latency; indexing freshness.
- Number of external API/skill consumers (later).

## 13. Risks and mitigations
- **Unknown FastData / social API behavior:** run spike before implementing the whole product; maintain storage adapter interfaces.
- **Spam and vote manipulation:** one-account-one-vote enforcement, rate limits, basic moderation, transparent community ranking.
- **Feed pollution:** test with one project and seek app-specific tagging or a separate publication strategy.
- **Centralized import/index:** publish provenance and schema; keep index rebuildable from open records where possible.
- **Project ownership and edits:** separate importer provenance from builder ownership; introduce a verified claim flow later.
- **Hackathon timeline:** prioritize human discovery and social actions; defer agent write features and advanced scoring.

## 14. Immediate next decision
Build a four-operation integration proof of concept: **write project JSON → create social post → like → reply**, then read each record back independently. If that works, commit to the open-data architecture. If it does not, use a small conventional metadata store while retaining NEAR Social for whichever interactions are confirmed supported.


## 15. Technical references and verification
- [NEAR Social documentation](https://near.social/docs) — social data model and client integration; verify current write APIs and limitations in Phase 0.
- [NEAR Social](https://near.social/) — live reference client.
- [FastNEAR](https://fastnear.com/) — infrastructure starting point; locate and pin the specific FastData KV API documentation before implementation.
- [NEAR Hackathon](https://nearhackathon.com/) — submission directory and official rules; recheck requirements and deadlines before submitting.

**Documentation gate:** Hermes should record exact API endpoint URLs, authentication/signing requirements, example payloads, response formats, indexing behavior, and tested repository commit/version. Prior discussion of custom FastData keys and social-kv semantics is a hypothesis until reproduced in Phase 0; these links alone do not verify it.
