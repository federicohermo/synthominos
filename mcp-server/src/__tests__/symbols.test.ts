import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseModule, findSymbol, outline } from '../symbols.ts';
import type { CodeIndex } from '../symbols.ts';

const MUSIC = `import { CHROMATIC as NOTAS } from './constants/music.constants.ts';
import { z } from 'zod';

/**
 * The five notes of the arpeggio. The rotation selects the scale formula.
 *
 * The retrograde is NOT applied here.
 */
export function notesForRotation(basePc: number, octave: number, rot: number): number[] {
  return [basePc, octave, rot];
}

/** MIDI name. */
export function midiName(m: number): string {
  return NOTAS[m] + z;
}

function noExportada(): void {}

export const DEFAULT_OCTAVE = 4;

/** MIDI to Hz. */
export const midiToHz = (m: number): number => 440 * m;

export interface Nota { midi: number }

export type Escala = 'mayor' | 'menor';
`;

const BOARD = `import { notesForRotation } from '../domain/music.ts';

/**
 * Central panel: the grid of the board.
 *
 * Presentational: no state, no effects.
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

const FAKE_USER = `import { notesForRotation } from './fake.ts';
`;

const TEST_FILE = `import { notesForRotation } from '../music.ts';

/** Helper for tests only: it is not surface of src/. */
export function peakNear(x: number): number {
  return x;
}
`;

const TOOL = `import { notesForRotation } from '../../../src/domain/music.ts';

export const describePiece = defineTool({});
`;

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
  test('gets the exported functions with a signature without body and the first sentence of the doc', () => {
    const { exports } = parseModule(MUSIC, 'src/domain/music.ts');
    const n = exports.find(e => e.name === 'notesForRotation');

    assert.equal(n?.kind, 'function');
    assert.equal(n?.file, 'src/domain/music.ts');
    assert.equal(n?.line, 9);
    assert.equal(n?.signature, 'export function notesForRotation(basePc: number, octave: number, rot: number): number[]');
    assert.equal(n?.doc, 'The five notes of the arpeggio.');
  });

  test('recognizes const, interface and type, and leaves out what is not exported', () => {
    const { exports } = parseModule(MUSIC, 'src/domain/music.ts');
    const kinds = new Map(exports.map(e => [e.name, e.kind]));

    assert.equal(kinds.get('DEFAULT_OCTAVE'), 'const');
    assert.equal(kinds.get('Nota'), 'interface');
    assert.equal(kinds.get('Escala'), 'type');
    assert.equal(kinds.has('noExportada'), false);
  });

  test('resolves the relative specifier to a repo path and leaves the packages as null', () => {
    const { imports } = parseModule(MUSIC, 'src/domain/music.ts');

    const local = imports.find(i => i.from.startsWith('.'));
    assert.equal(local?.resolved, 'src/domain/constants/music.constants.ts');

    const externo = imports.find(i => i.from === 'zod');
    assert.equal(externo?.resolved, null);
  });

  test('an import with an alias records the exported name, not the local one', () => {
    const { imports } = parseModule(MUSIC, 'src/domain/music.ts');
    const local = imports.find(i => i.from.startsWith('.'));

    assert.deepEqual(local?.names, ['CHROMATIC']);
  });

  test('marks the default binding, which does not travel in names', () => {
    const { imports } = parseModule(APP, 'src/App.tsx');
    const board = imports.find(i => i.from.endsWith('Board.tsx'));

    assert.equal(board?.porDefecto, true);
    assert.deepEqual(board?.names, [], 'the default has no name on the export side');

    const named = imports.find(i => i.from === './domain/music.ts');
    assert.equal(named?.porDefecto, false);
  });

  test('an export default is marked as such', () => {
    const { exports } = parseModule(BOARD, 'src/components/Board.tsx');
    const b = exports.find(e => e.name === 'Board');

    assert.equal(b?.esDefault, true);
    assert.equal(parseModule(MUSIC, 'src/domain/music.ts').exports[0].esDefault, false);
  });

  test('the default inherits the doc of the file when it has none attached', () => {
    const { exports } = parseModule(BOARD, 'src/components/Board.tsx');
    const b = exports.find(e => e.name === 'Board');

    assert.equal(b?.doc, 'Central panel: the grid of the board.');
  });

  test('a .ts with a generic arrow is not parsed as TSX', () => {
    const { exports } = parseModule(
      'export const id = <T>(x: T): T => x;\nexport const OTRO = 1;\n',
      'src/domain/id.ts',
    );

    assert.deepEqual(exports.map(e => e.name), ['id', 'OTRO']);
  });

  test('an arrow assigned to a const counts as a function and keeps the signature', () => {
    const { exports } = parseModule(MUSIC, 'src/domain/music.ts');
    const f = exports.find(e => e.name === 'midiToHz');

    assert.equal(f?.kind, 'function');
    assert.equal(f?.signature, 'midiToHz = (m: number): number');

    const c = exports.find(e => e.name === 'DEFAULT_OCTAVE');
    assert.equal(c?.kind, 'const');
  });

  test('goes up one level correctly: `../music.ts` from __tests__ resolves to the module', () => {
    const { imports } = parseModule(TEST_FILE, 'src/domain/__tests__/music.test.ts');
    assert.equal(imports[0].resolved, 'src/domain/music.ts');
  });

  test('gives the same result with CRLF as with LF', () => {
    const crlf = parseModule(MUSIC.replace(/\n/g, '\r\n'), 'src/domain/music.ts');
    const lf = parseModule(MUSIC, 'src/domain/music.ts');

    assert.deepEqual(crlf.exports, lf.exports);
    assert.deepEqual(crlf.imports, lf.imports);
  });
});

describe('findSymbol', () => {
  test('finds the definition and lists who imports it, without the tests', () => {
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

  test('counts mcp-server among the users of the domain', () => {
    const [hit] = findSymbol(INDEX, 'notesForRotation', false);
    assert.ok(hit.usedBy.includes('mcp-server/src/tools/describePiece.ts'));
  });

  test('with includeTests it adds the test', () => {
    const [hit] = findSymbol(INDEX, 'notesForRotation', true);
    assert.deepEqual(hit.usedBy, [
      'mcp-server/src/tools/describePiece.ts',
      'src/App.tsx',
      'src/components/Board.tsx',
      'src/domain/__tests__/music.test.ts',
      'src/domain/invariants.ts',
    ]);
  });

  test('does not confuse symbols of the same name from different modules', () => {
    const [hit] = findSymbol(INDEX, 'notesForRotation', false);
    const deFake = INDEX.imports.filter(i => i.resolved === 'src/audio/fake.ts');

    assert.equal(deFake.length, 2, 'the two imports of the second symbol are in the index');
    assert.deepEqual(
      deFake.map(i => i.names),
      [['notesForRotation'], ['notesForRotation']],
      'the alias of App.tsx does not hide the exported name',
    );
    assert.equal(hit.usedBy.includes('src/audio/otro.ts'), false);
  });

  test('counts the file that imports the default, although it renames it', () => {
    const [hit] = findSymbol(INDEX, 'Board', false);

    assert.equal(hit.file, 'src/components/Board.tsx');
    assert.deepEqual(hit.usedBy, ['src/App.tsx']);
  });

  test('without includeTests a symbol defined in __tests__ is not a match', () => {
    assert.deepEqual(findSymbol(INDEX, 'peakNear', false), []);

    const [hit] = findSymbol(INDEX, 'peakNear', true);
    assert.equal(hit.file, 'src/domain/__tests__/music.test.ts');
  });

  test('with no exact match it falls back to a case-insensitive substring', () => {
    const hits = findSymbol(INDEX, 'notesfor', false);
    assert.deepEqual(hits.map(h => h.name), ['notesForRotation']);
  });

  test('a symbol that does not exist returns an empty list', () => {
    assert.deepEqual(findSymbol(INDEX, 'noExisteEnNingunLado', false), []);
  });
});

describe('outline', () => {
  test('groups by file and marks the functions with (), arrows included', () => {
    const o = outline(INDEX, false);

    assert.deepEqual(o['src/domain/music.ts'], [
      'notesForRotation()', 'midiName()', 'DEFAULT_OCTAVE', 'midiToHz()', 'Nota', 'Escala',
    ]);
    assert.equal('src/domain/__tests__/music.test.ts' in o, false);
  });

  test('does not list the symbols of the files that are graph only', () => {
    const o = outline(INDEX, true);

    assert.equal('mcp-server/src/tools/describePiece.ts' in o, false);
    assert.equal(
      Object.values(o).flat().includes('describePiece'),
      false,
    );
  });
});

describe('parseModule: the edge cases that the repo does not have', () => {
  test('an empty docblock does not count as doc', () => {
    const [e] = parseModule('/** */\nexport const A = 1;\n', 'x.ts').exports;
    assert.equal(e.doc ?? null, null);
  });

  test('a file with no docblock has no doc', () => {
    const [e] = parseModule('export const A = 1;\n', 'x.ts').exports;
    assert.equal(e.doc ?? null, null);
  });

  test('a `/**` that is not closed is not read as documentation', () => {
    // After the export: an unclosed block at the start eats the rest of the file, and no export
    // is left to document.
    const m = parseModule('export const A = 1;\n/** starts and does not end\n', 'x.ts');
    assert.equal(m.exports.length, 1);
    assert.equal(m.exports[0].doc ?? null, null);
  });

  test('a default with no doc of its own and no file doc invents no documentation', () => {
    const [e] = parseModule('export default function A() {}\n', 'x.tsx').exports;
    assert.equal(e.esDefault, true);
    assert.equal(e.doc ?? null, null);
  });

  test('a default whose only `/**` is not closed has no doc', () => {
    const [e] = parseModule('export default function A() {}\n/** not closed\n', 'x.tsx').exports;
    assert.equal(e.doc ?? null, null);
  });

  test('a destructured export does not go into the index, and does not break the file', () => {
    const m = parseModule('export const { a, b } = obj;\nexport const C = 1;\n', 'x.ts');
    assert.deepEqual(m.exports.map(e => e.name), ['C']);
  });
});
