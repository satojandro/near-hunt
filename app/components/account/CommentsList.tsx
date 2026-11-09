// NH-52: the account's comments on NEAR Hunt projects, read from its own `comment/` rows.
// Server component: the page has already joined rows with live projects and cut the text.
import Link from 'next/link';
import s from './account.module.css';

export interface CommentRow {
  id: string;
  projectId: string;
  projectName: string;
  text: string;
  /** "2h ago" or null when the block time is unknown. */
  when: string | null;
  block_height: number | null;
  /** Deep link to the comment on the project page. */
  url: string;
}

const nf = new Intl.NumberFormat('en-US');

export default function CommentsList({ accountId, rows }: { accountId: string; rows: CommentRow[] }) {
  if (rows.length === 0) {
    return (
      <p className={s.empty}>
        {accountId} has not commented on any project yet. <Link href="/">Browse projects</Link> and start a
        discussion — comments are signed rows on NEAR, so they show up here.
      </p>
    );
  }

  return (
    <ul className={s.grid}>
      {rows.map((r) => (
        <li key={`${r.projectId}/${r.id}`} className={s.card}>
          <h3 className={s.cardTitle}>
            <Link href={`/p/${encodeURIComponent(r.projectId)}`}>{r.projectName}</Link>
          </h3>
          <p className={s.commentText}>{r.text}</p>
          <div className={s.cardFoot}>
            <span className={s.when}>
              {r.when ? r.when : 'Time unknown'}
              {typeof r.block_height === 'number' ? ` · block ${nf.format(r.block_height)}` : ''}
            </span>
            <Link href={r.url} className={s.commentLink}>
              Open<span className="visually-hidden"> the comment on {r.projectName}</span> ↗
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
