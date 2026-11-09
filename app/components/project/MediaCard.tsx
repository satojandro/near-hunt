import { mediaView } from '@/lib/media.mjs';
import type { ProjectMedia } from '@/types/nearhunt';
import s from './project.module.css';

/**
 * NH-96b: images and videos from the builder's own X post, rendered on the project page.
 *
 * A photo links to its full-size image. A video plays in place through X's own embed iframe
 * (`platform.twitter.com/embed/Tweet.html`), so the demo runs from X's origin without the record
 * carrying a file, without a proxy, and without loading `widgets.js`. The post stays one click
 * away as `post_url`. Renders nothing when the record has no media, so most pages are unchanged.
 */
export default function MediaCard({ media }: { media?: ProjectMedia[] | null }) {
  const items = mediaView({ media });
  if (items.length === 0) return null;
  return (
    <section className={s.card} aria-labelledby="media-title">
      <h2 id="media-title" className={s.cardTitle}>Media</h2>
      <ul className={items.length === 1 ? `${s.media} ${s.mediaSingle}` : s.media}>
        {items.map((m) => (
          <li key={m.postUrl + m.src} className={s.mediaItem}>
            {m.type === 'video' && m.embedUrl ? (
              <figure className={s.mediaFigure}>
                <div className={s.mediaEmbed}>
                  <iframe
                    className={s.mediaFrame}
                    src={m.embedUrl}
                    title={m.duration ? `Demo video from the builder's post on X, ${m.duration}` : `Demo video from the builder's post on X`}
                    loading="lazy"
                    allow="fullscreen; encrypted-media; picture-in-picture"
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                  />
                </div>
                <figcaption className={s.mediaCaption}>
                  Played from X. <a href={m.postUrl} target="_blank" rel="noopener noreferrer nofollow">
                    Open the post{m.duration ? ` (${m.duration})` : ''}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                </figcaption>
              </figure>
            ) : (
              <a
                href={m.full}
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
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className={s.note}>From the builder&rsquo;s post on X. Images and video are streamed from X&rsquo;s servers, not copied.</p>
    </section>
  );
}
