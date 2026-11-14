export interface WalletTx {
  receiverId: string;
  actions: Array<{ type: string; params: Record<string, unknown> }>;
}
export declare const YOCTO_PER_NEAR: bigint;
export declare const MIN_NEAR: string;
export declare const MAX_NEAR: string;
export declare const STAKE_GAS: string;
export declare const PRESETS: string[];
export declare function parseNear(input: unknown): bigint | null;
export declare function checkAmount(input: string): { ok: true; yocto: string } | { ok: false; error: string };
export declare function donationTx(receiverId: string, yocto: string | bigint): WalletTx;
export declare function stakeTx(poolId: string, yocto: string | bigint): WalletTx;
export declare function accountFromEnv(value: unknown): string | null;
export declare function explorerAccountUrl(accountId: string, network: string): string;
export declare function explorerTxUrl(txHash: string, network: string): string;
