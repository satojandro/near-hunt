# NEAR Hunt — delivery plan to 14 Nov

**Written:** 2026-11-08 · **Deadline:** 14 Nov 2026, 23:59 UTC · **Days left:** 6

## Where things actually stand (audited 2026-11-08)

What is on chain for `nearhunt.near`, from nearblocks and the FastData indexer:

| Tx | Block | What |
|---|---|---|
| transfer from `misfits-validator.near` | 223,583,069 | 1 NEAR to fund the account |
| `__fastdata_kv` | 223,583,277 | 256 `project/…` records |
| `__fastdata_kv` | 223,583,288 | 15 `project/…` records |

- Those are the only 3 transactions. There are no near.social posts, no votes, and no other
  key prefixes.
- The 271 records match `data/submissions-snapshot.json` and the live feed one to one
  (total still 271), and they all validate against the schema.
- **Nothing on chain needs to be undone.** The data layer is fine, but it got built well
  ahead of the rest of the product.

The real gaps:

1. **The product doesn't exist yet.** The P0 items in PRD §9 (directory, project page,
   upvotes, comments, NEAR login) and the P1 items (API, `SKILL.md`) are all unbuilt. The
   README describes a product the judges can't run, and the README is what gets screened
   first.
2. **Reads trust any writer (security bug).** Anyone can call `__fastdata_kv` on
   `nearhunt.near`. The spike already showed it: `board3` wrote into `board1`'s namespace.
   `validate-schema.mjs`, the `readBack` in `import.mjs`, and the curl example in
   `schema/README.md` all read `/v0/latest/nearhunt.near` without filtering by writer. So a
   stranger can inject a fake `project/…` record and it gets read as real. The fix is to read
   `/v0/latest/nearhunt.near/nearhunt.near` (scoped to `nearhunt.near` as the writer). That
   endpoint was checked and works.
3. **Votes have the same hole.** A vote key `vote/{project}/{voter}` is only valid when the
   `{voter}` part of the key equals `predecessor_id`. Otherwise Bob can write
   `vote/x/alice.near`. The spike doc says one-vote-per-account holds "by construction", but
   that's only true if the tally enforces this check.
4. **Re-running the importer rewrites all 271 records every time.** `updated_at` is set to
   now on every run, so each run writes every record again, even with no changes. That's
   exactly the "pushing stuff on-chain" problem waiting to happen again.
5. **The docs have drifted.** The README architecture table still says "proven on testnet".
   `phase-0-spike.md` still says the namespace account is undecided, though it now exists.
   The research doc repeats one paragraph. The spike observed "Exceeded the prepaid gas",
   while the research doc says `CodeDoesNotExist`.

---

## Day 0 (today): guardrails before any new writes

- [ ] **Freeze mainnet writes.** No `--execute` until the importer diffs (below). Hermes may
      run dry runs only.
- [ ] **Scope every read to its writer.** Add one `readProjects()` helper that reads
      `/v0/latest/nearhunt.near/nearhunt.near` and use it in `import.mjs`,
      `validate-schema.mjs`, the web app and the API. Update the curl example in
      `schema/README.md`. Also make the validator report rows from any other writer as
      warnings, so spoofing attempts show up.
- [ ] **Make the importer diff against chain.** Read the current records, compare everything
      except `updated_at`, and write only new or changed keys. Keep a record's `updated_at`
      unless its content changed. Print the diff. Require `--execute --yes`, and refuse when
      the diff is empty. Removed submissions get logged, never tombstoned automatically.
- [ ] **Add `AGENTS.md` with house rules for Hermes:** no mainnet transaction without a
      human-approved dry-run diff; every claim in the docs must come with the command that
      reproduces it; work only from this plan's checklist.
- [ ] **Fix the drift in item 5.**

## Days 1–3: the human MVP (PRD P0)

Stack: Next.js (App Router) deployed on Vercel, `@near-wallet-selector` for login, and the
FastData KV API as the only backend. No database. Use an in-memory or edge cache with a
short TTL.

- [ ] **Day 1: directory.** Cards showing name, tracks, demo link and vote count. Search on
      name. Filter by track (13 tracks). Sort by newest (`block_height`) and by most upvoted.
      Show `null` description and repo fields as "not supplied", not as blanks.
- [ ] **Day 1: project page** at `/p/{submission_id}`: permanent URL, source link, demo link,
      provenance line (written in block N by `nearhunt.near`) and a share link.
- [ ] **Day 2: login and upvote.** Connect a wallet, then sign `__fastdata_kv` on
      `nearhunt.near` with `{"vote/{submission_id}/{me}": {}}`, gas 1 Ggas, deposit 0.
      Unvoting writes `null`.
      - The UI must say that the transaction **shows as failed by design**, and confirm the
        write via the indexer instead.
      - When tallying, count only rows whose key voter equals `predecessor_id`, whose value
        is not null, and whose project id exists.
      - The wallet selector may refuse or warn on a receiver that has no contract. Test this
        first thing on Day 2 with MyNearWallet and Meteor. If it blocks, fall back to a
        function-call access key added on login.
- [ ] **Day 3: comments.** Recommended for the hackathon: use NEAR Hunt's own namespace,
      `comment/{submission_id}/{author}/{ms_timestamp}` → `{"text": "...", "reply_to": key|null}`,
      with the same author == `predecessor_id` rule. This avoids near.social feed flooding
      and the work of lazily creating posts. Mirroring comments to near.social is a stretch
      goal.
- [ ] **Day 3: states.** Empty, loading, pending-transaction and error states.
      Keyboard-accessible, works on mobile.

## Day 4: open data and agents (PRD P1)

- [ ] `GET /api/projects?track=&sort=&q=&cursor=&limit=` and `GET /api/projects/{id}`.
      Use near.social's envelope: `{"items":[…],"next_cursor":…}`.
- [ ] `GET /api/projects/{id}/votes` and `/discussion`, both rebuilt from the KV API on
      every request (cached).
- [ ] `public/SKILL.md`: starts with a quick-reference table, then endpoints, provenance, and
      "read-only, you cannot break anything". Test it end to end by asking Hermes to
      "read NEAR Hunt's skill and shortlist ten projects worth investigating".

## Day 5: submission

- [ ] Rewrite the README to match what runs: a live URL, a 3-command local run,
      architecture, and what is and isn't on chain. The judges' first screen is automated
      ("does it run and do what the README says").
- [ ] Name Baby Shark in this README, and NEAR Hunt in Baby Shark's (a hackathon rule).
- [ ] Record the demo video or screenshots, then make the X post tagging `@NEARProtocol` and
      `#NEARHackathon`. Submit to Open Innovation, plus Social / Agent tracks where they fit.
- [ ] Do a final dry-run import. If new submissions arrived, apply the diff with a human
      approving it.

## Day 6: buffer

Leave it unplanned on purpose.

## Explicitly out of scope until after the 14th

Anything not in PRD §9: Baby Shark funding links, builder claim and edit flows, AI scoring,
Valkey, agent writes, near.social post mirroring, and any new key prefix on mainnet that
isn't `vote/` or `comment/`.

## Decisions the owner needs to make

1. **Comments:** own namespace (recommended, fastest, no feed pollution) or near.social
   posts created on the first comment (better reach, more work, rate-limited)?
2. **Hosting:** Vercel under which account or domain?
3. **The importer key:** does the full-access key for `nearhunt.near` stay with Hermes? The
   recommendation is no. Give Hermes a function-call key limited to `__fastdata_kv` on
   `nearhunt.near`, or keep mainnet signing human-only.
