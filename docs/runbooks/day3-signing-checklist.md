# Day 3 — signing and approval checklist (for Hermes)

**Written:** 2026-11-08, from the `claude/great-planck-f8gtb9` branch. Agents built and tested
everything in this list, and none of them signed anything; there are no keys on the machine
where the code was written. Each box below is either a mainnet write, which needs the owner's
approval of that exact diff (AGENTS.md §1–2), or a check that needs a real wallet.

Rules that apply to every item: dry run first, then state the account, prefix, key count and
transaction count, and wait for a yes. One approval covers one write. Adding or deleting access
keys is a separate approval and is never implied by an import approval.

## A. Mainnet writes as `nearhunt.near`: owner approval for each

- [ ] **A1. Import 1 new project record.** The feed reports 281 projects and the chain holds 280.
      The new one is `project/04749b49-1ec8-469d-91b8-4ee173e2bc9f` "AgentGuard": a second project
      with that name, with a different id from `00ed3eb4-…` and `24ab3074-…`.
      ```bash
      node scripts/import.mjs            # expect: new 1, changed 0, unchanged 280 → 1 key, 544 bytes, 1 tx
      node scripts/import.mjs --execute --yes   # only after approval
      npm run validate:schema            # expect 281 valid, 0 foreign rows, 0 tombstones
      ```
- [ ] **A2. NH-40 project posts on near.social** (posts to `social.near` as `nearhunt.near`),
      at most 40 per batch and never all 281. The discussion branch is still being built: once it
      lands, `node scripts/social-posts.mjs --limit 40` prints the batch (account, contract, tx
      count, bytes, exact payloads) and has **no execute path**. Hermes posts it after approval.
      - [ ] Owner approves the printed batch.
      - [ ] If `nearhunt.near`'s only key is the full-access key, decide which key signs the posts
            (a new function-call key for `social.near` is a **separate** approval).
- [ ] **A3. Write `social_post` back into the posted projects' records.** The importer keeps the
      field but does not set it, so this runs after A2 using the overlay the discussion branch
      adds. It is a normal `project/` import: dry run, approval, `--execute --yes`.

## B. Owner decisions (no signing yet)

- [ ] **B1. How NH-40 posts get created.** The plan says "the server creates the post the first
      time someone opens a thread". That puts a `nearhunt.near` key on Vercel. The agents built
      the alternative, where Hermes posts batches from the operator machine. Pick one.
- [ ] **B2. Treasury account for NH-94** (still open from PLAN.md).

## C. Real-wallet checks: a human's own account, not `nearhunt.near`

These are votes or replies the tester signs from their own wallet. They are not agent writes, but
nobody has run them yet.

- [ ] **C1. Login** in two NEAR Connect wallets (e.g. Meteor and HOT): connect, then disconnect.
      Still open from Day 2.
- [ ] **C2. Upvote, then view the account page.** Upvote a project. Open `/u/{you}` and check it
      is listed. Open the directory within 20 s and check the count already includes it. The
      `votesChanged` cache invalidation, commit `8819c24`, has only been checked with server logs
      so far.
- [ ] **C3. Remove a vote from `/u/{you}`.** The row disappears, stays gone after a reload, and
      the project's count drops.
- [ ] **C4. "Edit profile on near.social"** link on your own account page opens a working editor
      (`https://near.social/mob.near/widget/ProfileEditor`; nobody has seen it render yet).
- [ ] **C5. Reply to a project thread** (NH-42), once A2 has posted at least one project. Check
      the reply appears in the thread and on near.social, and that a rejected or rate-limited
      reply keeps the draft (NH-83).

## D. Not signing, but still Hermes's

- [ ] **D1. DNS for nearhunt.xyz:** add the domain to the `near-hunt` Vercel project, then set
      Namecheap DNS (apex `A 76.76.21.21`, `www` CNAME `cname.vercel-dns.com`).
- [ ] **D2. Deploy** the Day 3 branch after it is merged.
