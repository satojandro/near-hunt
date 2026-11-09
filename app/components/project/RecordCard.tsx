import { recordRows, kvRecordUrl } from '@/lib/project-view.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import ExternalLink from './ExternalLink';
import s from './project.module.css';

/**
 * NH-21: where this record lives on NEAR, and a link to the raw row in the public KV API.
 * NH-43: the comment count is the same number the directory card shows; unknown (read failed)
 * shows no row rather than a misleading zero.
 */
export default function RecordCard({
  project,
  comments,
  commentsAvailable = false,
}: {
  project: ListingItem;
  comments?: number;
  commentsAvailable?: boolean;
}) {
  const rows = recordRows(project);
  const jsonUrl = kvRecordUrl({ account: project.account, key: project.key });
  return (
    <section className={`${s.card} ${s.record}`} aria-labelledby="record-title">
      <h2 id="record-title" className={s.cardTitle}>On-chain record</h2>
      <p className={s.recordLead}>This page is a view. The data lives on NEAR mainnet.</p>
      <dl className={s.recordRows}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'contents' }}>
            <dt>{r.label}</dt>
            <dd className={r.mono ? s.mono : undefined}>
              {r.href ? <ExternalLink href={r.href}>{r.value}</ExternalLink> : r.value}
            </dd>
          </div>
        ))}
        {commentsAvailable && typeof comments === 'number' ? (
          <div style={{ display: 'contents' }}>
            <dt>Comments</dt>
            <dd>{comments} signed {comments === 1 ? 'key' : 'keys'}</dd>
          </div>
        ) : null}
      </dl>
      <div className={s.recordActions}>
        {jsonUrl ? (
          <ExternalLink href={jsonUrl} className={s.jsonBtn}>View JSON</ExternalLink>
        ) : null}
      </div>
      <details className={s.recordFoot}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>What am I looking at?</summary>
        <p style={{ margin: '4px 0 0' }}>
          “View JSON” opens this row in the public FastData KV API, read only from rows that
          nearhunt.near wrote itself. “Written at block” opens the block on Pikespeak.
        </p>
      </details>
    </section>
  );
}
