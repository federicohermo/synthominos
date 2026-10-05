import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import type { Browser, LaunchOptions } from 'playwright';
import { createServer } from 'vite';
import type { InlineConfig } from 'vite';
import type { App, Mark, ProveSystem, Server } from './proofs.ts';

// Chromium blocks audio with no user gesture, and a headless run has none before its first click.
const BROWSER_ARGS = ['--autoplay-policy=no-user-gesture-required'];
const VIEWPORT = { width: 1280, height: 800 };

/** The first port a dev server of its own tries. `pnpm dev` holds 5173. */
export const FIRST_PORT = 5300;

/** The part of a Vite dev server this file uses. */
export interface DevServer {
  listen(): Promise<unknown>;
  close(): Promise<void>;
  readonly resolvedUrls: { readonly local: readonly string[] } | null;
}

export interface Engines {
  readonly createServer: (config: InlineConfig) => Promise<DevServer>;
  readonly launch: (options: LaunchOptions) => Promise<Browser>;
}

export const ENGINES: Engines = { createServer, launch: chromium.launch.bind(chromium) };

/** It runs in the page, so it reads nothing outside itself. */
export function opaquePixels(): number {
  const canvas = document.querySelector('canvas');
  const g = canvas?.getContext('2d');
  if (!canvas || !g) return 0;
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] === 255) opaque += 1;
  return opaque;
}

/** It runs in the page. The playhead has no name: it is the hidden node that a `translate` moves over the board. */
export function playheadMark(): Mark | null {
  for (const node of document.querySelectorAll<HTMLElement>('[aria-hidden="true"]')) {
    if (node.style.display === 'none' || !node.style.transform.startsWith('translate')) continue;
    const box = node.getBoundingClientRect();
    const cell = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2).find(e => e.getAttribute('role') === 'gridcell');
    if (cell === undefined) continue;
    const layers = (node.querySelector<HTMLElement>('div')?.style.boxShadow ?? '').split(/,(?![^(]*\))/);
    return { cell: String(cell.getAttribute('aria-label')), outer: layers.some(layer => layer !== '' && !layer.includes('inset')) };
  }
  return null;
}

/** It runs in the page. A focus call on the body does not take the focus from a cell. */
export function blurFocus(): void {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement) focused.blur();
}

export function boardSize(label: string | null): App['board'] {
  const found = /^Tablero de (\d+) por (\d+)$/.exec(label ?? '');
  if (found === null) throw new Error(`the grid is not the board of the instrument: ${JSON.stringify(label)}`);
  return { width: Number(found[1]), height: Number(found[2]) };
}

/** Opens the app at `url`. If the page is not the instrument, the browser closes before the error leaves. */
export async function open(url: string, launch: Engines['launch']): Promise<App> {
  const browser = await launch({ args: BROWSER_ARGS });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => { errors.push(String(error)); });
    await page.goto(url);
    const grid = page.getByRole('grid');
    await grid.waitFor();
    const board = boardSize(await grid.getAttribute('aria-label'));
    const cells = page.getByRole('gridcell');
    const cell = (x: number, y: number) => cells.nth(y * board.width + x);
    return {
      board,
      errors,
      cell,
      piece: letter => page.getByRole('button', { name: new RegExp(`^${letter}, `) }),
      slots: () => page.getByRole('button', { name: /^[A-Z], rotación/ }),
      button: name => page.getByRole('button', { name, exact: true }),
      cellName: async (x, y) => String(await cell(x, y).getAttribute('aria-label')),
      announced: async () => String(await page.locator('[aria-live]').textContent()),
      litPixels: () => page.evaluate(opaquePixels),
      playhead: () => page.evaluate(playheadMark),
      key: key => page.keyboard.press(key),
      wheel: deltaY => page.mouse.wheel(0, deltaY),
      blur: () => page.evaluate(blurFocus),
      wait: ms => page.waitForTimeout(ms),
      title: () => page.title(),
      screenshot: async file => { await page.screenshot({ path: file }); },
      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/** A Vite dev server of its own, on the first free port from `FIRST_PORT`. `close()` stops only that server. */
export async function serve(create: Engines['createServer'], root: string): Promise<Server> {
  const server = await create({ root, server: { port: FIRST_PORT, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) {
    await server.close();
    throw new Error('the dev server gives no local URL');
  }
  return { url, close: () => server.close() };
}

export function realProveSystem(engines: Engines = ENGINES, root: string = process.cwd()): ProveSystem {
  return {
    launch: () => serve(engines.createServer, root),
    open: url => open(url, engines.launch),
    folder(feature) {
      const dir = path.join(root, '.agent-runs', 'verify', `${new Date().toISOString().replace(/[:.]/g, '-')}-${feature}`);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    write: (file, text) => { writeFileSync(file, text); },
    out: line => { console.log(line); },
    err: line => { console.error(line); },
  };
}
