import type { SocialAction } from './discussion.mjs';

export declare const POSTER_ACCOUNT: 'nearhunt.near';
export declare const MAX_BATCH: 40;
export declare const DESCRIPTION_MAX: number;

interface ProjectLike {
  submission_id: string;
  name: string;
  description?: string | null;
  social_post?: string | null;
  block_height?: number;
}

export declare function rootPostText(project: ProjectLike): string;
export declare function rootPostArgs(project: ProjectLike, postId: string): Record<string, { text: string }>;
export declare function rootPostTransaction(
  project: ProjectLike,
  postId: string,
): { signerId: 'nearhunt.near'; receiverId: 'social'; actions: SocialAction[] };
export declare function selectBatch<T extends ProjectLike>(items: T[], limit?: number): T[];

export interface SocialPostPlan {
  account: 'nearhunt.near';
  receiver: 'social';
  method: '__fastdata_kv';
  gas: string;
  deposit: '0';
  candidates: number;
  already_posted: number;
  posts: Array<{
    submission_id: string;
    name: string;
    post_ref: string;
    tx: ReturnType<typeof rootPostTransaction>;
    bytes: number;
  }>;
  transactions: number;
  total_bytes: number;
  overlay: Record<string, string>;
}
export declare function planSocialPosts(opts: { items: ProjectLike[]; limit?: number; startMs: number }): SocialPostPlan;
