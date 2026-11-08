// NH-41/42: the project's discussion — replies to its near.social post by nearhunt.near.
//
// States: no `social_post` yet (honest empty state), loading (skeleton, streamed), near.social
// not responding, post missing, zero replies, and the reply list. Read on the server from
// api2.near.social with a 30 s cache and a 4 s timeout; it never throws, so the rest of the
// project page is unaffected by near.social being down.
import { Suspense } from 'react';
import { DEFAULT_HASHTAG } from '@/lib/social.mjs';
import { fetchThread, hashtagPageUrl, parsePostRef, threadUrl } from '@/lib/discussion.mjs';
import ReplyItem from './ReplyItem';
import ReplyComposer from './ReplyComposer';
import s from './discussion.module.css';

const TITLE_ID = 'discussion-title';

function Head({ count, href }: { count?: number; href?: string }) {
  return (
    <div className={s.head}>
      <h2 id={TITLE_ID} className={s.title}>
        Discussion
        {typeof count === 'number' ? (
          <span className={s.titleCount}> · {count} {count === 1 ? 'reply' : 'replies'}</span>
        ) : null}
      </h2>
      {href ? <a className={s.open} href={href} rel="noopener noreferrer">Open thread on near.social ↗</a> : null}
    </div>
  );
}

function Skeleton() {
  return (
    <section className={s.card} aria-labelledby={TITLE_ID} aria-busy="true">
      <Head />
      <p className="visually-hidden" role="status">Loading the discussion from near.social…</p>
      {[0, 1].map((i) => (
        <div key={i} className={s.skel} aria-hidden="true">
          <span className={s.skelDot} />
          <span className={s.skelLines}>
            <span className={s.skelLine} style={{ width: '35%' }} />
            <span className={s.skelLine} style={{ width: i ? '60%' : '85%' }} />
          </span>
        </div>
      ))}
    </section>
  );
}

async function Thread({ postRef, projectId }: { postRef: string; projectId: string }) {
  const thread = await fetchThread(postRef);
  const href = threadUrl(postRef);
  const now = Date.now();

  if (thread.status === 'not_found') {
    return (
      <section className={s.card} aria-labelledby={TITLE_ID}>
        <Head href={href} />
        <p className={s.note}>
          This project’s near.social post can’t be found (it may have been deleted, or near.social has not indexed it
          yet), so there is nothing to reply to here.
        </p>
      </section>
    );
  }

  if (thread.status !== 'ok') {
    return (
      <section className={s.card} aria-labelledby={TITLE_ID}>
        <Head href={href} />
        <p className={s.alert} role="status">
          <strong>near.social is not responding right now.</strong> The replies will show here once it is back; you can
          also <a href={href} rel="noopener noreferrer">open the thread on near.social</a>.
        </p>
        <ReplyComposer parent={postRef} projectId={projectId} />
      </section>
    );
  }

  return (
    <section className={s.card} aria-labelledby={TITLE_ID}>
      <Head count={thread.reply_count} href={href} />
      <ReplyComposer parent={postRef} projectId={projectId} />
      {thread.replies.length === 0 ? (
        <p className={s.note}>No replies yet. Ask the builders something.</p>
      ) : (
        <>
          <ul className={s.list}>
            {thread.replies.map((r) => <ReplyItem key={r.key} reply={r} now={now} />)}
          </ul>
          {thread.next_cursor || thread.reply_count > thread.replies.length ? (
            <a className={s.more} href={href} rel="noopener noreferrer">
              See all {thread.reply_count} replies on near.social ↗
            </a>
          ) : null}
        </>
      )}
    </section>
  );
}

export default function Discussion({ projectId, socialPost }: { projectId: string; socialPost?: string | null }) {
  const ref = parsePostRef(socialPost ?? null);
  if (!ref) {
    const tag = DEFAULT_HASHTAG;
    return (
      <section className={s.card} aria-labelledby={TITLE_ID}>
        <Head />
        <div className={s.empty}>
          <p className={s.note}>
            Discussion opens when NEAR Hunt posts this project on near.social. Replies will be near.social posts from
            your own account.
          </p>
          <p className={s.note}>
            Until then, people are talking under{' '}
            <a href={hashtagPageUrl(tag)} rel="noopener noreferrer">#{tag} on near.social ↗</a>
          </p>
        </div>
      </section>
    );
  }
  return (
    <Suspense fallback={<Skeleton />}>
      <Thread postRef={ref.key} projectId={projectId} />
    </Suspense>
  );
}
