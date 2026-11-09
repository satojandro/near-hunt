'use client';

/**
 * "— join them!" in the people strip (NH-112).
 *
 * A button that opens the NEAR Connect picker rather than navigating anywhere: the only way to join
 * the people in that row is to vote or comment, and both start with a connected account.
 *
 * Two details that matter:
 *  - The em dash lives here, not in the parent. If it sat in the server component, a signed-in
 *    visitor (who does not get this link) would see a sentence ending in a bare "—".
 *  - `loading` deliberately does not hide it. NEAR Connect is still restoring during SSR and during
 *    hydration, so hiding on `loading` would leave the CTA out of the first paint — the one moment
 *    a new visitor is reading that line. Only a real account hides it.
 */

import { useWallet } from '@/app/components/wallet/WalletProvider';
import s from './participants.module.css';

export default function JoinLink() {
  const { accountId, connect } = useWallet();
  if (accountId) return null;
  return (
    <>
      <span aria-hidden="true">— </span>
      <button
        type="button"
        className={s.join}
        onClick={() => {
          void connect();
        }}
      >
        join them!
      </button>
    </>
  );
}
