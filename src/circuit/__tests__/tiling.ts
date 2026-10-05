import { cellsAt } from '../../board-editing/placement.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../../board-editing/placement.ts';

/**
 * A full board for the tests of the circuit: the twelve pieces on the reference board.
 *
 * Two test files read it, `sequence.test.ts` and `sequence.budget.test.ts`, so it lives here.
 */

/**
 * The whole placement chain, as the app does it: rotate, reflect, bring the anchor to `(x, y)`.
 *
 * The gates are read by index over `cells`, so a shape built another way would check a mapping
 * the app never produces.
 */
export const place = (piece: PieceKey, rot: number, mirror: boolean, x: number, y: number, muted = false): PlacedPiece => {
  const base = rotateN(SHAPES[piece], rot);
  const shape = mirror ? reflect(base) : base;
  return {
    id: piece,
    piece,
    rotation: rot,
    mirror,
    cells: cellsAt(shape, ANCHOR_INDEX[piece], x, y),
    muted,
  };
};

/**
 * A tiling of the reference board with the twelve pieces. It is a solution of the exact
 * cover, not a hand arrangement: 200 random attempts gave no full board.
 *
 * The ORDER of the array matters: the prefixes of this array are the twelve boards of 1 to 12
 * pieces that half of `sequence.test.ts` measures on.
 */
const TILING: [PieceKey, number, boolean, number, number][] = [
  ['F', 1, true, 1, 1], ['I', 0, false, 3, 0], ['L', 1, true, 5, 1], ['P', 2, false, 8, 5],
  ['N', 2, true, 2, 2], ['Y', 3, true, 0, 4], ['Z', 0, false, 8, 2], ['U', 0, false, 6, 2],
  ['W', 2, true, 2, 4], ['T', 2, false, 4, 4], ['X', 0, false, 6, 4], ['V', 0, true, 9, 0],
];

/** The twelve placed pieces of the tiling, in the order of `TILING`. */
export const TWELVE: readonly PlacedPiece[] = TILING.map(([p, r, m, x, y]) => place(p, r, m, x, y));
