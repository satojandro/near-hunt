'use client';

/**
 * Comment composer (NH-44).
 *
 * A comment is a row in `nearhunt.near` written with the login key — the same key that signs
 * upvotes — so there is no wallet pop-up and no failure dialog. The receipt fails with
 * `CodeDoesNotExist` (there is no contract) and that is expected; the write is confirmed by
 * reading the row back from the KV index (lib/comments.mjs).
 *
 * Used for a new comment and, with `replyTo`, for a reply under one comment.
 */

import { useId, useState } from 'react';
import { useWallet } from '@/app/components/wallet/WalletProvider';
import { NETWORK, VOTE_ACCOUNT, VOTE_METHOD } from '@/lib/network.mjs';
import {
  MAX_COMMENT_CHARS,
  charCount,
  commentUrl,
  submitComment,
  validateCommentText,
  type Comment,
  type SubmitCommentResult,
} from '@/lib/comments.mjs';
import { profileUrl } from '@/lib/social.mjs';
import { commentsChanged } from '@/app/actions/comments';
import { track } from '@/lib/analytics';
import s from './discussion.module.css';

type Props = {
  projectId: string;
  replyTo?: Comment | null;
  onPosted: (comment: Comment) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
};

type Phase = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; result: SubmitCommentResult } | { kind: 'error'; message: string };

function Outcome({ result, accountId }: { result: SubmitCommentResult; accountId: string }) {
  switch (result.outcome) {
    case 'confirmed':
      return (
        <p className={`${s.alert} ${s.ok}`} role="status">
          <strong>Comment posted.</strong> It is on chain and shows here now.
        </p>
      );
    case 'timeout':
      return (
        <p className={s.alert} role="status">
          <strong>Sent, but NEAR has not confirmed it yet.</strong> Check{' '}
          <a href={profileUrl(accountId)} rel="noopener noreferrer">your comments</a> or reload in a minute before posting
          again, so it does not appear twice.
        </p>
      );
    case 'rejected':
      return (
        <p className={s.alert} role="status">
          <strong>Cancelled in your wallet.</strong> Nothing was written. Your text is still here.
        </p>
      );
    default:
      return (
        <p className={s.alert} role="alert">
          <strong>The comment could not be signed.</strong>{' '}
          {result.kind === 'no-allowance'
            ? 'Your NEAR Hunt key has used up its gas allowance: disconnect and connect again to get a new one.'
            : result.kind === 'key-missing'
              ? 'Your NEAR Hunt key is no longer on chain: disconnect and connect again to get a new one.'
              : `Nothing was written (${result.detail.slice(0, 140)}).`}{' '}
          Your text is kept.
        </p>
      );
  }
}

export default function CommentComposer({ projectId, replyTo = null, onPosted, onCancel, autoFocus = false }: Props) {
  const { accountId, loading, connect, commentSender } = useWallet();
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const id = useId();
  const busy = phase.kind === 'sending';
  const used = charCount(draft.trim());
  const over = used > MAX_COMMENT_CHARS;

  if (loading) {
    return (
      <div className={s.signedOut} aria-busy="true">
        <span className={s.hint}>Checking your wallet…</span>
      </div>
    );
  }

  if (!accountId) {
    return (
      <div className={s.signedOut}>
        <span className={s.hint}>Comments are signed by your own NEAR account. One click to connect, then no pop-ups.</span>
        <button type="button" className={s.btn} onClick={() => void connect()}>Connect to comment</button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const valid = validateCommentText(draft);
    if (!valid.ok) return;
    setPhase({ kind: 'sending' });

    const { send, fallbackSend } = commentSender();
    let result: SubmitCommentResult;
    try {
      result = await submitComment({
        signAndSendTransaction: send,
        fallbackSend,
        network: NETWORK,
        account: VOTE_ACCOUNT,
        accountId,
        projectId,
        text: valid.text,
        replyTo: replyTo?.ref ?? null,
        methodName: VOTE_METHOD,
      });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      return;
    }

    if (result.outcome === 'confirmed') {
      track('comment', { kind: replyTo ? 'reply' : 'new', project: projectId });
      const now = Date.now();
      onPosted({
        key: result.key,
        id: result.id,
        ref: `${accountId}/${result.id}`,
        project_id: projectId,
        author: accountId,
        text: result.text ?? valid.text,
        truncated: false,
        created_at: now,
        block_height: result.blockHeight,
        reply_to: replyTo?.ref ?? null,
        url: commentUrl(projectId, accountId, result.id),
      });
      setDraft('');
      // Fire-and-forget: a failed invalidation only means the old 15 s cache, never a lost write.
      commentsChanged().catch(() => {});
    }
    setPhase({ kind: 'done', result });
  }

  return (
    <form className={s.composer} onSubmit={onSubmit} aria-describedby={`${id}-hint`}>
      <label htmlFor={`${id}-text`} className={s.composerLabel}>
        {replyTo ? (
          <>Reply to <strong>{replyTo.author}</strong> as <strong>{accountId}</strong>.</>
        ) : (
          <>Comment as <strong>{accountId}</strong>.</>
        )}{' '}
        Comments are public and stay in history even if deleted.
      </label>
      <textarea
        id={`${id}-text`}
        className={s.textarea}
        rows={3}
        placeholder={replyTo ? 'Add to this comment…' : 'What would you ask the builders?'}
        value={draft}
        disabled={busy}
        autoFocus={autoFocus}
        onChange={(e) => {
          setDraft(e.target.value);
          if (phase.kind === 'done' || phase.kind === 'error') setPhase({ kind: 'idle' });
        }}
      />
      <div className={s.composerFoot}>
        <span id={`${id}-hint`} className={s.hint}>
          Signed with your NEAR Hunt login, like an upvote. No wallet pop-up ·{' '}
          <span className={`${s.counter} ${over ? s.over : ''}`}>
            {used.toLocaleString('en')} / {MAX_COMMENT_CHARS.toLocaleString('en')}
          </span>
        </span>
        <span className={s.composerButtons}>
          {onCancel ? (
            <button type="button" className={s.btnQuiet} onClick={onCancel} disabled={busy}>Cancel</button>
          ) : null}
          <button type="submit" className={s.btn} disabled={busy || used === 0 || over}>
            {busy ? 'Posting…' : replyTo ? 'Post reply' : 'Post comment'}
          </button>
        </span>
      </div>
      <div aria-live="polite" className={s.outcomeSlot}>
        {phase.kind === 'done' ? <Outcome result={phase.result} accountId={accountId} /> : null}
        {phase.kind === 'error' ? (
          <p className={s.alert} role="alert">
            <strong>The comment could not be sent.</strong> {phase.message} Your text is kept.
          </p>
        ) : null}
      </div>
    </form>
  );
}
