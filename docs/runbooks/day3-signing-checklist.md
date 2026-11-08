# Day 3 — signing and approval checklist (for Hermes)

**Written:** 2026-11-08, from the `claude/great-planck-f8gtb9` branch. Agents built and tested
everything in this list, and none of them signed anything; there are no keys on the machine
where the code was written. Each box below is either a mainnet write, which needs the owner's
approval of that exact diff (AGENTS.md §1–2), or a check that needs a real wallet.

Rules that apply to every item: dry run first, then state the account, prefix, key count and
transaction count, and wait for a yes. One approval covers one write. Adding or deleting access
keys is a separate approval and is never implied by an import approval.

## A. Mainnet writes as `nearhunt.near`: owner approval for each

- [x] **A1. Import 1 new project record.** Done while Day 3 was being built: `project/04749b49-…`
      "AgentGuard" is on chain at block 223,606,742, written by `nearhunt.near`.
      ```bash
      npm run validate:schema   # 281 records, 281 valid, 0 foreign rows
      node scripts/import.mjs   # new 0, changed 0, unchanged 281
      ```
- [ ] **A2. NH-40 project posts on near.social**, posted as `nearhunt.near`, at most 40 per batch,
      never all 281. Per near.social's skill.md (social-kv/1) the receiver is **`social`** (mainnet
      only; there is no testnet indexer), method `__fastdata_kv`, gas 1 Ggas, deposit 0, one post per
      transaction. The receipt fails with `CodeDoesNotExist` by design. Confirm each post with
      `GET https://api2.near.social/v1/tx/{hash}` and never resend.
      ```bash
      node scripts/social-posts.mjs --limit 40   # dry run: 40 posts, 40 tx, 10,917 bytes, every payload printed
      ```
      The script has **no execute path**: `--execute` exits 2. Hermes signs the printed payloads
      after approval.
      - [ ] **First, D1 (DNS):** near.social builds each post's link card from
            `https://nearhunt.xyz/p/{id}`, and the domain is still parked.
      - [ ] Owner approves the printed batch.
      - [ ] Decide which key signs. `nearhunt.near` has one full-access key today. A function-call
            key for receiver `social` is a **separate** approval.
      - [ ] Save the confirmed references as `data/social-posts.json` (the overlay format
            `scripts/social-posts.mjs` prints).
- [ ] **A3. Write `social_post` back into the posted projects' records.** This runs after A2, as a
      normal `project/` import with the overlay. The overlay only fills an empty `social_post` with
      a `nearhunt.near/{id}` reference. It never replaces an existing one; a mismatch shows as a `!`
      line in the dry run.
      ```bash
      node scripts/import.mjs --social-posts data/social-posts.json   # dry run: expect "~ changed: social_post" per posted project
      node scripts/import.mjs --social-posts data/social-posts.json --execute --yes   # only after approval
      ```

## B. Owner decisions (no signing yet)

- [ ] **B1. How NH-40 posts get created.** The plan says "the server creates the post the first
      time someone opens a thread". That puts a `nearhunt.near` key on Vercel. The agents built
      the alternative, where Hermes posts batches from the operator machine. Pick one.
- [ ] **B2. Treasury account for NH-94** (still open from PLAN.md).
- [ ] **B3. A pending vote when the indexer is slow (NH-82).** Today a pending vote is rolled back
      after 30 s with "reload in a minute". The States mockup keeps it visible until the indexer
      catches up. Making it match means changing vote logic in `UpvoteButton`. Keep it as is, or
      change it?
- [ ] **B4. Directory status code during a full KV outage.** With no saved copy, `/` shows its
      error state with a **200**, because the Suspense boundary has already started the response.
      `/p/{id}` returns a real 500. Does a 5xx on `/` matter for monitoring?

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
      reply keeps the draft (NH-83). This also confirms the wallet accepts a 1 Ggas call to `social`
      and returns a transaction hash; that path has only been unit-tested.

## D. Not signing, but still Hermes's

- [ ] **D1. DNS for nearhunt.xyz:** add the domain to the `near-hunt` Vercel project, then set
      Namecheap DNS (apex `A 76.76.21.21`, `www` CNAME `cname.vercel-dns.com`).
- [ ] **D2. Deploy** the Day 3 branch after it is merged.
