'use client';

import { useState } from 'react';
import { useWallet } from '@/app/components/wallet/WalletProvider';
import { PRESETS, checkAmount, donationTx, explorerTxUrl, stakeTx } from '@/lib/support.mjs';
import { classifySendResult } from '@/lib/vote-client.mjs';
import { track } from '@/lib/analytics';
import s from './support.module.css';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; txHash: string | null }
  | { kind: 'error'; message: string };

/** Amount picker plus one button; the visitor's wallet signs the transfer or the stake. */
export default function SupportForm({ mode, receiverId }: { mode: 'donate' | 'stake'; receiverId: string }) {
  const { accountId, connect, walletSend, network } = useWallet();
  const [amount, setAmount] = useState(mode === 'donate' ? PRESETS[1] : '25');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const verb = mode === 'donate' ? 'Donate' : 'Stake';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const checked = checkAmount(amount);
    if (!checked.ok) {
      setStatus({ kind: 'error', message: checked.error });
      return;
    }
    if (!accountId) {
      const ok = await connect();
      if (!ok) return;
    }
    setStatus({ kind: 'sending' });
    const tx = mode === 'donate' ? donationTx(receiverId, checked.yocto) : stakeTx(receiverId, checked.yocto);
    let result;
    try {
      result = classifySendResult({ ok: await walletSend(tx) });
    } catch (error) {
      result = classifySendResult({ error });
    }
    if (result.kind === 'written') {
      setStatus({ kind: 'done', txHash: result.txHash });
      track(mode === 'donate' ? 'donate' : 'stake', {});
    } else if (result.kind === 'rejected') {
      setStatus({ kind: 'idle' });
    } else if (result.txHash) {
      // Something came back with a hash: it may have landed. Show the transaction, never resend.
      setStatus({ kind: 'done', txHash: result.txHash });
    } else {
      setStatus({ kind: 'error', message: 'The wallet did not confirm it. Nothing was sent unless your wallet shows it.' });
    }
  }

  if (status.kind === 'done') {
    return (
      <div className={s.thanks} role="status">
        <strong>Thank you!</strong> {mode === 'donate' ? 'Your donation was sent.' : 'Your stake was sent.'}
        {status.txHash ? (
          <>
            {' '}
            <a href={explorerTxUrl(status.txHash, network)} target="_blank" rel="noopener noreferrer">
              View the transaction
            </a>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <div className={s.presets} role="group" aria-label="Amount">
        {(mode === 'donate' ? PRESETS : ['10', '25', '100']).map((p) => (
          <button
            key={p}
            type="button"
            className={s.preset}
            aria-pressed={amount === p}
            onClick={() => setAmount(p)}
          >
            {p} NEAR
          </button>
        ))}
      </div>
      <div className={s.inputRow}>
        <label className={s.label}>
          <span>Amount</span>
          <span className={s.inputWrap}>
            <input
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-describedby={`${mode}-status`}
            />
            <span aria-hidden="true">NEAR</span>
          </span>
        </label>
        <button type="submit" className={s.submit} disabled={status.kind === 'sending'} aria-busy={status.kind === 'sending'}>
          {status.kind === 'sending' ? 'Waiting for wallet…' : accountId ? verb : `Connect & ${verb.toLowerCase()}`}
        </button>
      </div>
      <p id={`${mode}-status`} className={status.kind === 'error' ? s.error : s.small} aria-live="polite">
        {status.kind === 'error' ? status.message : 'Your wallet shows the exact amount before you confirm.'}
      </p>
    </form>
  );
}
