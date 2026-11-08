# NH-35 — does a wallet sign a transaction to a receiver with no contract?

**Spike run:** 2026-11-08 (Day 0 evening into Day 2's first ticket) · **Networks:** testnet for every
write, mainnet read-only · **Verdict: yes, and the plan's wallet list has to change.**

Two answers came out of this, one expected and one not:

| Question | Answer | Confidence |
|---|---|---|
| Do wallets broadcast a `FunctionCall` to a contract-less receiver? | **Yes.** The wallet signs and broadcasts first, then reports the receipt result. No pre-flight refusal in the shipped Meteor client. | High — shipped client code + on-chain probe |
| Does that mean the vote tx works? | **The transaction lands; the receipt fails** with `CodeDoesNotExist`. The indexer stores the row. | Proven on testnet |
| Can MyNearWallet be used at all? | **No.** Mainnet MyNearWallet is in sunset Phase 3 and refuses every dApp request. | Proven, live page |

**Consequence:** NH-30's "Login and logout work in Meteor and MyNearWallet" cannot be met — MyNearWallet
retired app approvals on 1 November. The vote path is chosen in §5.

---

## 1. MyNearWallet is retired for dApp use — this is not a spike finding, it is live

The plan was written before the sunset landed. Checked on 2026-11-08:

```
$ curl -s https://app.mynearwallet.com/            # (via a browser; Cloudflare blocks curl)
window.mnwSunset → {"phase":3,"buildPhase":3,"source":"build"}
body            → "MyNearWallet is in limited mode
                   Sending, staking and app approvals have ended. …"
```

Loading a sign request directly — `https://app.mynearwallet.com/sign?transactions=[]&callbackUrl=https://example.com/cb`:

```
MyNearWallet can no longer approve app requests
example.com sent a request, but MyNearWallet is being retired and no longer approves requests from apps.
Your accounts and funds are safe. Choose another wallet in example.com, or move your account to
Meteor Wallet first and connect with that.
```

Source of truth, [`mynearwallet/my-near-wallet`](https://github.com/mynearwallet/my-near-wallet) `@ 2b3906e`
(2026-11-01):

```ts
// packages/frontend/src/config/sunset.ts
dappConnect: 2,      // /login — new dApp connections retired from phase 2
dappSign: 3,         // /sign — "MyNearWallet can no longer approve app requests"
```

`packages/frontend/src/config/environmentDefaults/mainnet.ts` ships `SUNSET_PHASE: 2`; the live mainnet
build reports `phase: 3`, i.e. the deploy carried the phase-3 override. The testnet deployment is still
`phase: 2` (`https://testnet.mynearwallet.com/` → `{"phase":2,"buildPhase":2,"source":"build"}`): it can
still sign, but no longer accepts new connections.

**So:** there is no MyNearWallet path to test, now or during judging. Remove it from the supported
wallets; the wallet itself tells users to move to Meteor.

---

## 2. Meteor does not pre-flight the call

The Meteor web wallet is closed source, but the shipped bundle is public and readable. What was inspected:

```
url      https://wallet.meteorwallet.app/assets/index-raUw1d1T.js
size     10,273,676 bytes
build    261105-1351   (the string shown in the wallet's own header)
fetched  2026-11-08
```

`signAndSendTransaction` in that bundle (minified, renamed locals):

```js
async signAndSendTransaction({receiverId, actions, returnError}) {
  … [txHash, signedTx] = await this.signTransaction(receiverId, actions);
  try { return await this.connection.provider.sendTransaction(signedTx); }   // ← broadcast first
  catch (gr) { if (gr.type === "InvalidNonce") …retry; if (gr.type === "Expired") …retry; throw gr }
  …
  if (!returnError && pr.status.Failure != null)
    throw new TypedError(`Transaction ${id} failed. ${pr.status.Failure.error_message}`, …);
  return pr;                                                                  // ← status read after
}
```

`signTransaction` → `findAccessKey`, which queries **only the signer's own key**:

```js
provider.query({request_type:"view_access_key", account_id: this.accountId, public_key: …, finality:"optimistic"})
```

Bundle-wide string counts (same file): `preflight` 0, `pre-flight` 0, `code_hash` 4 (all in lockup-contract
logic), no `call_function` or `view_account` anywhere against the *receiver*. The broadcast goes out with
`send_tx` / `wait_until: "EXECUTED_OPTIMISTIC"`.

**Conclusion:** the wallet has no code path that can refuse a transaction because the receiver has no
contract. It signs, broadcasts, and only then looks at the outcome. The failure it then reports is a
display decision, not a gate.

---

## 3. On-chain probe: exactly the vote write, to a contract-less receiver

Receiver `nearhunt.testnet`, whose code hash is the empty-code sentinel:

```
$ near view-account … → code_hash 11111111111111111111111111111111, storage_usage 182
```

**3a. Vote with the account's full-access key**

```bash
near contract call-function as-transaction nearhunt.testnet __fastdata_kv \
  json-args '{"vote/nh35-probe":{"schema":"nearhunt/probe/1"}}' \
  prepaid-gas '1 Ggas' attached-deposit '0 NEAR' \
  sign-as nearhunt.testnet network-config testnet sign-with-keychain send
```

```
├ Your transaction was signed successfully.
Error:
   0: Error: An error occurred during a `FunctionCall` action.
      CompilationError(CodeDoesNotExist { account_id: AccountId("nearhunt.testnet") })
```

**3b. The login-key path: add a function-call key, then vote with it**

```bash
near account add-key nearhunt.testnet grant-function-call-access \
  --allowance '0.25 NEAR' --contract-account-id nearhunt.testnet --function-names __fastdata_kv \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-keychain send
# → Transaction ID: 25pxE45RPAqzDp7FdZi8nhyzr9b5S2VTkBUz8EeFUUXG
# → Added access key = ed25519:CtbM8UFFvWr42V5kxKmX2JjyXqbto7zb945VRQXQumay

near contract call-function as-transaction nearhunt.testnet __fastdata_kv \
  json-args '{"vote/nh35-probe-fckey":{}}' \
  prepaid-gas '1 Ggas' attached-deposit '0 NEAR' sign-as nearhunt.testnet network-config testnet \
  sign-with-access-key-file ~/.near-credentials/testnet/nearhunt.testnet/ed25519_CtbM8UFF…Qumay.json send
# → CompilationError(CodeDoesNotExist { account_id: AccountId("nearhunt.testnet") })
```

Note that the `AddKey` action itself **succeeds** on a contract-less account: `AddKey` is a native action,
not a function call, so no contract code is needed. Only `FunctionCall` needs code.

**3c. What the chain recorded** — both rows indexed despite the failed receipts:

```
$ curl -s -X POST https://kv.test.fastnear.com/v0/latest/nearhunt.testnet \
       -H 'content-type: application/json' -d '{"key_prefix":"vote/","limit":10}'

{"entries":[
  {"predecessor_id":"nearhunt.testnet","current_account_id":"nearhunt.testnet",
   "block_height":276753225,"key":"vote/nh35-probe","value":{"schema":"nearhunt/probe/1"}},
  {"predecessor_id":"nearhunt.testnet","current_account_id":"nearhunt.testnet",
   "block_height":276753372,"key":"vote/nh35-probe-fckey","value":{}}
]}
```

**3d. The exact outcome shape** (`EXPERIMENTAL_tx_status` on the function-call-key tx
`7gDSszcZtKcvieVz8h353GBHnbqQUUeQuf2DnvJG56DR`, 10 shards, `final_execution_status: FINAL`):

```
transaction_outcome.outcome.status = {"SuccessReceiptId":"EqCuQfdR2rML5C24KfQyTFwjJd294ags77vBqY7nw23d"}
status                              = {"Failure":{"ActionError":{"index":0,"kind":{"FunctionCallError":
                                       {"CompilationError":{"CodeDoesNotExist":{"account_id":"nearhunt.testnet"}}}}}}}
```

The transaction succeeded; the function-call receipt failed. `send_tx` returns that final status, which is
what near-api-js reads in the snippet in §2 — so a wallet-confirmed vote **is broadcast and lands** and the
wallet then reports "Transaction … failed. Cannot find contract code for account nearhunt.near."

---

## 4. What this means for the client

The receipt status must never be the source of truth. `CodeDoesNotExist` is the *success* signal for a
FastData write. Confirm by reading the KV index (already the rule in `lib/kv.mjs`).

Two workable paths, both proven enough to build on:

**Path A — chosen: one login approval, then local signing (no per-vote popup).**
Meteor's own SDK supports exactly this. `signIn({ addFunctionCallKey: { contractId, allowMethods } })`
generates the key pair **in the dApp**, sends only the public key to the wallet (which adds it on chain as
part of the login action), keeps the `KeyPair` in the SDK's `KeyStore`, and returns it:

```ts
// packages/meteor-sdk-v1/src/MeteorWallet.ts (meteor_wallet_sdk @ cb83d1b)
keyPairToAdd = KeyPair.fromRandom("ed25519");
…
await getMeteorPostMessenger().connectAndWaitForResponse({actionType: login, inputs: {
  public_key: finalFunctionCallKey?.publicKey,
  methods: allowMethods.anyMethod === false ? allowMethods.methodNames : [],
  contract_id: finalFunctionCallKey?.contractId, …}})
…
await this._keyStore.setKey(this._networkId, accountId, keyPairToAdd);
return {success: true, payload: {accessKey: keyPairToAdd, accountId, …}};
```

The app then builds the vote transaction, signs it with that key, broadcasts, and treats
`CodeDoesNotExist` as expected. The vote is a `FunctionCall` on `nearhunt.near`, method `__fastdata_kv`,
args `{"vote/{project_id}": {}}`, 1 Ggas, 0 deposit — the shape proven in §3.

**Path B — fallback, also works: wallet-confirmed vote.**
`wallet-selector.signAndSendTransaction` per vote. It lands and is indexed, but the user sees a failure
dialog each time. Keep this only if Path A overruns; NH-31's "the wallet will say failed" copy is for this
path.

Either way: **MyNearWallet is not in the supported list.**

## 5. Reproduce

```bash
# empty-code receiver + both write paths
near contract call-function as-transaction nearhunt.testnet __fastdata_kv …   # §3a

# the wallet's decision logic, as shipped (bundle id is in the file name)
curl -sL https://wallet.meteorwallet.app/assets/index-raUw1d1T.js | grep -o 'preflight' | wc -l   # 0

# mainnet MyNearWallet, read in a real browser (Cloudflare blocks curl):
#   https://app.mynearwallet.com/  → window.mnwSunset = {"phase":3,"buildPhase":3,"source":"build"}
#   https://app.mynearwallet.com/sign?transactions=[]&callbackUrl=https://example.com/cb
#                                  → "MyNearWallet can no longer approve app requests"

curl -s -X POST https://kv.test.fastnear.com/v0/latest/nearhunt.testnet \
     -H 'content-type: application/json' -d '{"key_prefix":"vote/"}'
```

## 6. What this spike did **not** prove

- **No click-through in Meteor with a real account.** The run was headless and the client is closed source,
  so the evidence is the shipped bundle plus the chain probe, not a signed screenshot. A two-minute manual
  confirmation (login to Meteor web with a throwaway testnet account, vote once, watch the KV row appear)
  is still worth doing on Day 2 — but nothing in the code suggests it can fail.
- **No mainnet write.** `AGENTS.md` requires a human-approved diff, and a vote would need a voter's own
  account. The mainnet case differs only in the account id (`nearhunt.near`, also `code_hash 1111…`), which
  the import transactions already prove.
- **The Meteor extension was not inspected.** It talks to the same wallet backend and account code; the
  behaviour above is the shared path.
- Left on testnet (harmless, listed so nobody wonders): one function-call key on `nearhunt.testnet`
  (`ed25519:CtbM8UFF…Qumay`, 0.25 NEAR allowance), and two probe rows `vote/nh35-probe`,
  `vote/nh35-probe-fckey`.
