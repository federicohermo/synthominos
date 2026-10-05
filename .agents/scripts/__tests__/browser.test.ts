import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser, LaunchOptions } from 'playwright';
import { createServer } from 'vite';
import { ENGINES, FIRST_PORT, blurFocus, boardSize, open, opaquePixels, realProveSystem, serve, type DevServer } from '../browser.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const page = (body: string) => `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>Synthominos</title>${body}`)}`;

const cells = (row: number) => [1, 2, 3].map(column => `<div role="gridcell" aria-label="fila ${row}, columna ${column}, libre">.</div>`).join('');

const INSTRUMENT = page(`
<div role="grid" aria-label="Tablero de 3 por 2"><div role="row">${cells(1)}</div><div role="row">${cells(2)}</div></div>
${[...'FILNPTUVWXYZ'].map(l => `<button aria-label="${l}, rotación 0°" aria-pressed="${String(l === 'F')}">${l}</button>`).join('')}
<button aria-label="Reproducir">▶</button><button aria-label="Reproducir todo">▶▶</button>
<p aria-live="polite" id="said"></p>
<canvas width="20" height="10"></canvas>
<script>
  const say = text => { document.getElementById('said').textContent = text; };
  for (const cell of document.querySelectorAll('[role=gridcell]')) {
    cell.addEventListener('click', e => say((e.altKey ? 'alt ' : '') + 'click ' + cell.getAttribute('aria-label')));
  }
  addEventListener('keydown', e => say('key ' + e.key + ' on ' + document.activeElement.tagName));
  addEventListener('wheel', e => say('wheel ' + e.deltaY), { passive: false });
  const g = document.querySelector('canvas').getContext('2d');
  g.fillStyle = 'rgb(5, 150, 105)';
  g.fillRect(0, 0, 4, 4);
  g.fillStyle = 'rgba(148, 163, 184, 0.12)';
  g.fillRect(10, 0, 10, 10);
  console.log('fine');
  console.error('bad');
  setTimeout(() => { throw new Error('boom'); }, 0);
</script>`);

/** Chromium through `ENGINES`, with each browser and its options kept. */
function chromium() {
  const browsers: Browser[] = [];
  const options: LaunchOptions[] = [];
  const launch = async (given: LaunchOptions) => {
    options.push(given);
    const browser = await ENGINES.launch(given);
    browsers.push(browser);
    return browser;
  };
  return { launch, browsers, options };
}

describe('open, in a real Chromium', () => {
  it('drives the page by accessible name, reads the opaque pixels, and closes its browser', async () => {
    const { launch, browsers, options } = chromium();
    const app = await open(INSTRUMENT, launch);
    expect(options).toEqual([{ args: ['--autoplay-policy=no-user-gesture-required'] }]);
    expect(app.board).toEqual({ width: 3, height: 2 });
    expect(await app.title()).toBe('Synthominos');
    expect(await app.cellName(2, 1)).toBe('fila 2, columna 3, libre');
    await app.cell(1, 0).click();
    expect(await app.announced()).toBe('click fila 1, columna 2, libre');
    await app.cell(0, 1).click({ modifiers: ['Alt'] });
    expect(await app.announced()).toBe('alt click fila 2, columna 1, libre');
    expect(await app.piece('F').getAttribute('aria-pressed')).toBe('true');
    expect(await app.slots().count()).toBe(12);
    expect(await app.button('Reproducir').count()).toBe(1);
    expect(await app.litPixels()).toBe(16);
    await app.button('Reproducir').click();
    await app.key('a');
    expect(await app.announced()).toBe('key a on BUTTON');
    await app.blur();
    await app.key('b');
    expect(await app.announced()).toBe('key b on BODY');
    await app.cell(0, 0).hover();
    await app.wheel(100);
    expect(await app.announced()).toBe('wheel 100');
    await app.wait(1);
    const dir = mkdtempSync(path.join(tmpdir(), 'proof-'));
    await app.screenshot(path.join(dir, 'final.png'));
    expect(statSync(path.join(dir, 'final.png')).size).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
    expect(app.errors).toEqual(['bad', 'Error: boom']);
    await app.close();
    expect(browsers.map(browser => browser.isConnected())).toEqual([false]);
    // One Chromium and some twenty actions: in a parallel suite they pass the 5 s default.
  }, 30_000);

  it('closes its browser when the grid is not the board of the instrument', async () => {
    const { launch, browsers } = chromium();
    await expect(open(page('<div role="grid" aria-label="Tabla">.</div>'), launch)).rejects.toThrow('the grid is not the board of the instrument: "Tabla"');
    expect(browsers.map(browser => browser.isConnected())).toEqual([false]);
  }, 30_000);

  it('closes its browser when nothing answers at the URL', async () => {
    const free = createHttpServer();
    await new Promise<void>(resolve => { free.listen(0, '127.0.0.1', resolve); });
    const { port } = free.address() as AddressInfo;
    await new Promise<void>(resolve => { free.close(() => { resolve(); }); });
    const { launch, browsers } = chromium();
    await expect(open(`http://127.0.0.1:${port}/`, launch)).rejects.toThrow('ERR_CONNECTION_REFUSED');
    expect(browsers.map(browser => browser.isConnected())).toEqual([false]);
  }, 30_000);
});

describe('the functions that run in the page', () => {
  const canvas = (data: number[] | null) => ({
    width: data === null ? 0 : data.length / 4,
    height: 1,
    getContext: () => (data === null ? null : { getImageData: () => ({ data: Uint8ClampedArray.from(data) }) }),
  });

  it.each([
    ['no canvas', null, 0],
    ['a canvas with no 2D context', canvas(null), 0],
    ['an opaque pixel, a dim one, an empty one and an opaque one', canvas([5, 150, 105, 255, 148, 163, 184, 31, 0, 0, 0, 0, 94, 234, 212, 255]), 2],
  ])('opaquePixels counts only the opaque pixels: %s', (_, found, expected) => {
    vi.stubGlobal('document', { querySelector: () => found });
    expect(opaquePixels()).toBe(expected);
  });

  it('blurFocus blurs the focused element, and does nothing when no element has the focus', () => {
    class Focusable { blur = vi.fn(); }
    vi.stubGlobal('HTMLElement', Focusable);
    const focused = new Focusable();
    vi.stubGlobal('document', { activeElement: focused });
    blurFocus();
    expect(focused.blur).toHaveBeenCalledOnce();
    vi.stubGlobal('document', { activeElement: null });
    expect(() => { blurFocus(); }).not.toThrow();
  });
});

describe('boardSize', () => {
  it('reads the width and the height from the name of the board', () => {
    expect(boardSize('Tablero de 18 por 11')).toEqual({ width: 18, height: 11 });
  });

  it.each([[null, 'null'], ['Tablero de 18', '"Tablero de 18"']])('refuses %j', (label, shown) => {
    expect(() => boardSize(label)).toThrow(`the grid is not the board of the instrument: ${shown}`);
  });
});

function fakeDevServer(resolvedUrls: DevServer['resolvedUrls']) {
  const configs: unknown[] = [];
  const listen = vi.fn(() => Promise.resolve());
  const close = vi.fn(() => Promise.resolve());
  const create = (config: unknown) => {
    configs.push(config);
    return Promise.resolve({ listen, close, resolvedUrls });
  };
  return { create, configs, listen, close };
}

describe('serve', () => {
  it('starts from the first port, moves on when it is taken, and stops only its own server', async () => {
    const fake = fakeDevServer({ local: ['http://localhost:5301/'] });
    const server = await serve(fake.create, '/repo');
    expect(fake.configs).toEqual([{ root: '/repo', server: { port: FIRST_PORT, strictPort: false }, logLevel: 'error' }]);
    expect(fake.listen).toHaveBeenCalledOnce();
    expect(server.url).toBe('http://localhost:5301/');
    expect(fake.close).not.toHaveBeenCalled();
    await server.close();
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it('stops the server and fails when it gives no local URL', async () => {
    const fake = fakeDevServer(null);
    await expect(serve(fake.create, '/repo')).rejects.toThrow('the dev server gives no local URL');
    expect(fake.close).toHaveBeenCalledOnce();
  });
});

describe('realProveSystem', () => {
  it('starts the server and the browser through its engines, and keeps the evidence under its root', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'verify-'));
    const fake = fakeDevServer({ local: ['http://localhost:5300/'] });
    const sys = realProveSystem({ createServer: fake.create, launch: () => Promise.reject(new Error('no Chromium')) }, root);
    expect((await sys.launch()).url).toBe('http://localhost:5300/');
    expect(fake.configs).toEqual([expect.objectContaining({ root })]);
    await expect(sys.open('http://localhost:5300/')).rejects.toThrow('no Chromium');
    const dir = sys.folder('edit');
    expect(path.relative(root, dir)).toMatch(/^\.agent-runs[\\/]verify[\\/]\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-edit$/);
    expect(existsSync(dir)).toBe(true);
    sys.write(path.join(dir, 'proof.json'), '{}');
    expect(readFileSync(path.join(dir, 'proof.json'), 'utf8')).toBe('{}');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sys.out('PASSED');
    sys.err('usage');
    expect(log).toHaveBeenCalledWith('PASSED');
    expect(error).toHaveBeenCalledWith('usage');
    rmSync(root, { recursive: true, force: true });
  });

  it('by default starts Vite and Chromium, from the current folder', () => {
    expect(ENGINES.createServer).toBe(createServer);
    expect(Object.keys(realProveSystem())).toEqual(['launch', 'open', 'folder', 'write', 'out', 'err']);
  });
});
