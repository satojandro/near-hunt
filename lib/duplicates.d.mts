export interface DupSubmission { submission_id: string; name: string; on_chain: boolean; urls?: Array<{ field: string; url: string | null | undefined }> }
export declare function urlKey(url: unknown): { key: string; kind: 'repository' | 'x-post' | 'url' } | null;
export declare function findDuplicates(subs: DupSubmission[]): Array<{ key: string; kind: string; submissions: Array<{ submission_id: string; name: string; on_chain: boolean; fields: string[] }> }>;
export declare function clusters(groups: ReturnType<typeof findDuplicates>): Array<{ submissions: Array<{ submission_id: string; name: string; on_chain: boolean }>; shared: Array<{ kind: string; key: string }> }>;
export declare function xAuthor(url: unknown): string | null;
export declare function weakSignals(subs: DupSubmission[]): { same_name: Array<{ key: string; submissions: object[] }>; same_x_account: Array<{ key: string; submissions: object[] }> };
