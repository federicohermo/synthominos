import type { Cell } from '../pieces/transform.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import { centroid, angleFromCentroid, pathThroughCells } from '../pieces/transform.ts';

export type RegimenDeRotacion = (typeof REGIMEN)[keyof typeof REGIMEN];

/** The index is the pitch class. */
export const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;

export const PENT_MAJOR: number[] = [0,2,4,7,9];
export const PENT_MINOR: number[] = [0,3,5,7,10];
export const PENT_BLUES5: number[] = [0,3,5,6,7];

export const REGIMEN = { escala: 'escala', orden: 'orden' } as const;

/** The default of the state of `App.tsx`. No function of the domain has a default regime. */
export const DEFAULT_REGIMEN = REGIMEN.escala;

/** It must equal `CELLS_PER_PIECE`: `degreeByCellIndex` pairs the two lists. `checkNotes` verifies it. */
export const NOTES_PER_PIECE = 5;

/** Piece → pitch class of its tonic. The piece `F` has the tonic C, and the note F belongs to `T`. */
export const BASE_MAP: Record<PieceKey, number> = {
  F:0, I:1, L:2, N:3, P:4, T:5, U:6, V:7, W:8, X:9, Y:10, Z:11,
};

export const DEFAULT_OCTAVE = 4;

/** The centroid is a mean of fifths: a cell at the center can be 1e-16 away from it. */
export const DEGREE_EPSILON = 1e-9;

/** C4 = 60. */
export function midiFor(pc: number, octave: number): number { return 12*(octave+1) + pc; }

export function midiName(m: number): string { const pc = m%12; const o = Math.floor(m/12)-1; return `${CHROMATIC[pc]}${o}`; }

function notasDeFormula(basePc: number, octave: number, formula: readonly number[], transpose: number): number[] {
  return formula.map(iv => {
    const total = basePc + iv + transpose;
    const pc = ((total%12)+12)%12;
    const octShift = Math.floor((basePc + iv + transpose)/12);
    return midiFor(pc, octave + octShift);
  });
}

/** In `orden` the formula is that of rotation 0 of `escala`: at 0° the two regimes sound the same. */
export function notesForRotation(basePc: number, octave: number, rot: number, regimen: RegimenDeRotacion): number[]{
  if (regimen === REGIMEN.orden) {
    const base = notasDeFormula(basePc, octave, PENT_MAJOR, 0);
    // Two modulos: the `%` of JS keeps the sign of the dividend, and `rot` is an unbounded `number`.
    const largo = base.length;
    return base.map((_n, j) => base[(((j + rot) % largo) + largo) % largo]);
  }
  let formula = PENT_MAJOR, transpose=0;
  if (rot===1) formula = PENT_MINOR;
  else if (rot===2) formula = PENT_BLUES5;
  else if (rot===3) { formula = PENT_MAJOR; transpose = 7; }
  return notasDeFormula(basePc, octave, formula, transpose);
}

/** In the order of sound. For the note of one cell, index `notesForRotation` with the degree. */
export function arpeggioFor(piece: PieceKey, rotation: number, mirror: boolean, regimen: RegimenDeRotacion): number[] {
  const asc = notesForRotation(BASE_MAP[piece], DEFAULT_OCTAVE, rotation, regimen);
  return mirror ? asc.reverse() : asc;
}

/** Element `k` is the degree of `cells[k]`. Pass `SHAPES[piece]`, never the oriented `p.cells`. */
export function degreeByCellIndex(cells: readonly Cell[]): number[] {
  const orden = pathThroughCells(cells, angularRank(cells));
  const grados = new Array<number>(cells.length);
  orden.forEach((k, degree) => { grados[k] = degree; });
  return grados;
}

/** Element `k` is the step of `cells[k]`. The step says when a cell sounds, not which note. */
export function playOrderByCellIndex(cells: readonly Cell[], mirror: boolean): number[] {
  const grados = degreeByCellIndex(cells);
  const ultimo = cells.length - 1;
  return mirror ? grados.map(g => ultimo - g) : grados;
}

// A cell on the centroid leaves the ring: `Math.atan2(0, 0)` returns 0, which is east.
// The angle is rounded to a bucket: "less than epsilon apart" is not transitive.
export function angularRank(cells: readonly Cell[]): number[] {
  const cent = centroid(cells);

  const center: number[] = [];
  const ring: number[] = [];
  const bucket = new Array<number>(cells.length);

  for (let k = 0; k < cells.length; k++) {
    const dx = cells[k][0] - cent[0];
    const dy = cells[k][1] - cent[1];
    if (Math.hypot(dx, dy) < DEGREE_EPSILON) {
      center.push(k);
    } else {
      bucket[k] = Math.round(angleFromCentroid(cells[k], cent) / DEGREE_EPSILON);
      ring.push(k);
    }
  }

  ring.sort((a, b) => bucket[a] === bucket[b] ? a - b : bucket[a] - bucket[b]);

  const rank = new Array<number>(cells.length);
  [...center, ...ring].forEach((k, posicion) => { rank[k] = posicion; });
  return rank;
}
