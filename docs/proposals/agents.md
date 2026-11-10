# Proposal: two NEAR Hunt agents — Scout (enrichment) and Judge (discussion)

**Status:** proposed 10 Nov 2026, **awaiting owner decisions** (bottom of this file). Nothing here
signs or writes on chain. Tickets: NH-120…NH-125 in [`../PLAN.md`](../PLAN.md).

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
        { "kind": "builder-page-links-value", "url": "https://veto.app", "quote": "<a href=\"https://github.com/acme/veto\">" },
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
   page links it (the X post/thread, the demo site, the builder's profile), **or** the repo links back
   to the project's demo URL or X post. "Same name on GitHub" is a `dead_end`, never a proposal.
3. **`scripts/scout-verify.mjs` (NH-121) re-checks every proposal deterministically**: refetches each
   evidence URL and confirms the quoted link is really there, runs `git ls-remote`, link-checks via
   `lib/link-probe.mjs`, and drops anything that fails. Survivors merge into `proposal.json` with
   `enrichment.method: "scout"` and the evidence URLs in `enrichment.sources`.
4. **Same write path as today.** `node scripts/import.mjs --enrichment …` dry run → owner approves
   the exact numbers → `--execute --yes` (AGENTS.md §1). Scout itself never holds a key.

**Where OutLayer fits (optional, NH-125).** The verifier is deterministic, so it can run as a
WASI P2 component on OutLayer: input = finding file, output = accepted/rejected per proposal, plus an
Intel TDX attestation (`GET https://api.outlayer.ai/attestations/by-call/{call_id}`) stored next to
the finding. Then "this repository was verified" is checkable by anyone, not just a line in our log.

## Agent 2 — Judge (NEAR expert, roasts and reviews)

Definition: [`.claude/agents/judge.md`](../../.claude/agents/judge.md). Rubric:
[`agents/judge/rubric.yaml`](../../agents/judge/rubric.yaml), adapted from
`satojandro/agent-orchestrator` (`docs/03-quality-framework.md` scoring discipline; rubrics B, C, D, G).

**Rubric in one line:** NEAR-native depth 20 · it works 20 · user value 20 · engineering 15 ·
security 15 · pitch 10; critical gates (fabricated claim, asset-loss path, nothing runs) cap at 39;
every point cites evidence; unsupported = 0; `blocked` (judge couldn't reach it) doesn't count
against the builder.

**NEAR knowledge it loads:** the NEAR Agent Skills (`npx skills add near/agent-skills`:
`near-contract-audit`, `near-smart-contracts`, `near-api-js`, `near-kit`, `near-intents`,
`near-ai-cloud`, `near-dapp`, `near-cli-rs`), the vendored near.social skill, `public/SKILL.md`,
and `https://docs.near.org/llms.txt` for anything else. It must look things up on chain (contract
exists? recent txs?) rather than trust a README.

**Voice.** Roast the work, never the person; every joke rests on a cited fact; credit is given
in the same voice; the fixes are the point. Starts with `🤖 AI judge`, says it is not official
judging, no @mentions, no token talk, ≤ 2,000 characters, must pass [`/comment-policy`](https://nearhunt.xyz/comment-policy).

**Pipeline.**

1. **Draft (NH-122, no key).** Judge writes `data/judge/drafts/{submission_id}.json`:
   `{ score, outcomes per criterion with evidence, gates, comment_text }`. Drafts are committed, so
   the owner reviews them as a diff.
2. **Approve.** `scripts/judge-post.mjs` (NH-124) dry run prints: account, prefix `comment/`, the N
   comments with their text, key count and transaction count. The owner says yes to that batch.
3. **Post from the judge's own account**, never `nearhunt.near`:
   `{"comment/{submission_id}/{ms}": {"text": "…"}}` via `__fastdata_kv` on receiver
   `nearhunt.near`, exactly like a human comment (NH-44). Because the judge is the row's
   `predecessor_id`, it is the author: it can delete its own comment (`null`), the hide list works
   on it, and nothing in `lib/comments.mjs` changes.
4. **Replies.** On later runs, the judge reads replies to its comments and answers builders who
   argue with evidence (and corrects its score when they're right). Same approval per batch.

**Key custody via OutLayer (NH-123).** Register an OutLayer custody wallet
(`POST https://api.outlayer.ai/register` → `wk_…` API key + a NEAR implicit account). Its key is
generated in and never leaves the TDX enclave. Set its policy to: receiver whitelist
`nearhunt.near` (plus `social` for its own profile), deposit 0, a daily op cap. Then post with
`POST /wallet/v1/call {"receiver_id":"nearhunt.near","method_name":"__fastdata_kv","args":{…},"deposit":"0"}`.
Nobody — Hermes, Claude, the owner's laptop — holds a judge key that could write anything else.
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
