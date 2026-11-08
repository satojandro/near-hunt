# Runbook: NEAR keys for NEAR Hunt

**Who runs this:** a human with the full-access key for `nearhunt.near`. Never an agent.

## Why

FastData writes need no deposit and no contract, so the only key the importer needs is a
**function-call access key**: it can call one method on one receiver and nothing else. It
cannot transfer NEAR, add keys or delete the account. If it leaks, the worst case is junk
records under `project/` (fixable by re-running the importer), not lost funds.

A function-call key covers **one receiver account**. NEAR Hunt needs:

| Key | Receiver | Methods | Used by |
|---|---|---|---|
| Importer key | `nearhunt.near` | `__fastdata_kv` | `scripts/import.mjs` (human or Hermes, after approval) |
| near.social key | `social` | `__fastdata_kv` | the server that creates project posts (NH-40), Day 3 |

The full-access key stays with a human, ideally offline, and is used only to add or remove keys.

## Add the importer key

With [near-cli-rs](https://github.com/near/near-cli-rs). Check the exact flags first with
`near account add-key --help`, because option names have changed between versions:

```bash
near account add-key nearhunt.near \
  grant-function-call-access \
  --allowance '0.25 NEAR' \
  --contract-account-id nearhunt.near \
  --function-names '__fastdata_kv' \
  autogenerate-new-keypair save-to-legacy-keychain \
  network-config mainnet sign-with-keychain send
```

- `--allowance` caps the gas this key can ever spend. Each import call uses 1 Ggas, so
  0.25 NEAR is far more than needed.
- `save-to-legacy-keychain` writes the new key to
  `~/.near-credentials/mainnet/nearhunt.near/<public-key>.json`. The importer finds it without
  extra flags (see below).

Check it is there and limited:

```bash
near account list-keys nearhunt.near network-config mainnet now
```

The new key must show `FunctionCall` with receiver `nearhunt.near`, not `FullAccess`.

## Use it

The importer reads both credential layouts the NEAR CLIs write — the flat
`~/.near-credentials/{network}/{account}.json` of older near-cli and the
`~/.near-credentials/{network}/{account}/<public-key>.json` directory of near-cli-rs — and
names every path it tried when neither exists:

```bash
node scripts/import.mjs --check-key      # resolve + parse the key file, sign nothing
node scripts/import.mjs                  # dry run, review the diff
node scripts/import.mjs --execute --yes   # no --key-file needed
```

If the directory holds more than one key (full access, rotated, function call), the importer
uses the newest file and prints all of them; pin the intended one with
`--key-file ~/.near-credentials/mainnet/nearhunt.near/<public-key>.json`.

## Take keys away from an agent

1. Delete the key file from the agent's machine.
2. If a full-access key was ever on an agent's machine, rotate it: add a new full-access key
   from a trusted device, then delete the old one:

```bash
near account delete-keys nearhunt.near public-keys <old-public-key> network-config mainnet sign-with-keychain send
```

## Treasury (NH-94)

Donations go to a separate account, for example `treasury.nearhunt.near`, created and held by a
human. No agent key is ever added to it.
