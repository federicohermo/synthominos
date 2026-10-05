import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

// It throws: two missing values would be two equal `undefined`, and the equality would hold.
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
    expect(extraer(html, /<title>([^<]+)<\/title>/, 'index.html')).toBe(nombre);
  });

  it('AC-PNL-029 — the heading of the README says the same name', () => {
    expect(extraer(readme, /^#\s+(.+)$/m, 'README.md')).toBe(nombre);
  });

  it('AC-PNL-029 — the `short_name` of the manifest is the name or a shorter version of it', () => {
    expect(nombre.startsWith(manifest.short_name)).toBe(true);
  });
});
