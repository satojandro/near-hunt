'use client';

// NH-119, steps 2-3 in the browser (lib/claim-link.mjs): after a passed GitHub check, the person
// may link the NEAR account they are signed in with. The row is signed like a vote; the server
// confirms it from the index, never from what this component says.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/app/components/wallet/WalletProvider';
import { VOTE_ACCOUNT, VOTE_METHOD } from '@/lib/network.mjs';
import { makerTransaction, sendMakerRow } from '@/lib/claim-link.mjs';
import s from './similar.module.css';

type Pending = { id: string; github_login: string; code: string };
type Phase = 'idle' | 'signing' | 'confirming' | 'linked' | 'slow' | 'rejected' | 'expired' | 'failed';

const TRIES = 20;
const INTERVAL_MS = 1500;

export default function LinkNearAccount({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { accountId, loading, connect, commentSender } = useWallet();
  const [pending, setPending] = useState<Pending | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    let live = true;
    fetch('/api/claim/link', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { pending: Pending | null }) => {
        if (live && j.pending?.id === projectId) setPending(j.pending);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId]);

  const confirm = useCallback(async (account: string) => {
    setPhase('confirming');
    for (let i = 0; i < TRIES; i++) {
      const res = await fetch('/api/claim/link', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account }),
      }).then((r) => r.json()).catch(() => ({ status: 'pending' }));
      if (res.status === 'linked') {
        setPhase('linked');
        router.refresh();
        return;
      }
      if (res.status === 'expired') return setPhase('expired');
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
    setPhase('slow');
  }, [router]);

  const link = useCallback(async () => {
    if (!pending || !accountId) return;
    setPhase('signing');
    const { send, fallbackSend } = commentSender();
    const sent = await sendMakerRow({
      send, fallbackSend,
      transaction: makerTransaction({ account: VOTE_ACCOUNT, submissionId: pending.id, code: pending.code, methodName: VOTE_METHOD }),
    });
    if (sent.kind === 'rejected') return setPhase('rejected');
    if (sent.kind === 'key-missing' || sent.kind === 'no-allowance') return setPhase('failed');
    // 'written' or 'unknown': it may be on chain. Never resend; ask the index.
    await confirm(accountId);
  }, [pending, accountId, commentSender, confirm]);

  if (!pending || loading) return null;
  if (phase === 'linked') {
    return <p className={s.claimNotice} role="status">{accountId} is now linked to @{pending.github_login} for this project.</p>;
  }
  const busy = phase === 'signing' || phase === 'confirming';

  return (
    <div className={s.linkStep}>
      <h3 className={s.linkTitle}>Link your NEAR account (optional)</h3>
      {accountId ? (
        <>
          <p className={s.claimText}>
            Show <strong>{accountId}</strong> next to @{pending.github_login} on this project. Your account
            signs one public row on NEAR. It links the two accounts in public history permanently,
            even if you withdraw it later.
          </p>
          <button type="button" className={s.claimButton} onClick={link} disabled={busy}>
            {phase === 'signing' ? 'Signing…' : phase === 'confirming' ? 'Waiting for the index…' : `Link ${accountId}`}
          </button>
        </>
      ) : (
        <>
          <p className={s.claimText}>Sign in with your NEAR account to show it next to @{pending.github_login}.</p>
          <button type="button" className={s.claimButton} onClick={() => void connect()}>Sign in with NEAR</button>
        </>
      )}
      <p className={s.makerNote} role="status">
        {phase === 'rejected' ? 'Declined in the wallet. Nothing was written.' : null}
        {phase === 'failed' ? 'The row could not be signed. Sign out, sign in again and retry.' : null}
        {phase === 'expired' ? 'This step expired. Claim the project again to restart it.' : null}
        {phase === 'slow' ? (
          <>The row was sent but the index has not shown it yet. <button type="button" className={s.claimRemove} onClick={() => void confirm(accountId)}>Check again</button></>
        ) : null}
      </p>
    </div>
  );
}
