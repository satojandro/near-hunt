# Runbook: signing writes to `nearhunt.near`

**Who runs this:** whoever holds the signing key — the owner, or an agent acting after the owner
has authorized that specific write. Custody is not the control. Authorization is.

## The gate: one approval per write

1. Run the dry run and keep its output: `node scripts/import.mjs`.
2. State what will be written — account, prefix, key count, transaction count — and get a yes
   **for that write**.
3. Then `--execute --yes`.

Approval covers that write only; it does not extend to the next import, and it never covers
adding or deleting access keys, transferring NEAR, deleting an account, or tombstoning records.
Those need their own explicit yes.

Operational details — which machine holds which key, and where the credential files are — are
deliberately **not written down in this repository**: it is public. Keep them in the owner's
notes, not in git.

## Key tiers

FastData writes need no deposit and no contract, so the data layer does not need a full-access key:

- **Full-access key** — can move funds, add keys, delete the account. Used only to add or remove
  keys, and only by the owner.
- **Function-call key** — one method on one receiver. Cannot transfer NEAR or add keys. This is
  what imports should be signed with.

A function-call key covers **one receiver account**, so two are needed:

| Key | Receiver | Methods | Used by |
|---|---|---|---|
| Importer key | `nearhunt.near` | `__fastdata_kv` | `scripts/import.mjs` |
| near.social key | `social` | `__fastdata_kv` | the server that creates project posts (NH-40) — never a laptop |

## Checking which key the importer will use

```bash
node scripts/import.mjs --check-key
```

It reads `view_access_key` for every candidate credential file, prints each one's on-chain
permission, and marks the chosen file. An import signed by a `FullAccess` key is refused unless
`--accept-full-access` is passed, so the refusal is a decision rather than a wall. Imports are
expected to use the `FunctionCall` key.

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

Which signer form to use (`sign-with-keychain`, `sign-with-legacy-keychain`,
`sign-with-access-key-file`, `sign-with-seed-phrase`) depends on where the key was stored; run
`near account add-key grant-function-call-access autogenerate-new-keypair --help` for the current
list rather than trusting a copy of it.

The importer resolves either credential layout the NEAR CLIs write — see the header of
`scripts/import.mjs` — and prints every path it tried when neither exists.

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

## Never, regardless of approval

- Print, log, commit or paste a secret key or seed phrase. Nothing under a credentials directory
  is ever tracked by git.
- Leave credential files readable by any other user on the machine that holds them.
- Transfer NEAR from `nearhunt.near`, or delete or tombstone a project record, without a separate
  explicit yes.
- Delete the account's remaining full-access key without first confirming a replacement works:
  a function-call key cannot add keys, so that is irreversible.

## Treasury (NH-94)

> Donations: `team.nearhunt.near`, a sub-account of `nearhunt.near` holding no data and no key that
> signs writes (created 14 Nov, tx `2Z4KYZ6…`), so the data-publishing account never also holds
> funds. `NEXT_PUBLIC_DONATION_ACCOUNT` overrides it. Nothing here is signed by an agent.

## What the chain actually holds (checked 12 Nov 2026, after the importer key was added)

`view_access_key_list nearhunt.near` returns **three** keys:

- `ed25519:2WMyEz8FTeywPbziEhTxJhpHuViUENp1bDQ5uFFwgTeA` — **FunctionCall, receiver
  `nearhunt.near`, `__fastdata_kv`, allowance 0.25 NEAR.** The importer key. Added 12 Nov in tx
  `AA7pbAPeA5phsCbp664Sg8o3PAsgBFeH5D8Z1Kz2Zipc`, owner-approved, secret at
  `~/.near-credentials/mainnet/nearhunt.near/ed25519_2WMy….json` (mode 600).
- `ed25519:2ozjdhsUK6iAAWrGtizUtqkx8ms9FSDzKBwedMSa2gaW` — FunctionCall, receiver `social`,
  `__fastdata_kv`/`__fastdata_fastfs`. The near.social key; it cannot sign an import, whose calls
  go to receiver `nearhunt.near`.
- `ed25519:EXQAnyijsEeUa9yKqk3z2FKDqLcaHWsZ6wuVEm2sW5yw` — **FullAccess**. Used only to add or remove
  keys. Its credential files were moved out of `~/.near-credentials` to
  `~/.near-credentials-archive/` (mode 600) on 12 Nov, because the importer resolves the flat
  file first and would have kept signing with full access; `--key-file <archive path>` still works
  when a key operation needs it.

`node scripts/import.mjs --check-key` prints one candidate and its on-chain permission:
`permission: FunctionCall(nearhunt.near, __fastdata_kv)`. Batches 12–21 were signed with the
FullAccess key under `--accept-full-access` because the importer key did not exist then; batch 22
is the first that signs with the scoped key.

