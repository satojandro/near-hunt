import type { ReactNode } from 'react';

// The AI reviewer writes pitches and memos with two bits of Markdown: **bold** and `code`
// (account names, commands). Render just those two as text elements, never as HTML, so nothing
// in the text can inject markup. Any other Markdown is shown as typed.

const TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

export default function InlineMarks({ text }: { text: string }) {
  const out: ReactNode[] = [];
  text.split(TOKEN).forEach((part, i) => {
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) out.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) out.push(<code key={i}>{part.slice(1, -1)}</code>);
    else out.push(part);
  });
  return <>{out}</>;
}
