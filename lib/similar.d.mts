export declare const SIMILAR_LIMIT: number;
export declare function similarProjects<P extends { submission_id: string; name?: string; tracks?: string[] }>(
  project: P,
  all: Iterable<P> | null | undefined,
  limit?: number,
): Array<{ project: P; shared: string[] }>;
