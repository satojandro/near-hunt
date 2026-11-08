'use client';

/**
 * Reply composer (NH-42) with near.social's write statuses (NH-83).
 *
 * A reply is a near.social post written to the `social` account. The login key only covers
 * `nearhunt.near` (votes), so every reply is a transaction the person confirms in their wallet.
 * The wallet will report the receipt as failed (`CodeDoesNotExist`, there is no contract on
 * `social`); that is expected, never retried, and the write is confirmed through
 * `GET api2.near.social/v1/tx/{hash}` instead (lib/discussion.mjs).
 *
 * The draft is kept on every outcome except a confirmed post, in state and in localStorage.
 */

import { useEffect, useId, useState } from 'react';
import { useNearWallet } from 'near-connect-hooks';
import { useWallet } from '@/app/components/wallet/WalletProvider';
import {
  composeReplyText, draftLimit, charCount, replySuffix, submitReply, threadUrl,
  type ReplyResult, type SocialSignAndSend,
} from '@/lib/discussion.mjs';
import { profileUrl } from '@/lib/social.mjs';
import ReplyItem, { type ReplyView } from './ReplyItem';
import s from './discussion.module.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'wallet' }
  | { kind: 'confirming' }
  | { kind: 'done'; result: ReplyResult };

const draftKey = (projectId: string) => `nearhunt:reply-draft:${projectId}`;

function readDraft(projectId: string): string {
  try {
    return window.localStorage.getItem(draftKey(projectId)) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(projectId: string, text: string) {
  try {
    if (text) window.localStorage.setItem(draftKey(projectId), text);
    else window.localStorage.removeItem(draftKey(projectId));
  } catch {
    // Storage blocked (private mode): the draft still lives in state.
  }
}

function Outcome({ result, accountId }: { result: ReplyResult; accountId: string }) {
  const mine = `${profileUrl(accountId)}`;
  switch (result.outcome) {
    case 'ok':
      return (
        <p className={`${s.alert} ${s.ok}`} role="status">
          <strong>Reply posted to near.social.</strong> It shows in this thread within a minute.
        </p>
      );
    case 'rejected':
      return (
        <p className={s.alert} role="status">
          <strong>Cancelled in your wallet.</strong> Nothing was posted. Your draft is still here.
        </p>
      );
    case 'rate_limited':
      return (
        <p className={s.alert} role="alert">
          <strong>near.social’s daily limit for {accountId} is reached</strong> (300 posts per account per UTC day).
          The reply was recorded on chain but near.social will not show it. Your draft is kept: post it again after
          00:00 UTC.
        </p>
      );
    case 'invalid':
      return (
        <p className={s.alert} role="alert">
          <strong>near.social rejected the reply as invalid</strong>
          {result.reason ? <>: “{result.reason}”</> : null}. It will not be shown. Your draft is kept, so you can edit
          it and try again.
        </p>
      );
    case 'dropped':
      return (
        <p className={s.alert} role="alert">
          <strong>The reply was too large and was dropped</strong> ({result.reason}). Shorten it and try again; your
          draft is kept.
        </p>
      );
    case 'timeout':
      return (
        <p className={s.alert} role="status">
          <strong>Sent, but near.social has not confirmed it yet.</strong> Check{' '}
          <a href={mine} rel="noopener noreferrer">your posts on near.social</a> before posting again, so it does not
          appear twice. Your draft is kept.
        </p>
      );
    default:
      return (
        <p className={s.alert} role="alert">
          <strong>The reply could not be sent.</strong> {result.reason ? <>({result.reason}) </> : null}Your draft is
          kept; try again.
        </p>
      );
  }
}

export default function ReplyComposer({ parent, projectId }: { parent: string; projectId: string }) {
  const { accountId, loading, connect, network } = useWallet();
  const near = useNearWallet();
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [posted, setPosted] = useState<ReplyView[]>([]);
  const [now, setNow] = useState(0);
  const id = useId();

  // Restore a draft kept from an earlier failure or reload (client only).
  useEffect(() => {
    const saved = readDraft(projectId);
    if (saved) setDraft(saved);
  }, [projectId]);

  const limit = draftLimit(projectId);
  const used = charCount(draft.trim());
  const over = used > limit;
  const busy = phase.kind === 'wallet' || phase.kind === 'confirming';

  if (network !== 'mainnet') {
    return (
      <p className={s.signedOut}>
        <span className={s.hint}>
          Replying is off in this testnet build: near.social runs on mainnet only. Read and reply on{' '}
          <a href={threadUrl(parent)} rel="noopener noreferrer">near.social</a>.
        </span>
      </p>
    );
  }

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
        <span className={s.hint}>Replies are near.social posts from your own NEAR account.</span>
        <button type="button" className={s.btn} onClick={() => void connect()}>Connect to reply</button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const composed = composeReplyText(draft, projectId);
    if (!composed.ok) return;
    setPhase({ kind: 'wallet' });
    const result = await submitReply({
      signAndSendTransaction: near.signAndSendTransaction as unknown as SocialSignAndSend,
      accountId,
      parent,
      text: composed.text,
      onSent: () => setPhase({ kind: 'confirming' }),
    });
    setPhase({ kind: 'done', result });
    if (result.outcome === 'ok') {
      const t = Date.now();
      setNow(t);
      setPosted((prev) => [
        ...prev,
        {
          key: result.postKey,
          author: { account_id: accountId, name: null, avatar_url: null },
          text: result.text,
          created_at: t,
          url: threadUrl(result.postKey),
        },
      ]);
      setDraft('');
      writeDraft(projectId, '');
    }
  }

  return (
    <>
      <form className={s.composer} onSubmit={onSubmit} aria-describedby={`${id}-hint`}>
        <label htmlFor={`${id}-text`} className={s.composerLabel}>
          Reply as <strong>{accountId}</strong>. This posts to near.social, where your followers can see it. Posts are
          public and stay in history even if deleted.
        </label>
        <textarea
          id={`${id}-text`}
          className={s.textarea}
          rows={3}
          placeholder="What would you ask the builders?"
          value={draft}
          disabled={busy}
          onChange={(e) => {
            setDraft(e.target.value);
            writeDraft(projectId, e.target.value);
            if (phase.kind === 'done') setPhase({ kind: 'idle' });
          }}
        />
        <div className={s.composerFoot}>
          <span id={`${id}-hint`} className={s.hint}>
            Adds <code>{replySuffix(projectId)}</code> · 1 transaction, confirmed in your wallet. The wallet may call it
            failed; that is normal for near.social, and we check with near.social instead.
            {used > limit * 0.9 ? (
              <> · <span className={`${s.counter} ${over ? s.over : ''}`}>{used.toLocaleString('en')} / {limit.toLocaleString('en')}</span></>
            ) : null}
          </span>
          <button type="submit" className={s.btn} disabled={busy || used === 0 || over}>
            {phase.kind === 'wallet' ? 'Confirm in wallet…' : phase.kind === 'confirming' ? 'Confirming…' : 'Post reply'}
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {phase.kind === 'done' ? <Outcome result={phase.result} accountId={accountId} /> : null}
      </div>
      {posted.length > 0 ? (
        <ul className={s.list} aria-label="Your new replies" style={{ marginBottom: 18 }}>
          {posted.map((r) => <ReplyItem key={r.key} reply={r} now={now} pending />)}
        </ul>
      ) : null}
    </>
  );
}
