import type { ListingItem } from './listing.mjs';
import type { Project } from '../types/nearhunt';

export declare const NOT_SUPPLIED: 'Not supplied';
export declare const BLOCK_EXPLORER: string;

export interface LinkRow {
  label: string;
  /** Only set for a well-formed https URL. */
  href: string | null;
  text: string;
  supplied: boolean;
  note?: string;
}

export interface RecordRow {
  label: string;
  value: string;
  href: string | null;
  mono?: boolean;
}

export declare function safeHttpsUrl(url: unknown): string | null;
export declare function linkHost(url: unknown): string | null;
export declare function linkText(url: unknown): string | null;
export declare function linkRow(label: string, url: unknown): LinkRow;
export declare function isXPost(url: unknown): boolean;
export declare function extraLinkLabel(url: unknown): string;
export declare function linkRows(
  project: Pick<Project, 'demo_url' | 'repository_url' | 'source'> & { links?: Array<{ url: string } | string> | null },
): LinkRow[];
export declare function descriptionView(description: string | null | undefined): { supplied: boolean; text: string };
export declare function eventLabel(event: unknown): string | null;
export declare function formatBlockHeight(height: unknown): string | null;
export declare function explorerBlockUrl(height: unknown): string | null;
export declare function formatUtc(iso: unknown): string | null;
export declare function kvRecordUrl(opts: { account: string; key: string; network?: 'mainnet' | 'testnet' }): string | null;
export declare function recordRows(item: ListingItem): RecordRow[];
export declare function metaDescription(item: ListingItem, labelFor?: (track: string) => string): string;
