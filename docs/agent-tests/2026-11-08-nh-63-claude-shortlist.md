<!-- NH-63 run 1 of 2: a fresh Claude Code subagent given only the site URL (local production build of claude/wizardly-lamport-w9jaba at dbcfc75, reading mainnet) and the operator prompt. Output kept verbatim. Its feedback on SKILL.md was applied in the same commit as this file. Run 2 (Hermes) is still open. -->

# NEAR Hunt: ten projects worth investigating

Data read from the NEAR Hunt API (local build at http://localhost:3555, standing in for
https://near-hunt.vercel.app) on 2026-11-08; `meta.fetched_at` = `2026-11-08T16:42:19.820Z`,
`meta.stale` = `false`, `meta.total` = 281, `meta.source` = `nearhunt.near` / `project/` / mainnet.
All 281 records have `schema: nearhunt/project/1` and `account: nearhunt.near`.

Projects were submitted at the hackathon's listing, https://nearhackathon.com/#submissions;
NEAR Hunt republishes that listing. Every "builder says" line below paraphrases the project's
`description`, which is the builder's own X post (linked), not a verified fact.

## Criteria

1. **Verified repository** (`repository_url` non-null; 98 of 281 have one). Required for this list.
2. **Builder description** present (265 of 281).
3. **A builder-linked app**, from the record's `links` field (URLs pulled from the builder's post).
   I did not use `demo_url` as a signal: 269 of 281 `demo_url`s are the X submission post itself,
   so it does not separate projects.
4. **Distinct idea.** About 40 records are variations on "spending limits / function-call key for an
   AI agent's wallet". I took one representative of that cluster rather than several.
5. **Spread across tracks.** The ten cover agents, business, defi, games, memecoins, nfts, open,
   privacy, realworld, security, social, swarms and thesis.

Votes were not a usable signal: 280 records have `votes: 0` and one (Aegis, not on this list: no
verified repo) has 1. Votes are community signals, not official judging. Liveness of the apps and
repos was not checked.

## Shortlist

### 1. DeadDrop
- NEAR Hunt: https://nearhunt.xyz/p/14c70946-d8de-4fed-8fc6-739886447220
- Tracks: privacy, realworld
- Repo: https://github.com/Hothit1/deaddrop · App: https://hothit1.github.io/deaddrop
- Builder says (https://x.com/DavidHu178488/status/2116915586261557492): sell encrypted files with
  payment held in escrow; the decryption key is sealed to the buyer's public key and the seller is
  paid only on delivery, otherwise refunded.
- Why: a concrete, testable fair-exchange protocol with repo and live app.
- Verified on chain: record https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/14c70946-d8de-4fed-8fc6-739886447220,
  `predecessor_id: nearhunt.near`, block_height 223641089, value identical to the API record.

### 2. Warrant
- NEAR Hunt: https://nearhunt.xyz/p/493021e8-fb56-49ef-8be0-b1a1060d7784
- Tracks: defi
- Repo: https://github.com/emmanuelist/warrant · App: https://warrant-options.vercel.app
- Builder says (https://x.com/emmanuelcesc/status/2118396029271974299): options that cannot default
  and need no oracle, because the collateral stays locked inside NEAR Intents until expiry; invites
  people to "break it on mainnet".
- Why: an unusual use of NEAR Intents as a collateral lock, with a mainnet deployment claimed.
- Verified on chain: record https://kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near/project/493021e8-fb56-49ef-8be0-b1a1060d7784,
  `predecessor_id: nearhunt.near`, block_height 223641089, value identical to the API record.

### 3. Sealed Exploit
- NEAR Hunt: https://nearhunt.xyz/p/849f9204-ed81-497b-8570-bd3ef00a21e2
- Tracks: privacy, security, agents, open
- Repo: https://github.com/edycutjong/sealed · App: https://sealed.edycu.dev
- Builder says (https://x.com/edycutjong/status/2117725204403364028): a bug bounty where a keyless
  NEAR account runs the submitted exploit inside an OutLayer TEE and pays the first real break,
  refusing fakes on chain, so hunters need not hand the bug to a human triager first.
- Why: an original take on trustless bounty payout. Block height 223606754.

### 4. Black box
- NEAR Hunt: https://nearhunt.xyz/p/3dd7c35e-6930-4b60-ad0a-7f569fcdacdc
- Tracks: security, agents, open
- Repo: https://github.com/tenxagent/blackbox · App: https://tenxagent.github.io/blackbox/web
- Builder says (https://x.com/mr_ghdc/status/2116851371207012835): a flight recorder for an AI
  agent's money; each decision is hash-chained and anchored on NEAR with a key that cannot move
  funds, so the agent cannot rewrite its own log.
- Why: the one pick from the large agent-wallet-safety cluster, chosen because it is about
  auditability rather than yet another spend limit. Block height 223641089.

### 5. Deed
- NEAR Hunt: https://nearhunt.xyz/p/2dc79d85-a032-49da-a708-89f6607d81bc
- Tracks: business, security, nfts
- Repo: https://github.com/ClaudeOpusPremiumAgent/deed · App: none linked
- Builder says (https://x.com/Szczypek_96/status/2117369764112932935): sell an on-chain business as
  an NFT that owns a keyless NEAR account; if anything leaves the account after the buyer checked
  it, the sale aborts with a refund.
- Why: a novel answer to "seller drains the business during the sale", and the business-track pick.
  Block height 223606754.

### 6. Afterlight
- NEAR Hunt: https://nearhunt.xyz/p/e4a1b9c2-5f38-4d67-9a81-2c4e7b8d9012
- Tracks: games, nfts
- Repo: https://github.com/GGGODLIN/near-afterlight · App: https://near-afterlight.vercel.app
- Builder says (https://x.com/GGGODLIN/status/2119268196062798316): an orbital power-grid survival
  game with dynamic NEP-171 equipment NFTs and popup-free NEP-366 sessions.
- Why: a game that exercises real NEAR standards (NEP-171, NEP-366), with repo and playable app.
  Block height 223606778.

### 7. Meridian
- NEAR Hunt: https://nearhunt.xyz/p/0fdc3944-7e09-4607-a08a-2590472db1ea
- Tracks: swarms, agents, games, nfts, memecoins, social
- Repo: https://github.com/efeaizesogie/meridian-town · App: https://meridian-town-production.up.railway.app
- Builder says (https://x.com/meridiantown/status/2119062642270830924): a game town where AI
  shopkeepers with their own NEAR accounts set prices, and coin is minted only when the town hits
  its weekly goal.
- Why: the swarms/memecoins pick; an agent-driven economy rather than a fixed one. Note it tags six
  tracks. Block height 223606778.

### 8. Shelflife
- NEAR Hunt: https://nearhunt.xyz/p/3dfb2344-8015-43d8-9389-9cf36bd8fbc2
- Tracks: open
- Repo: https://github.com/Savage27z/Shelflife · App: none linked
- Builder says (https://x.com/Savage27z/status/2118225862168649899): only 6 of 168 NEAR token
  contracts have a working source link pinned to an exact code version; Shelflife checks yours.
- Why: a public-goods tool with a specific, checkable claim about the ecosystem (the 6/168 figure is
  the builder's, unverified). Block height 223606767.

### 9. NEAR Books
- NEAR Hunt: https://nearhunt.xyz/p/3f86c8f9-811e-4de8-a500-ae345b737b2c
- Tracks: thesis, open
- Repo: https://github.com/IhorMuliar/nearbooks · App: https://ihormuliar.github.io/nearbooks
- Builder says (https://x.com/muliark/status/2117252715139264647): argues NEAR's token supply still
  outruns Intents revenue; an OutLayer TDX enclave logs mainnet data daily and the browser re-runs
  seven checks per entry.
- Why: the strongest of several thesis-track entries on the same question because its numbers are
  meant to be re-verifiable by the reader. Block height 223641089.

### 10. Roomy
- NEAR Hunt: https://nearhunt.xyz/p/65ee7b4d-ddc0-4519-959e-9d65c51deb59
- Tracks: realworld, social, open
- Repo: https://github.com/Ber254/roomy · App: https://roomy-house.vercel.app
- Builder says (https://x.com/FocoBernardo/status/2118698850445586812): split expenses with
  roommates and settle in USDC on NEAR via NEAR Intents (one real mainnet payment from Polygon USDT);
  escrow and DAO parts are on testnet.
- Why: a consumer use case with an honest statement of what is mainnet and what is testnet.
  Block height 223641089.

## Also noted
- Aegis (https://nearhunt.xyz/p/de2b5217-8d85-4052-a0d2-0e8e8066c2a5, security) is the only record
  with a vote (1, from `alejandro.near`, block 223642127, confirmed on chain). Left off because it
  has no verified repository.
