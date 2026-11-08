// Render the canvas's .dc.html boards to static HTML + PNG for the repo.
// Usage: node scripts/render-mockups.mjs docs/mockups/src docs/mockups
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [srcDir, outDir] = process.argv.slice(2).map((p) => resolve(p));
const canvas = JSON.parse(await readFile(join(srcDir, 'canvas.json'), 'utf8'));
await mkdir(join(outDir, 'html'), { recursive: true });
await mkdir(join(outDir, 'png'), { recursive: true });
const tmpDir = join(outDir, '.tmp');
await mkdir(tmpDir, { recursive: true });

function renderInPage() {
  class DCLogic { constructor() { this.props = {}; this.state = {}; } setState() {} forceUpdate() {} }
  window.DCLogic = DCLogic;
  const code = document.querySelector('script[data-dc-script]').textContent;
  const Component = new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
  const vals = new Component().renderVals();

  const lookup = (path, scope) => path.trim().split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
  const fill = (s, scope) => s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => { const v = lookup(p, scope); return v == null ? '' : String(v); });

  function walk(node, scope) {
    if (node.nodeType === 3) { node.textContent = fill(node.textContent, scope); return; }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'TEMPLATE' && node.hasAttribute('data-sc-for')) {
      const m = node.getAttribute('list').match(/\{\{\s*([^}]+?)\s*\}\}/);
      const list = (m && lookup(m[1], scope)) || [];
      const as = node.getAttribute('as');
      const frag = document.createDocumentFragment();
      list.forEach((item, i) => {
        const c = node.content.cloneNode(true);
        const s = Object.assign({}, scope, { [as]: item, $index: i });
        [...c.childNodes].forEach((ch) => walk(ch, s));
        frag.appendChild(c);
      });
      node.replaceWith(frag);
      return;
    }
    for (const a of [...node.attributes]) a.value = fill(a.value, scope);
    [...node.childNodes].forEach((ch) => walk(ch, scope));
  }

  const root = document.querySelector('x-dc');
  const helmet = root.querySelector('helmet');
  if (helmet) { [...helmet.childNodes].forEach((n) => document.head.appendChild(n)); helmet.remove(); }
  [...root.childNodes].forEach((ch) => walk(ch, vals));
  root.replaceWith(...root.childNodes);
  document.querySelectorAll('script').forEach((s) => s.remove());
}

const browser = await chromium.launch();
const results = [];
for (const name of canvas.order) {
  const b = canvas.boards[name];
  const stem = name.replace('.dc.html', '');
  let src = await readFile(join(srcDir, name), 'utf8');
  src = src.replace('<script src="./support.js"></script>', '')
    .replace(/<sc-for\b/g, '<template data-sc-for').replace(/<\/sc-for>/g, '</template>');
  const tmp = join(tmpDir, stem + '.html');
  await writeFile(tmp, src);

  const page = await browser.newPage({ viewport: { width: b.w, height: b.h }, deviceScaleFactor: 2 });
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.evaluate(renderInPage);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  let html = '<!doctype html>\n' + (await page.evaluate(() => document.documentElement.outerHTML));
  html = html.replace(/href="([A-Za-z]+)\.dc\.html"/g, 'href="$1.html"');
  await writeFile(join(outDir, 'html', stem + '.html'), html);
  await page.screenshot({ path: join(outDir, 'png', stem + '.png'), fullPage: !!b.expand });
  results.push(stem);
  await page.close();
}
await browser.close();
console.log('rendered', results.join(', '));
