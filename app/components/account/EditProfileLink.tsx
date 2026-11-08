'use client';

import { useWallet } from '@/app/components/wallet/WalletProvider';

/** near.social's own profile editor; the edit is signed by the person in their wallet there. */
const PROFILE_EDITOR = 'https://near.social/mob.near/widget/ProfileEditor';

/**
 * NH-50: "Edit profile on near.social", shown only when the signed-in account is the page's
 * account. A client-side check: the server page is the same for every viewer.
 */
export default function EditProfileLink({ accountId, className }: { accountId: string; className?: string }) {
  const { accountId: me } = useWallet();
  if (!me || me !== accountId) return null;
  return (
    <a className={className} href={PROFILE_EDITOR} target="_blank" rel="noopener noreferrer">
      Edit profile on near.social <span aria-hidden="true">↗</span>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
