'use client';

/**
 * The project's discussion (NH-44): comments as rows on `nearhunt.near`, one level of replies,
 * authored by the row's `predecessor_id`. Anyone can comment; only the author can delete their
 * own row, and NEAR Hunt can hide one through the repo hide list (never by writing a comment).
 *
 * The server component (Discussion.tsx) reads the comments and the authors' near.social profiles;
 * this component owns the interactive list: the composer, reply, delete, and the state of each.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/app/components/wallet/WalletProvider';
import { NETWORK, VOTE_ACCOUNT, VOTE_METHOD } from '@/lib/network.mjs';
import { POLICY_PATH, submitComment, threadView, type Comment, type CommentNode } from '@/lib/comments.mjs';
import { commentsChanged } from '@/app/actions/comments';
import CommentComposer from './CommentComposer';
import CommentItem, { type ProfileView } from './CommentItem';
import s from './discussion.module.css';

const TITLE_ID = 'discussion-title';

type Props = {
  projectId: string;
  /** The newest comments, oldest first (already cut to PAGE_LIMIT by the server). */
  initialItems: Comment[];
  /** Total visible comments, including any older than `initialItems`. */
  count: number;
  available: boolean;
  profiles: Record<string, ProfileView>;
  /** False when near.social (names and avatars) could not be reached; comments still show. */
  profilesAvailable: boolean;
  /** Server time, so relative times do not differ between the first render and hydration. */
  now: number;
};

function insertComment(nodes: CommentNode[], c: Comment): CommentNode[] {
  if (c.reply_to) {
    // Hang it under the top-level comment it answers (threadView gives the same shape).
    const root = nodes.find((n) => n.ref === c.reply_to || n.replies.some((r) => r.ref === c.reply_to));
    if (root) {
      const next = nodes.slice();
      const i = nodes.indexOf(root);
      next[i] = { ...root, replies: [...root.replies, c] };
      return next;
    }
  }
  return [...nodes, { ...c, replies: [] }];
}

function removeComment(nodes: CommentNode[], target: Comment): CommentNode[] {
  const out: CommentNode[] = [];
  for (const n of nodes) {
    if (n.ref === target.ref) {
      // A deleted parent's replies are their own rows: keep them visible, promoted to top level.
      for (const r of n.replies) out.push({ ...r, replies: [] });
      continue;
    }
    const root = n.ref === target.reply_to || n.replies.some((r) => r.ref === target.ref)
      ? { ...n, replies: n.replies.filter((r) => r.ref !== target.ref) }
      : n;
    out.push(root);
  }
  return out;
}

export default function CommentsSection({
  projectId,
  initialItems,
  count,
  available,
  profiles,
  profilesAvailable,
  now,
}: Props) {
  const { accountId, commentSender } = useWallet();
  const [nodes, setNodes] = useState<CommentNode[]>(() => threadView(initialItems));
  const [total, setTotal] = useState(count);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Comments on screen: each thread's first comment plus its replies. `nodes.length` alone is the
  // number of threads, which made a page showing both of its 2 comments say "newest 1 of 2".
  const shownCount = nodes.reduce((n, node) => n + 1 + node.replies.length, 0);

  const mine = (c: Comment) => !!accountId && c.author === accountId;

  function onPosted(c: Comment) {
    setNodes((prev) => insertComment(prev, c));
    setTotal((n) => n + 1);
    if (c.reply_to) setReplyTo(null);
  }

  async function onDelete(c: Comment) {
    if (!accountId) return;
    if (confirming !== c.ref) {
      setConfirming(c.ref);
      return;
    }
    setConfirming(null);
    setDeleting(c.ref);
    setError(null);
    try {
      const { send, fallbackSend } = commentSender();
      const res = await submitComment({
        signAndSendTransaction: send,
        fallbackSend,
        network: NETWORK,
        account: VOTE_ACCOUNT,
        accountId,
        projectId,
        id: c.id,
        deleted: true,
        methodName: VOTE_METHOD,
      });
      if (res.outcome === 'confirmed') {
        setNodes((prev) => removeComment(prev, c));
        setTotal((n) => Math.max(0, n - 1));
        commentsChanged().catch(() => {});
      } else if (res.outcome === 'timeout') {
        setError('The NEAR indexer has not shown the deletion yet. Reload in a minute to see where it stands.');
      } else if (res.outcome === 'rejected') {
        setError('Cancelled in your wallet. Nothing was deleted.');
      } else {
        setError(
          res.kind === 'no-allowance'
            ? 'Your NEAR Hunt key has used up its gas allowance. Disconnect and connect again to get a new one.'
            : `The deletion could not be signed. Nothing was deleted. (${res.detail.slice(0, 140)})`,
        );
      }
    } catch (err) {
      setError(`Could not send the deletion: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(null);
    }
  }

  function item(c: Comment, depth: 0 | 1) {
    return (
      <CommentItem
        comment={c}
        profile={profiles[c.author]}
        now={now}
        mine={mine(c)}
        depth={depth}
        confirming={confirming === c.ref}
        deleting={deleting === c.ref}
        onReply={() => setReplyTo(c)}
        onDelete={() => void onDelete(c)}
        onCancelDelete={() => setConfirming(null)}
      />
    );
  }

  return (
    <section className={s.card} aria-labelledby={TITLE_ID}>
      <div className={s.head}>
        <h2 id={TITLE_ID} className={s.title}>
          Discussion
          {available ? (
            <span className={s.titleCount}> · {total} {total === 1 ? 'comment' : 'comments'}</span>
          ) : null}
        </h2>
        <span className={s.headNote}>Each comment is signed by its author on NEAR</span>
      </div>

      {!available ? (
        <p className={s.alert} role="status">
          <strong>Comments cannot be read right now.</strong> The NEAR indexer is not answering. You can still post; it
          will show once the indexer is back.
        </p>
      ) : null}

      {!profilesAvailable && nodes.length > 0 ? (
        <p className={s.note}>near.social is not responding, so names and avatars are missing; the comments themselves are from the chain.</p>
      ) : null}

      <CommentComposer projectId={projectId} onPosted={onPosted} />

      {error ? (
        <p className={s.alert} role="alert">
          <strong>That did not go through.</strong> {error}
        </p>
      ) : null}

      {available && total === 0 ? (
        <p className={s.note}>No comments yet. Start the discussion.</p>
      ) : null}

      {nodes.length > 0 ? (
        <>
          {total > shownCount ? (
            <p className={s.note}>
              Showing the newest {shownCount} of {total} comments.{' '}
              <a href={`/api/projects/${encodeURIComponent(projectId)}/discussion?limit=100`} rel="noopener noreferrer">
                Read all comment rows
              </a>
            </p>
          ) : null}
          <ul className={s.list} style={{ marginTop: 18 }}>
            {nodes.map((n) => (
              <li key={n.ref} className={s.threadItem}>
                {item(n, 0)}
                {replyTo?.ref === n.ref ? (
                  <div className={s.inlineComposer}>
                    <CommentComposer
                      projectId={projectId}
                      replyTo={n}
                      onPosted={onPosted}
                      onCancel={() => setReplyTo(null)}
                      autoFocus
                    />
                  </div>
                ) : null}
                {n.replies.length > 0 ? (
                  <ul className={s.replies}>
                    {n.replies.map((r) => (
                      <li key={r.ref} className={s.threadItem}>
                        {item(r, 1)}
                        {replyTo?.ref === r.ref ? (
                          <div className={s.inlineComposer}>
                            <CommentComposer
                              projectId={projectId}
                              replyTo={r}
                              onPosted={onPosted}
                              onCancel={() => setReplyTo(null)}
                              autoFocus
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className={s.policy}>
        Comments are public rows on <code>nearhunt.near</code> under{' '}
        <code>comment/{projectId.slice(0, 8)}…</code>. Only the author can delete one, because only they can write their
        own row. NEAR Hunt hides a comment that breaks the <Link href={POLICY_PATH}>comment policy</Link>.
      </p>
    </section>
  );
}
