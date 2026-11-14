/** Whether an Authorization header is `Bearer <secret>`, compared in constant time. */
export declare function bearerMatches(header: string | null | undefined, secret: string | null | undefined): boolean;
