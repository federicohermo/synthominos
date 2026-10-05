import type { Cell } from './transform.ts';

/** The letter names the shape, not the sound: the piece `F` has the tonic C. */
export type PieceKey = 'F' | 'I' | 'L' | 'N' | 'P' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

export const CELLS_PER_PIECE = 5;

export const SHAPES: Record<PieceKey, Cell[]> = {
  F: [[0,1],[1,0],[1,1],[1,2],[2,2]],
  I: [[0,0],[1,0],[2,0],[3,0],[4,0]],
  L: [[0,0],[0,1],[0,2],[0,3],[1,0]],
  N: [[0,0],[1,0],[1,1],[2,1],[3,1]],
  P: [[0,0],[0,1],[1,0],[1,1],[2,0]],
  T: [[0,0],[1,0],[2,0],[1,1],[1,2]],
  U: [[0,0],[0,1],[1,0],[2,0],[2,1]],
  V: [[0,0],[0,1],[0,2],[1,0],[2,0]],
  W: [[0,0],[1,0],[1,1],[2,1],[2,2]],
  X: [[1,0],[0,1],[1,1],[2,1],[1,2]],
  Y: [[0,0],[1,0],[2,0],[3,0],[2,1]],
  Z: [[0,0],[1,0],[1,1],[1,2],[2,2]],
};

// The grip cell, as an index into `SHAPES[piece]`: a transformation keeps the order of the array.
export const ANCHOR_INDEX: Record<PieceKey, number> = {
  F: 2, I: 2, L: 1, N: 2, P: 2, T: 3, U: 2, V: 0, W: 2, X: 2, Y: 2, Z: 2,
};
