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
