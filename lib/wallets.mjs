/**
 * NEAR Connect configuration — the ONE place that decides which wallets NEAR Hunt offers.
 *
 * How the list is built: the official NEAR Connect manifest (OFFICIAL_MANIFEST_URLS) is fetched
 * by our own route `/wallet-manifest.json` (app/wallet-manifest.json/route.ts), which drops
 * EXCLUDED_WALLETS and appends EXTRA_WALLETS, and the NearConnector loads that URL. The browser
 * also receives EXCLUDED_WALLETS as `excludedWallets`, so an excluded wallet stays out even if
 * it is injected by a browser extension.
 *
 * To add a wallet: append its NEAR Connect manifest entry to EXTRA_WALLETS. That is the whole
 * change — vote code never names a wallet. A sandbox entry needs `id`, `name`, `icon`, `website`,
 * `version`, `type: "sandbox"`, an `executor` URL pinned to an immutable commit (NEAR Connect
 * downloads and runs that script), `features` (it must have `signInWithFunctionCallKey: true`
 * to appear in our login, because login asks for the vote key) and `permissions`.
 * Example of a future entry — Privy via `@peerfolio/privy-near-connect`
 * (https://docs.near.org/web3-apps/tutorials/privy), NOT enabled: it is out of scope until
 * docs/PLAN.md lists it, and it also needs a `/sign` page and its env vars:
 *
 *   { id: 'nearhunt-privy', name: 'Email or social login', type: 'sandbox', version: '1.0.0',
 *     icon: 'https://nearhunt.xyz/icon.png', website: 'https://nearhunt.xyz', description: '…',
 *     executor: 'https://raw.githubusercontent.com/beneviolabs/privy-near-connect/<commit-sha>/executor.js',
 *     platform: { web: 'https://nearhunt.xyz' },
 *     features: { signInWithFunctionCallKey: true, signAndSendTransaction: true, … , mainnet: true, testnet: true },
 *     permissions: { isPrivyConnect: true, storage: true, allowsOpen: ['https://nearhunt.xyz'] },
 *     metadata: { signPageURL: 'https://nearhunt.xyz/sign' } }
 *
 * To remove one: add its manifest id to EXCLUDED_WALLETS. (NEAR Connect always keeps
 * `hot-wallet`; it ignores an exclusion of that id.)
 */

import { NETWORK, VOTE_ACCOUNT, VOTE_METHOD } from './network.mjs';

/** Where NEAR Connect itself reads the wallet list (same order as @hot-labs/near-connect). */
export const OFFICIAL_MANIFEST_URLS = [
  'https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json',
  'https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json',
];

/** Path of our merged manifest, served by app/wallet-manifest.json/route.ts. */
export const MANIFEST_PATH = '/wallet-manifest.json';

/**
 * Wallets never offered. MyNearWallet entered sunset phase 3 on 1 Nov 2026 and refuses every
 * dApp request (docs/spikes/2026-11-08-nh-35-wallet-tx-to-contractless-receiver.md §1).
 */
export const EXCLUDED_WALLETS = ['mynearwallet'];

/** Extra NEAR Connect manifest entries, appended after the official ones. See the header. */
export const EXTRA_WALLETS = [];

/** yoctoNEAR the login key may spend on gas (0.25 NEAR, NEAR Connect's own default). */
export const VOTE_KEY_ALLOWANCE = '250000000000000000000000';

/**
 * What login asks the wallet for (Path A of the NH-35 spike): a function-call key limited to
 * `VOTE_METHOD` on `VOTE_ACCOUNT`, so votes are signed in the browser without a wallet popup.
 * Shape: near-connect-hooks `signIn({ addFunctionCallKey })`.
 */
export const SIGN_IN_OPTIONS = {
  addFunctionCallKey: {
    contractId: VOTE_ACCOUNT,
    allowMethods: { anyMethod: false, methodNames: [VOTE_METHOD] },
    gasAllowance: { kind: 'limited', amount: VOTE_KEY_ALLOWANCE },
  },
};

/** RPC endpoints (the near-api-js skill's FastNEAR defaults). */
export const RPC_PROVIDERS = {
  mainnet: ['https://free.rpc.fastnear.com'],
  testnet: ['https://test.rpc.fastnear.com'],
};

/** An empty manifest, used while rendering on the server so NEAR Connect fetches nothing there. */
export const EMPTY_MANIFEST = { version: '1.0.0', wallets: [] };

/**
 * Options for `NearProvider` / `new NearConnector(...)`.
 * @param {{ server?: boolean }} [opts]  server: true while rendering on the server
 */
export function connectorOptions({ server = false } = {}) {
  return {
    network: NETWORK,
    providers: RPC_PROVIDERS,
    excludedWallets: EXCLUDED_WALLETS,
    manifest: server ? EMPTY_MANIFEST : MANIFEST_PATH,
  };
}

/**
 * Merge the official manifest with our additions and exclusions. Pure, for the route and tests.
 * @param {{version?: string, wallets?: any[]}|null} official
 */
export function mergeManifest(official, { extra = EXTRA_WALLETS, excluded = EXCLUDED_WALLETS } = {}) {
  const drop = new Set(excluded);
  const byId = new Map();
  // An extra entry with the same id as an official one replaces it.
  for (const w of [...(official?.wallets ?? []), ...extra]) {
    if (!w || typeof w.id !== 'string' || drop.has(w.id)) continue;
    byId.set(w.id, w);
  }
  return { version: official?.version ?? '1.0.0', wallets: [...byId.values()] };
}
