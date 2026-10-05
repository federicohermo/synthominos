import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative, sep } from 'node:path';

// `fileURLToPath`, not `.pathname`: on Windows the pathname of a `file://` is `/D:/...`.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const existe = (ruta: string) => existsSync(ruta);

// `worktrees`: `.claude/worktrees/` holds full checkouts of the repo.
const IGNORADOS = new Set(['node_modules', 'dist', '.git', 'worktrees', '__screenshots__', '.stryker-tmp']);

const caminar = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORADOS.has(e.name)) return [];
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return caminar(ruta);
    return e.name.endsWith('.md') ? [ruta] : [];
  });

const ARCHIVOS = caminar(RAIZ);

// GitHub does not collapse spaces (`/\s/g`, not `/\s+/g`), and it keeps the `_`.
const slug = (encabezado: string) =>
  encabezado
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s/g, '-');

// GitHub adds `-1`, `-2` to a repeated heading. A `#` inside a fence is not a heading.
const anclasDe = (contenido: string) => {
  const vistos = new Map<string, number>();
  const anclas = new Set<string>();
  let enFence = false;

  for (const linea of contenido.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(linea)) { enFence = !enFence; continue; }
    if (enFence) continue;

    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(linea);
    if (!m) continue;

    const base = slug(m[2]);
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    anclas.add(n === 0 ? base : `${base}-${n}`);
  }
  return anclas;
};

const cacheAnclas = new Map<string, Set<string>>();
const anclasDeArchivo = (ruta: string) => {
  const yaEsta = cacheAnclas.get(ruta);
  if (yaEsta) return yaEsta;
  const calculadas = anclasDe(readFileSync(ruta, 'utf8'));
  cacheAnclas.set(ruta, calculadas);
  return calculadas;
};

const enlacesDe = (contenido: string) => {
  const enlaces: { destino: string; linea: number }[] = [];
  let enFence = false;

  contenido.split(/\r?\n/).forEach((texto, i) => {
    if (/^\s*(```|~~~)/.test(texto)) { enFence = !enFence; return; }
    if (enFence) return;

    for (const m of texto.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const destino = m[1];
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(destino)) continue;
      enlaces.push({ destino, linea: i + 1 });
    }
  });
  return enlaces;
};

const esDeUnSpec = (absoluto: string) => /[/\\]specs[/\\]\d{3}-/.test(absoluto);

describe('the relative links of the documentation resolve', () => {
  it('walks the `.md` files of the repo, and finds more than the floor', () => {
    // Without this floor, a broken walker makes the other two tests pass with nothing read.
    const piso = 25;

    expect(ARCHIVOS.length, `floor ${piso}`).toBeGreaterThan(piso);
  });

  it('each link points to a file that exists', () => {
    const rotos: string[] = [];

    for (const archivo of ARCHIVOS) {
      for (const { destino, linea } of enlacesDe(readFileSync(archivo, 'utf8'))) {
        const [ruta] = destino.split('#');
        if (ruta === '') continue; // own anchor: the test below checks it
        const absoluto = resolve(dirname(archivo), ruta);

        // The trailing separator keeps a sibling like `specs-archivo/` out of the exception.
        if (esDeUnSpec(archivo) && absoluto.startsWith(join(RAIZ, 'specs') + sep)) continue;

        if (!ARCHIVOS.includes(absoluto) && !existe(absoluto)) {
          rotos.push(`${relative(RAIZ, archivo)}:${linea} → ${destino}`);
        }
      }
    }

    expect(rotos, `links to a file that does not exist:\n${rotos.join('\n')}`).toEqual([]);
  });

  it('each anchor points to a heading that exists, in its own file or in another', () => {
    const rotas: string[] = [];

    for (const archivo of ARCHIVOS) {
      const contenido = readFileSync(archivo, 'utf8');
      for (const { destino, linea } of enlacesDe(contenido)) {
        const [ruta, ancla] = destino.split('#');
        if (!ancla) continue;

        const objetivo = ruta === '' ? archivo : resolve(dirname(archivo), ruta);
        if (!existe(objetivo)) continue; // the test above reports it
        if (!objetivo.endsWith('.md')) continue;

        if (!anclasDeArchivo(objetivo).has(ancla.toLowerCase())) {
          rotas.push(`${relative(RAIZ, archivo)}:${linea} → ${destino}`);
        }
      }
    }

    expect(rotas, `anchors that do not exist:\n${rotas.join('\n')}`).toEqual([]);
  });
});
