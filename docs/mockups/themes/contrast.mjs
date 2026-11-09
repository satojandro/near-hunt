// WCAG contrast check for the theme proposal in this folder.
//
//   node docs/mockups/themes/contrast.mjs
//
// Prints every text/background pair a theme uses and exits 1 if any falls below 4.5:1.
// Network-free, no dependencies. Keep THEMES in step with README.md when a value changes.

const THEMES = {
  light: {
    bg: '#F5F6F8', surface: '#FFFFFF', surfaceMuted: '#F0F2F5', text: '#12161C', textMuted: '#5A6472',
    textChip: '#3B4450', accent: '#0A7F5A', onAccent: '#FFFFFF', social: '#2557C7',
    featureBg: '#12161C', featureText: '#FFFFFF', featureLink: '#5FD3A6', btnBg: '#12161C', btnText: '#FFFFFF',
    tints: [],
  },
  dark: {
    bg: '#0D1117', surface: '#151B23', surfaceMuted: '#1C232D', text: '#E6EAF0', textMuted: '#9BA5B3',
    textChip: '#C5CCD6', accent: '#34D399', onAccent: '#04221A', social: '#7AA2FF',
    featureBg: '#0A2A20', featureText: '#D7F5E9', featureLink: '#34D399', btnBg: '#E6EAF0', btnText: '#0D1117',
    tints: [['#1C232D', '#F5B97A'], ['#1C232D', '#6EE7B7'], ['#1C232D', '#F0A3B5'], ['#1C232D', '#9DB8FF'], ['#1C232D', '#C9E07A'], ['#1C232D', '#C4A7FF']],
  },
  'golden-hour': {
    bg: '#F4EBD9', surface: '#FFFAF0', surfaceMuted: '#F1E4C9', text: '#2B1D12', textMuted: '#6B5540',
    textChip: '#4A3727', accent: '#B83A0B', onAccent: '#FFF8EC', social: '#1E5A87',
    featureBg: '#2B1D12', featureText: '#F7EBD3', featureLink: '#F5B700', btnBg: '#2B1D12', btnText: '#FFF8EC',
    tints: [['#FBE3B0', '#6B4400'], ['#D9EBE6', '#1F5C55'], ['#F9D9D2', '#8A2A14'], ['#DCE6F2', '#1E4A75'], ['#E6EBCF', '#4D5A1A'], ['#EEDCEC', '#6B2D65']],
  },
  darkroom: {
    bg: '#120B09', surface: '#1C1310', surfaceMuted: '#261A15', text: '#F5E9D6', textMuted: '#BBA38A',
    textChip: '#E0CDB4', accent: '#FF6A3D', onAccent: '#1A0A04', social: '#7CC6DE',
    featureBg: '#2A0E08', featureText: '#F5E9D6', featureLink: '#FFC23D', btnBg: '#F5E9D6', btnText: '#1A0A04',
    tints: [['#3A2A0E', '#FFC23D'], ['#13302C', '#7FD6C8'], ['#3A1810', '#FF9B7A'], ['#152A3D', '#8EC3F0'], ['#262E12', '#C5D77A'], ['#33192F', '#E7A6DD']],
  },
};

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

let failed = 0;
for (const [name, t] of Object.entries(THEMES)) {
  const pairs = [
    ['text on surface', t.text, t.surface],
    ['text on bg', t.text, t.bg],
    ['text-muted on surface', t.textMuted, t.surface],
    ['text-muted on bg', t.textMuted, t.bg],
    ['text-chip on surface-muted', t.textChip, t.surfaceMuted],
    ['accent (links) on surface', t.accent, t.surface],
    ['accent (links) on bg', t.accent, t.bg],
    ['on-accent on accent (voted)', t.onAccent, t.accent],
    ['social on surface', t.social, t.surface],
    ['feature text on feature bg', t.featureText, t.featureBg],
    ['feature link on feature bg', t.featureLink, t.featureBg],
    ['button text on button', t.btnText, t.btnBg],
    ...t.tints.map(([bg, fg], i) => [`tint ${i + 1}`, fg, bg]),
  ];
  const results = pairs.map(([label, fg, bg]) => ({ label, r: ratio(fg, bg) }));
  const worst = results.reduce((a, b) => (a.r < b.r ? a : b));
  const bad = results.filter((x) => x.r < 4.5);
  failed += bad.length;
  console.log(`${name.padEnd(12)} ${results.length} pairs, lowest ${worst.r.toFixed(2)}:1 (${worst.label})${bad.length ? ` — FAIL: ${bad.map((x) => `${x.label} ${x.r.toFixed(2)}`).join(', ')}` : ''}`);
}
process.exit(failed ? 1 : 0);
