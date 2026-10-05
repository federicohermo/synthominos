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

/** No literal goes here: a constant that is not exported is exported in `src/` first. */
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

const CONSTANTES = Object.fromEntries(
  POR_ARCHIVO.flatMap(({ archivo, constantes }) =>
    Object.entries(constantes).map(
      ([nombre, valor]): [string, { valor: unknown; archivo: string }] => [nombre, { valor, archivo }],
    ),
  ),
);

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
