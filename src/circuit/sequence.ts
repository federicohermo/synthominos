import type { Cell } from '../pieces/transform.ts';
import type { PlacedPiece, Dims } from '../board-editing/placement.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';
import { occupantAt, occupantCellIndex } from '../board-editing/placement.ts';
import { rutador } from './routing.ts';
import {
  degreeByCellIndex,
  playOrderByCellIndex,
  arpeggioFor,
  notesForRotation,
  BASE_MAP,
  DEFAULT_OCTAVE,
} from '../musical-model/music.ts';
import { SHAPES, CELLS_PER_PIECE } from '../pieces/pieces.ts';

// Greater than the moves of the whole circuit, not of one leg: 12 legs of at most 60 moves
// give 720. A carry into the cost reorders the circuit with no error.
export const PASOS_MAX = 1024;

/** `offset` is in intervals, one cell travelled. `notes` is in play order, with the retrograde applied. */
export interface Step {
  pieceId: string;
  offset: number;
  notes: number[];
}

export interface Click {
  offset: number;
  cell: Cell;
  note?: number;
}

export interface Visita {
  pieceId: string;
  offset: number;
}

export interface Sequence {
  steps: Step[];
  clicks: Click[];
  order: Visita[];
  length: number;
}

export function cellsByPlayOrder(p: PlacedPiece): Cell[] {
  // The step comes from the canonical shape and travels by index: over `p.cells` it gives
  // another mapping in 53 of the 96 orientations.
  const pasos = playOrderByCellIndex(SHAPES[p.piece], p.mirror);
  const porPaso = new Array<Cell>(pasos.length);
  pasos.forEach((paso, k) => { porPaso[paso] = p.cells[k]; });
  return porPaso;
}

export function gates(p: PlacedPiece): { entrada: Cell; salida: Cell } {
  const orden = cellsByPlayOrder(p);
  return { entrada: orden[0], salida: orden[orden.length - 1] };
}

export function noteAtCell(p: PlacedPiece, cell: Cell, regimen: RegimenDeRotacion): number | null {
  const k = occupantCellIndex(p, cell[0], cell[1]);
  if (k < 0) return null;
  // The degree indexes the ascending arpeggio, never `arpeggioFor`: the retrograde gives the
  // mirrored note. The degree comes from the canonical shape, by index.
  const ascendente = notesForRotation(BASE_MAP[p.piece], DEFAULT_OCTAVE, p.rotation, regimen);
  return ascendente[degreeByCellIndex(SHAPES[p.piece])[k]];
}

function clickEn(offset: number, celda: Cell, placed: readonly PlacedPiece[], regimen: RegimenDeRotacion): Click {
  const ocupante = occupantAt(placed, celda[0], celda[1]);
  const nota = ocupante === null || ocupante.muted ? null : noteAtCell(ocupante, celda, regimen);
  return nota === null ? { offset, cell: celda } : { offset, cell: celda, note: nota };
}

function clicksDeMuteada(p: PlacedPiece, offset: number): Click[] {
  return cellsByPlayOrder(p).map((cell, j) => ({ offset: offset + j, cell }));
}

// The moves break a tie in cost. A crossing costs `CROSS_COST` and lasts one interval, so
// without them the placement order chooses between two cycle lengths.
function claveDeTramo(r: { cost: number; steps: number }): number {
  return r.cost * PASOS_MAX + r.steps;
}

// The table goes backward, from `j` through `mask` to 0, so that the forward rebuild takes
// the smallest index at each move: the tie-break among the optimal circuits.
function shortestCircuit(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length;
  const size = 1 << n;

  // Above the most expensive circuit and far from the edge of Int32: a sum does not overflow.
  const INF = 0x3fffffff;
  const g = new Int32Array(n * size).fill(INF);

  for (let j = 0; j < n; j++) g[j * size] = cost[j][0];

  for (let mask = 2; mask < size; mask++) {
    if (mask & 1) continue;
    for (let j = 0; j < n; j++) {
      if ((mask >> j) & 1) continue;
      let best = INF;
      for (let k = 1; k < n; k++) {
        const bit = 1 << k;
        if (!(mask & bit)) continue;
        const c = cost[j][k] + g[k * size + (mask ^ bit)];
        if (c < best) best = c;
      }
      g[j * size + mask] = best;
    }
  }

  const order = [0];
  let cur = 0;
  let mask = size - 2;
  while (mask !== 0) {
    const objetivo = g[cur * size + mask];
    for (let k = 1; k < n; k++) {
      const bit = 1 << k;
      if (!(mask & bit)) continue;
      if (cost[cur][k] + g[k * size + (mask ^ bit)] !== objetivo) continue;
      order.push(k);
      cur = k;
      mask ^= bit;
      break;
    }
  }
  return order;
}

export function buildSequence(placed: readonly PlacedPiece[], regimen: RegimenDeRotacion, dims: Dims): Sequence {
  const n = placed.length;
  if (n === 0) return { steps: [], clicks: [], order: [], length: 0 };

  if (n === 1) {
    const p = placed[0];
    return {
      steps: p.muted ? [] : [{ pieceId: p.id, offset: 0, notes: arpeggioFor(p.piece, p.rotation, p.mirror, regimen) }],
      clicks: p.muted ? clicksDeMuteada(p, 0) : [],
      order: [{ pieceId: p.id, offset: 0 }],
      // Five intervals and not four: the next pass starts one interval after the last note.
      length: CELLS_PER_PIECE,
    };
  }

  const puertas = placed.map(gates);
  const ruta = rutador(placed, dims);
  const rutas = puertas.map((desde) => puertas.map((hasta) => ruta(desde.salida, hasta.entrada)));
  const circuito = shortestCircuit(rutas.map((fila) => fila.map(claveDeTramo)));

  const steps: Step[] = [];
  const order: Visita[] = [];
  const clicks: Click[] = [];
  let offset = 0;

  for (let t = 0; t < n; t++) {
    const p = placed[circuito[t]];
    order.push({ pieceId: p.id, offset });
    if (p.muted) clicks.push(...clicksDeMuteada(p, offset));
    else steps.push({ pieceId: p.id, offset, notes: arpeggioFor(p.piece, p.rotation, p.mirror, regimen) });

    const ultima = offset + (CELLS_PER_PIECE - 1);
    const ruta = rutas[circuito[t]][circuito[(t + 1) % n]];
    for (let m = 0; m < ruta.path.length; m++) clicks.push(clickEn(ultima + 1 + m, ruta.path[m], placed, regimen));

    offset = ultima + ruta.steps;
  }

  return { steps, clicks, order, length: offset };
}
