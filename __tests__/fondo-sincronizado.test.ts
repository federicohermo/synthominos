import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

// It throws: two missing values would be two equal `undefined`, and the equality would hold.
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
    // Without `@theme`, Tailwind stops generating `bg-fondo`, and nothing shows on screen.
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
