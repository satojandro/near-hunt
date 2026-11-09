import { mediaView } from '@/lib/media.mjs';
import type { ProjectMedia } from '@/types/nearhunt';
import s from './project.module.css';

/**
 * NH-96: images and video posters from the builder's own X post, referenced on pbs.twimg.com.
 * Videos open on X: NEAR Hunt loads no X script and hotlinks no video file. Renders nothing
 * when the record has no media, so most pages are unchanged until the enrichment import lands.
 */
export default function MediaCard({ media }: { media?: ProjectMedia[] | null }) {
  const items = mediaView({ media });
  if (items.length === 0) return null;
  return (
    <section className={s.card} aria-labelledby="media-title">
      <h2 id="media-title" className={s.cardTitle}>Media</h2>
      <ul className={items.length === 1 ? `${s.media} ${s.mediaSingle}` : s.media}>
        {items.map((m) => (
          <li key={m.src} className={s.mediaItem}>
            <a
              href={m.type === 'video' ? m.postUrl : m.full}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={s.mediaLink}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, referenced not copied */}
              <img
                src={m.src}
                alt={m.alt}
                width={m.width ?? undefined}
                height={m.height ?? undefined}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className={s.mediaImg}
              />
              {m.type === 'video' ? (
                <span className={s.mediaPlay}>
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
                  Watch on X{m.duration ? ` · ${m.duration}` : ''}
                </span>
              ) : null}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      <p className={s.note}>From the builder&rsquo;s post on X. Shown from X&rsquo;s image servers, not copied.</p>
    </section>
  );
}
