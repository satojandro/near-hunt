'use client';

/**
 * NH-51 list of the account's upvotes, and NH-53 "Remove vote" for the account's owner.
 *
 * The rows are read on the server (writer-scoped `vote/` rows joined with live projects); this
 * component only renders them. When the signed-in account is the page's account, each row gets a
 * remove control that goes through the same `cast(id, false)` path as the upvote button (NH-32):
 * the row leaves the list at once, the write is confirmed against the KV index, and the row comes
 * back with a message if the wallet declines or the index never shows the removal.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useWallet } from '@/app/components/wallet/WalletProvider';
import s from './account.module.css';

export interface UpvoteRow {
  id: string;
  name: string;
  /** Track labels, already human-readable. */
  tracks: string[];
  /** "Upvoted 2h ago", or null when the block time is unknown. */
  when: string | null;
  block_height: number;
}

type Notice = { id: string; name: string; kind: 'pending' | 'done' | 'error'; text: string };

const nf = new Intl.NumberFormat('en-US');

function failureText(outcome: string, kind: string, detail: string): string {
  switch (outcome) {
    case 'rejected':
      return 'Cancelled in your wallet. Nothing was sent.';
    case 'failed':
      return kind === 'no-allowance'
        ? 'Your NEAR Hunt key has used up its gas allowance. Disconnect and connect again to get a new one.'
        : `Could not sign the removal. Nothing was sent. (${detail.slice(0, 140)})`;
    default:
      return 'The NEAR indexer has not shown the removal after 30 seconds. Reload in a minute to see where it stands.';
  }
}

export default function UpvotesList({ accountId, rows }: { accountId: string; rows: UpvoteRow[] }) {
  const { accountId: me, cast, setMyVote, voteSigning } = useWallet();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [notices, setNotices] = useState<Notice[]>([]);
  const isOwner = !!me && me === accountId;

  const setNotice = (n: Notice) => setNotices((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, 3));
  const toggle = (id: string, gone: boolean) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (gone) next.add(id);
      else next.delete(id);
      return next;
    });

  async function remove(row: UpvoteRow) {
    if (!isOwner || removed.has(row.id)) return;
    const viaWallet = voteSigning() === 'wallet';
    toggle(row.id, true);
    setMyVote(row.id, false);
    setNotice({
      id: row.id,
      name: row.name,
      kind: 'pending',
      text: viaWallet
        ? `Removing your upvote from ${row.name}… Approve it in your wallet. Your wallet may say the transaction failed: that is normal for this kind of write; we confirm from the NEAR indexer.`
        : `Removing your upvote from ${row.name}…`,
    });
    const rollback = (text: string) => {
      toggle(row.id, false);
      setMyVote(row.id, true);
      setNotice({ id: row.id, name: row.name, kind: 'error', text });
    };
    try {
      const res = await cast(row.id, false);
      if (res.outcome === 'confirmed') {
        setNotice({ id: row.id, name: row.name, kind: 'done', text: `Upvote removed from ${row.name}.` });
      } else {
        rollback(failureText(res.outcome, res.kind, res.detail));
      }
    } catch (err) {
      rollback(`Could not send the removal: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const visible = rows.filter((r) => !removed.has(r.id));

  return (
    <>
      <div role="status" aria-live="polite">
        {notices.map((n) => (
          <p key={n.id} className={n.kind === 'error' ? s.rowError : s.status}>
            {n.kind === 'error' ? `Could not remove your upvote from ${n.name}. ` : ''}
            {n.text}
          </p>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className={s.empty}>
          {rows.length === 0 ? `${accountId} has not upvoted any projects yet. ` : 'No upvotes left. '}
          <Link href="/">Browse projects</Link>
        </p>
      ) : (
        <ul className={s.grid}>
          {visible.map((r) => (
            <li key={r.id} className={s.card}>
              <h3 className={s.cardTitle}>
                <Link href={`/p/${encodeURIComponent(r.id)}`}>{r.name}</Link>
              </h3>
              {r.tracks.length > 0 ? <p className={s.tracks}>{r.tracks.join(' · ')}</p> : null}
              <div className={s.cardFoot}>
                <span className={s.when}>
                  {r.when ? `${r.when} · ` : ''}block {nf.format(r.block_height)}
                </span>
                {isOwner ? (
                  <button
                    type="button"
                    className={s.removeBtn}
                    onClick={() => remove(r)}
                    aria-label={`Remove your upvote from ${r.name}`}
                  >
                    Remove vote
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
