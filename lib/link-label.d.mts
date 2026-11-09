import type { ProjectLink } from '../types/nearhunt';

export declare const KINDS: NonNullable<ProjectLink['kind']>[];
export declare function gitRepoUrl(url: unknown): string | null;
export declare function cueBefore(text: unknown, at: number): string | null;
export declare function linkIndex(tweet: unknown, url: string): number;
export declare function labelLink(url: string, opts?: { cue?: string | null }): { kind: string; kind_basis: string; repo?: string };
export declare function kindLabel(kind: unknown): string;
export declare function applyLinkChecks(
  results: object[],
  input: { probes: Map<string, object>; repos: Map<string, boolean>; verifiedAt: string },
): { checked: number; repositories_promoted: number };
