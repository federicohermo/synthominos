import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The name of the app, in the three places where the repo writes it for a person to read.
 *
 * It is the exact sibling of `fondo-sincronizado.test.ts`, with another value: the name lives
 * in three files and nothing else syncs them. Without this gate a half-changed name breaks no
 * assertion: `documento.test.ts` reads this same `index.html` but only looks at `lang`, and
 * `fondo-sincronizado.test.ts` compares colors. Measured on 2026-08-21: `manifest.json` said
 * "Synthominos", the `<title>` and the README said "Pentomino Games", and `pnpm verify` was
 * **green**.
 *
 * The three copies are UNAVOIDABLE, as those of the color: the browser parses the manifest
 * and the `<title>` with no CSS or JS in sight (the manifest for the name of the installed
 * app, the `<title>` for the tab), and a person reads the README on GitHub. None of the three
 * can read a constant of `src/`.
 *
 * ## What it does NOT cover, and why
 *
 * The identity of the **repository** (`package.json:name`, the GitHub remote, the
 * `pentomino-games` of the tooling docs) stays as it is, and this test does not look at it.
 * They are two different things: one is the name of the product and the other is where the
 * code lives. To tie them would force a rename of the remote and a review of the deploy to
 * change a `<title>`, which is exactly the cost that leaves a rename half done.
 *
 * It is a test of the `node` project and not of the browser one: three files read from the
 * disk and compared as text, with no DOM in between.
 */

/** The repo root: `__tests__/` hangs from it. */
const raiz = new URL('../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

/**
 * Extracts the value, and fails naming the file if it is missing.
 *
 * It fails and does not return `undefined` for the same reason as its twin of the color: the
 * values are compared with each other, and two missing values would be two equal `undefined`.
 * The equality would hold empty, and the test would pass without looking at anything.
 */
const extraer = (texto: string, patron: RegExp, donde: string) => {
  const m = patron.exec(texto);
  if (!m) throw new Error(`App name not found in ${donde}`);
  return m[1].trim();
};

const manifest = JSON.parse(leer('public/manifest.json')) as {
  name: string;
  short_name: string;
};
const html = leer('index.html');
const readme = leer('README.md');

describe('the name of the app is in sync', () => {
  const nombre = manifest.name;

  it('AC-PNL-029 — the manifest declares a non-empty name', () => {
    expect(nombre).toBeTruthy();
  });

  it('AC-PNL-029 — the `<title>` of `index.html` says the same name', () => {
    // It is what the tab and the history show. Out of sync, it names another thing.
    expect(extraer(html, /<title>([^<]+)<\/title>/, 'index.html')).toBe(nombre);
  });

  it('AC-PNL-029 — the heading of the README says the same name', () => {
    expect(extraer(readme, /^#\s+(.+)$/m, 'README.md')).toBe(nombre);
  });

  it('AC-PNL-029 — the `short_name` of the manifest is the name or a shorter version of it', () => {
    // The PWA spec wants `short_name` for when `name` does not fit, so it may be shorter.
    // But it must be the SAME name cut short and not another one, which is the result when
    // someone changes only one of the two fields.
    expect(nombre.startsWith(manifest.short_name)).toBe(true);
  });
});
