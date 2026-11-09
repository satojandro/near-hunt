import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  THEME_CHOICES, THEME_LABELS, THEME_STORAGE_KEY, THEME_SURFACE,
  isThemeChoice, resolveTheme, themeInitScript,
} from '../lib/themes.mjs';

test('every choice has a label, and every explicit theme has a surface colour', () => {
  assert.deepEqual(THEME_CHOICES, ['system', 'light', 'dark', 'golden-hour', 'darkroom']);
  for (const c of THEME_CHOICES) assert.equal(typeof THEME_LABELS[c], 'string');
  for (const c of THEME_CHOICES.filter((c) => c !== 'system')) {
    assert.match(THEME_SURFACE[c], /^#[0-9A-F]{6}$/);
  }
});

test('system resolves from prefers-color-scheme, an explicit theme always wins', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('golden-hour', false), 'golden-hour');
  assert.equal(resolveTheme('darkroom', true), 'darkroom');
});

test('a missing or unknown stored choice falls back to system', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(undefined, false), 'light');
  assert.equal(resolveTheme('neon', false), 'light');
  assert.equal(resolveTheme('neon', true), 'dark');
  assert.equal(isThemeChoice('neon'), false);
  assert.equal(isThemeChoice('dark'), true);
});

test('the pre-paint script carries the storage key, every choice and every surface colour', () => {
  const script = themeInitScript();
  assert.match(script, /^\(function\(\)\{try\{/);
  assert.ok(script.includes(THEME_STORAGE_KEY));
  for (const c of THEME_CHOICES) assert.ok(script.includes(JSON.stringify(c)), c);
  for (const hex of Object.values(THEME_SURFACE)) assert.ok(script.includes(hex), hex);
  // It must set the attribute the stylesheet keys off, and it must never throw out of the page.
  assert.ok(script.includes("setAttribute('data-theme',t)"));
  assert.ok(script.includes('catch(e){}'));
  // Plain script, no module syntax that would break inline execution.
  assert.ok(!/\bimport\b|\bexport\b/.test(script));
});
