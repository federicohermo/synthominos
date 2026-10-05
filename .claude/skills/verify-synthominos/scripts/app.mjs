import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Chromium blocks audio with no user gesture; a headless run has none before the first click.
const BROWSER_ARGS = ['--autoplay-policy=no-user-gesture-required'];

/** Starts a dev server of its own on a free port. `close()` stops only that server. */
export async function launch() {
  const server = await createServer({ server: { port: 5300, strictPort: false }, logLevel: 'error' });
  await server.listen();
  return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

/** Opens the app at `url` and returns the handles a proof drives it with. */
export async function open(url, viewport = { width: 1280, height: 800 }) {
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(url);
  const grid = page.getByRole('grid');
  await grid.waitFor();
  const [, width, height] = /Tablero de (\d+) por (\d+)/.exec(await grid.getAttribute('aria-label'));
  const cells = page.getByRole('gridcell');
  const cell = (x, y) => cells.nth(y * Number(width) + x);
  return {
    page,
    errors,
    board: { width: Number(width), height: Number(height) },
    cell,
    cellName: (x, y) => cell(x, y).getAttribute('aria-label'),
    piece: letter => page.getByRole('button', { name: new RegExp(`^${letter}, `) }),
    button: name => page.getByRole('button', { name, exact: true }),
    announced: () => page.locator('[aria-live]').textContent(),
    /** The pixels the spectrum canvas has painted: more than zero only while audio reaches the analyser. */
    litPixels: () => page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
      return lit;
    }),
    close: () => browser.close(),
  };
}

/** A recorder of one proof: each step keeps the action and the state observed after it. */
export function evidence(feature) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = resolve('.agent-runs', 'verify', `${stamp}-${feature}`);
  mkdirSync(dir, { recursive: true });
  const steps = [];
  return {
    dir,
    step(action, observed, expected) {
      const ok = expected === undefined || expected(observed);
      steps.push({ action, observed, ok });
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${action} -> ${JSON.stringify(observed)}`);
      return ok;
    },
    async save(app) {
      await app.page.screenshot({ path: join(dir, 'final.png') });
      const passed = steps.every(step => step.ok) && app.errors.length === 0;
      writeFileSync(join(dir, 'proof.json'), JSON.stringify({ feature, passed, steps, consoleErrors: app.errors }, null, 2));
      console.log(`${passed ? 'PASSED' : 'FAILED'}: ${dir}`);
      return passed;
    },
  };
}
