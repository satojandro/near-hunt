// One reply in the thread. Shared by the server-rendered thread and the composer's "just posted"
// echo, so it has no hooks and no server-only imports.
import { relativeTime } from '@/lib/social.mjs';
import PostText from './PostText';
import s from './discussion.module.css';

export interface ReplyView {
  key: string;
  author: { account_id: string; name: string | null; avatar_url: string | null };
  text: string;
  truncated?: boolean;
  media_count?: number;
  created_at: number | null;
  counts?: { replies: number; likes: number };
  url: string;
}

function Avatar({ author }: { author: ReplyView['author'] }) {
  if (author.avatar_url) {
    return (
      // Plain <img>: avatars live on many hosts, and next/image would need each one configured.
      <img
        className={s.avatar}
        src={author.avatar_url}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }
  const letter = ((author.name ?? author.account_id).match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return <span className={s.avatar} aria-hidden="true">{letter}</span>;
}

export default function ReplyItem({ reply, now, pending = false }: { reply: ReplyView; now: number; pending?: boolean }) {
  const { author } = reply;
  const replies = reply.counts?.replies ?? 0;
  const likes = reply.counts?.likes ?? 0;
  return (
    <li className={`${s.reply} ${pending ? s.pending : ''}`}>
      <Avatar author={author} />
      <div className={s.body}>
        <div className={s.meta}>
          <span className={s.name}>{author.name ?? author.account_id}</span>
          {author.name ? <span>{author.account_id}</span> : null}
          {reply.created_at ? (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={new Date(reply.created_at).toISOString()} title={new Date(reply.created_at).toUTCString()}>
                {relativeTime(reply.created_at, now)}
              </time>
            </>
          ) : null}
          {pending ? <><span aria-hidden="true">·</span><span>just posted</span></> : null}
        </div>
        {reply.text ? <PostText text={reply.text} className={s.text} /> : null}
        <div className={s.actions}>
          {reply.media_count ? <span>{reply.media_count === 1 ? '1 image' : `${reply.media_count} images`} on near.social</span> : null}
          {likes > 0 ? <span>{likes} {likes === 1 ? 'like' : 'likes'}</span> : null}
          <a href={reply.url} rel="noopener noreferrer">
            {reply.truncated ? 'Read the rest' : replies > 0 ? `${replies} ${replies === 1 ? 'reply' : 'replies'}` : 'Reply'} on near.social ↗
            <span className="visually-hidden"> (post by {author.account_id})</span>
          </a>
        </div>
      </div>
    </li>
  );
}
