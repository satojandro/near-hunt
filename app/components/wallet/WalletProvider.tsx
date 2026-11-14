'use client';

/**
 * NEAR Connect login (NH-30) and the signed-in account's votes (NH-31/32), for the whole app.
 *
 * Wallet choice, network and the login key request all come from lib/wallets.mjs; this file
 * names no wallet. The provider is a client component that renders its children unchanged, so
 * the pages under it stay server components and keep reading KV on the server.
 *
 * Login (Path A of the NH-35 spike): near-connect-hooks' `signIn({ addFunctionCallKey })`
 * generates a key pair in the browser (function-call-key-plugin), asks the chosen wallet to add
 * its public key as a function-call key for VOTE_METHOD on VOTE_ACCOUNT, and installs a plugin
 * that signs matching transactions locally — so a vote needs no wallet popup. If the wallet did
 * not add the key, the vote falls back to a wallet-confirmed transaction (Path B).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NearProvider, useNearWallet } from 'near-connect-hooks';
import { NETWORK, VOTE_ACCOUNT, VOTE_METHOD } from '@/lib/network.mjs';
import { SIGN_IN_OPTIONS, connectorOptions } from '@/lib/wallets.mjs';
import { castVote, readAccountVotes, type CastResult, type SignAndSend } from '@/lib/vote-client.mjs';
import { votesChanged } from '@/app/actions/votes';
import { track } from '@/lib/analytics';

/** Where function-call-key-plugin keeps the login key (documented in its README). */
const PLUGIN_STORAGE_KEY = 'access_key::plugin';

export type VoteSigning = 'local' | 'wallet';

interface WalletContextValue {
  /** True until NEAR Connect has restored (or not) a previous session. */
  loading: boolean;
  accountId: string;
  network: 'mainnet' | 'testnet';
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  /** `local`: the login key signs votes (no popup). `wallet`: each vote opens the wallet. */
  voteSigning: () => VoteSigning;
  /** Project ids this account upvotes; null while unknown (signed out, loading or failed). */
  myVotes: ReadonlySet<string> | null;
  votesError: string | null;
  /** The account's votes, waiting for the shared read in flight (or retrying a failed one). */
  ensureMyVotes: () => Promise<ReadonlySet<string>>;
  setMyVote: (projectId: string, voted: boolean) => void;
  /** `onWalletFallback` runs when the login key cannot sign and the wallet is asked instead. */
  cast: (projectId: string, upvote: boolean, opts?: { onWalletFallback?: () => void }) => Promise<CastResult>;
  /**
   * The same sender for comment writes (NH-44): `send` signs with the login key, and
   * `fallbackSend` drops a key the chain no longer accepts so the next send goes to the wallet.
   * Typed for any transaction shape so the comment module does not depend on the vote types.
   */
  commentSender: () => { send: (tx: unknown) => Promise<unknown>; fallbackSend: () => ((tx: unknown) => Promise<unknown>) | null };
  /**
   * Any other transaction (NH-121: a donation or a stake). It carries a deposit, which the login
   * key cannot attach, so the plugin passes it to the wallet and the visitor confirms it there.
   */
  walletSend: (tx: unknown) => Promise<unknown>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}

function readLocalKey(): { contractId?: string; methodNames?: string[] } | null {
  try {
    const raw = window.localStorage.getItem(PLUGIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function hasVoteKey(): boolean {
  const key = readLocalKey();
  return !!key && key.contractId === VOTE_ACCOUNT && (key.methodNames?.length === 0 || !!key.methodNames?.includes(VOTE_METHOD));
}

function Inner({ children }: { children: React.ReactNode }) {
  const near = useNearWallet();
  const { signedAccountId: accountId, loading } = near;
  const [myVotes, setMyVotes] = useState<Set<string> | null>(null);
  const [votesError, setVotesError] = useState<string | null>(null);
  // The latest hook value, for callbacks that outlive a render.
  const nearRef = useRef(near);
  nearRef.current = near;

  // One read of the account's `vote/` rows, shared by every upvote button on the page.
  const readRef = useRef<{ accountId: string; promise: Promise<Set<string>> } | null>(null);
  const startRead = useCallback((id: string, signal?: AbortSignal) => {
    const promise = readAccountVotes({ network: NETWORK, voteAccount: VOTE_ACCOUNT, accountId: id, signal });
    readRef.current = { accountId: id, promise };
    promise
      .then((ids) => {
        if (readRef.current?.promise === promise) {
          setMyVotes(ids);
          setVotesError(null);
        }
      })
      .catch((err: unknown) => {
        if (readRef.current?.promise === promise && !signal?.aborted) {
          setVotesError(err instanceof Error ? err.message : String(err));
          readRef.current = null;
        }
      });
    return promise;
  }, []);

  useEffect(() => {
    setMyVotes(null);
    setVotesError(null);
    readRef.current = null;
    if (!accountId) return;
    const ctrl = new AbortController();
    startRead(accountId, ctrl.signal).catch(() => {});
    return () => ctrl.abort();
  }, [accountId, startRead]);

  const ensureMyVotes = useCallback(async () => {
    const id = nearRef.current.signedAccountId;
    if (!id) throw new Error('not signed in');
    const current = readRef.current;
    return current && current.accountId === id ? current.promise : startRead(id);
  }, [startRead]);

  const connect = useCallback(async () => {
    try {
      await nearRef.current.signIn(SIGN_IN_OPTIONS);
      track('wallet_connect');
      return true;
    } catch (err) {
      // Closing the picker or declining in the wallet lands here; nothing changed.
      console.info('NEAR Connect sign-in did not complete:', err instanceof Error ? err.message : err);
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    await nearRef.current.signOut();
  }, []);

  const setMyVote = useCallback((projectId: string, voted: boolean) => {
    setMyVotes((prev) => {
      const next = new Set(prev ?? []);
      if (voted) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  }, []);

  const cast = useCallback(
    (projectId: string, upvote: boolean, opts?: { onWalletFallback?: () => void }) => {
      const send = nearRef.current.signAndSendTransaction as unknown as SignAndSend;
      const result = castVote({
        signAndSendTransaction: send,
        // The login key is missing on chain or out of allowance: forget it, so the plugin hands the
        // next send to the wallet, and send this vote once through the wallet.
        fallbackSend: () => {
          try {
            window.localStorage.removeItem(PLUGIN_STORAGE_KEY);
          } catch {
            return null;
          }
          opts?.onWalletFallback?.();
          return send;
        },
        network: NETWORK,
        voteAccount: VOTE_ACCOUNT,
        accountId: nearRef.current.signedAccountId,
        projectId,
        upvote,
        methodName: VOTE_METHOD,
      });
      // Once the index shows the vote, expire the server's cached tally so every page reads the
      // new count on its next render instead of up to 20 s later. Fire-and-forget: a failed
      // invalidation only means the old 20 s lag, and must never turn a counted vote into an error.
      // No router.refresh(): the buttons already show the vote optimistically, and re-rendering
      // them with the new server count on top of their local adjustment would count it twice.
      result.then((res) => {
        if (res.outcome === 'confirmed') {
          votesChanged().catch(() => {});
          // The funnel signal the chain cannot split: a confirmed write plus the intent around it.
          track(upvote ? 'vote' : 'unvote', { project: projectId });
        }
      }, () => {});
      return result;
    },
    [],
  );

  const commentSender = useCallback(() => {
    const send = nearRef.current.signAndSendTransaction as unknown as (tx: unknown) => Promise<unknown>;
    const fallbackSend = () => {
      try {
        window.localStorage.removeItem(PLUGIN_STORAGE_KEY);
      } catch {
        return null;
      }
      return send;
    };
    return { send, fallbackSend };
  }, []);

  const walletSend = useCallback(
    (tx: unknown) => (nearRef.current.signAndSendTransaction as unknown as (tx: unknown) => Promise<unknown>)(tx),
    [],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      loading,
      accountId,
      network: NETWORK,
      connect,
      disconnect,
      voteSigning: () => (hasVoteKey() ? 'local' : 'wallet'),
      myVotes,
      votesError,
      ensureMyVotes,
      setMyVote,
      cast,
      commentSender,
      walletSend,
    }),
    [loading, accountId, connect, disconnect, myVotes, votesError, ensureMyVotes, setMyVote, cast, commentSender, walletSend],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export default function WalletProvider({ children }: { children: React.ReactNode }) {
  // On the server NEAR Connect gets an empty manifest so it fetches nothing; the browser builds
  // its own connector during hydration with the real manifest URL.
  const config = useMemo(
    () => connectorOptions({ server: typeof window === 'undefined' }) as Parameters<typeof NearProvider>[0]['config'],
    [],
  );
  return (
    <NearProvider config={config}>
      <Inner>{children}</Inner>
    </NearProvider>
  );
}
