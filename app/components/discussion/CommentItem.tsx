// One comment in the discussion (NH-44, mockup board 2). A plain view: no hooks, no server
// imports, so the server page and the client section can both render it.
import { relativeTime } from '@/lib/social.mjs';
import type { Comment } from '@/lib/comments.mjs';
import PostText from './PostText';
import s from './discussion.module.css';

export interface ProfileView {
  name: string | null;
  avatar_url: string | null;
}

type Props = {
  comment: Comment;
  profile?: ProfileView;
  /** `now` comes from the server so the first client render matches it (no hydration drift). */
  now: number;
  mine: boolean;
  depth?: 0 | 1;
  pending?: boolean;
  confirming?: boolean;
  deleting?: boolean;
  onReply?: () => void;
  onDelete?: () => void;
  onCancelDelete?: () => void;
};

function Avatar({ author, profile }: { author: string; profile?: ProfileView }) {
  if (profile?.avatar_url) {
    return (
      // Plain <img>: avatars live on near.social's file host; next/image would need it configured.
      <img
        className={s.avatar}
        src={profile.avatar_url}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }
  const letter = ((profile?.name ?? author).match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return <span className={s.avatar} aria-hidden="true">{letter}</span>;
}

export default function CommentItem({
  comment,
  profile,
  now,
  mine,
  depth = 0,
  pending = false,
  confirming = false,
  deleting = false,
  onReply,
  onDelete,
  onCancelDelete,
}: Props) {
  const name = profile?.name ?? null;
  return (
    <li
      id={`c-${comment.author}-${comment.id}`}
      className={`${s.reply} ${pending ? s.pending : ''} ${depth === 1 ? s.nested : ''}`}
    >
      <Avatar author={comment.author} profile={profile} />
      <div className={s.body}>
        <div className={s.meta}>
          <span className={s.name}>{name ?? comment.author}</span>
          {name ? <span>{comment.author}</span> : null}
          {comment.created_at ? (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={new Date(comment.created_at).toISOString()} title={new Date(comment.created_at).toUTCString()}>
                {relativeTime(comment.created_at, now)}
              </time>
            </>
          ) : null}
          {pending ? <><span aria-hidden="true">·</span><span>just posted</span></> : null}
        </div>
        <PostText text={comment.text} className={s.text} />
        <div className={s.actions}>
          {onReply ? (
            <button type="button" className={s.action} onClick={onReply}>
              Reply<span className="visually-hidden"> to {comment.author}</span>
            </button>
          ) : null}
          {mine ? (
            confirming ? (
              <>
                <button type="button" className={`${s.action} ${s.danger}`} onClick={onDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button type="button" className={s.action} onClick={onCancelDelete} disabled={deleting}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className={s.action} onClick={onDelete}>
                Delete<span className="visually-hidden"> your comment</span>
              </button>
            )
          ) : null}
          {pending ? <span>Saving… confirmed when it appears on chain</span> : null}
        </div>
      </div>
    </li>
  );
}
