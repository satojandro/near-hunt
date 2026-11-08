// Plain-text post body with https links made clickable (standard §5: post text is plain text,
// never HTML or markdown). React escapes every text node, and only https:// URLs become links.
import { Fragment } from 'react';

const URL_RE = /https:\/\/[^\s<>"]+/g;
const TRAIL = /[.,:;!?'")\]}]+$/;

export default function PostText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0];
    const url = raw.replace(TRAIL, '');
    const start = m.index ?? 0;
    if (start > last) parts.push(<Fragment key={`t${last}`}>{text.slice(last, start)}</Fragment>);
    parts.push(
      <a key={`u${start}`} href={url} rel="noopener noreferrer nofollow ugc">
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return <p className={className}>{parts}</p>;
}
