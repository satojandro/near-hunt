'use client';

/**
 * Upvote / remove upvote (NH-31, NH-32) and the near.social share offer (NH-34).
 *
 * The count moves the moment you click; the write is then confirmed against the FastData KV
 * index and rolled back if the index never shows it (30 s) or the send fails. The receipt's
 * `CodeDoesNotExist` failure is the expected outcome of a write to a contract-less account and is
 * never retried (lib/vote-client.mjs).
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useWallet } from '@/app/components/wallet/WalletProvider';
import { shareText } from '@/lib/vote-client.mjs';
import s from './vote.module.css';

type Props = {
  projectId: string;
  initialCount: number;
  variant: 'card' | 'page';
  /** Used in the accessible label and the share text. */
  projectName?: string;
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'pending'; upvote: boolean; viaWallet: boolean }
  | { kind: 'done'; upvote: boolean }
  | { kind: 'error'; message: string };

const NEAR_SOCIAL = 'https://near.social/';

export default function UpvoteButton({ projectId, initialCount, variant, projectName }: Props) {
  const { accountId, loading, connect, myVotes, ensureMyVotes, setMyVote, cast, voteSigning } = useWallet();
  // The number on screen. It starts at the server's count and moves by one on click; a confirmed
  // vote revalidates the route, so `initialCount` then already includes it (issue #5).
  const [count, setCount] = useState(initialCount);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const statusId = useId();
  const busy = phase.kind === 'pending';
  const voted = !!accountId && !!myVotes?.has(projectId);
  const name = projectName ?? 'this project';
  /** True from the click until the write settles: the optimistic number is authoritative. */
  const inFlight = useRef(false);

  // Adopt the server's number when no write is in flight. Adding a local +1 on top of a
  // revalidated count that already includes the vote is exactly what showed two upvotes for one
  // transaction (GitHub issue #5). An in-flight write keeps its optimistic number; when the
  // refreshed count lands after it settles, this adopts it (the same number).
  useEffect(() => {
    if (!inFlight.current) setCount(initialCount);
  }, [initialCount]);

  // Forget local adjustments when the account changes.
  const lastAccount = useRef(accountId);
  useEffect(() => {
    if (lastAccount.current !== accountId) {
      lastAccount.current = accountId;
      inFlight.current = false;
      setCount(initialCount);
      setPhase({ kind: 'idle' });
    }
  }, [accountId, initialCount]);

  // A removed-upvote notice clears itself; the share offer stays until dismissed.
  useEffect(() => {
    if (phase.kind === 'done' && !phase.upvote) {
      const t = setTimeout(() => setPhase({ kind: 'idle' }), 4000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Guards the gap between a click and the pending state (e.g. while the vote read finishes).
  const clicking = useRef(false);

  async function onClick() {
    if (busy || clicking.current) return;
    clicking.current = true;
    try {
      await handleClick();
    } finally {
      clicking.current = false;
    }
  }

  async function handleClick() {
    if (!accountId) {
      // Signed out: the click opens the wallet picker. The person clicks again once connected.
      await connect();
      return;
    }
    // The current vote decides upvote vs remove, so wait for the shared read if it is still running.
    let current: ReadonlySet<string>;
    try {
      current = myVotes ?? (await ensureMyVotes());
    } catch {
      setPhase({ kind: 'error', message: 'Could not read your current votes from NEAR, so nothing was sent. Try again in a moment.' });
      return;
    }

    const upvote = !current.has(projectId);
    const step = upvote ? 1 : -1;
    inFlight.current = true;
    setMyVote(projectId, upvote);
    setCount((c) => Math.max(0, c + step));
    setCopied(false);
    setPhase({ kind: 'pending', upvote, viaWallet: voteSigning() === 'wallet' });

    const rollback = (message: string) => {
      inFlight.current = false;
      setMyVote(projectId, !upvote);
      setCount((c) => Math.max(0, c - step));
      setPhase({ kind: 'error', message });
    };

    let res;
    try {
      res = await cast(projectId, upvote, {
        onWalletFallback: () => setPhase({ kind: 'pending', upvote, viaWallet: true }),
      });
    } catch (err) {
      rollback(`Could not send the vote: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    switch (res.outcome) {
      case 'confirmed':
        // The count on screen is already right; the revalidated `initialCount` will match it.
        inFlight.current = false;
        setPhase({ kind: 'done', upvote });
        return;
      case 'rejected':
        rollback('Cancelled in your wallet. Nothing was sent.');
        return;
      case 'failed':
        rollback(
          res.kind === 'no-allowance'
            ? 'Your NEAR Hunt key has used up its gas allowance. Disconnect and connect again to get a new one.'
            : `Could not sign the vote. Nothing was sent. (${res.detail.slice(0, 140)})`,
        );
        return;
      case 'timeout':
      default:
        rollback(
          upvote
            ? 'The NEAR indexer has not shown your upvote after 30 seconds, so it is not counted here. Reload in a minute: if it landed, it will show.'
            : 'The NEAR indexer has not shown the removal after 30 seconds. Reload in a minute to see where it stands.',
        );
    }
  }

  const label = !accountId
    ? `Upvote ${name}. Connect a NEAR account to vote`
    : voted
      ? `Remove your upvote from ${name}`
      : `Upvote ${name}`;

  const text = shareText({ projectId, projectName });

  async function share() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(NEAR_SOCIAL, '_blank', 'noopener,noreferrer');
  }

  const bubble =
    phase.kind === 'pending' ? (
      <>
        <p className={s.statusTitle}>{phase.upvote ? 'Confirming your vote…' : 'Removing your vote…'}</p>
        <p className={s.statusText}>
          {phase.viaWallet
            ? 'Approve it in your wallet. Your wallet may then say the transaction failed: that is normal for this kind of write. We confirm your vote from the NEAR indexer instead.'
            : 'Signed in your browser with your NEAR Hunt key. Usually takes a few seconds.'}
        </p>
      </>
    ) : phase.kind === 'error' ? (
      <>
        <p className={s.statusText}>{phase.message}</p>
        <button type="button" className={s.linkBtn} onClick={() => setPhase({ kind: 'idle' })}>Dismiss</button>
      </>
    ) : phase.kind === 'done' && !phase.upvote ? (
      <p className={s.statusText}>Upvote removed.</p>
    ) : phase.kind === 'done' && phase.upvote ? (
      <>
        <p className={s.shareTitle}>Tell your near.social followers?</p>
        <p className={s.shareText}>{text}</p>
        <button type="button" className={s.shareBtn} onClick={share}>
          Copy text and open near.social
        </button>
        <p className={s.statusText}>
          {copied
            ? 'Copied. Paste it into the near.social composer.'
            : 'near.social has no link that pre-fills a post, so we copy the text for you. Nothing is posted by NEAR Hunt.'}
        </p>
        <button type="button" className={s.linkBtn} onClick={() => setPhase({ kind: 'idle' })}>Close</button>
      </>
    ) : null;

  const classes = [s.btn, variant === 'card' ? s.card : s.page, voted ? s.voted : '', busy ? s.pending : ''].join(' ');

  return (
    <div
      className={variant === 'card' ? `dir-upvote ${s.wrapCard}` : s.wrapPage}
      // An open bubble must paint above the next cards' upvote boxes (each is its own z-index: 1).
      style={bubble ? { zIndex: 10 } : undefined}
    >
      <button
        type="button"
        className={classes}
        aria-pressed={accountId ? voted : undefined}
        aria-label={`${label}. ${count} ${count === 1 ? 'upvote' : 'upvotes'}`}
        aria-describedby={bubble ? statusId : undefined}
        aria-busy={busy || (loading && !accountId)}
        onClick={onClick}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        {variant === 'page' ? (
          <span>
            {voted ? 'Upvoted' : 'Upvote'} · {count}
          </span>
        ) : (
          <span>{count}</span>
        )}
      </button>
      <div id={statusId} role="status" aria-live="polite" className={bubble ? s.bubble : s.bubbleEmpty}>
        {bubble}
      </div>
    </div>
  );
}
