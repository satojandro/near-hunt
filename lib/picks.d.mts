export interface Pick {
  submission_id: string;
  name: string;
  track: string;
  pitch: string;
  primitives: string[];
}

export interface PicksFile {
  _note: string;
  generated_at: string;
  method: { cutoff: number; per_track_top: boolean };
  reviewed: number;
  picks: Pick[];
}

export declare const DEFAULT_CUTOFF: number;
export declare function effectiveScore(row: { human_score_override?: unknown; weighted_score?: unknown }): number | null;
export declare function selectPicks(
  rows: Array<Record<string, unknown>> | null | undefined,
  opts?: {
    cutoff?: number;
    perTrackTop?: boolean;
    hidden?: unknown;
    duplicates?: { clusters?: Array<{ submissions?: Array<{ submission_id: string }> }> };
  },
): Pick[];
export declare function groupByTrack(picks: Pick[] | null | undefined): Array<{ track: string; items: Pick[] }>;
export declare function trackSlug(track: string): string;
