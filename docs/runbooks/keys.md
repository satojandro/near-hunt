# Runbook: NEAR keys for NEAR Hunt

**Who runs this:** Hermes or the owner. The key lives on the Mac Mini and that is fine — the
gate is **prior authorization of the specific write**, not which machine holds the key (owner's
decision, 8 Nov 2026).

## What is where

| Machine | Home | Holds the key | May run `--execute` |
|---|---|---|---|
| Mac Mini (`Claudios-Mac-mini`) | `/Users/clawdio` | yes — this is where the importer runs | yes, after the owner authorizes that write |
| MacBook Pro (`Alejandros-MacBook-Pro`) | `/Users/avb` | possible second copy, owner's call | yes, same rule |

Two credential files for `nearhunt.near` exist on the Mini, both written by one import: a flat
`~/.near-credentials/mainnet/nearhunt.near.json` and a directory
`~/.near-credentials/mainnet/nearhunt.near/<public-key>.json`. The importer resolves either. Both
are mode `600` and contain the master seed phrase, which is why they are never printed, logged,
pasted into a chat or committed.

## The gate: authorization, per write

1. Run the dry run and keep its output: `node scripts/import.mjs`.
2. State what will be written — account, prefix, key count, transaction count — and get a yes
   **for that write**.
3. Then `--execute --yes`.

Authorization for one import does not extend to the next one, and never covers adding or deleting
access keys, transferring NEAR, or deleting an account; those need their own explicit approval.

## Key tiers

FastData writes need no deposit and no contract, so the data layer needs no full-access key:

- **Full-access key** — can move funds, add keys, delete the account. Used only to add or remove
  keys, and only by the owner.
- **Function-call key** — one method on one receiver. Cannot transfer NEAR or add keys. This is
  what the importer should sign with.

A function-call key covers **one receiver account**, so two exist:

| Key | Receiver | Methods | Used by |
|---|---|---|---|
| Importer key | `nearhunt.near` | `__fastdata_kv` | `scripts/import.mjs` |
| near.social key | `social` | `__fastdata_kv` | the Vercel server env (NH-40, Day 3) |

## Checking which key the importer will use

```bash
node scripts/import.mjs --check-key
```

It reads `view_access_key` for every candidate file, prints each one's on-chain permission and
marks the chosen file. An import signed by a `FullAccess` key is refused unless
`--accept-full-access` is passed — that flag exists so the refusal is a decision, not a wall.
Imports are expected to use the `FunctionCall` key.

## Adding the function-call key (if it is ever missing)

```bash
near account add-key nearhunt.near \
  grant-function-call-access \
  --allowance '0.25 NEAR' \
  --contract-account-id nearhunt.near \
  --function-names '__fastdata_kv' \
  autogenerate-new-keypair save-to-legacy-keychain \
  network-config mainnet sign-with-legacy-keychain send
```

`--allowance` caps lifetime gas spend; each import call uses 1 Ggas, so 0.25 NEAR is ample.
`save-to-legacy-keychain` writes `~/.near-credentials/mainnet/nearhunt.near/<public-key>.json`.

`sign-with-keychain` works when the key is in the macOS keychain; `sign-with-legacy-keychain`
reads the flat file; `sign-with-seed-phrase` prompts for the phrase. Any of them is fine.

## Running the import

```bash
node scripts/import.mjs                  # dry run — this is what the owner authorizes
node scripts/import.mjs --execute --yes  # after the yes
```

The script verifies every written key against the FastData indexer afterwards and exits non-zero
if any key has not appeared. A failed receipt (`CodeDoesNotExist`) is expected and is not a
failure: `nearhunt.near` has no contract, and the indexer records the row anyway (proven in
`docs/spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md`).

`npm test` and `npm run validate:schema` are read-only.

## Do not, without explicit approval

- Add or delete access keys, or rotate the full-access key. The account currently has one
  full-access key; deleting it would leave it unrecoverable.
- Transfer NEAR from `nearhunt.near`.
- Delete or tombstone a project record.
- Print, log, commit or paste a secret key or seed phrase anywhere.

## Treasury (NH-94)

Donations go to a separate account, for example `treasury.nearhunt.near`, created and held by the
owner. It never signs imports.
