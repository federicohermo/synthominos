import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The background color, in the four places where the repo writes it.
 *
 * Inside `src/` it is unified: there is ONE token, `--color-fondo`, and the `body` and the
 * root `div` of `App.tsx` come from it. Outside `src/` there are three more copies, and they
 * are UNAVOIDABLE, not an oversight: the browser parses the manifest and the
 * `<meta name="theme-color">` with no CSS in sight (the manifest to paint the icon and the
 * splash of the installed app, the meta to paint the bar of the mobile browser), so neither
 * can consume a custom property.
 *
 * What must not happen is that they go out of sync: this is one value written across the
 * CSS/JSON/HTML border, and nothing else syncs it. A comment in the manifest is not an
 * option either: JSON has no comments.
 *
 * It is a test of the `node` project and not of the browser one: three files read from the
 * disk and compared as text, with no DOM in between.
 */

/** The repo root: `__tests__/` hangs from it. */
const raiz = new URL('../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

/**
 * Extracts the color, and fails naming the file if it is missing.
 *
 * It fails explicitly and does not return `undefined` because the four values are compared
 * with each other: two missing values would be two equal `undefined`, and the equality would
 * hold empty.
 */
const color = (texto: string, patron: RegExp, donde: string) => {
  const m = patron.exec(texto);
  if (!m) throw new Error(`Background color not found in ${donde}`);
  return m[1].toLowerCase();
};

const css = leer('src/styles/index.css');
const manifest = leer('public/manifest.json');
const html = leer('index.html');

describe('the background color is in sync outside `src/`', () => {
  const token = color(css, /--color-fondo:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'src/styles/index.css');

  it('AC-PNL-030 — the token exists and is a written color', () => {
    // If `@theme` goes away, Tailwind stops generating `bg-fondo` and the root `div` becomes
    // transparent: the `body` would cover the background and nothing strange would show on
    // screen.
    expect(token).toMatch(/^#[0-9a-f]{6}$/);
    expect(css).toContain('var(--color-fondo)');
  });

  it('AC-PNL-030 — `theme_color` and `background_color` of the manifest say the token', () => {
    const m = JSON.parse(manifest) as { theme_color: string; background_color: string };
    expect(m.theme_color.toLowerCase()).toBe(token);
    expect(m.background_color.toLowerCase()).toBe(token);
  });

  it('AC-PNL-030 — the `<meta name="theme-color">` of `index.html` says the token', () => {
    const meta = color(html, /<meta\s+name="theme-color"\s+content="(#[0-9a-fA-F]{3,8})"/, 'index.html');
    expect(meta).toBe(token);
  });
});
