'use client';

import { useState } from 'react';
import s from './open-data.module.css';

/** Copies `text` to the clipboard. The text stays visible next to it, so a failed copy loses nothing. */
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button type="button" className={s.copyBtn} onClick={copy} aria-live="polite">
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed: select the text' : label}
    </button>
  );
}
