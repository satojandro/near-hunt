# AGENTS.md — rules for AI agents working on NEAR Hunt

These rules apply to every agent working in this repository (Hermes, Claude, Codex and any
other). They exist because writes to NEAR mainnet are public and permanent: a tombstone hides a
value, but the old value stays in public history forever.

## 1. Mainnet writes need a human

- **Never sign or broadcast a mainnet transaction without explicit human approval of the exact
  diff.** Run the dry run, show the human its output, and wait for a yes in the conversation.
- The only sanctioned write path for project records is `scripts/import.mjs`. Run it without
  flags first (dry run). Only after approval: `--execute --yes`.
- Never write keys outside the prefixes in `docs/PLAN.md`. Today that means `project/` on
  `nearhunt.near` (importer only) and nothing else from agents. Votes and comments are written
  by end users from their own accounts, never by an agent.
- Never tombstone (write `null`) a project. Report projects missing from the feed instead.
- Never post to near.social as `nearhunt.near` unless a ticket in `docs/PLAN.md` says so
  (NH-40) and a human has approved the batch.
- Testnet is fine for experiments. Say which network you used.

## 2. Keys

**Owner decision, 9 Nov:** NH-06 is dropped and key custody is handled by the owner with Hermes.
Keys may live on the Mac Mini (`Claudios-Mac-mini`). This replaces the earlier "agent machine
holds none" rule; `docs/runbooks/keys.md` is kept for reference only.

- Holding a key never replaces §1: no mainnet transaction without a human's approval of the
  exact dry-run diff.
- Cloud or ad-hoc agent sessions (anything other than the Mac Mini) hold no key. Their job is the
  dry run: produce the exact diff, show it, and hand the decision to the owner.
- Never ask for, read, print, log or commit a full-access key, a seed phrase or any secret key.
  Never commit anything under `~/.near-credentials`.

## 2a. NEAR Agent Skills win over older docs

The NEAR Agent Skills (`npx skills add near/agent-skills`, listed at
https://docs.near.org/getting-started/tools-for-ai) were installed on 9 Nov, after `docs/PLAN.md`,
the PRD and the roadmap were written. Where a skill and a repo doc disagree on how to build
something on NEAR (libraries, wallet connection, API usage), **follow the skill** and update the
repo doc in the same change. The rules in §1 (mainnet writes) and §5 (scope) still apply.

## 3. Reading data

- Read project records only through `lib/kv.mjs` (`readProjects`), which keeps rows written by
  `nearhunt.near`. Rows in the namespace written by any other account are not data.
- A vote's voter is the row's `predecessor_id`. Never trust an account id inside a key or value.

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
