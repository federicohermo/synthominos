import { GRID_MIN, GRID_DEFAULT, MAX_PIEZAS } from '../../../src/board-editing/placement.ts';
import { CROSS_COST } from '../../../src/circuit/routing.ts';
import { CELLS_PER_PIECE } from '../../../src/pieces/pieces.ts';
import {
  NOTES_PER_PIECE,
  DEFAULT_OCTAVE,
  DEFAULT_REGIMEN,
} from '../../../src/musical-model/music.ts';
import { PASOS_MAX } from '../../../src/circuit/sequence.ts';
import { MASTER_GAIN } from '../../../src/playback/engine.ts';
import { FFT_SIZE } from '../../../src/spectrum/spectrum-bars.ts';
import { DEFAULT_BPM } from '../../../src/playback/scheduler.ts';
import { LOOKAHEAD, TICK_MS } from '../../../src/playback/scheduler.ts';
import { jsonResource, type ResourceDef } from './types.ts';

/**
 * The values that govern the instrument, IMPORTED from `src/` and not copied.
 *
 * "Values" and not "numbers", because one is not a number: `DEFAULT_REGIMEN` is
 * `REGIMEN.escala`, a string. It is here by the same criterion as the others: `docs/`
 * copies it. To call them all numbers would be one more false statement, and false
 * statements are what this file prevents.
 *
 * No value is written here: the file has no numeric literal. That is the whole point of
 * the resource. A table of constants written by hand is a copy, and a copy goes stale
 * with nothing red. If a constant is needed and is not exported, export it in `src/`,
 * in its own commit. Do not type it on this side.
 *
 * They are grouped by the file that defines them, with **property shorthand**. Written
 * this way, the key IS the imported identifier, so the name cannot go out of sync with
 * the value and cannot survive a rename: the import stops compiling. And the path is
 * written once for each file, not once for each constant.
 */
const POR_ARCHIVO = [
  {
    archivo: 'src/board-editing/placement.ts',
    constantes: { GRID_MIN, GRID_DEFAULT, MAX_PIEZAS },
  },
  {
    archivo: 'src/circuit/routing.ts',
    constantes: { CROSS_COST },
  },
  {
    archivo: 'src/pieces/pieces.ts',
    constantes: { CELLS_PER_PIECE },
  },
  {
    archivo: 'src/musical-model/music.ts',
    constantes: { NOTES_PER_PIECE, DEFAULT_OCTAVE, DEFAULT_REGIMEN },
  },
  {
    archivo: 'src/circuit/sequence.ts',
    constantes: { PASOS_MAX },
  },
  {
    archivo: 'src/playback/engine.ts',
    constantes: { MASTER_GAIN },
  },
  {
    archivo: 'src/spectrum/spectrum-bars.ts',
    constantes: { FFT_SIZE },
  },
  {
    archivo: 'src/playback/scheduler.ts',
    constantes: { DEFAULT_BPM, LOOKAHEAD, TICK_MS },
  },
];

/**
 * What the resource sends: a map `NAME -> { valor, archivo }`, derived from the grouped
 * list.
 *
 * **The question that brings a reader here decides the shape**: "what is the value of X
 * and where do I edit it". On a map that is one read. On the grouped list the reader
 * must search each group. The list stays the SOURCE, because the path is written once
 * there, and this is its index.
 *
 * Each constant has its `archivo` next to it, and that separates this from one more
 * copy, a generated one. Without the path, the reader knows the number and does not know
 * where to change it, and goes back to `grep`. With the path, the answer ends at the
 * file to open.
 */
const CONSTANTES = Object.fromEntries(
  POR_ARCHIVO.flatMap(({ archivo, constantes }) =>
    Object.entries(constantes).map(
      ([nombre, valor]): [string, { valor: unknown; archivo: string }] => [nombre, { valor, archivo }],
    ),
  ),
);

/**
 * `pentomino://constantes`.
 *
 * It is a resource and not a tool because there is nothing to ask it: it takes no
 * argument and the whole answer fits in the context at once. A tool with an empty
 * `inputSchema` would be the same information behind a call that the client must decide
 * to make.
 */
export const constantes: ResourceDef = {
  name: 'constantes',
  uri: 'pentomino://constantes',
  config: {
    title: 'Constants of the instrument',
    description:
      'The fixed values of the domain and of the audio engine (board, pieces, musical model, scheduler), each with its value and with the path of the file of `src/` that defines it. They are imported on each read: no copy can go stale. Use it in place of the values that `CLAUDE.md` and `docs/` transcribe.',
    mimeType: 'application/json',
  },
  read: (uri) => jsonResource(uri, CONSTANTES),
};
