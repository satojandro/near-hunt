import type { Claim } from './claims.mjs';
import type { SendKind } from './vote-client.mjs';

export declare const MAKER_PREFIX: 'maker/';
export declare const LINK_COOKIE: 'nh_link';
export declare const LINK_TTL_SECONDS: number;
export declare function isLinkCode(v: unknown): v is string;
export declare function isNearAccountId(v: unknown): v is string;
export declare function makerKey(submissionId: string): string;
export interface MakerTransaction { receiverId: string; actions: unknown[] }
export declare function makerTransaction(o: { account: string; submissionId: string; code: string; methodName?: string }): MakerTransaction;
export interface MakerRow { key: string; predecessor_id: string; value: unknown }
export declare function rowLinks(rows: MakerRow[] | null | undefined, o: { submissionId: string; account: unknown; code: unknown }): boolean;
export declare function linkedAccount(claim: Pick<Claim, 'near_account' | 'link_code'> | null | undefined, rows: MakerRow[] | null | undefined, submissionId: string): string | null;
export declare function sendMakerRow(o: {
  send: (tx: unknown) => Promise<unknown>;
  fallbackSend?: (sent: unknown) => ((tx: unknown) => Promise<unknown>) | null | Promise<((tx: unknown) => Promise<unknown>) | null>;
  transaction: MakerTransaction;
}): Promise<{ kind: SendKind; txHash: string | null; detail: string }>;
