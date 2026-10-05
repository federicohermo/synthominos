import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, posix } from 'node:path';

export type SymbolKind = 'function' | 'const' | 'interface' | 'type';

export interface ExportedSymbol {
  name: string;
  kind: SymbolKind;
  /** Relative to the repo root, with `/` also on Windows. */
  file: string;
  line: number;
  signature: string;
  doc: string | null;
  esDefault: boolean;
}

export interface ImportBinding {
  file: string;
  from: string;
  /** `null` for an external package. */
  resolved: string | null;
  /** The names as the source module exports them, not the local ones. */
  names: string[];
  porDefecto: boolean;
}

export interface ModuleFacts {
  exports: ExportedSymbol[];
  imports: ImportBinding[];
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

function primeraFrase(raw: string): string | null {
  if (!raw.startsWith('/**')) return null;

  const cuerpo = oneLine(
    raw.replace(/^\/\*\*/, '').replace(/\*\/$/, '').replace(/^\s*\*/gm, ''),
  );
  if (!cuerpo) return null;

  const corte = cuerpo.indexOf('. ');
  return corte === -1 ? cuerpo : cuerpo.slice(0, corte + 1);
}

function leadingDoc(node: ts.Node, full: string): string | null {
  const ranges = ts.getLeadingCommentRanges(full, node.getFullStart()) ?? [];
  const last = ranges.at(-1);
  if (!last) return null;

  return primeraFrase(full.slice(last.pos, last.end));
}

/** In a `.tsx`, TypeScript attaches the top block to `interface Props`, not to the default export. */
function primerDocDelArchivo(full: string): string | null {
  const ini = full.indexOf('/**');
  if (ini === -1) return null;
  const fin = full.indexOf('*/', ini);
  return fin === -1 ? null : primeraFrase(full.slice(ini, fin + 2));
}

function signatureOf(node: ts.Node, sf: ts.SourceFile, body?: ts.Node): string {
  const start = node.getStart(sf);
  const end = body ? body.getStart(sf) : node.getEnd();
  return oneLine(sf.text.slice(start, end)).replace(/(?:=>|[{=])$/, '').trim();
}

/** `posix`, not `resolve`: `resolve` goes through `cwd`, and an MCP client promises no working directory. */
function resolveSpecifier(from: string, file: string): string | null {
  if (!from.startsWith('.')) return null;
  return posix.join(posix.dirname(file), from);
}

export function parseModule(text: string, file: string): ModuleFacts {
  // In TSX the `<T>` of a generic arrow opens a tag that never closes: the parser drops the
  // rest of the file and does not throw.
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
        // `propertyName` is the exported name in `{ isValid as esValida }`: `name` is the local one.
        names: nb && ts.isNamedImports(nb)
          ? nb.elements.map(e => (e.propertyName ?? e.name).text)
          : [],
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
 * The comparator has no branch: with a `?:`, the branch that runs depends on the order in which
 * the file system gives the entries, and the coverage threshold with it.
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
  archivos: number;
  /** Files read for their imports only. */
  archivosGrafo: number;
}

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
  usedBy: string[];
}

const esTest = (f: string): boolean => f.includes('__tests__');

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
          && (i.names.includes(e.name) || (e.esDefault && i.porDefecto))
          && (includeTests || !esTest(i.file)))
        .map(i => i.file),
    )].sort(),
  }));
}

export function outline(index: CodeIndex, includeTests: boolean): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of index.exports) {
    if (!includeTests && esTest(e.file)) continue;
    (out[e.file] ??= []).push(`${e.name}${e.kind === 'function' ? '()' : ''}`);
  }
  return out;
}
