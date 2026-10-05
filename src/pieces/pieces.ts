import type { Cell } from './transform.ts';

/**
 * The 12 pieces, by their letter.
 *
 * The type is declared and not derived from `keyof typeof BASE_MAP`. So the type of the
 * pieces comes from the geometry and not from the musical table, and a piece added with
 * no tonic is a compile error.
 *
 * The letter names the SHAPE, not the sound: the piece `F` sounds with the tonic C.
 */
export type PieceKey = 'F' | 'I' | 'L' | 'N' | 'P' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

/**
 * The cells in a piece. It is the "penta" of pentomino: not a parameter, but the
 * definition of the family of pieces.
 */
export const CELLS_PER_PIECE = 5;

/** The shape of each piece: 5 cells, before any orientation. Each cell is `[x, y]`. */
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

// The grip cell: the cell that goes under the pointer when the piece is placed. It is
// stored as an index into SHAPES[piece] and not as a coordinate, because rotation,
// reflection and normalization map each cell and keep the order of the array. So the
// index points at the same cell after a transformation.
// Each piece has a central cell as its grip cell, so that the click falls on the mass of
// the piece and not on a gap of its bounding box.
export const ANCHOR_INDEX: Record<PieceKey, number> = {
  F: 2, I: 2, L: 1, N: 2, P: 2, T: 3, U: 2, V: 0, W: 2, X: 2, Y: 2, Z: 2,
};
