import type { KvEntry } from '../types/nearhunt';

export declare const KV_HOSTS: { mainnet: string; testnet: string };
export declare const DEFAULT_ACCOUNT: string;

interface ReadOpts {
  account?: string;
  network?: 'mainnet' | 'testnet';
  fetchImpl?: typeof fetch;
}

export declare function readLatest(
  opts: ReadOpts & { account: string; writer?: string; keyPrefix?: string; key?: string },
): Promise<KvEntry[]>;
export declare function readProjects(opts?: ReadOpts): Promise<KvEntry[]>;
export declare function readForeignProjectRows(opts?: ReadOpts): Promise<KvEntry[]>;
/** JSON.parse that keeps each `entries[].block_timestamp` as the API's exact decimal digits. */
export declare function parseKvJson(text: string): { entries?: KvEntry[]; page_token?: string | null } & Record<string, unknown>;
