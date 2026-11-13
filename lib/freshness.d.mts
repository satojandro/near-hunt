export declare function ageText(fetchedAt: string | number | Date, now: number): string | null;

export interface StaleNotice {
  age: string;
  headline: string;
  body: string;
}

export declare function staleNotice(opts: {
  fetchedAt: string | number | Date;
  now: number;
  readFailing: boolean;
}): StaleNotice | null;

export declare function readIsFailing(opts: {
  lastFailedAt: number;
  lastOkAt: number;
  fetchedAt: string | number | Date;
}): boolean;

/**
 * "as of 4 minutes ago" for a number or list that is a stored copy rather than a live read
 * (lib/snapshot.mjs). Never present a copy as current.
 */
export declare function staleCopyText(fetchedAt: string | number | Date | null | undefined, now?: number): string;

export declare const STALE_COPY_AFTER_MS: number;

/**
 * Whether a copy handed back by the cache must be labelled as a saved copy: a read failed after it
 * was read, it is older than `maxAgeMs`, or its time is unusable.
 */
export declare function copyIsStale(opts: {
  fetchedAt: string | number | Date | null | undefined;
  now: number;
  lastFailedAt?: number;
  maxAgeMs?: number;
}): boolean;
