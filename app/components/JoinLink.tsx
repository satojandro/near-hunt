'use client';

/**
 * "join them!" in the people strip (NH-112).
 *
 * A link that opens the NEAR Connect picker rather than navigating anywhere: the only way to join
 * the people in that row is to vote or comment, and both start with a connected account. Hidden
 * once you are already signed in, because you have joined.
 */

import { useWallet } from '@/app/components/wallet/WalletProvider';
import s from './participants.module.css';

export default function JoinLink() {
  const { accountId, loading, connect } = useWallet();
  if (loading || accountId) return null;
  return (
    <button
      type="button"
      className={s.join}
      onClick={() => {
        void connect();
      }}
    >
      join them!
    </button>
  );
}
