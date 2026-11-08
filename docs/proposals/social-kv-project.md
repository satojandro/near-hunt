# Proposal: `project/` — projects as a near.social data object

**Status:** draft, not submitted · **Target:** `social-kv/1` (an additive key) · **Author:** NEAR Hunt

## Summary

Add one key to the near.social standard so that any account can publish a project it builds,
the same way it publishes a profile or a post:

```
project/{slug}  →  { "name": "...", "tagline": "...", ... }     written to `social` by the builder
```

The author is the `predecessor_id`, exactly as for posts. A project is referenced as
`{account_id}/{slug}`, the way a post is referenced as `{account_id}/{post_id}`.

## Why near.social needs this

- Builders already use near.social to talk about what they build, but there's nowhere to
  *point* at the thing itself. Profiles describe people and posts describe moments; nothing
  describes a project.
- Hackathon directories, grant programs, launch sites and agents each invent their own
  project record, and it disappears when the event ends. One shared record, owned by the
  builder, outlives all of them.
- It fits the standard's own growth rule (§2.6): add a key, ignore unknown fields, and use a
  new namespace for breaking changes. On 2026-11-08, `project/` held no data on `social`
  (checked through the public KV API).

## Proposed value (v1)

```json
{
  "name": "NEAR Hunt",
  "tagline": "Discovery and community voting for NEAR projects",
  "description": "Plain text, up to 5,000 characters.",
  "links": { "website": "https://…", "repo": "https://github.com/…", "demo": "https://…", "x": "nearhunt" },
  "tags": ["social", "open-data"],
  "logo": "fastfs://nearhunt.near/social/media/….webp",
  "team": ["alice.near", "bob.near"],
  "sources": [{ "event": "nearhackathon-2026", "submission_id": "21996773-…" }]
}
```

| Field | Rule |
|---|---|
| `slug` (in the key) | `^[a-z0-9][a-z0-9-]{0,63}$`, unique per author |
| `name` | required, 1–200 characters, plain text |
| `tagline` | ≤ 140 characters |
| `description` | ≤ 5,000 characters, plain text (§5 rules: mentions, hashtags, URLs) |
| `links.*` | same rules as `profile/links/{service}` |
| `tags` | ≤ 16 lowercase slugs |
| `logo` | a media URI (§4) |
| `team` | ≤ 32 account IDs. **Listed by the author, not verified.** v1 shows them as "listed by {author}". |
| `sources` | where else this project is listed. It lets directories link an imported listing to the builder's own record |

The usual rules apply: last write wins, `null` deletes, and an invalid latest value means the
project is absent.

## Optional, later

- **`post.project`**: an optional post field, `"project": "alice.near/near-hunt"`. Indexers
  could then derive a per-project feed (updates, launches, discussion) the way they derive
  hashtag feeds today.
- **Team confirmation edge**: `member/{account}/{slug}` → `{}`, written by a team member to
  confirm the author's `team` list. A two-way match marks the member as verified.

## How NEAR Hunt would use it

1. NEAR Hunt keeps importing hackathon listings into its own namespace
   (`nearhunt.near`, `nearhunt/project/1`). Those are *listings by NEAR Hunt*, not claims of
   ownership.
2. A builder publishes `project/{slug}` on `social` from their own account, with a `sources`
   entry pointing at the hackathon submission.
3. NEAR Hunt shows the builder's record as the authoritative description, and the listing gains
   a "claimed by alice.near" badge.
4. **Open question:** how do we prove that alice.near really built submission X? The hackathon
   feed has no NEAR accounts. Candidates: the builder adds their account to the demo post or
   the repo README, or the hackathon organisers publish an account mapping.

## What we will not do

- Write `project/` keys to `social` on behalf of other people. Records in the shared namespace
  must be authored by the people they describe; bulk imports stay in `nearhunt.near`.
  **Under review (8 Nov):** NEAR Hunt's roadmap now separates *submitting* a project (anyone,
  Product Hunt style) from *claiming* it (the makers). If the owner picks option (a) in
  `docs/PLAN.md` → Open decisions, this section changes to "the author is the submitter; makers
  confirm with `member/{author}/{slug}`", and bulk imports still stay in `nearhunt.near`.
- Ship this before the maintainers accept it. Until then the near.social indexer reports these
  keys as `ignored`, so nothing breaks, but nothing shows up in the app either.
