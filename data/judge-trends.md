# NEAR Hackathon (`nearhackathon.com`) — AI Judge Trends & Clusters
*Pass 1 Complete: **1,269** evaluated GitHub-linked projects in local Supabase (**1,183** gate pass, **86** gate fail) — 100% of GitHub-linked submissions in `proposal.json`.*

## 1. Track Distribution (Relative Competition & Pass 2 Funnel)
Because quality is relative to the field, knowing how crowded each track is changes the bar for winning:
- **AI Security & Defense (`274` total · `58` contenders `>= 4.40`):** ~22% of all GitHub submissions. Over half are *"agent spending firewalls / function-call-key vaults"*. Simply capping `request_payment` is table stakes—winners separated themselves via **TEE exploit/certification verification** (`Sealed Exploit`, `pwnbounty`, `Antibody`, `PROCTOR`, `Glassbox`), **formal Lean verification** (`exorcist`, `emet`), **typed policy compilers** (`x3lang`), **CA-less MPC SSH** (`sudo-by-contract`), **source-free WASM bytecode simulation** (`bitlens`), **mainnet-live vaults/battlegrounds** (`Foundling`, `SpactVault`, `float-near`, `sledgit`, `Intatto`, `baret`, `Mask Wars`), **hardware SIM signing** (`agentsim-nearhackathon`), or **empirical prompt-injection benchmarks** (`countersign` 71/71).
- **Real-World Money (`136` · `19` `>= 4.40`), Agent Economy (`121` · `18`), Privacy & Private AI (`114` · `33`), Games With Real Economies (`95` · `10`), Investment Thesis (`87` · `17`), Unstoppable DeFi (`81` · `22`), Memecoins With Mechanics (`75` · `13`):** Deep, competitive tracks with clear standout leaders (`Fulfil`, `Settl`, `accord`, `penstock`, `payminto-near`, `rajista-pay-near`, `Byline`, `sphinx-protocol`, `horkos`, `certo`, `proofstream-near`, `bakeoff`, `Antumbra`, `attested-arena`, `sphinx`, `arrow`, `FireKey`, `Laurel`, `sightline`, `kibble`, `Nims`, `brinewar`, `bluffalo-v1`, `NEAR Books`, `near-intents-xray`, `void`, `proof-of-numbers`, `blindbook`, `LifeLine`, `Ripcord`, `Parity`, `silent-partner`, `counterweight`, `Warrant`, `nomad`, `Petri Dish`, `chair`, `LIFO`, `sealed-launch`).
- **NFTs That Do Something (`64` · `15`), Social Money (`62` · `4`), AI Swarms (`59` · `6`), Autonomous Business (`59` · `8`), Open Innovation (`42` · `7`):** Slightly smaller fields where strong mainnet/creative execution (`Pixel Wayfarers`, `bearer`, `satchel`, `conch`, `keyhole`, `Earmark`, `stated-app`, `gossip-market`, `foreman`, `correlation`, `vibe-city`, `muse-swarm`, `will-wallet`, `ghost_store`, `Priced In`, `undo`, `rerun`) stands out fast.

## 2. Biggest Technical & Product Trends
1. **OutLayer (Intel TDX) & NEAR AI Cloud are the breakout primitives:**
   Powering verifiable bug bounties (`Sealed Exploit`, `Antibody`), sealed agent grading/exams (`Judge on NEAR`, `PROCTOR`, `Psephex`), confidential audits (`Attested`, `Sealed Ledger`, `Clean Ledger`, `Private Health Reading`), and mainnet oracles (`NEAR Books`, `Priced In`).
2. **"NFT = Keyless NEAR Sub-Account" (NEAR-only architectural pattern):**
   Four independent teams converged on minting NEP-171 tokens that are real keyless NEAR sub-accounts (often using NEAR global contracts) so transferring the NFT transfers the account, balance, and rights: `Pixel Wayfarers`, `Release Passport`, `Satchel`, `Merit` (plus `Kinlings` for game creatures).
3. **Mainnet-Live Separators (Huge Tie-Breaker):**
   Most submissions are testnet-only. The handful that shipped **live on NEAR mainnet** with real USDC or real contracts stand out immediately: `Fulfil` (`nearfullfil.near`), `Priced In`, `Petri Dish` (`petri-dish.near`), `NEAR Books` (`nearbooks.near`), `Settl` (`settl-billonaire.near`), `Byline` (`byline.near`), `nearswaps agent kit` (`nekoorders.near`), `Epoch`, `Proposal X-Ray`, `Where's My ZEC`, `Intent Sentinel`.
4. **Investment Thesis Consensus:**
   All 11 Thesis entries tested public data reproducibly, and the strongest ones (`NEAR Books`, `NEAR's agent economy, measured`, `NEAR Intents Thesis — Tested`, `NePu`) converged on the same honest finding: **NEAR Intents volume & fees are real, but current buybacks only offset a fraction (~17%) of token issuance and don't yet statistically lead NEAR price.**
5. **Ecosystem Tooling Force-Multipliers:**
   `Tidepool` (built a 1Click-compatible Intents testnet API because there is no official 1Click testnet), `NEARpedia` (27-tool MCP + deprecation linter), `Glassbox` (Shade/dstack TEE key auditor), `Intent Firewall` (pre-sign `token_diff` decoder), and `Intent Sentinel` (stuck-swap debugger).

## 3. Name Collisions & Multi-Entry Builders
- **Duplicate Project Names:**
  - `Bridle` (`0xBadSign/bridle` vs `Mofifoluwa-ade/Bridle` — both Chain Signatures agent vaults!)
  - `AgentGuard` (`zaxcoraider/AgentGuard` vs `Ibrahimjibril/agentguard`)
  - `Tripwire` (`demir-sama/tripwire` memecoin launchpad vs `Afar88/tripwire` security registry)
  - `NEAR Usage Thesis` (`Raindess69` vs `lisaaai200`)
- **Notable Multi-Entry Builders:** `ethboi` (`OneUp` + `CONSUME`), `ZSP111` (`Settl` + `Heir`), `cryppit` (`Intent Sentinel` + `Where's My ZEC`), `UnityNodes` (`Psephex` + `NEARpedia`), `ChrisTu117` (`Satchel` + `STAG`), `replaycourt` (`Hat Tip` + `Bonfire`), `chaoticpunk` (`Sealed Ledger` + `The Daily Swarm`), `rjrajput-web3` (`PATCHPAY` + `VAULTRY`), `emilhuseyn` (`Release Passport` + `Patch Fund`).

## 4. Screening Gate Failures (`11` caught so far)
- **Empty/Unreachable GitHub repos (`2`):** `Delivered`, `Intents Desk`
- **Wrong-hackathon / Unrelated popular repos scraped (`6`):** `Farm Ajo` (`Nearblocks/nearblocks`), `Recall Wallet Agent` (`Nearblocks/nearblocks`), `NEAR, on evidence` (`whatwg/fetch`), `Quittance` (`discourse/discourse`), `Take The L` (`pacocoursey/next-themes`), `Milestone Vault` (`Shinigami-tech/sitedoctor` for Vultr)
- **Built for another chain / no NEAR code (`3`):** `CT Life` (Solana Seeker), `PFWA` (Robinhood Chain Solidity Uniswap v4 hook), `Wakeless` (pure Python Hyperliquid TWAP watcher)
