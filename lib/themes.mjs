/**
 * Theme choices for nearhunt.xyz (NH-114, docs/mockups/themes/README.md §4).
 *
 * The visitor's choice is a per-visitor preference: it lives in localStorage, is never written on
 * chain and is never sent to analytics. "System" is the default and resolves Light or Dark from
 * `prefers-color-scheme`; the two playful themes are only ever picked by hand.
 */

export const THEME_STORAGE_KEY = 'nh-theme';

/** Menu order, as in board T0: System first, then the four explicit themes. */
export const THEME_CHOICES = ['system', 'light', 'dark', 'golden-hour', 'darkroom'];

export const THEME_LABELS = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'golden-hour': 'Golden Hour',
  darkroom: 'Darkroom',
};

/** The `--surface` of each theme, which is what `<meta name="theme-color">` must carry. */
export const THEME_SURFACE = {
  light: '#FFFFFF',
  dark: '#151B23',
  'golden-hour': '#FFFAF0',
  darkroom: '#1C1310',
};

/** Two-tone swatch per choice, drawn in the picker button and its menu. */
export const THEME_SWATCH = {
  system: 'linear-gradient(90deg, #F5F6F8 0 50%, #0D1117 50%)',
  light: 'linear-gradient(90deg, #FFFFFF 0 50%, #0A7F5A 50%)',
  dark: 'linear-gradient(90deg, #0D1117 0 50%, #34D399 50%)',
  'golden-hour': 'linear-gradient(90deg, #F5B700 0 35%, #D7261E 100%)',
  darkroom: 'linear-gradient(90deg, #120B09 0 50%, #FF6A3D 50%)',
};

export function isThemeChoice(value) {
  return typeof value === 'string' && THEME_CHOICES.includes(value);
}

/** The theme id actually applied to `<html data-theme>`: one of light, dark, golden-hour, darkroom. */
export function resolveTheme(choice, prefersDark) {
  const picked = isThemeChoice(choice) ? choice : 'system';
  if (picked !== 'system') return picked;
  return prefersDark ? 'dark' : 'light';
}

/**
 * The script that runs in `<head>` before first paint, so a dark visitor never sees a white flash.
 * It repeats resolveTheme() on purpose: it must not depend on a module having loaded. It also sets
 * `<meta name="theme-color">`, because theme-color follows the picked theme and metadata is static.
 */
export function themeInitScript() {
  return [
    '(function(){try{',
    'var choices=' + JSON.stringify(THEME_CHOICES) + ';',
    'var surfaces=' + JSON.stringify(THEME_SURFACE) + ';',
    "var c=null;try{c=localStorage.getItem('" + THEME_STORAGE_KEY + "')}catch(e){}",
    "if(choices.indexOf(c)<0)c='system';",
    "var t=c==='system'?((window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'):c;",
    "document.documentElement.setAttribute('data-theme',t);",
    "var m=document.querySelector('meta[name=\"theme-color\"]');",
    "if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}",
    "m.setAttribute('content',surfaces[t]||'#FFFFFF');",
    '}catch(e){}})();',
  ].join('');
}
