import { safeHttpsUrl } from '@/lib/project-view.mjs';

/** Outbound link. Renders plain text unless `href` is a well-formed https URL. */
export default function ExternalLink({
  href, children, className,
}: { href: string | null | undefined; children: React.ReactNode; className?: string }) {
  const safe = safeHttpsUrl(href);
  if (!safe) return <span className={className}>{children}</span>;
  return (
    <a href={safe} className={className} target="_blank" rel="noopener noreferrer nofollow">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
