# Proposal: two NEAR Hunt agents — Scout (enrichment) and Judge (discussion)

**Status:** proposed 10 Nov 2026, **awaiting owner decisions** (bottom of this file). Nothing here
signs or writes on chain. Tickets: NH-120…NH-126 in [`../PLAN.md`](../PLAN.md); only NH-120 and
NH-121 (Scout) have a priority there. Revised 11 Nov after review (see "Review changes" below).

## Why

- **Enrichment has hit the limit of static code.** Counted 10 Nov from mainnet (413 records):
  205 without a verified repository, 208 without `links`, 216 whose only demo is the X post,
  43 without media, 25 without a description. The scripts only read the submitted X post and the
  builder's replies; the repos are usually one hop further (the demo site's footer, the builder's
  GitHub profile, a devpost/README that links back). An agent can follow those hops; a regex can't.
- **The discussion feeds are empty.** NH-44 comments are live, but almost no project has one.
  A judge that is sharp, specific and NEAR-literate gives every builder feedback and gives
  visitors a reason to read and reply.
- **OutLayer** (FastNEAR's TEE compute and agent custody) lets both agents run with keys that never
  leave an enclave and with attested output.

Reproduce the counts:

```bash
node -e "import('./lib/kv.mjs').then(async({readProjects,DEFAULT_ACCOUNT})=>{const v=(await readProjects({account:DEFAULT_ACCOUNT,network:'mainnet'})).filter(r=>r.value).map(r=>r.value);const c=f=>v.filter(f).length;console.log({records:v.length,noRepo:c(x=>!x.repository_url),noLinks:c(x=>!(x.links||[]).length),noMedia:c(x=>!(x.media||[]).length),noDescription:c(x=>!x.description)})})"
```

## Agent 1 — Scout (make every record as rich as it can be)

Definition: [`.claude/agents/scout.md`](../../.claude/agents/scout.md) (Claude Code subagent; Hermes
reads the same file as its prompt).

**What it does.** For each record with gaps, it investigates like a person would: the X post and
thread, the demo site (footer, `/about`, page source), the builder's GitHub/GitLab profile, GitHub
search, devpost, the builder's near.social profile, explorer pages for contract accounts it finds.
It writes one **finding file** per project, `data/enrichment/scout/{submission_id}.json`:

```json
{
  "submission_id": "…",
  "scouted_at": "2026-11-10T22:00:00Z",
  "proposals": [
    {
      "field": "repository_url",
      "value": "https://github.com/acme/veto",
      "evidence": [
        { "kind": "builder-page-links-value", "anchor": "demo_url", "url": "https://veto.app", "quote": "<a href=\"https://github.com/acme/veto\">" },
        { "kind": "value-links-back", "url": "https://github.com/acme/veto", "quote": "Demo: https://veto.app" }
      ]
    }
  ],
  "dead_ends": ["github search 'veto near' → 14 repos, none link to veto.app or @tarantinbv"]
}
```

**What keeps it honest** — the agent proposes, code verifies, the owner approves:

1. **No model prose in records.** Scout proposes URLs, media and links only. `description` stays the
   builder's verbatim text (NH-95). Scout may point at a *builder-written* text the scripts missed
   (e.g. their README's first paragraph) with its source, never write one.
2. **Evidence chain, not name matching.** A repository is accepted only when a builder-controlled
   page links it. A repo that links back to the project's demo URL or X post is supporting evidence
   only: anyone can publish a repo that links someone else's demo, so links-back alone is a lead
   under `dead_ends`, as is "same name on GitHub".
3. **`scripts/scout-verify.mjs` (NH-121) re-checks every proposal deterministically.** It works out
   the builder-controlled pages **from the record**, not from Scout's say-so: the source X post and
   the same handle's replies, the `demo_url` host, the record's `links`, and a profile page one of
   those links. Evidence anchored anywhere else is rejected. It then refetches each evidence URL and
   confirms the quote is in the body as served (a link that appears only after JavaScript runs does
   not count), runs `git ls-remote`, link-checks via `lib/link-probe.mjs`, and drops anything that
   fails. Survivors merge into `proposal.json` with `enrichment.method: "scout"` and the evidence
   URLs in `enrichment.sources`.
4. **Same write path as today.** `node scripts/import.mjs --enrichment …` dry run → owner approves
   the exact numbers → `--execute --yes` (AGENTS.md §1). Scout itself never holds a key.
5. **No shell next to a key.** Scout reads untrusted pages and has a shell. AGENTS.md §2 keeps the
   `nearhunt.near` key on the importer's machine, so Scout runs somewhere else: its prompt checks
   for `~/.near-credentials` and stops if it is there. Fetched text is data, never instructions.

**Where OutLayer fits (optional, NH-125).** The verifier is deterministic, so it can run as a
WASI P2 component on OutLayer: input = finding file, output = accepted/rejected per proposal, plus an
Intel TDX attestation (`GET https://api.outlayer.ai/attestations/by-call/{call_id}`) stored next to
the finding. That makes "the verifier ran on this input and accepted it" checkable by anyone. It
does not prove the record's builder pages are right, so it is worth doing only if the OutLayer
track asks for it (decision 5).

## Agent 2 — Judge (NEAR expert, roasts and reviews)

Definition: [`.claude/agents/judge.md`](../../.claude/agents/judge.md). Rubric:
[`agents/judge/rubric.yaml`](../../agents/judge/rubric.yaml), adapted from
`satojandro/agent-orchestrator` (`docs/03-quality-framework.md` scoring discipline; rubrics B, C, D, G).

**Rubric in one line:** NEAR-native depth 20 · it works 20 · user value 20 · engineering 15 ·
security 15 · pitch 10; every point cites evidence. Each criterion gets one outcome: the judge
looked and found nothing = `fail`, 0; the judge could not look (`blocked`: demo timed out;
`not_assessed`: no public repository; `not_applicable`) = the points leave the denominator. The
draft records `assessed_points`, and below 50 assessed points there is no score at all. With 205
records lacking a repository, that is the common case, not the edge.

**Flags, not public verdicts.** `fabricated-claim` and `asset-loss-path` cap the *draft* score at 39
and mark the draft for owner review. They are never posted as an accusation: a comment is public
and permanent, and a wrong "this claim is false" cannot be taken out of history. The comment says
what was looked for, where, and that it was not found.

**NEAR knowledge it loads:** the NEAR Agent Skills (`near-contract-audit`, `near-smart-contracts`,
`near-api-js`, `near-kit`, `near-intents`, `near-ai-cloud`, `near-dapp`, `near-cli-rs`), vendored
under `.claude/skills/` with a checksum as part of NH-122 (today only `near-social` is there:
`ls .claude/skills`). The judge does not run `npx skills add` itself, because that fetches unpinned
code on every run. Also the vendored near.social skill, `public/SKILL.md`,
and `https://docs.near.org/llms.txt` for anything else. It must look things up on chain (contract
exists? recent txs?) rather than trust a README.

**Voice.** Roast the work, never the person; every joke rests on a cited fact; credit is given
in the same voice; the fixes are the point. Starts with `🤖 AI judge`, says it is not official
judging, no @mentions, no token talk, ≤ 2,000 characters, must pass [`/comment-policy`](https://nearhunt.xyz/comment-policy).
Version 1 posts **no number score**: the hackathon has not announced results yet (18 Nov, per the
sponsored-placements row in PLAN.md), and a number from an account called "AI judge" reads as a
ranking however it is labelled. The score stays in the draft
(decision 6).

**Pipeline.**

1. **Draft (NH-122, no key).** Judge writes `data/judge/drafts/{submission_id}.json`:
   `{ score, assessed_points, outcomes per criterion with evidence, flags, owner_review, comment_text }`.
   Drafts are committed, so the owner reviews them as a diff. Like Scout, the judge has a shell and
   clones strangers' repositories, so it runs only where no NEAR key is present.
2. **Approve.** `scripts/judge-post.mjs` (NH-124) dry run prints: account, prefix `comment/`, the N
   comments with their text, key count and transaction count. Before that it lints every draft in
   code and refuses one that is over 2,000 code points, lacks the prefix, has an @mention, a number
   score or a link outside the project's own pages and `nearhunt.xyz`, or is marked for owner
   review. Twenty 2,000-character comments is a lot to read; the lint catches what tired eyes miss.
   The owner says yes to that batch.
3. **Post from the judge's own account**, never `nearhunt.near`:
   `{"comment/{submission_id}/{ms}": {"text": "…"}}` via `__fastdata_kv` on receiver
   `nearhunt.near`, exactly like a human comment (NH-44). Because the judge is the row's
   `predecessor_id`, it is the author: it can delete its own comment (`null`) and the hide list
   works on it. **One thing does change:** the directory's "Most discussed" sort and the count on
   every card come from comment counts (`sortItems` in `lib/directory.mjs`, `countComments` in
   `lib/comments.mjs`), and a judge comment on every project would make every count at least 1.
   NH-124 leaves `data/agents.json` accounts out of both.
4. **Replies are not in this version** (NH-126). A reply is untrusted text written to the judge,
   which makes it a second way to steer what the judge posts. It gets its own design after the
   first batch has been live.

**Key custody via OutLayer (NH-123).** Register an OutLayer custody wallet
(`POST https://api.outlayer.ai/register` → `wk_…` API key + a NEAR implicit account). Its key is
generated in and never leaves the TDX enclave. Set its policy to: receiver whitelist
`nearhunt.near` (plus `social` for its own profile), deposit 0, a daily op cap. Then post with
`POST /wallet/v1/call {"receiver_id":"nearhunt.near","method_name":"__fastdata_kv","args":{…},"deposit":"0"}`.
No machine of ours holds a NEAR key for the judge, and the policy limits *where* it can write.
It does not limit *what* is written: whoever holds the `wk_…` API key can post any comment text as
the judge. That key is a secret under AGENTS.md §2 and lives only where `judge-post.mjs` runs.
**Unverified:** that `/wallet/v1/call` works against a contractless receiver (`CodeDoesNotExist` is
the expected receipt). Prove it on testnet first (`nearhunt.testnet`).

The site shows comments from accounts listed in `data/agents.json` with a "🤖 AI judge" badge
and a link to the rubric, and its near.social profile says it is automated.

## What this changes in the rules (needs the owner)

| Rule today | Proposed |
|---|---|
| PLAN: "AI scoring … and agent writes" out of scope until after the 14th | Judge scores and comments are in scope as NH-122…124 |
| AGENTS.md §1/§3: agents never write `comment/` keys | Exception: the accounts in `data/agents.json`, writing from **their own** account, batch-approved. Never as `nearhunt.near`, never as a person |
| `public/SKILL.md`: "Agents must not … comment" | Stays true for third-party agents; adds a line naming NEAR Hunt's own disclosed judge |
| Comment policy: comments are "never official judging" | Still true — the judge says so in every comment |
| NH-95: "no repository guessed from a name" | Unchanged in spirit: Scout needs an evidence chain to the builder, and code re-verifies it |

## Review changes (11 Nov)

Changed after review of this proposal; the reasons are inline above.

- Both agents run only where no NEAR key is present, and treat fetched text as data.
- Scout: links-back alone is no longer enough for a repository; the verifier derives the
  builder-controlled pages from the record; quotes must be in the body as served.
- Judge: `not_assessed` outcome and a minimum of 50 assessed points; the `nothing-runs` gate is
  gone (it contradicted `blocked`); flags go to owner review instead of into the comment; no number
  score in posted comments; skills vendored instead of fetched per run; replies moved to NH-126.
- NH-124 gains a lint and the comment-count exclusion. NH-122 to NH-126 have no priority in PLAN.md
  until the owner decides.

## Open decisions for the owner

1. **Approve the rule changes above** (judge writes `comment/` from its own disclosed account).
2. **Approval cadence for the judge.** Per-batch approval (AGENTS.md today), e.g. 20 comments per
   batch, or a standing approval inside fixed limits (rate cap, policy-restricted OutLayer wallet).
3. **Which LLM the judge runs on for posted text**: whoever runs it (Claude/Hermes), or NEAR AI Cloud
   (TEE-attested inference, `cloud-api.near.ai`) so the verdict itself is attested.
4. **Judge account name**: the OutLayer implicit account plus a near.social profile, or a named
   `judge.nearhunt.near` (creating it is a separate key action on `nearhunt.near`).
5. **Hackathon eligibility**: the OutLayer docs (read 10 Nov) state no hackathon requirement;
   confirm which OutLayer usage the track asks for, so NH-123/125 hit it.
6. **Number scores in public.** Version 1 keeps them in the draft. Post them later (for example
   after results on the 18th), only on a builder's request, or never?
