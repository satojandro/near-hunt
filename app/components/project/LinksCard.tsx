import { linkRows } from '@/lib/project-view.mjs';
import { outboundKind } from '@/lib/links.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import ExternalLink from './ExternalLink';
import s from './project.module.css';

export default function LinksCard({ project }: { project: ListingItem }) {
  const rows = linkRows(project);
  return (
    <section className={s.card} aria-labelledby="links-title">
      <h2 id="links-title" className={s.cardTitle}>Links</h2>
      <dl className={s.rows}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'contents' }}>
            <dt>{r.label}</dt>
            <dd>
              {r.href ? (
                <ExternalLink href={r.href} eventKind={outboundKind(r.label)}>{r.text}</ExternalLink>
              ) : (
                <span className={r.supplied ? undefined : s.notSupplied}>{r.text}</span>
              )}
              {r.note ? <span className={s.note}>{r.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
