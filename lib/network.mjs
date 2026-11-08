/**
 * Which network the app talks to for votes and wallet login (Day 2 shared contract).
 *
 * Project records always come from mainnet `nearhunt.near` (lib/kv.mjs). Votes are written to,
 * and tallied from, `VOTE_ACCOUNT` on `NETWORK`. Set `NEXT_PUBLIC_NEAR_NETWORK=testnet` to try the
 * whole connect-and-vote flow against `nearhunt.testnet` without touching mainnet (AGENTS.md §1).
 * Anything other than "testnet" means mainnet.
 */
export const NETWORK = process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';

/** Receiver of `__fastdata_kv` vote writes, and the namespace votes are read from. */
export const VOTE_ACCOUNT = NETWORK === 'testnet' ? 'nearhunt.testnet' : 'nearhunt.near';

/** The only method the login function-call key may call. */
export const VOTE_METHOD = '__fastdata_kv';
