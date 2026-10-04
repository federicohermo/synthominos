import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseModule, findSymbol, outline } from '../symbols.ts';
import type { CodeIndex } from '../symbols.ts';

/**
 * Sobre strings fijos y NO sobre los archivos del repo: si estos tests leyeran
 * `src/`, agregar un export rompería el build.
 */

const MUSIC = `import { CHROMATIC as NOTAS } from './constants/music.constants.ts';
import { z } from 'zod';

/**
 * Las cinco notas del arpegio. La rotación elige la fórmula de escala.
 *
 * El retrógrado NO se aplica acá.
 */
export function notesForRotation(basePc: number, octave: number, rot: number): number[] {
  return [basePc, octave, rot];
}

/** Nombre MIDI. */
export function midiName(m: number): string {
  return NOTAS[m] + z;
}

function noExportada(): void {}

export const DEFAULT_OCTAVE = 4;

/** MIDI a Hz. */
export const midiToHz = (m: number): number => 440 * m;

export interface Nota { midi: number }

export type Escala = 'mayor' | 'menor';
`;

/**
 * Un componente con la convencion de los `.tsx` de este repo: el bloque que lo
 * describe va arriba y lo sigue `interface Props`, que no se exporta.
 */
const BOARD = `import { notesForRotation } from '../domain/music.ts';

/**
 * Panel central: la grilla del tablero.
 *
 * Presentacional: sin estado, sin efectos.
 */

interface Props { placed: number[] }

export default function Board({ placed }: Props) {
  return placed;
}
`;

const APP = `import { notesForRotation } from './domain/music.ts';
import { notesForRotation as otro } from './audio/fake.ts';
import Tablero from './components/Board.tsx';
`;

const INVARIANTS = `import { notesForRotation, midiName } from './music.ts';
`;

/** Solo importa del homonimo: no es usuario de `domain/music.ts`. */
const FAKE_USER = `import { notesForRotation } from './fake.ts';
`;

const TEST_FILE = `import { notesForRotation } from '../music.ts';

/** Helper solo de tests: no es superficie de src/. */
export function peakNear(x: number): number {
  return x;
}
`;

/** Una tool del server: aporta arista al grafo, y sus exports NO van al índice. */
const TOOL = `import { notesForRotation } from '../../../src/domain/music.ts';

export const describePiece = defineTool({});
`;

/** Un índice armado a mano, del mismo modo que lo arma `readIndex`. */
function indexOf(
  files: Record<string, string>,
  soloGrafo: Record<string, string> = {},
): CodeIndex {
  const index: CodeIndex = { exports: [], imports: [], archivos: 0, archivosGrafo: 0 };
  for (const [file, text] of Object.entries(files)) {
    const facts = parseModule(text, file);
    index.exports.push(...facts.exports);
    index.imports.push(...facts.imports);
    index.archivos++;
  }
  for (const [file, text] of Object.entries(soloGrafo)) {
    index.imports.push(...parseModule(text, file).imports);
    index.archivosGrafo++;
  }
  return index;
}

const INDEX = indexOf(
  {
    'src/domain/music.ts': MUSIC,
    'src/App.tsx': APP,
    'src/components/Board.tsx': BOARD,
    'src/domain/invariants.ts': INVARIANTS,
    'src/audio/otro.ts': FAKE_USER,
    'src/domain/__tests__/music.test.ts': TEST_FILE,
  },
  { 'mcp-server/src/tools/describePiece.ts': TOOL },
);

describe('parseModule', () => {
  test('saca las funciones exportadas con firma sin cuerpo y la primera frase del doc', () => {
    const { exports } = parseModule(MUSIC, 'src/domain/music.ts');
    const n = exports.find(e => e.name === 'notesForRotation');

    assert.equal(n?.kind, 'function');
    assert.equal(n?.file, 'src/domain/music.ts');
    assert.equal(n?.line, 9);
    assert.equal(n?.signature, 'export function notesForRotation(basePc: number, octave: number, rot: number): number[]');
    assert.equal(n?.doc, 'Las cinco notas del arpegio.');
  });

  test('reconoce const, interface y type, y deja afuera lo no exportado', () => {
    const { exports } = parseModule(MUSIC, 'src/domain/music.ts');
    const kinds = new Map(exports.map(e => [e.name, e.kind]));

    assert.equal(kinds.get('DEFAULT_OCTAVE'), 'const');
    assert.equal(kinds.get('Nota'), 'interface');
    assert.equal(kinds.get('Escala'), 'type');
    assert.equal(kinds.has('noExportada'), false);
  });

  test('resuelve el specifier relativo a ruta del repo y deja los paquetes en null', () => {
    const { imports } = parseModule(MUSIC, 'src/domain/music.ts');

    const local = imports.find(i => i.from.startsWith('.'));
    assert.equal(local?.resolved, 'src/domain/constants/music.constants.ts');

    const externo = imports.find(i => i.from === 'zod');
    assert.equal(externo?.resolved, null);
  });

  /**
   * `{ CHROMATIC as NOTAS }` importa a `CHROMATIC`: el segundo nombre es solo como
   * se llama del lado de acá.
   *
   * Guardando el local, `find_symbol("CHROMATIC")` no lista al archivo que lo usa, y
   * el fallo es mudo.
   */
  test('un import con alias registra el nombre exportado, no el local', () => {
    const { imports } = parseModule(MUSIC, 'src/domain/music.ts');
    const local = imports.find(i => i.from.startsWith('.'));

    assert.deepEqual(local?.names, ['CHROMATIC']);
  });

  /** Los seis `export default` de `src/` son `App` y los cinco componentes. */
  test('marca el binding por defecto, que no viaja en names', () => {
    const { imports } = parseModule(APP, 'src/App.tsx');
    const board = imports.find(i => i.from.endsWith('Board.tsx'));

    assert.equal(board?.porDefecto, true);
    assert.deepEqual(board?.names, [], 'el default no tiene nombre del lado del export');

    const named = imports.find(i => i.from === './domain/music.ts');
    assert.equal(named?.porDefecto, false);
  });

  test('un export default queda marcado como tal', () => {
    const { exports } = parseModule(BOARD, 'src/components/Board.tsx');
    const b = exports.find(e => e.name === 'Board');

    assert.equal(b?.esDefault, true);
    assert.equal(parseModule(MUSIC, 'src/domain/music.ts').exports[0].esDefault, false);
  });

  /**
   * La convención de los `.tsx`: el bloque va antes de `interface Props`, que no se
   * exporta.
   *
   * Así que TypeScript se lo adjudica a ella y el componente queda con `doc: null` —
   * los cinco, o sea toda la capa de UI.
   */
  test('el default hereda el doc del archivo cuando no tiene uno pegado', () => {
    const { exports } = parseModule(BOARD, 'src/components/Board.tsx');
    const b = exports.find(e => e.name === 'Board');

    assert.equal(b?.doc, 'Panel central: la grilla del tablero.');
  });

  /**
   * En `.ts` `<T>` abre un genérico; en TSX abre una etiqueta JSX que nunca cierra y
   * **se come el resto del archivo**.
   *
   * Medido: con `ScriptKind.TSX` fijo este módulo aporta `id` y pierde `OTRO`, sin
   * ningún error. Por eso el kind sale de la extensión y no es una constante.
   */
  test('un .ts con arrow genérica no se parsea como TSX', () => {
    const { exports } = parseModule(
      'export const id = <T>(x: T): T => x;\nexport const OTRO = 1;\n',
      'src/domain/id.ts',
    );

    assert.deepEqual(exports.map(e => e.name), ['id', 'OTRO']);
  });

  test('una arrow asignada a const cuenta como función y conserva la firma', () => {
    const { exports } = parseModule(MUSIC, 'src/domain/music.ts');
    const f = exports.find(e => e.name === 'midiToHz');

    assert.equal(f?.kind, 'function');
    assert.equal(f?.signature, 'midiToHz = (m: number): number');

    const c = exports.find(e => e.name === 'DEFAULT_OCTAVE');
    assert.equal(c?.kind, 'const');
  });

  test('sube un nivel bien: `../music.ts` desde __tests__ resuelve al módulo', () => {
    const { imports } = parseModule(TEST_FILE, 'src/domain/__tests__/music.test.ts');
    assert.equal(imports[0].resolved, 'src/domain/music.ts');
  });

  /**
   * Los archivos del repo están en CRLF. Es el trap documentado de este server, y
   * el motivo de fondo por el que este módulo usa un AST y no una regex de líneas.
   */
  test('da lo mismo con CRLF que con LF', () => {
    const crlf = parseModule(MUSIC.replace(/\n/g, '\r\n'), 'src/domain/music.ts');
    const lf = parseModule(MUSIC, 'src/domain/music.ts');

    assert.deepEqual(crlf.exports, lf.exports);
    assert.deepEqual(crlf.imports, lf.imports);
  });
});

describe('findSymbol', () => {
  test('encuentra la definición y lista quién la importa, sin los tests', () => {
    const [hit] = findSymbol(INDEX, 'notesForRotation', false);

    assert.equal(hit.file, 'src/domain/music.ts');
    assert.equal(hit.line, 9);
    assert.deepEqual(hit.usedBy, [
      'mcp-server/src/tools/describePiece.ts',
      'src/App.tsx',
      'src/components/Board.tsx',
      'src/domain/invariants.ts',
    ]);
  });

  /**
   * La arista que faltaba: tocar una firma de `domain/` puede romper una tool.
   *
   * `pnpm verify` lo atrapa —el tsconfig del server cruza el borde de paquete— pero
   * recién al final: si `usedBy` la esconde, la estimación ya se hizo mal.
   */
  test('cuenta a mcp-server entre los usuarios del dominio', () => {
    const [hit] = findSymbol(INDEX, 'notesForRotation', false);
    assert.ok(hit.usedBy.includes('mcp-server/src/tools/describePiece.ts'));
  });

  test('con includeTests suma el test', () => {
    const [hit] = findSymbol(INDEX, 'notesForRotation', true);
    assert.deepEqual(hit.usedBy, [
      'mcp-server/src/tools/describePiece.ts',
      'src/App.tsx',
      'src/components/Board.tsx',
      'src/domain/__tests__/music.test.ts',
      'src/domain/invariants.ts',
    ]);
  });

  /**
   * Lo que un grep no puede hacer: en el índice hay DOS símbolos llamados
   * `notesForRotation`.
   *
   * Uno es el de `domain/music.ts` y el otro lo exporta el módulo de audio homónimo
   * que arma este fixture —una ruta que no existe en el repo, y es a propósito: así el
   * homónimo no se confunde con ningún archivo real—. Quien importa el segundo no es
   * usuario del primero, y un grep lo contaría igual.
   */
  test('no confunde homónimos de módulos distintos', () => {
    const [hit] = findSymbol(INDEX, 'notesForRotation', false);
    const deFake = INDEX.imports.filter(i => i.resolved === 'src/audio/fake.ts');

    assert.equal(deFake.length, 2, 'los dos imports del homónimo están en el índice');
    assert.deepEqual(
      deFake.map(i => i.names),
      [['notesForRotation'], ['notesForRotation']],
      'el alias de App.tsx no esconde el nombre exportado',
    );
    assert.equal(hit.usedBy.includes('src/audio/otro.ts'), false);
  });

  /**
   * `Board` no se importa por nombre en ningún lado: `App.tsx` lo trae por defecto y
   * encima renombrado.
   *
   * Sin esta arista los seis `export default` de `src/` —`App` y los cinco
   * componentes— contestan `usedBy: []`, que un agente lee como código muerto.
   */
  test('cuenta a quien importa por defecto, aunque lo renombre', () => {
    const [hit] = findSymbol(INDEX, 'Board', false);

    assert.equal(hit.file, 'src/components/Board.tsx');
    assert.deepEqual(hit.usedBy, ['src/App.tsx']);
  });

  /**
   * Las dos puntas o ninguna: filtrando solo `usedBy`, un helper de test salía
   * como match huérfano y presentado como superficie de `src/`.
   */
  test('sin includeTests un símbolo definido en __tests__ no es match', () => {
    assert.deepEqual(findSymbol(INDEX, 'peakNear', false), []);

    const [hit] = findSymbol(INDEX, 'peakNear', true);
    assert.equal(hit.file, 'src/domain/__tests__/music.test.ts');
  });

  test('sin coincidencia exacta cae a subcadena sin distinguir mayúsculas', () => {
    const hits = findSymbol(INDEX, 'notesfor', false);
    assert.deepEqual(hits.map(h => h.name), ['notesForRotation']);
  });

  test('un símbolo que no existe devuelve lista vacía', () => {
    assert.deepEqual(findSymbol(INDEX, 'noExisteEnNingunLado', false), []);
  });
});

describe('outline', () => {
  /**
   * `midiToHz()` con paréntesis: es una arrow function y marcarla como valor
   * desinformaba justo en el mapa cuyo propósito es "qué hay y dónde".
   */
  test('agrupa por archivo y marca las funciones con (), arrows incluidas', () => {
    const o = outline(INDEX, false);

    assert.deepEqual(o['src/domain/music.ts'], [
      'notesForRotation()', 'midiName()', 'DEFAULT_OCTAVE', 'midiToHz()', 'Nota', 'Escala',
    ]);
    assert.equal('src/domain/__tests__/music.test.ts' in o, false);
  });

  /**
   * `mcp-server/` entra al grafo pero no al mapa: el índice describe la superficie
   * de `src/`, y sumar las tools lo haría crecer sin responder nada nuevo.
   */
  test('no lista los símbolos de los archivos que son solo grafo', () => {
    const o = outline(INDEX, true);

    assert.equal('mcp-server/src/tools/describePiece.ts' in o, false);
    assert.equal(
      Object.values(o).flat().includes('describePiece'),
      false,
    );
  });
});

/**
 * Los cuatro bordes del parser, que ningun archivo del repo ejerce.
 *
 * Son justamente los que un indice construido EN LA CONSULTA no puede darse el lujo
 * de tener rotos: `find_symbol` corre sobre lo que haya en el arbol en ese momento,
 * incluido un archivo a medio escribir. Que hoy `src/` no tenga ninguno de estos
 * cuatro casos es una propiedad del repo de hoy, no del parser.
 */
describe('parseModule — los bordes que el repo no tiene', () => {
  test('un docblock vacio no cuenta como doc', () => {
    const [e] = parseModule('/** */\nexport const A = 1;\n', 'x.ts').exports;
    assert.equal(e.doc ?? null, null);
  });

  test('un archivo sin un solo docblock tampoco', () => {
    const [e] = parseModule('export const A = 1;\n', 'x.ts').exports;
    assert.equal(e.doc ?? null, null);
  });

  test('un `/**` sin cerrar no se lee como documentacion', () => {
    // El caso del archivo a medio escribir. Va DESPUES del export a proposito: un
    // bloque sin cerrar al principio se come el resto del archivo en el parser de
    // TypeScript y no habria export que documentar. Lo que se afirma aca es la otra
    // guarda —la del `indexOf('*/')` que devuelve -1— sin la cual el `slice` daria
    // basura y la tool la mostraria como si fuera doc.
    const m = parseModule('export const A = 1;\n/** empieza y no termina\n', 'x.ts');
    assert.equal(m.exports.length, 1);
    assert.equal(m.exports[0].doc ?? null, null);
  });

  /**
   * El doc de nivel de archivo solo se busca para un `export default` SIN doc propio.
   *
   * Es la unica forma de export que suele documentarse arriba de todo y no encima, asi
   * que sus dos guardas viven detras de esa puerta.
   */
  test('un default sin doc propio ni doc de archivo no inventa documentacion', () => {
    const [e] = parseModule('export default function A() {}\n', 'x.tsx').exports;
    assert.equal(e.esDefault, true);
    assert.equal(e.doc ?? null, null);
  });

  test('un default cuyo unico `/**` esta sin cerrar tampoco', () => {
    // Sin la guarda del `indexOf('*/')`, el `slice` hasta un -1 devolveria basura y
    // la tool la mostraria como si fuera la primera frase del archivo.
    const [e] = parseModule('export default function A() {}\n/** sin cerrar\n', 'x.tsx').exports;
    assert.equal(e.doc ?? null, null);
  });

  test('un export desestructurado no entra al indice, y no rompe el archivo', () => {
    // `export const { a, b } = obj` no tiene un identificador que nombrar, asi que
    // se saltea. Lo que importa es que los exports NORMALES del mismo archivo sigan
    // saliendo: un solo caso raro no puede dejar el modulo sin indexar.
    const m = parseModule('export const { a, b } = obj;\nexport const C = 1;\n', 'x.ts');
    assert.deepEqual(m.exports.map(e => e.name), ['C']);
  });
});
