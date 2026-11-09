import { safeHttpsUrl } from '@/lib/project-view.mjs';

/**
 * Outbound link. Renders plain text unless `href` is a well-formed https URL.
 *
 * `eventKind` tags the click for the aggregate counter (Analytics.tsx): a repository click and a
 * demo click mean different things during judging, and only the client knows which was clicked.
 */
export default function ExternalLink({
  href, children, className, eventKind,
}: { href: string | null | undefined; children: React.ReactNode; className?: string; eventKind?: string }) {
  const safe = safeHttpsUrl(href);
  if (!safe) return <span className={className}>{children}</span>;
  return (
    <a
      href={safe}
      className={className}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-outbound-kind={eventKind}
    >
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
