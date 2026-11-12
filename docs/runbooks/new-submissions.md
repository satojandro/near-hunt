# Runbook: new submissions, enrichment and media

**Who runs this:** anyone can run steps 1–4, which are read-only and sign nothing. Step 5 (the
mainnet write) is run by whoever holds the importer key (today: Hermes), and only after the owner
has approved that exact dry run ([`AGENTS.md`](../../AGENTS.md) §1–2, [`keys.md`](keys.md)).

**What it does:** takes new projects from the hackathon feed and puts them on chain as
`project/{submission_id}` records on `nearhunt.near`, already filled in: the builder's own
description, a verified repository, their links (labelled and checked) and the images or video
posters from their X post. Existing records get only what they are missing.

**Rules that never change** (NH-95/NH-96 policy):

- Builder text is used **verbatim**. No model writes or rewrites anything.
- A repository is published only when `git ls-remote` answers. No repository is guessed from a name.
- Images are **referenced by URL** on `pbs.twimg.com`, never copied. A video is stored as its poster
  and plays in place through X's embed iframe, built from the post URL — no file in the record.
- A value a builder or the owner set is never overwritten. A record is never deleted (tombstoned);
  report it instead.
- Every value carries its source post in `enrichment.sources`.

## When to run it

When `npm run feed:check` prints a line, there is new work (it is silent when nothing is new).

Steps 2–5 are packaged as `scripts/enrich-cycle.mjs`, and **a Hermes cron job runs it every three
hours** (`near-hunt-enrich-cycle`, wrapper `~/.hermes/scripts/near-hunt-enrich.sh`). It stays silent
until a batch is ready to approve, then prints the dry-run numbers once. It is read-only: it never
signs, so a scheduled run can only ever produce numbers for the owner to approve. `npm run
feed:check` and the individual steps remain available for running by hand.

## The cycle

Run from the repository root on an up-to-date `main`, after `npm ci`.

### 1. See what is new (read-only)

```bash
npm run feed:check        # one line, e.g. "NEAR Hunt feed: 12 new project record(s) (chain 335, feed 347)"
```

### 2. Capture the builders' reply threads (read-only)

```bash
npm run threads:capture   # = node scripts/capture-threads.mjs --gaps-only --include-pending
```

The syndication endpoint walks a thread **up** (parents), never down, and builders put the
repository in their first reply ("Code: github.com/…") far more often than in the submitted post —
and their screenshots and demo videos in the replies after it. This step reads the server-rendered
status page for every record missing a repository **or** a media set (plus every feed submission
not on chain yet, since the import will create it), keeps the author's own replies (never a
stranger's) with their media, and stores them with post ids and expanded URLs in
`data/enrichment/threads.json`. Raw pages are cached under `data/enrichment/x-threads/`
(git-ignored) and fetched with an honest user agent at ~3 requests/second. A capture is reused for
`--max-age-days 7` (and a capture that found no author reply is stored too, so a scheduled run does
not re-crawl it); `--refresh` re-crawls now.

### 3. Build the proposal (read-only)

```bash
npm run enrich            # = node scripts/enrich.mjs --threads data/enrichment/threads.json
```

Writes `data/enrichment/proposal.json`, covering every record on chain **and** every feed
submission not on chain yet, so new projects are created already enriched (one approval, not two).
It also:

- fetches each submitted X post and its parent chain (cached in `data/enrichment/x-posts/`, which
  git ignores);
- runs `git ls-remote` on every repository and drops the ones that do not answer;
- reuses link checks from `data/enrichment/links.json` and visits only new URLs;
- prints a summary: `with description`, `with repository`, `with media`, `by status`.

`threads.json` holds thread replies captured in a browser for a few older projects; new projects do
not need an entry.

### 4. Check links and duplicates (read-only)

```bash
npm run enrich:links       # data/enrichment/links.json: verdict, HTTP status, title, og:image per link
npm run enrich:duplicates  # data/enrichment/duplicates.json: submissions sharing a repo, X post or demo
```

Read both before asking for approval:

- **links.json:** `verdict` is `live`, `gone` (404/410 or no such host) or `unverified` (crawler
  blocked, rate limited, 5xx, timeout). Only `gone` means broken. Never report `unverified` as dead.
  Broken links stay on the record and the page marks them.
- **duplicates.json:** `clusters` share an identifying URL and are possible duplicates. Flag them to
  the owner; never merge or delete. `weak_signals` (same name, same X account) are usually different
  projects and are listed for information only.
- Look out for spam (e.g. a gambling referral link) and tell the owner. Hiding a record is the
  owner's decision.

### 5. Dry run the import (read-only)

```bash
node scripts/import.mjs --enrichment data/enrichment/proposal.json
```

It prints `new`, `changed`, `unchanged`, then
`would write: N keys, B bytes, T transaction(s)` and `DRY RUN — nothing signed`.

Check it before asking:

- `new` should equal the feed check's count. `changed` should be explainable (a record gaining
  `media` or `links` it lacked).
- `missing from feed` and `deleted on chain` are reported only; nothing is deleted.
- Variants, only when the owner asks for them:
  - `--updates-only` leaves new records out (approve them separately).
  - `--refresh-enriched` lets the run correct fields an earlier enrichment run set (e.g. a link
    label fix). It never touches a value without enrichment provenance.

**Ask the owner** with: account `nearhunt.near`, prefix `project/`, the key count, bytes and
transaction count from the dry run, and what changes (new records, which fields). Wait for an
explicit yes. The yes covers this kind of write — new submissions plus corrections, on that
account and prefix — not a byte-exact plan: the feed is live and keeps growing while the owner
reads, and stopping every time it does means a batch never lands. Report the numbers the write
actually did afterwards.

### 6. Write (needs the key and the approval)

Re-run the **same** command with `--execute --yes`:

```bash
node scripts/import.mjs --enrichment data/enrichment/proposal.json --execute --yes
```

- The importer recomputes the diff first, so a submission that arrived after the dry run is
  included. That is expected and does **not** need a new approval — a later batch picks up what
  came after this one. Stop only if the *kind* of write changed: a different account or prefix, a
  deletion or tombstone, a key change, or an enrichment overwrite of values an earlier run set.

- It refuses a full-access key unless told otherwise; see [`keys.md`](keys.md) before using any
  override.
- Each transaction's receipt fails with `CodeDoesNotExist`. That is expected (no contract on
  `nearhunt.near`); never retry on it. The importer then reads every written key back from the
  indexer and prints `verified: N/N written keys read back`.

### 7. Verify and record

```bash
npm run validate:schema   # every live record against the schema
node scripts/import.mjs --enrichment data/enrichment/proposal.json   # should now show 0 new, 0 changed
```

Commit `data/enrichment/proposal.json`, `links.json` and `duplicates.json` with a message giving
the transaction hashes, and add one line to "Where things stand" in [`docs/PLAN.md`](../PLAN.md):
date, key count, tx hashes, who approved.

The site needs no deploy for data: pages read the chain through a ~60 s cache (`PROJECTS_REVALIDATE_SECONDS` in `lib/projects.ts`). It needs a
deploy only when code changes (`vercel --prod` from `main`, Hermes).

## What the page shows from each field

| Field | Where it shows on `/p/{id}` |
|---|---|
| `description` | About card (verbatim builder text) |
| `media` | Media card (photos inline, videos as a poster that opens the post on X) and the share preview image |
| `repository_url` | Links card, "Repository" |
| `demo_url` | Links card, "Launch post on X" when it is an X post, else "Demo" |
| `links[].kind` | Links card label (Demo, Website, Video, Docs, Article, On-chain, Community, Repository) |
| `links[].check` | A `gone` link gets "Did not answer when checked on …" |

Field definitions: [`schema/README.md`](../../schema/README.md). Agent-facing summary:
[`public/SKILL.md`](../../public/SKILL.md).

## Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| `post-unavailable` in the enrich summary | X post deleted or private | Nothing; the record keeps feed fields only |
| `not-an-x-post` | `demo_url` is not on X | Nothing to enrich from; its link is still checked |
| Many `unverified` links | Rate limiting from this IP | Re-run `npm run enrich:links` later; do not mark them dead |
| A repository disappears between runs | `git ls-remote` stopped answering | Normal; it is dropped from the proposal, never from a record that already has it |
| Dry run shows `changed` you cannot explain | Something unexpected in the proposal | Stop; diff the proposal against chain before asking for approval |
| An image stops loading on a page | The builder deleted the X post | The card shows a broken image; the record is unchanged |

## Scripts at a glance

| Command | Reads | Writes | Signs |
|---|---|---|---|
| `npm run feed:check` | feed, chain | stdout | no |
| `node scripts/enrich-cycle.mjs` | feed, chain, X, git hosts, link sites | `data/enrichment/*.json` | no |
| `npm run threads:capture` | chain, feed, X status pages, X syndication | `data/enrichment/threads.json` | no |
| `npm run enrich` | chain, feed, X, git hosts, link sites | `data/enrichment/proposal.json` | no |
| `npm run enrich:links` | chain, link sites | `data/enrichment/links.json` | no |
| `npm run enrich:duplicates` | chain, proposal, feed | `data/enrichment/duplicates.json` | no |
| `node scripts/import.mjs [--enrichment …]` | feed, chain, proposal | stdout | no (dry run) |
| `… --execute --yes` | same | **mainnet** | **yes: approval first** |
| `npm run validate:schema` | chain | stdout | no |
