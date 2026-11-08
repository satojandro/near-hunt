'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from './WalletProvider';

/** Header connect / account button (NH-30). Opens the NEAR Connect wallet picker. */
export default function ConnectButton() {
  const { loading, accountId, connect, disconnect, network } = useWallet();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!accountId) {
    return (
      <button
        type="button"
        className="connect-btn"
        aria-busy={loading || busy}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await connect();
          setBusy(false);
        }}
      >
        Connect<span className="connect-long">NEAR account</span>
      </button>
    );
  }

  return (
    <div className="account-menu" ref={wrap}>
      <button
        type="button"
        className="account-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={accountId}
      >
        <span className="account-initial" aria-hidden="true">{accountId.slice(0, 1).toUpperCase()}</span>
        <span className="account-id">{accountId}</span>
        {network === 'testnet' ? <span className="account-net">testnet</span> : null}
      </button>
      {open ? (
        <div className="account-pop" role="menu">
          <p className="account-pop-note">Signed in with NEAR Connect.</p>
          <button
            type="button"
            role="menuitem"
            className="account-pop-item"
            onClick={async () => {
              setOpen(false);
              await disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
