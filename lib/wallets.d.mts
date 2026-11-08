/** A NEAR Connect wallet manifest entry (see @hot-labs/near-connect WalletManifest). */
export interface WalletManifestEntry {
  id: string;
  name: string;
  type: 'sandbox';
  executor: string;
  [key: string]: unknown;
}
export interface WalletManifest {
  version: string;
  wallets: WalletManifestEntry[];
}

export declare const OFFICIAL_MANIFEST_URLS: string[];
export declare const MANIFEST_PATH: string;
export declare const EXCLUDED_WALLETS: string[];
export declare const EXTRA_WALLETS: WalletManifestEntry[];
export declare const VOTE_KEY_ALLOWANCE: string;
export declare const SIGN_IN_OPTIONS: {
  addFunctionCallKey: {
    contractId: string;
    allowMethods: { anyMethod: false; methodNames: string[] };
    gasAllowance: { kind: 'limited'; amount: string };
  };
};
export declare const RPC_PROVIDERS: { mainnet: string[]; testnet: string[] };
export declare const EMPTY_MANIFEST: WalletManifest;
export declare function connectorOptions(opts?: { server?: boolean }): {
  network: 'mainnet' | 'testnet';
  providers: { mainnet: string[]; testnet: string[] };
  excludedWallets: string[];
  manifest: string | WalletManifest;
};
export declare function mergeManifest(
  official: Partial<WalletManifest> | null | undefined,
  opts?: { extra?: WalletManifestEntry[]; excluded?: string[] },
): WalletManifest;
