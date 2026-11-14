# NEAR Hunt demo: speaker notes

One section per slide, in deck order. Slides: [near-hunt-demo.pdf](near-hunt-demo.pdf).

## 1. The Product Hunt of NEAR.

Hi, I'm [name]. This is NEAR Hunt: think Product Hunt, but for NEAR projects, and with every record, vote and comment living on NEAR itself. I'll walk through what we set out to do, how it plugs into NEAR Social, and why the data is open, then jump into the live site.

## 2. More than 2,100 projects shipped at this hackathon. The only way to see them was a list of names and links.

So we built the thing we wanted ourselves. More than 2,100 projects shipped here, and the official view was basically a list. You couldn't browse, compare or discuss them, and after the 14th they'd just fade. NEAR Hunt gives each project a permanent page, a community signal, and a machine-readable record that outlives the hackathon.

## 3. Four things we set out to prove

Four goals. One: drive adoption of an existing NEAR product, NEAR Social, instead of building yet another silo. Two: show off what the NEAR stack can do — open data and FastData KV, with no contract at all. Three: help new projects get discovered and give the ecosystem a place to gather. Four: make it feel as good as any Web2 app.

## 4. People showed up

Before the tour, the numbers. These are all on chain and anyone can count them. 287 different NEAR accounts have signed upvotes, 58 have commented, and 48 posts on near.social carry #nearhunt. There are now 2,130 project records on chain, and builders have filed 36 corrections to their own listings, which tells us they care what their page says. [Refresh these numbers right before presenting.]

## 5. Your near.social identity, everywhere on NEAR Hunt.

Objective one was adoption of NEAR Social. Rather than building our own profiles or our own feed, NEAR Hunt borrows near.social's: who you are, what you look like, and where you share. Two parts: login and profiles, then the share loop.

## 6. Sign in once, show up as yourself

Click Connect NEAR account, approve once in your wallet, and you're in. From then on votes and comments are signed with a function-call key, so there are no more pop-ups. Your name and avatar come straight from near.social, and every account gets a profile page showing what it upvoted and said, next to its near.social followers and posts. If you want to change your profile, you do it on near.social; we just read it. Demo: open /u/alejandro.near.

## 7. Every upvote can become a near.social post

This is the loop we built to send people back to near.social. Upvote something, and right under the button we ask: tell your near.social followers? One click copies a ready-made post and opens near.social. You post from your own account, never from ours. Anything tagged #nearhunt then appears live in the sidebar next to the project list, which brings the next person in. Demo: upvote a project and show the prompt.

## 8. Everything on NEAR Hunt is readable without NEAR Hunt.

Objective two: show off the NEAR stack. Our core design rule is that the website is just a view. The real data — every project, every vote, every comment — lives on NEAR mainnet, and you can read it without touching our server.

## 9. Plain key-value rows on mainnet. No smart contract.

Everything is a FastData KV row under nearhunt.near. Project records are written by our importer. Votes, comments and maker links are written by users from their own accounts. That matters: the voter is whoever signed the transaction, so one account gets one vote and nobody can vote or comment on your behalf. And because it's just key-value data, there's no contract to deploy, audit or upgrade. Demo: click View JSON on a project's On-chain record card.

## 10. One source of truth, many readers

Here's the whole path. You sign a write from your own wallet. It lands on NEAR mainnet as a FastData KV row and stays public forever. The FastData indexer serves those rows back, so we didn't write a custom indexer either. NEAR Hunt reads the same data anyone else can: our site, our public API, AI agents, or you with one curl command, no key and no wallet. Demo: run the curl on screen.

## 11. Built for people, and for their agents

Because the data is open, it's also easy for machines to use. There's a documented read-only JSON API and a SKILL.md, so you can tell your agent “read NEAR Hunt's skill and shortlist ten projects worth investigating”, and it can check every record against the chain by itself. It's read-only on purpose: agents never vote or write for anyone. Demo: open /open-data.

## 12. It feels like a normal app

Objective four was UI and UX. Most dapps make you approve every click. Here you approve once at login, then voting and commenting feel like any Web2 app. Search, track filters and sorting all live in the URL, so you can share a filtered view. There are four themes, all contrast-checked, and it works properly on a phone. [Add page-speed or other measured numbers here if you have them.]

## 13. Builders claim their projects

Objective three is also about the builders. Anyone with access to a project's GitHub repo can claim its listing: we check ownership with a scope-less GitHub login and revoke the token straight away. Then they can link their NEAR account with one signed row, so visitors know who's behind a project. Builders have also filed 36 corrections to their own listings. And descriptions are always the builder's own words; no AI writes or ranks project content.

## 14. Kept running by its community

How does this keep running after the hackathon? We don't want a token or paid ranking, so the Support page offers two honest options. Donate NEAR straight to team.nearhunt.near, or stake with our validator, avb.poolv1.near: your NEAR stays yours and keeps earning rewards, and the validator's commission funds the site. Both are signed in your own wallet and are public on chain. Neither one ever touches a ranking. And if you'd rather not spend anything, upvoting, commenting and sharing help just as much. Demo: open /support.

## 15. From one hackathon to where every NEAR project launches

The hackathon ends today; NEAR Hunt doesn't. Phase one is live now. Next is open submissions, so any NEAR project can get its own launch day, and makers can tell their own story. Longer term, we want the project record format to be an open standard that wallets, explorers and grant programs all read and write. And a few things we won't do: no tokens for votes, no paid ranking, no agents writing for you.

## 16. Go upvote something you’d actually use.

That's NEAR Hunt: near.social for identity and sharing, open FastData KV records for everything else, and an app that feels like any good Web2 product. Go to nearhunt.xyz, connect your account and upvote something you'd actually use. Thanks! Happy to take questions.
