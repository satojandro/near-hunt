// NH-15: "Live on near.social" — latest posts tagged #nearhunt, read server-side from
// api2.near.social with a 60 s cache and a 4 s timeout. Never throws: on any failure it renders
// a "not responding" note and the rest of the page is unaffected.
import {
  DEFAULT_HASHTAG, SOCIAL_API, SOCIAL_WEB, fetchHashtagFeed, hashtagUrl, relativeTime,
  type SocialPost,
} from '@/lib/social.mjs';
import styles from './sidebar.module.css';

function Avatar({ author }: { author: SocialPost['author'] }) {
  if (author.avatar_url) {
    return (
      // Plain <img>: avatars live on many hosts, and next/image would need each one configured.
      <img
        className={styles.avatar}
        src={author.avatar_url}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }
  const letter = ((author.name ?? author.account_id).match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return <span className={styles.avatar} aria-hidden="true">{letter}</span>;
}

function Post({ post, now }: { post: SocialPost; now: number }) {
  const { author } = post;
  const label = author.name ?? author.account_id;
  return (
    <li className={styles.post}>
      <Avatar author={author} />
      <div className={styles.postBody}>
        <div className={styles.meta}>
          <span className={styles.name} title={author.account_id}>{label}</span>
          {author.name ? <span className={styles.account}>{author.account_id}</span> : null}
          <time className={styles.time} dateTime={new Date(post.created_at).toISOString()} title={new Date(post.created_at).toUTCString()}>
            {relativeTime(post.created_at, now)}
          </time>
        </div>
        <a className={styles.excerpt} href={post.url} rel="noopener noreferrer">
          {post.excerpt}
          <span className="visually-hidden"> (post by {author.account_id} on near.social)</span>
        </a>
      </div>
    </li>
  );
}

export default async function LiveOnSocial({
  hashtag = DEFAULT_HASHTAG,
  apiBase = SOCIAL_API,
}: {
  hashtag?: string;
  apiBase?: string;
}) {
  const feed = await fetchHashtagFeed({ hashtag, base: apiBase });
  const tag = feed.hashtag;
  const tagHref = hashtagUrl(tag);
  const now = Date.now();

  return (
    <section className={styles.card} aria-labelledby="live-on-social-title">
      <div className={styles.head}>
        <h2 className={styles.title} id="live-on-social-title">Live on near.social</h2>
        <a className={styles.tagLink} href={tagHref} rel="noopener noreferrer">#{tag}</a>
      </div>

      {feed.status === 'error' ? (
        <p className={styles.alert} role="status">
          <strong>near.social is not responding right now.</strong> Posts tagged #{tag} will show up here
          once it is back.
        </p>
      ) : feed.items.length === 0 ? (
        <>
          <p className={styles.note}>
            No #{tag} posts yet. Be the first: posts tagged #{tag} on near.social show up here.
          </p>
          <a className={styles.more} href={SOCIAL_WEB} rel="noopener noreferrer">Open near.social →</a>
        </>
      ) : (
        <>
          <ul className={styles.feed}>
            {feed.items.map((post) => <Post key={post.key} post={post} now={now} />)}
          </ul>
          <a className={styles.more} href={tagHref} rel="noopener noreferrer">All #{tag} posts on near.social →</a>
        </>
      )}
    </section>
  );
}
