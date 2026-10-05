import { rotateN, reflect } from './transform.ts';
import { SHAPES } from './pieces.ts';
import type { Cell } from './transform.ts';
import type { PieceKey } from './pieces.ts';

/** In cells: the `I` is 5 long. It is layout, and not `CELLS_PER_PIECE`, which is the model. */
export const MINI_BOX = 5;

/** In px. The smallest size at which the shape reads. */
export const MINI_CELL_PX = 8;

/** In px: the thumbnail, the `px-2` of its button (8 on each side) and its border (1 on each side). */
export const MINI_PISTA_PX = MINI_BOX * MINI_CELL_PX + 16 + 2;

/** Rotation first and reflection second, as the board does: the reverse order gives another orientation. */
export function miniCells(piece: PieceKey, rotation: number, mirror: boolean): Cell[] {
  const rotada = rotateN(SHAPES[piece], rotation);
  const forma = mirror ? reflect(rotada) : rotada;
  const ancho = Math.max(...forma.map((c) => c[0])) + 1;
  const alto = Math.max(...forma.map((c) => c[1])) + 1;
  // `floor` and not `round`: the spare square stays on one side, so the shape does not jump
  // on a rotation.
  const dx = Math.floor((MINI_BOX - ancho) / 2);
  const dy = Math.floor((MINI_BOX - alto) / 2);
  return forma.map(([x, y]): Cell => [x + dx, y + dy]);
}
