// Render the share cards (og:image) for the front page and /open-data.
//
//   node scripts/render-og.mjs
//
// Same approach as render-mockups.mjs: no npm dependency, no bundled browser — the Chrome or
// Chromium already on the machine is driven in one-shot headless mode. Set CHROME_PATH if it is
// not in a standard location. Output is 1200×630 (the size X, Slack and Discord expect) and
// committed under public/og/, so a deploy needs no browser.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repo, 'public', 'og');

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) if (candidate && existsSync(candidate)) return candidate;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try {
      const found = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (found) return found;
    } catch {
      // not on PATH
    }
  }
  return null;
}

/** One card. Copy is static on purpose: a project count in a share image goes stale silently. */
function cardHtml({ eyebrow, headline, lede, foot }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0}
  html,body{width:1200px;height:630px}
  body{
    background:#F5F6F8;color:#12161C;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;
    border:1px solid #E3E6EB;
  }
  .brand{display:flex;align-items:center;gap:18px}
  .mark{width:64px;height:64px;border-radius:16px;background:#12161C;display:flex;align-items:center;justify-content:center}
  .name{font-size:34px;font-weight:700;letter-spacing:-0.02em}
  .eyebrow{margin-top:8px;font-size:19px;color:#5A6472;letter-spacing:0.02em;text-transform:uppercase}
  h1{font-size:64px;line-height:1.06;letter-spacing:-0.03em;font-weight:700;max-width:980px}
  .lede{margin-top:22px;font-size:26px;line-height:1.35;color:#3B4450;max-width:900px}
  .rule{height:6px;width:96px;background:#0A7F5A;border-radius:3px;margin:30px 0 0}
  .foot{display:flex;align-items:center;justify-content:space-between;font-size:22px;color:#5A6472}
  .foot b{color:#0A7F5A;font-weight:600}
</style></head>
<body>
  <div>
    <div class="brand">
      <div class="mark">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
      </div>
      <div>
        <div class="name">NEAR Hunt</div>
        <div class="eyebrow">${eyebrow}</div>
      </div>
    </div>
    <h1>${headline}</h1>
    <p class="lede">${lede}</p>
    <div class="rule"></div>
  </div>
  <div class="foot"><span>${foot}</span><b>nearhunt.xyz</b></div>
</body></html>`;
}

const CARDS = [
  {
    file: 'home.png',
    html: cardHtml({
      eyebrow: 'NEAR Hackathon · Nov 2026',
      headline: 'The hackathon, as open records on NEAR.',
      lede: 'Browse every project. Upvote the ones you would actually use — each vote is a write you sign from your own account.',
      foot: 'Records and votes live on NEAR',
    }),
  },
  {
    file: 'open-data.png',
    html: cardHtml({
      eyebrow: 'Open data',
      headline: 'Every record, readable by anyone.',
      lede: 'A read-only JSON API, a SKILL.md for agents, and the raw KV rows on NEAR. No key needed to read.',
      foot: 'API · SKILL.md · schema · chain',
    }),
  },
];

const browser = findBrowser();
if (!browser) {
  console.error(
    'No Chrome or Chromium found, so the share cards cannot be rendered.\n' +
      '  Set CHROME_PATH to a Chrome/Chromium binary, or leave the committed public/og/*.png as they are.',
  );
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'og-'));

try {
  for (const card of CARDS) {
    const htmlPath = join(work, card.file.replace(/\.png$/, '.html'));
    await writeFile(htmlPath, card.html, 'utf8');
    const pngPath = join(outDir, card.file);
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--force-device-scale-factor=1',
        '--window-size=1200,630',
        `--screenshot=${pngPath}`,
        `file://${htmlPath}`,
      ],
      { stdio: 'pipe' },
    );
    const bytes = execFileSync('wc', ['-c', pngPath], { encoding: 'utf8' }).trim().split(/\s+/)[0];
    console.log(`${card.file}: ${bytes} bytes -> ${pngPath}`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
