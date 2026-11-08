// Render the canvas's .dc.html boards to static HTML + PNG for the repo.
//
//   node scripts/render-mockups.mjs docs/mockups/src docs/mockups
//
// No npm dependency and no bundled browser: it drives whichever Chrome/Chromium is already
// on the machine over the DevTools protocol, using the WebSocket client that ships with Node
// (>= 22). That keeps `npm ci` free of a 300 MB browser download while still working on a
// clean clone of this repo.
//
// Set CHROME_PATH to a Chromium 112+ binary if it is not in a standard location. Any Chrome
// or Chromium works — a `npx playwright install chromium` build is fine too.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Browser discovery
// ---------------------------------------------------------------------------

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
  '/snap/bin/chromium',
  '/usr/bin/microsoft-edge',
];

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
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

function noBrowser() {
  console.error(
    'No Chrome or Chromium found, so the mockups cannot be rendered.\n' +
      '  - install Chrome, Chromium or Edge, or point CHROME_PATH at an existing binary:\n' +
      '      CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\\n' +
      '        npm run render:mockups\n' +
      '  - a Playwright-managed build works too: npx playwright install chromium\n' +
      '  (only the browser is needed; the `playwright` npm package is not used.)',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// A minimal DevTools-protocol client (one browser connection, flattened sessions)
// ---------------------------------------------------------------------------

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map(); // id -> { resolve, reject, method }
    this.waiters = new Map(); // "sessionId:method" -> { resolve, timer }
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', () => rej(new Error('DevTools socket failed to open')), {
        once: true,
      });
    });
    this.ws.addEventListener('message', (ev) => this.#onMessage(ev.data));
  }

  #onMessage(data) {
    const msg = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
    if (msg.id != null) {
      const call = this.pending.get(msg.id);
      if (!call) return;
      this.pending.delete(msg.id);
      if (msg.error) call.reject(new Error(`${msg.error.message} (${call.method})`));
      else call.resolve(msg.result ?? {});
      return;
    }
    const key = `${msg.sessionId ?? ''}:${msg.method}`;
    const waiter = this.waiters.get(key);
    if (waiter) {
      this.waiters.delete(key);
      clearTimeout(waiter.timer);
      waiter.resolve(msg.params ?? {});
    }
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  /** Wait for one event. Register it *before* the command that triggers it. */
  once(method, sessionId, timeoutMs = 30_000) {
    const key = `${sessionId ?? ''}:${method}`;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.waiters.delete(key);
        rej(new Error(`timed out waiting for ${method}`));
      }, timeoutMs);
      this.waiters.set(key, { resolve: res, timer });
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // already gone
    }
  }
}

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

async function launchBrowser() {
  const bin = findBrowser();
  if (!bin) noBrowser();

  const userDataDir = await mkdtemp(join(tmpdir(), 'near-hunt-mockups-'));
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--force-color-profile=srgb',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  // Chrome writes the port and browser websocket path to DevToolsActivePort, and also
  // echoes "DevTools listening on ws://..." on stderr. Either is enough.
  const portFile = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + 20_000;
  let url = null;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [port, path] = (await readFile(portFile, 'utf8')).split('\n');
      if (port?.trim()) {
        url = `ws://127.0.0.1:${port.trim()}${path?.trim() || '/devtools/browser'}`;
        break;
      }
    }
    const echoed = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
    if (echoed) {
      url = echoed[1];
      break;
    }
    if (proc.exitCode !== null) {
      throw new Error(`browser exited before listening (code ${proc.exitCode})\n${stderr.slice(-800)}`);
    }
    await delay(100);
  }
  if (!url) throw new Error('browser did not expose a DevTools endpoint within 20s');

  const stop = async () => {
    try {
      proc.kill();
    } catch {
      // already gone
    }
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  };
  return { url, stop };
}

// ---------------------------------------------------------------------------
// In-page rendering of a .dc.html board
// ---------------------------------------------------------------------------

// Evaluated inside the page: resolves the board's DCLogic component, fills the {{ }}
// bindings and expands <sc-for> templates. Kept as a function so it can be serialised with
// toString() and sent over Runtime.evaluate.
function renderInPage() {
  class DCLogic {
    constructor() {
      this.props = {};
      this.state = {};
    }
    setState() {}
    forceUpdate() {}
  }
  window.DCLogic = DCLogic;
  const code = document.querySelector('script[data-dc-script]').textContent;
  const Component = new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
  const vals = new Component().renderVals();

  const lookup = (path, scope) =>
    path.trim().split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
  const fill = (s, scope) =>
    s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => {
      const v = lookup(p, scope);
      return v == null ? '' : String(v);
    });

  function walk(node, scope) {
    if (node.nodeType === 3) {
      node.textContent = fill(node.textContent, scope);
      return;
    }
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
  if (helmet) {
    [...helmet.childNodes].forEach((n) => document.head.appendChild(n));
    helmet.remove();
  }
  [...root.childNodes].forEach((ch) => walk(ch, vals));
  root.replaceWith(...root.childNodes);
  document.querySelectorAll('script').forEach((s) => s.remove());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [srcDir, outDir] = process.argv.slice(2).map((p) => resolve(p));
if (!srcDir || !outDir) {
  console.error('usage: node scripts/render-mockups.mjs <src-dir> <out-dir>');
  process.exit(1);
}

const canvas = JSON.parse(await readFile(join(srcDir, 'canvas.json'), 'utf8'));
await mkdir(join(outDir, 'html'), { recursive: true });
await mkdir(join(outDir, 'png'), { recursive: true });
const tmpDir = join(outDir, '.tmp');
await mkdir(tmpDir, { recursive: true });

const browser = await launchBrowser();
const cdp = new CDP(browser.url);

try {
  await cdp.ready;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);

  const results = [];
  for (const name of canvas.order) {
    const board = canvas.boards[name];
    const stem = name.replace('.dc.html', '');

    // The board source is a fragment meant for the canvas shell: drop its support script,
    // translate <sc-for> into the <template> form the renderer understands, and write it
    // somewhere a file:// URL can reach.
    let src = await readFile(join(srcDir, name), 'utf8');
    src = src
      .replace('<script src="./support.js"></script>', '')
      .replace(/<sc-for\b/g, '<template data-sc-for')
      .replace(/<\/sc-for>/g, '</template>');
    const tmp = join(tmpDir, stem + '.html');
    await writeFile(tmp, src);

    const metrics = { width: board.w, height: board.h, deviceScaleFactor: 2, mobile: false };
    await cdp.send('Emulation.setDeviceMetricsOverride', metrics, sessionId);

    const loaded = cdp.once('Page.loadEventFired', sessionId);
    await cdp.send('Page.navigate', { url: 'file://' + tmp }, sessionId);
    await loaded;

    const rendered = await cdp.send(
      'Runtime.evaluate',
      { expression: `(${renderInPage.toString()})()`, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (rendered.exceptionDetails) {
      const detail =
        rendered.exceptionDetails.exception?.description ?? rendered.exceptionDetails.text;
      throw new Error(`${stem}: ${detail}`);
    }

    // Fonts and the 300 ms settle match what the previous renderer produced, so re-renders
    // stay byte-comparable instead of drifting on subpixel text metrics.
    await cdp.send(
      'Runtime.evaluate',
      { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true, returnByValue: true },
      sessionId,
    );
    await delay(300);

    const html = await cdp.send(
      'Runtime.evaluate',
      { expression: 'document.documentElement.outerHTML', returnByValue: true },
      sessionId,
    );
    const standalone =
      '<!doctype html>\n' +
      String(html.result.value).replace(/href="([A-Za-z]+)\.dc\.html"/g, 'href="$1.html"');
    await writeFile(join(outDir, 'html', stem + '.html'), standalone);

    // Boards marked expand:"fill" are taller than their canvas box: grow the viewport to the
    // rendered content first, so the screenshot is the full page at 2x instead of a crop.
    if (board.expand) {
      const { cssContentSize } = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { ...metrics, height: Math.ceil(cssContentSize.height) },
        sessionId,
      );
      await delay(150);
    }

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(outDir, 'png', stem + '.png'), Buffer.from(shot.data, 'base64'));

    results.push(stem);
  }

  console.log('rendered', results.join(', '));
} finally {
  cdp.close();
  await browser.stop();
}
