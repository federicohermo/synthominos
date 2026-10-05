import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative, sep } from 'node:path';

/**
 * Every relative link of every `.md` of the repo resolves: the file exists, and if the link
 * has an anchor, the heading exists.
 *
 * No linter gives this gate. `markdown/no-missing-link-fragments` looks at the anchors of ONE
 * file against its own headings, and this repo links mostly OUTWARD (`AGENTS.md` to `docs/`,
 * `docs/` to itself, the specs to the specs), which is what that rule does not see. So the
 * rule is off in `eslint.config.js`, and so this file exists.
 *
 * The other reason for a test and not a rule is the slugger. The one of the rule does not
 * match the one of GitHub on a heading with backticks and an underscore, so it declares
 * broken a link to the anchor `#find_symbol`, which resolves on GitHub: **to "fix" it would
 * break it for real**. The two differences are below, each with the false positive it gives
 * when written the other way.
 *
 * It is a test of the `node` project: files read from the disk and compared as text, with no
 * DOM in between. It lives in `docs/__tests__/` and not in `src/` because it imports no line
 * of the app: it verifies the DOCUMENTATION, and `src/` does not need to know about it
 * (issue #100). It is outside the `include` of coverage, so it is not under the 100
 * threshold: the criterion of sufficiency is another one, written below.
 */

/**
 * The repo root: this file lives in `docs/__tests__/`, two levels down.
 *
 * With `fileURLToPath` and not with `.pathname`: on Windows the pathname of a `file://` comes
 * as `/D:/...`, with one slash too many in front, and `resolve` on that gives a path that
 * does not exist.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** It exists, and it is a file or a directory. */
const existe = (ruta: string) => existsSync(ruta);

/**
 * What is not walked. `node_modules` is obvious. `.claude/worktrees/` is not, and it is the
 * one that matters.
 *
 * It holds a complete checkout of the repo, so without this entry each `.md` of the project
 * is verified one more time for each parallel task that runs, and the test depends on whether
 * one runs.
 */
const IGNORADOS = new Set(['node_modules', 'dist', '.git', 'worktrees', '__screenshots__', '.stryker-tmp']);

const caminar = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORADOS.has(e.name)) return [];
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return caminar(ruta);
    return e.name.endsWith('.md') ? [ruta] : [];
  });

const ARCHIVOS = caminar(RAIZ);

/**
 * The slug of a heading, with the rules of GitHub and the **two** differences that cost one
 * false positive each:
 *
 * 1. **Spaces are NOT collapsed** (`/\s/g` and not `/\s+/g`). GitHub replaces each space with
 *    a hyphen, one by one. A heading with `→`, which is deleted because it is not
 *    alphanumeric, keeps two spaces in a row and so TWO hyphens. With the `+` there were 4
 *    false positives, all 4 on headings with an arrow.
 * 2. **The `_` is kept.** When the backticks are cleaned it is tempting to sweep the
 *    underscore too. Then `### \`find_symbol\`` stops giving `find_symbol`, and a link to
 *    that heading, which works on GitHub, reads as broken. The underscore is one of the few
 *    signs GitHub does NOT delete.
 */
const slug = (encabezado: string) =>
  encabezado
    .trim()
    .toLowerCase()
    // The signs go. Letters (with accents), numbers, spaces, hyphens and underscores stay.
    // `\p{L}` covers the `ñ` and the accented vowels.
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s/g, '-');

/**
 * The headings of a `.md`, as slugs, with the suffix GitHub adds to the repeated ones (`-1`,
 * `-2`, …).
 *
 * Without the suffix, a legitimate link to the second occurrence of a title would read as
 * broken. The fences are skipped: a `# comment` inside a code block is not a heading, and
 * this repo has directory trees full of `#`.
 */
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

/** Cache: each target file is read once, even when twenty links point to it. */
const cacheAnclas = new Map<string, Set<string>>();
const anclasDeArchivo = (ruta: string) => {
  const yaEsta = cacheAnclas.get(ruta);
  if (yaEsta) return yaEsta;
  const calculadas = anclasDe(readFileSync(ruta, 'utf8'));
  cacheAnclas.set(ruta, calculadas);
  return calculadas;
};

/**
 * The `[text](target)` links of a file, with the external ones already dropped.
 *
 * The content of the fences is skipped for the same reason as in `anclasDe`: a syntax example
 * inside a code block is not a link of the document.
 */
const enlacesDe = (contenido: string) => {
  const enlaces: { destino: string; linea: number }[] = [];
  let enFence = false;

  contenido.split(/\r?\n/).forEach((texto, i) => {
    if (/^\s*(```|~~~)/.test(texto)) { enFence = !enFence; return; }
    if (enFence) return;

    for (const m of texto.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const destino = m[1];
      // External links and protocols: not the business of this gate.
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(destino)) continue;
      enlaces.push({ destino, linea: i + 1 });
    }
  });
  return enlaces;
};

/**
 * The one exception: a link FROM a file under a folder of `specs/` whose name starts with
 * three digits and a hyphen, TO a path under `specs/`, is not verified.
 *
 * All the rest of the repo is verified the same, the links of `docs/` included.
 */

/** Is the path under a folder of `specs/` whose name starts with three digits and a hyphen? */
const esDeUnSpec = (absoluto: string) => /[/\\]specs[/\\]\d{3}-/.test(absoluto);

describe('the relative links of the documentation resolve', () => {
  it('walks the `.md` files of the repo, and finds more than the floor', () => {
    // The most important gate of the file, and the one that looks like decoration: if the
    // walker breaks, or if one `IGNORADOS` entry too many eats half the repo, the other two
    // tests pass **without looking at anything**. It is the same "failing green" as the
    // `--filter "{.}"` of `verify`.
    //
    // The floor is a net that catches a broken walker. If the count of the repo comes near
    // it, the fix is to measure again and move the floor, not to delete it.
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

        // The one exception, and it is narrow on purpose: a file under a three-digit folder
        // of `specs/` that links to a path under `specs/`.
        //
        // What the exception does NOT cover: such a file linking to `docs/` or to `src/`.
        // There a broken link is a broken link.
        //
        // The trailing separator is not cosmetic: without it, `startsWith` would also exempt
        // a future sibling like `specs-archivo/`, so a new directory would enter the
        // exception with no decision.
        if (esDeUnSpec(archivo) && absoluto.startsWith(join(RAIZ, 'specs') + sep)) continue;

        if (!ARCHIVOS.includes(absoluto) && !existe(absoluto)) {
          rotos.push(`${relative(RAIZ, archivo)}:${linea} → ${destino}`);
        }
      }
    }

    // The whole list and not the first one: these are all the `.md` of the repo, and a gate
    // that says "failed" and not where is a gate that gets turned off.
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
