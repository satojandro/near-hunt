import type { KvEntry } from '../types/nearhunt';

type Network = 'mainnet' | 'testnet';

export declare const VOTE_PREFIX: 'vote/';
export declare const VOTE_GAS: string;
export declare const VOTE_DEPOSIT: '0';
export declare const SITE_ORIGIN: string;

export declare function voteKey(projectId: string): string;
export declare function idFromVoteKey(key: unknown): string | null;
export declare function voteArgs(projectId: string, upvote: boolean): Record<string, Record<string, never> | null>;

export interface VoteAction {
  type: 'FunctionCall';
  params: {
    methodName: string;
    args: Record<string, Record<string, never> | null>;
    gas: string;
    deposit: string;
  };
}
export declare function voteAction(projectId: string, upvote: boolean, methodName?: string): VoteAction;

export declare function isActiveVote(value: unknown): boolean;
export declare function votedIdsFromRows(entries: KvEntry[] | null | undefined, accountId: string): Set<string>;
export declare function accountVotesUrl(opts: { network: Network; voteAccount: string; accountId: string }): string;

interface ReadOpts {
  network: Network;
  voteAccount: string;
  accountId: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}
export declare function readAccountVotes(opts: ReadOpts): Promise<Set<string>>;
export declare function readAccountVote(
  opts: ReadOpts & { projectId: string },
): Promise<{ voted: boolean; blockHeight: number | null }>;

export interface ConfirmResult {
  confirmed: boolean;
  blockHeight: number | null;
  attempts: number;
  lastError: string | null;
}
export declare function confirmVote(
  opts: Omit<ReadOpts, 'signal'> & {
    projectId: string;
    upvote: boolean;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<ConfirmResult>;

export type SendKind = 'written' | 'rejected' | 'key-missing' | 'no-allowance' | 'unknown';
export declare function classifySendResult(result: { ok?: unknown; error?: unknown }): {
  kind: SendKind;
  txHash: string | null;
  detail: string;
};

/** Anything shaped like NEAR Connect's `signAndSendTransaction`. */
export type SignAndSend = (params: { receiverId: string; actions: VoteAction[] }) => Promise<unknown>;

export interface SendResult {
  kind: SendKind;
  txHash: string | null;
  detail: string;
}
export declare function sendVote(opts: {
  signAndSendTransaction: SignAndSend;
  voteAccount: string;
  projectId: string;
  upvote: boolean;
  methodName?: string;
}): Promise<SendResult>;

export interface CastResult extends SendResult {
  outcome: 'confirmed' | 'timeout' | 'rejected' | 'failed';
  blockHeight: number | null;
  usedFallback: boolean;
}
export declare function castVote(opts: {
  signAndSendTransaction: SignAndSend;
  fallbackSend?: (first: SendResult) => Promise<SignAndSend | null | undefined> | SignAndSend | null | undefined;
  network: Network;
  voteAccount: string;
  accountId: string;
  projectId: string;
  upvote: boolean;
  methodName?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
  onSent?: (sent: SendResult) => void;
}): Promise<CastResult>;

export declare function projectUrl(projectId: string): string;
export declare function shareText(opts: { projectId: string; projectName?: string | null }): string;
