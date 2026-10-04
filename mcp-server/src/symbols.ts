import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, posix } from 'node:path';

/**
 * Indice de simbolos de `src/`, construido EN LA CONSULTA y nunca persistido.
 *
 * Es la unica tool que mira el codigo como texto en vez de ejecutarlo, y por eso
 * conviene ser explicito con lo que NO cambia: no hay archivo de indice, no hay
 * paso de build y no hay `generatedAt`. Cada llamada parsea `src/` de nuevo desde
 * disco, asi que la respuesta es HEAD en el momento de preguntar. Se puede porque
 * medirlo dio, sobre los 36 + 16 archivos de entonces, 112 ms en frio y ~50 ms
 * despues. Hoy el indice son 92 archivos mas 22 que solo aportan aristas; el dia
 * que eso duela, la respuesta es cachear por mtime, no generar un artefacto que
 * alguien tenga que regenerar.
 *
 * Por que un AST y no una regex: la pregunta que se quiere contestar es "quien
 * USA este simbolo", y eso se resuelve por el grafo de imports —specifier
 * relativo resuelto a archivo—, no por coincidencia de texto. Un grep sobre
 * `notesForRotation` devuelve 14 lineas de las cuales 11 son llamadas dentro de
 * un mismo test; el grafo devuelve los 3 archivos que lo importan. Ademas el
 * compilador ya viene con el paquete y se encarga de CRLF, comentarios y strings,
 * que es justo donde una regex de lineas se equivoca en silencio en este repo.
 */

/**
 * Que es el simbolo. Sin `enum`: `erasableSyntaxOnly` los rechaza.
 *
 * Una arrow function asignada a un `const` cuenta como `'function'` y no como
 * `'const'`: la pregunta que contesta este campo es que ES el simbolo, y en
 * `audio/engine.ts` hay seis que son funciones y se leian como valores.
 */
export type SymbolKind = 'function' | 'const' | 'interface' | 'type';

export interface ExportedSymbol {
  name: string;
  kind: SymbolKind;
  /** Ruta relativa a la raiz del repo, con `/` aun en Windows. */
  file: string;
  line: number;
  /** La firma en una linea: lo que evita tener que abrir el archivo. */
  signature: string;
  /** Primera frase del bloque de doc, si hay. */
  doc: string | null;
  /**
   * Si se exporta con `export default`. Hace falta para casar el import: del lado
   * del importador el binding por defecto no trae el nombre del simbolo.
   */
  esDefault: boolean;
}

export interface ImportBinding {
  file: string;
  /** El specifier tal cual esta escrito. */
  from: string;
  /**
   * El specifier resuelto a ruta del repo, o `null` si es un paquete externo.
   * Es lo que permite distinguir dos simbolos homonimos de modulos distintos.
   */
  resolved: string | null;
  /** Los nombres tal como los EXPORTA el modulo de origen, no los locales. */
  names: string[];
  /**
   * Si el import trae el binding por defecto.
   *
   * Va aparte de `names` porque del lado del export ese simbolo no tiene nombre:
   * `import Tablero from './Board.tsx'` importa a `Board`, asi que casarlo por
   * nombre daria falso.
   */
  porDefecto: boolean;
}

export interface ModuleFacts {
  exports: ExportedSymbol[];
  imports: ImportBinding[];
}

/** Barre `\r`, saltos e indentacion: una firma multilinea entra en una linea. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Primera frase de un bloque de doc crudo, delimitadores incluidos. */
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
 * Primera frase del JSDoc que precede al nodo.
 *
 * Se toma del texto crudo y no de `ts.getJSDocCommentsAndTags` porque alcanza con
 * la primera frase y asi no se arrastra la estructura de tags.
 */
function leadingDoc(node: ts.Node, full: string): string | null {
  const ranges = ts.getLeadingCommentRanges(full, node.getFullStart()) ?? [];
  const last = ranges.at(-1);
  if (!last) return null;

  return primeraFrase(full.slice(last.pos, last.end));
}

/**
 * Primer bloque de doc del archivo, buscado sobre el texto crudo.
 *
 * Es el fallback del `export default`, y existe por la convencion de los `.tsx`
 * de este repo: el bloque que describe al componente va arriba del archivo y lo
 * sigue `interface Props`, que NO se exporta. TypeScript se lo adjudica a ella,
 * asi que el componente quedaba con `doc: null` — los cinco, o sea toda la capa
 * de UI, que es justo donde la tool promete evitar abrir el archivo.
 *
 * Solo se aplica al default: `react-refresh/only-export-components` obliga a que
 * un `.tsx` exporte una sola cosa, asi que el primer bloque no puede ser de otro
 * simbolo exportado. Sobre texto crudo y no sobre el AST porque el bloque no esta
 * adjunto a ningun nodo que sobreviva al filtro de exports.
 */
function primerDocDelArchivo(full: string): string | null {
  const ini = full.indexOf('/**');
  if (ini === -1) return null;
  const fin = full.indexOf('*/', ini);
  return fin === -1 ? null : primeraFrase(full.slice(ini, fin + 2));
}

/**
 * La cabecera de una declaracion, sin su cuerpo.
 *
 * El `=>` entra en lo que se recorta porque para una arrow function el corte va
 * en el cuerpo: cortar en el inicializador dejaba `midiToHz` pelado, sin
 * parametros ni tipo de retorno, que es exactamente lo que el llamador venia a
 * buscar para no abrir el archivo.
 */
function signatureOf(node: ts.Node, sf: ts.SourceFile, body?: ts.Node): string {
  const start = node.getStart(sf);
  const end = body ? body.getStart(sf) : node.getEnd();
  return oneLine(sf.text.slice(start, end)).replace(/(?:=>|[{=])$/, '').trim();
}

/**
 * Resuelve un specifier relativo a ruta del repo. Devuelve `null` para paquetes
 * externos, que es lo que hace que `react` y `zod` no ensucien el grafo.
 *
 * No toca el disco: los imports de este repo llevan extension explicita, asi que
 * no hay que adivinar `index.ts` ni probar sufijos.
 *
 * Con `posix` y no con `resolve`: las rutas que maneja este modulo son relativas
 * al repo y con `/`, asi que meterlas en el resolvedor del sistema las haria pasar
 * por `cwd` —que en un server MCP no promete nada— para volver a salir.
 */
function resolveSpecifier(from: string, file: string): string | null {
  if (!from.startsWith('.')) return null;
  return posix.join(posix.dirname(file), from);
}

/**
 * Exports e imports de UN modulo. Pura sobre el texto: los tests le pasan un
 * string fijo, asi que editar `src/` no los rompe.
 *
 * `file` es la ruta relativa al repo y se usa tal cual en la salida y como base
 * para resolver los specifiers.
 */
export function parseModule(text: string, file: string): ModuleFacts {
  // El `ScriptKind` sale de la extension y no es fijo TSX. En TSX el `<T>` de una
  // arrow generica —o un cast viejo `<Foo>bar`— abre una etiqueta que nunca cierra
  // y se COME el resto del archivo: `createSourceFile` no tira, simplemente
  // devuelve los exports de arriba y ninguno de los de abajo. Hoy `src/` no tiene
  // ninguno de los dos; elegir bien el kind es lo que hace que siga sin importar.
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
        // `propertyName ?? name` y no `name` a secas: en `{ isValid as esValida }`
        // el simbolo importado es el primero y el segundo es solo como se llama
        // aca. Guardar el local hacia que `find_symbol("isValid")` no listara al
        // archivo que lo usa.
        names: nb && ts.isNamedImports(nb)
          ? nb.elements.map(e => (e.propertyName ?? e.name).text)
          : [],
        // El binding por defecto vive en `importClause.name` y no en
        // `namedBindings`: ignorarlo dejaba a los seis `export default` de `src/`
        // —`App` y los cinco componentes— con `usedBy: []`, que se lee como
        // codigo muerto. Un `import * as x` sigue afuera: no dice que simbolo se
        // usa, y `src/` no tiene ninguno.
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
          // Una constante corta en el `=`, porque su valor puede ser las 12
          // piezas; una arrow corta en el cuerpo, para conservar la firma.
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
 * Todos los `.ts`/`.tsx` bajo un directorio, en orden estable.
 *
 * El comparador es aritmetico y no un `?:`, y las dos razones se midieron juntas
 * cuando el spec 023 corrio `pnpm verify` en un runner de Linux por primera vez.
 *
 * Decia `a.name < b.name ? -1 : 1`, y eso tiene un defecto latente y uno visible.
 * El latente: para dos nombres IGUALES devuelve 1, o sea afirma `a > b`. Es un
 * comparador inconsistente; hoy no explota porque los nombres de un directorio son
 * unicos, pero es una promesa que el tipo de `sort` no obliga a cumplir.
 *
 * El visible es el que lo delato, y es de la familia que este repo persigue —pasar
 * en verde—: **que rama del `?:` se ejecuta depende del orden en que el sistema de
 * archivos entrega las entradas**. NTFS las devuelve alfabeticas y ext4 en orden de
 * hash, asi que V8 puede no tomar nunca uno de los dos lados. Medido: en Windows
 * las 102 ramas de este archivo quedaban cubiertas y en el runner una no
 * —`BRDA:243,72,0,0`, la de esta linea—, y `mcp:test` daba
 * `99.64% branch coverage does not meet threshold of 100%`. O sea que el umbral 100
 * que fijo el 029 pasaba por el sistema de archivos de quien lo corriera.
 *
 * `Number(x) - Number(y)` no tiene ramas, asi que no hay nada cuya cobertura pueda
 * depender del entorno, y de paso el orden queda total: devuelve 0 para iguales. No
 * se usa `localeCompare` porque depende del locale, que es cambiar una dependencia
 * del entorno por otra.
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
  /** Archivos cuyos exports entran al indice. */
  archivos: number;
  /** Archivos que solo aportan aristas al grafo: se leen sus imports, no sus exports. */
  archivosGrafo: number;
}

/**
 * Lee y parsea el codigo. Es la unica parte que toca el disco.
 *
 * `soloGrafo` son directorios de los que interesan las ARISTAS y no los simbolos:
 * hoy es `mcp-server/src/`, que importa 45 cosas de `src/domain/` y `src/audio/`.
 * Sin ellos `usedBy` sub-reporta y la tool queda menos completa que el grep que
 * vino a reemplazar — un `grep notesForRotation` encuentra `describePiece.ts` y
 * el grafo, si no se lo indexa, no. Sus exports quedan afuera a proposito: el
 * indice es el mapa de `src/`, y las tools no son superficie de la app.
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
  /** Archivos que lo importan, resueltos por el grafo y no por texto. */
  usedBy: string[];
}

const esTest = (f: string): boolean => f.includes('__tests__');

/**
 * Busca un simbolo por nombre. Exacto primero; si no hay ninguno, subcadena sin
 * distinguir mayusculas, que es lo que salva la consulta a medio recordar.
 *
 * `usedBy` cuenta un archivo UNA vez aunque lo llame quince veces: la pregunta es
 * quien depende del simbolo, y es justo donde el grep infla la respuesta.
 *
 * `includeTests` filtra las DOS puntas —los matches y los usuarios— y no una
 * sola: filtrando solo `usedBy`, un helper de `__tests__/` salia como match con
 * cero usuarios, o sea presentado como huerfano y como parte de la superficie de
 * `src/`; y peor, una coincidencia exacta en un test tapaba la busqueda por
 * subcadena de un simbolo real, porque el fallback solo corre si no hubo exacta.
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
          // Por nombre exportado, o por el binding por defecto: ese no trae
          // nombre, asi que lo unico que lo casa es el archivo.
          && (i.names.includes(e.name) || (e.esDefault && i.porDefecto))
          && (includeTests || !esTest(i.file)))
        .map(i => i.file),
    )].sort(),
  }));
}

/**
 * El indice entero, agrupado por archivo y sin firmas.
 *
 * Sin firmas a proposito: agrupado asi sirve para orientarse —que hay y donde—, y
 * con firmas pasa de ~2 KB a ~16 KB, que deja de ser un mapa y es el codigo otra vez.
 */
export function outline(index: CodeIndex, includeTests: boolean): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of index.exports) {
    if (!includeTests && esTest(e.file)) continue;
    (out[e.file] ??= []).push(`${e.name}${e.kind === 'function' ? '()' : ''}`);
  }
  return out;
}
