'use client';

// Theme picker (NH-114, docs/mockups/themes/README.md §4). The visitor's choice is a per-visitor
// preference: it lives in localStorage, is never written on chain and is never sent to analytics.
// An inline script in <head> sets the attribute before first paint; this component only reflects
// the saved choice, changes it, and keeps "System" in step with the OS setting.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  THEME_CHOICES, THEME_LABELS, THEME_STORAGE_KEY, THEME_SURFACE, THEME_SWATCH, isThemeChoice, resolveTheme,
} from '@/lib/themes.mjs';

type Choice = (typeof THEME_CHOICES)[number];

const DARK_QUERY = '(prefers-color-scheme: dark)';

// The maps come from a plain .mjs module, so TypeScript infers exact keys; widen them for lookup.
const LABELS: Record<string, string> = THEME_LABELS;
const SURFACE: Record<string, string | undefined> = THEME_SURFACE;
const SWATCH: Record<string, string> = THEME_SWATCH;

function readStored(): Choice {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(raw) ? (raw as Choice) : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: Choice) {
  const prefersDark = window.matchMedia?.(DARK_QUERY).matches ?? false;
  const theme = resolveTheme(choice, prefersDark);
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', SURFACE[theme] ?? '#FFFFFF');
}

export default function ThemePicker({ variant = 'header' }: { variant?: 'header' | 'footer' }) {
  // Server and first client paint both say "System"; the effect swaps in the stored choice.
  const [choice, setChoice] = useState<Choice>('system');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readStored();
    setChoice(stored);
    apply(stored);
  }, []);

  // "System" follows the OS while the tab is open.
  useEffect(() => {
    const mql = window.matchMedia?.(DARK_QUERY);
    if (!mql) return;
    const onChange = () => { if (choice === 'system') apply('system'); };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [choice]);

  // Close on an outside click or Escape, and hand focus back to the button on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = useCallback((next: Choice) => {
    setChoice(next);
    apply(next);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* private mode */ }
    setOpen(false);
    btnRef.current?.focus();
  }, []);

  // Arrow keys move between items, as a menu is expected to.
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (at + 1) % items.length
      : (at - 1 + items.length) % items.length;
    items[next].focus();
  };

  const label = LABELS[choice];

  return (
    <div className={`theme-picker${variant === 'footer' ? ' footer-theme' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="theme-btn"
        ref={btnRef}
        aria-label={`Theme: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="theme-swatch" aria-hidden="true" style={{ background: SWATCH[choice] }} />
        <span>{label}</span>
        <svg className="theme-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="theme-menu" role="menu" aria-label="Theme" ref={menuRef} onKeyDown={onMenuKey}>
          {THEME_CHOICES.map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === choice}
              className="theme-item"
              onClick={() => choose(value as Choice)}
            >
              <span className="theme-swatch" aria-hidden="true" style={{ background: SWATCH[value] }} />
              <span>{LABELS[value]}</span>
              {value === 'system' ? <span className="theme-item-hint">Light or Dark</span> : null}
              {value === choice ? <span className="theme-check" aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
