import type { ProjectMedia } from '../types/nearhunt';

export declare const MEDIA_HOST: 'pbs.twimg.com';
export declare const MAX_MEDIA: number;

export interface MediaViewItem {
  type: 'photo' | 'video';
  src: string;
  full: string;
  width: number | null;
  height: number | null;
  alt: string;
  duration: string | null;
  postUrl: string;
  /** X's player iframe for a video (NH-96b: plays in place), null for a photo. */
  embedUrl: string | null;
}

export declare function safeMediaUrl(url: unknown): string | null;
export declare function mediaFromPost(tweet: unknown): ProjectMedia[];
export declare function mediaFromChain(chain: unknown[]): ProjectMedia[];
export declare function formatDuration(ms: unknown): string | null;
export declare function mediaView(project: { media?: unknown } | null | undefined): MediaViewItem[];
