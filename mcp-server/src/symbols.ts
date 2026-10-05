import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, posix } from 'node:path';

/**
 * Index of the symbols of `src/`, built IN THE QUERY and never persisted.
 *
 * It serves the only tool that reads the code as text and does not run it, so it is
 * worth being explicit about what does NOT change: there is no index file, no build step
 * and no `generatedAt`. Each call parses `src/` again from disk, so the answer is HEAD
 * at the time of the question. That is affordable. Measured on 36 + 16 files: 112 ms
 * cold and ~50 ms after. Today the index is 72 files plus 17 that only add edges. If
 * that hurts, the answer is a cache by mtime, not a generated artifact that someone must
 * regenerate.
 *
 * Why an AST and not a regex: the question to answer is "who USES this symbol", and the
 * import graph answers it, a relative specifier resolved to a file, not a text match. A
 * grep for `notesForRotation` returns 14 lines, and 11 of them are calls inside one
 * test. The graph returns the 3 files that import it. Also, the compiler comes with the
 * package and handles CRLF, comments and strings, which is exactly where a line regex
 * goes wrong silently in this repo.
 */

/**
 * What the symbol is. No `enum`: `erasableSyntaxOnly` rejects them.
 *
 * An arrow function assigned to a `const` counts as `'function'` and not as `'const'`:
 * this field answers what the symbol IS, and `playback/engine.ts` has six that are
 * functions and would read as values.
 */
export type SymbolKind = 'function' | 'const' | 'interface' | 'type';

export interface ExportedSymbol {
  name: string;
  kind: SymbolKind;
  /** Path relative to the repo root, with `/` also on Windows. */
  file: string;
  line: number;
  /** The signature on one line: it avoids the need to open the file. */
  signature: string;
  /** First sentence of the doc block, if there is one. */
  doc: string | null;
  /**
   * True if the export is an `export default`. The import match needs it: on the
   * importer side the default binding does not have the name of the symbol.
   */
  esDefault: boolean;
}

export interface ImportBinding {
  file: string;
  /** The specifier as written. */
  from: string;
  /**
   * The specifier resolved to a repo path, or `null` for an external package.
   * It tells apart two symbols of the same name from different modules.
   */
  resolved: string | null;
  /** The names as the source module EXPORTS them, not the local ones. */
  names: string[];
  /**
   * True if the import has the default binding.
   *
   * It is apart from `names` because on the export side that symbol has no name:
   * `import Tablero from './Board.tsx'` imports `Board`, so a match by name would be
   * false.
   */
  porDefecto: boolean;
}

export interface ModuleFacts {
  exports: ExportedSymbol[];
  imports: ImportBinding[];
}

/** Removes `\r`, line breaks and indentation: a multi-line signature fits on one line. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** First sentence of a raw doc block, delimiters included. */
function primeraFrase(raw: string): string | null {
  if (!raw.startsWith('/**')) return null;

  const cuerpo = oneLine(
    raw.replace(/^\/\*\*/, '').replace(/\*\/$/, '').replace(/^\s*\*/gm, ''),
  );
  if (!cuerpo) return null;

  const corte = cuerpo.indexOf('. ');
  return corte === -1 ? cuerpo : cuerpo.slice(0, corte + 1);
}

/**
 * First sentence of the JSDoc before the node.
 *
 * It comes from the raw text and not from `ts.getJSDocCommentsAndTags`: the first
 * sentence is enough, and this way the tag structure is not carried.
 */
function leadingDoc(node: ts.Node, full: string): string | null {
  const ranges = ts.getLeadingCommentRanges(full, node.getFullStart()) ?? [];
  const last = ranges.at(-1);
  if (!last) return null;

  return primeraFrase(full.slice(last.pos, last.end));
}

/**
 * First doc block of the file, searched in the raw text.
 *
 * It is the fallback of the `export default`, and it exists because of the convention
 * of the `.tsx` files of this repo: the block that describes the component is at the top
 * of the file, and `interface Props`, which is NOT exported, follows it. TypeScript
 * attaches the block to the interface, so the component would have `doc: null`. That is
 * every component, the whole UI layer, exactly where the tool promises to avoid opening
 * the file.
 *
 * It applies only to the default: `react-refresh/only-export-components` makes a `.tsx`
 * export one thing, so the first block cannot belong to another exported symbol. On raw
 * text and not on the AST, because the block is attached to no node that survives the
 * export filter.
 */
function primerDocDelArchivo(full: string): string | null {
  const ini = full.indexOf('/**');
  if (ini === -1) return null;
  const fin = full.indexOf('*/', ini);
  return fin === -1 ? null : primeraFrase(full.slice(ini, fin + 2));
}

/**
 * The header of a declaration, without its body.
 *
 * The `=>` is part of what is trimmed because for an arrow function the cut is at the
 * body. A cut at the initializer would leave `midiToHz` bare, with no parameters and no
 * return type, which is exactly what the caller came for, to avoid opening the file.
 */
function signatureOf(node: ts.Node, sf: ts.SourceFile, body?: ts.Node): string {
  const start = node.getStart(sf);
  const end = body ? body.getStart(sf) : node.getEnd();
  return oneLine(sf.text.slice(start, end)).replace(/(?:=>|[{=])$/, '').trim();
}

/**
 * Resolves a relative specifier to a repo path. Returns `null` for external packages,
 * which keeps `react` and `zod` out of the graph.
 *
 * It does not touch the disk: the imports of this repo have an explicit extension, so
 * there is no `index.ts` to guess and no suffix to try.
 *
 * With `posix` and not with `resolve`: the paths of this module are relative to the
 * repo and use `/`. The resolver of the system would pass them through `cwd`, which
 * promises nothing in an MCP server, and back out.
 */
function resolveSpecifier(from: string, file: string): string | null {
  if (!from.startsWith('.')) return null;
  return posix.join(posix.dirname(file), from);
}

/**
 * Exports and imports of ONE module. Pure on the text: the tests give it a fixed
 * string, so an edit of `src/` does not break them.
 *
 * `file` is the path relative to the repo. It goes as is into the output, and it is the
 * base to resolve the specifiers.
 */
export function parseModule(text: string, file: string): ModuleFacts {
  // The `ScriptKind` comes from the extension and is not a fixed TSX. In TSX the `<T>` of
  // a generic arrow, or an old cast `<Foo>bar`, opens a tag that never closes and EATS
  // the rest of the file: `createSourceFile` does not throw, it only returns the exports
  // above and none of those below. Today `src/` has neither. The correct kind keeps that
  // from mattering.
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, kind);
  const exports: ExportedSymbol[] = [];
  const imports: ImportBinding[] = [];
  const lineOf = (n: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const clause = st.importClause;
      const nb = clause?.namedBindings;
      imports.push({
        file,
        from: st.moduleSpecifier.text,
        resolved: resolveSpecifier(st.moduleSpecifier.text, file),
        // `propertyName ?? name` and not plain `name`: in `{ isValid as esValida }` the
        // imported symbol is the first, and the second is only its local name. With the
        // local name stored, `find_symbol("isValid")` would not list the file that uses
        // it.
        names: nb && ts.isNamedImports(nb)
          ? nb.elements.map(e => (e.propertyName ?? e.name).text)
          : [],
        // The default binding lives in `importClause.name` and not in `namedBindings`.
        // Without it each `export default` of `src/`, `App` and the components, has
        // `usedBy: []`, which reads as dead code. An `import * as x` stays out: it does
        // not say which symbol is used, and `src/` has none.
        porDefecto: clause?.name !== undefined,
      });
      continue;
    }

    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) ?? [] : [];
    if (!mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;

    const esDefault = mods.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    const doc = leadingDoc(st, sf.text) ?? (esDefault ? primerDocDelArchivo(sf.text) : null);

    if (ts.isFunctionDeclaration(st) && st.name) {
      exports.push({
        name: st.name.text, kind: 'function', file, line: lineOf(st),
        signature: signatureOf(st, sf, st.body), doc, esDefault,
      });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const esFn = init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        exports.push({
          name: d.name.text, kind: esFn ? 'function' : 'const', file, line: lineOf(st),
          // A constant cuts at the `=`, because its value can be the 12 pieces. An arrow
          // cuts at the body, to keep the signature.
          signature: signatureOf(d, sf, esFn ? init.body : init), doc, esDefault,
        });
      }
    } else if (ts.isInterfaceDeclaration(st)) {
      exports.push({
        name: st.name.text, kind: 'interface', file, line: lineOf(st),
        signature: `interface ${st.name.text}`, doc, esDefault,
      });
    } else if (ts.isTypeAliasDeclaration(st)) {
      exports.push({
        name: st.name.text, kind: 'type', file, line: lineOf(st),
        signature: signatureOf(st, sf), doc, esDefault,
      });
    }
  }

  return { exports, imports };
}

/**
 * All the `.ts`/`.tsx` files under a directory, in a stable order.
 *
 * The comparator is arithmetic and not a `?:`, for two reasons that were measured
 * together on a Linux runner.
 *
 * A comparator `a.name < b.name ? -1 : 1` has a latent defect and a visible one. The
 * latent one: for two EQUAL names it returns 1, so it states `a > b`. That comparator is
 * inconsistent. It does not fail here because the names of a directory are unique, but
 * the type of `sort` does not enforce that promise.
 *
 * The visible one is of the family this repo hunts, a gate whose result depends on the
 * machine: **which branch of the `?:` runs depends on the order in which the file system
 * gives the entries**. NTFS returns them in alphabetical order and ext4 in hash order,
 * so V8 can leave one of the two sides never taken. Measured: on Windows the 102
 * branches of this file were covered, and on the runner one was not, the one of this
 * line (`BRDA:243,72,0,0`). `mcp:test` gave
 * `99.64% branch coverage does not meet threshold of 100%`. So the threshold of 100
 * depended on the file system of the machine that ran it.
 *
 * `Number(x) - Number(y)` has no branches, so no coverage can depend on the
 * environment. Also the order is total: it returns 0 for equal names. `localeCompare`
 * is not used because it depends on the locale, which would trade one dependency on the
 * environment for another.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => Number(a.name > b.name) - Number(a.name < b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

export interface CodeIndex {
  exports: ExportedSymbol[];
  imports: ImportBinding[];
  /** Files whose exports go into the index. */
  archivos: number;
  /** Files that only add edges to the graph: their imports are read, not their exports. */
  archivosGrafo: number;
}

/**
 * Reads and parses the code. It is the only part that touches the disk.
 *
 * `soloGrafo` are directories that give EDGES and not symbols: today it is
 * `mcp-server/src/`, which imports 45 symbols of `src/`.
 * Without them `usedBy` under-reports and the tool is less complete than the grep it
 * replaces: a `grep notesForRotation` finds `describePiece.ts`, and the graph does not
 * unless the directory is indexed. Their exports stay out on purpose: the index is the
 * map of `src/`, and the tools are not surface of the app.
 */
export function readIndex(root: string, srcDir: string, soloGrafo: readonly string[] = []): CodeIndex {
  const exports: ExportedSymbol[] = [];
  const imports: ImportBinding[] = [];

  const parse = (abs: string): ModuleFacts => {
    const rel = relative(root, abs).replace(/\\/g, '/');
    return parseModule(readFileSync(abs, 'utf8'), rel);
  };

  const files = walk(srcDir);
  for (const abs of files) {
    const facts = parse(abs);
    exports.push(...facts.exports);
    imports.push(...facts.imports);
  }

  let archivosGrafo = 0;
  for (const dir of soloGrafo) {
    for (const abs of walk(dir)) {
      imports.push(...parse(abs).imports);
      archivosGrafo++;
    }
  }

  return { exports, imports, archivos: files.length, archivosGrafo };
}

export interface SymbolHit extends ExportedSymbol {
  /** Files that import it, resolved by the graph and not by text. */
  usedBy: string[];
}

const esTest = (f: string): boolean => f.includes('__tests__');

/**
 * Finds a symbol by name. Exact match first. If there is none, a case-insensitive
 * substring, which saves the half-remembered query.
 *
 * `usedBy` counts a file ONCE although it calls the symbol fifteen times: the question
 * is who depends on the symbol, and that is exactly where grep inflates the answer.
 *
 * `includeTests` filters the TWO ends, the matches and the users, not one. With a
 * filter on `usedBy` alone, a helper of `__tests__/` is a match with zero users: it
 * looks like an orphan and like part of the surface of `src/`. Worse, an exact match in
 * a test hides the substring search for a real symbol, because the fallback runs only
 * when there is no exact match.
 */
export function findSymbol(index: CodeIndex, query: string, includeTests: boolean): SymbolHit[] {
  const q = query.toLowerCase();
  const universo = includeTests ? index.exports : index.exports.filter(e => !esTest(e.file));
  const exactos = universo.filter(e => e.name === query);
  const hits = exactos.length > 0 ? exactos : universo.filter(e => e.name.toLowerCase().includes(q));

  return hits.map((e): SymbolHit => ({
    ...e,
    usedBy: [...new Set(
      index.imports
        .filter(i => i.resolved === e.file
          // By exported name, or by the default binding: that one has no name, so only
          // the file matches it.
          && (i.names.includes(e.name) || (e.esDefault && i.porDefecto))
          && (includeTests || !esTest(i.file)))
        .map(i => i.file),
    )].sort(),
  }));
}

/**
 * The whole index, grouped by file and with no signatures.
 *
 * No signatures on purpose: grouped like this it is for orientation, what exists and
 * where. With signatures it goes from ~2 KB to ~16 KB, which is not a map: it is the
 * code again.
 */
export function outline(index: CodeIndex, includeTests: boolean): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of index.exports) {
    if (!includeTests && esTest(e.file)) continue;
    (out[e.file] ??= []).push(`${e.name}${e.kind === 'function' ? '()' : ''}`);
  }
  return out;
}
