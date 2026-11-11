export type ClaimAction = 'claim' | 'remove';
export type ClaimBasis = 'owner' | 'collaborator';

export interface Claim {
  github_id: number;
  github_login: string;
  /** `owner/repo` as GitHub named it at verification time. */
  repository: string | null;
  basis: ClaimBasis;
  /** ISO 8601, server clock. */
  verified_at: string;
}

export declare const CLAIM_COOKIE: 'nh_claim';
export declare const CLAIM_STATE_TTL_SECONDS: number;
export declare const CLAIM_ACTIONS: readonly ClaimAction[];
export declare const CLAIM_OUTCOMES: Readonly<Record<string, string>>;

export declare function claimKey(submissionId: string): string;
export declare function claimableRepo(project: { repository_url?: string | null } | null | undefined): string | null;
export declare function encodeState(s: { state: string; action: ClaimAction; id: string; verifier: string }): string;
export declare function decodeState(cookie: unknown): { state: string; action: ClaimAction; id: string; verifier: string } | null;
export declare function sameState(a: unknown, b: unknown): boolean;
export declare function authorizeUrl(o: { base?: string; clientId: string; redirectUri: string; state: string; verifier: string }): string;
export declare function ownershipBasis(user: unknown, repo: unknown): ClaimBasis | null;
export declare function claimRecord(o: { user: unknown; repo: unknown; basis: ClaimBasis | null; now?: Date }): Claim;
export declare function parseClaims(json: unknown): Claim[];
export declare function outcomeMessage(code: unknown): string | null;
export declare function pkceChallenge(verifier: string): string;
