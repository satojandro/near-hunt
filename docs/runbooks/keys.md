# Runbook: NEAR keys for NEAR Hunt

**Who runs this:** the owner, on the MacBook. Never an agent, never the Mac Mini.

## Which machine does what

| | Machine | Holds a key | Runs `--execute` |
|---|---|---|---|
| Owner | MacBook Pro (`Alejandros-MacBook-Pro`, `/Users/avb`) | **yes — all of them** | **yes** |
| Hermes | Mac Mini (`Claudios-Mac-mini`, `/Users/clawdio`) | **no — zero keys** | **no** |

The Mini runs dry runs (`node scripts/import.mjs`), `npm test`, `npm run validate:schema`,
the mockup renderer, docs and reviews. With no credential file it cannot sign anything, which is
the point. Every signature happens on the MacBook. If a later decision gives the agent machine a
key, that reverses this rule and must be recorded here first, with the reason.

## Why

FastData writes need no deposit and no contract, so the data layer needs no full-access key at
all. Two tiers:

- **Full-access key** — can move funds, add keys, delete the account. Exactly one copy, on the
  MacBook, kept **outside** `~/.near-credentials` (see step 5) and used only to add or remove keys.
- **Function-call key** — one method on one receiver, nothing else. Cannot transfer NEAR or add
  keys. This is what signs imports and (later) near.social posts.

A function-call key covers **one receiver account**, so two are needed:

| Key | Receiver | Methods | Used by |
|---|---|---|---|
| Importer key | `nearhunt.near` | `__fastdata_kv` | `scripts/import.mjs`, on the MacBook |
| near.social key | `social` | `__fastdata_kv` | the Vercel server env (NH-40, Day 3) — not a laptop |

## 1. Take the existing key off the Mini

Run this **on the MacBook**. It reads from the Mini and writes nothing there. There are two copies
of the same full-access key on the Mini — a flat file and a directory — created by one import;
either is enough, so copy the flat one.

```bash
mkdir -p ~/.near-credentials/mainnet && chmod 700 ~/.near-credentials/mainnet
scp "clawdio@Claudios-Mac-mini.local:~/.near-credentials/mainnet/nearhunt.near.json" \
    ~/.near-credentials/mainnet/nearhunt.near.json
chmod 600 ~/.near-credentials/mainnet/nearhunt.near.json
```

The file contains a `master_seed_phrase`. Do not print it, paste it into any chat, or commit it.
From here on the MacBook is the only machine with it.

## 2. Add the importer's function-call key

Run this **on the MacBook**. `sign-with-legacy-keychain` reads the file from step 1, so there is
no seed-phrase prompt. This transaction is also the proof that the key works.

```bash
near account add-key nearhunt.near \
  grant-function-call-access \
  --allowance '0.25 NEAR' \
  --contract-account-id nearhunt.near \
  --function-names '__fastdata_kv' \
  autogenerate-new-keypair save-to-legacy-keychain \
  network-config mainnet sign-with-legacy-keychain send
```

- `--allowance` caps lifetime gas spend. Each import call uses 1 Ggas, so 0.25 NEAR is ample.
- `save-to-legacy-keychain` writes the new key to
  `~/.near-credentials/mainnet/nearhunt.near/<public-key>.json` — a **directory**, not the flat file.

## 3. Check it before touching anything else

```bash
near account list-keys nearhunt.near network-config mainnet now
```

Expected: two keys — the original `full access` **and** a new `FunctionCall` limited to
`nearhunt.near`. If the FunctionCall key is missing, stop; nothing downstream works.

## 4. Move the full-access key out of the credentials tree

The importer prefers the flat `~/.near-credentials/{network}/{account}.json` when it exists.
It now also asks the RPC (`view_access_key`) what the resolved key may do, prints that
permission next to every candidate file, and **refuses to sign an import with a `FullAccess`
key** unless `--accept-full-access` is passed. This step therefore becomes belt-and-braces
rather than the only protection. Do it all the same: a full-access file in the tree is one
flag away from signing, and that file also carries the master seed phrase.

```bash
mkdir -p ~/nearhunt-keys && chmod 700 ~/nearhunt-keys
mv ~/.near-credentials/mainnet/nearhunt.near.json ~/nearhunt-keys/full-access.json
chmod 600 ~/nearhunt-keys/full-access.json
node ~/Projects/near-hunt/scripts/import.mjs --check-key
```

`--check-key` prints `permission: …` for **every** candidate file it finds (the chosen one is
marked `*`). It must now report the **directory** path (`…/nearhunt.near/<public-key>.json`)
and `permission: FunctionCall(nearhunt.near, __fastdata_kv)` — nothing may print
`permission: full access`. That is the function-call key, and it is the only key the importer
can find.

## 5. Clear the Mini

Tell Hermes the MacBook copy is confirmed. Hermes deletes both
`~/.near-credentials/mainnet/nearhunt.near.json` and the `nearhunt.near/` directory on the Mini.
That path is not a Syncthing share, so the deletion is local to the Mini.

Do **not** run `near account delete-keys` on chain at this point. The full-access key is currently
the only full-access key on the account; deleting it would leave an account that can never be
recovered. On-chain rotation to a fresh offline key is a post-hackathon job.

## 6. Run the import (MacBook)

The repo has to exist on the MacBook, not only on the Mini:

```bash
cd ~/Projects/near-hunt || git clone git@github.com:satojandro/near-hunt.git ~/Projects/near-hunt
cd ~/Projects/near-hunt && git pull && npm install
node scripts/import.mjs                  # dry run — paste this output for approval
node scripts/import.mjs --execute --yes  # signs with the function-call key from step 4
```

If the resolved key is still full access, `--execute` exits 1 with the refusal and names this
runbook. That is the guardrail working; do not reach for `--accept-full-access` to get past it,
go back to step 2.

`npm test` and `npm run validate:schema` are read-only and can be run on either machine.

## Taking keys away from a machine

1. Delete the credential file from that machine.
2. If a full-access key ever lived there, treat the account as exposed: add a new full-access key
   from a trusted device, verify it signs, and only then delete the old one on chain.

## Treasury (NH-94)

Donations go to a separate account, for example `treasury.nearhunt.near`, created and held by the
owner. No agent key is ever added to it, and it never signs imports.
