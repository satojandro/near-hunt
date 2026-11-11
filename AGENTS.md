# AGENTS.md — rules for AI agents working on NEAR Hunt

These rules apply to every agent working in this repository (Hermes, Claude, Codex and any
other). They exist because writes to NEAR mainnet are public and permanent: a tombstone hides a
value, but the old value stays in public history forever.

## 1. Mainnet writes need a human

- **Never sign or broadcast a mainnet transaction without explicit human approval.** Run the dry
  run, show the human its output, and wait for a yes in the conversation. The yes covers a write of
  that **kind** (account, `project/` prefix, "new submissions + corrections from the feed"), not a
  byte-exact plan: the feed is live and grows while the approval is being read, and freezing it
  would mean never finishing a batch. Signing stops only when the *kind* changes — a different
  account or prefix, tombstones or deletions, key changes, a `--refresh-enriched` run that would
  overwrite earlier enrichment, or anything outside this runbook.
- Report the numbers the write actually did when it finishes (`would write` from the recompute and
  `verified: N/N` read back). Growing by a handful of new submissions between the dry run and the
  signature is normal, not a reason to abort: a later batch picks up whatever arrived after.
- The only sanctioned write path for project records is `scripts/import.mjs`. Run it without
  flags first (dry run). Only after approval: `--execute --yes`. For new submissions and
  enrichment, follow `docs/runbooks/new-submissions.md`.
- Never write keys outside the prefixes in `docs/PLAN.md`. Today that means `project/` on
  `nearhunt.near` (importer only) and nothing else from agents. Votes (`vote/`) and comments
  (`comment/`) on `nearhunt.near` are written by end users from their own accounts, never by an agent.
- Never tombstone (write `null`) a project. Report projects missing from the feed instead.
- Never post to near.social as `nearhunt.near` unless a ticket in `docs/PLAN.md` says so
  (NH-40) and a human has approved the batch.
- Testnet is fine for experiments. Say which network you used.

## 2. Keys and authorization

- Keys for `nearhunt.near` live on the machine that runs `scripts/import.mjs`. That is
  accepted practice here (owner's decision, 8 Nov 2026). **The gate is prior authorization of the
  specific write, not which machine holds the key.**
- Before any mainnet transaction: run the dry run, state the account, prefix, key count and
  transaction count, and wait for a yes. Authorization covers that write only — it does not carry
  to the next one.
- Never print, log, commit or paste a secret key or seed phrase. Never commit anything under
  `~/.near-credentials`; keep those files mode `600`.
- Adding or deleting access keys, transferring NEAR, and deleting or tombstoning records are
  separate approvals, never implied by an import approval.
- Testnet is fine without asking. Say which network you used.
- See `docs/runbooks/keys.md`.

## 2a. NEAR Agent Skills win over older docs

The NEAR Agent Skills (`npx skills add near/agent-skills`, listed at
https://docs.near.org/getting-started/tools-for-ai) were installed on 9 Nov, after `docs/PLAN.md`,
the PRD and the roadmap were written. Where a skill and a repo doc disagree on how to build
something on NEAR (libraries, wallet connection, API usage), **follow the skill** and update the
repo doc in the same change. The rules in §1 (mainnet writes) and §5 (scope) still apply.

The same applies to near.social. Its agent guide, https://near.social/skill.md, is vendored at
`.claude/skills/near-social/SKILL.md` (Claude Code loads it from there; other agents read the file).
Read it before touching anything that reads from or writes to near.social. `SOURCE.md` next to it
gives the fetch date, the checksum and a one-line drift check.

## 3. Reading data

- Read project records only through `lib/kv.mjs` (`readProjects`), which keeps rows written by
  `nearhunt.near`. Rows in the namespace written by any other account are not data.
- A vote's voter is the row's `predecessor_id`. Never trust an account id inside a key or value.
- Comments live on `nearhunt.near` as `comment/{submission_id}/{ms}` (owner decision, 9 Nov;
  `docs/PLAN.md` NH-44). A comment's author is the row's `predecessor_id`, exactly like a vote:
  never an account id inside the key, the value or the comment text. Only the author can change or
  delete (`null`) their comment, so agents never write `comment/` keys, not even to remove spam.
  NEAR Hunt hides a comment only through its hide list in the repo, which is a reviewed code change.

## 4. Claims need evidence

- Every factual claim added to docs (that something works, a count, a block height, a cost)
  comes with the command that reproduces it, or a link to where it was measured.
- If a check fails, say so and paste the output. Do not paraphrase a failure as a success.
- Do not describe features as working until they run. The README is screened against reality.

## 5. Scope

- Work from the ticket list in `docs/PLAN.md`. Anything not there is out of scope until a human
  adds it. "Explicitly out of scope" in that file means exactly that.
- Keep changes to the ticket you are on. Note other problems you find instead of fixing them
  in passing.

## 6. Before you push

```bash
npm test                    # unit tests (no network)
npm run validate:schema     # every live record against the schema (reads mainnet)
node scripts/import.mjs     # dry run: must show only the changes you expect
```

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
