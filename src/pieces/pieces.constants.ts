import type { Cell } from './transform.types.ts';
import type { PieceKey } from './pieces.types.ts';

/**
 * Celdas por pieza. Es el "penta" de pentomino: no es un parametro, es la
 * definicion de la familia de piezas.
 */
export const CELLS_PER_PIECE = 5;

/** Coordenadas canonicas de cada pieza (5 celdas). Cada celda es `[x, y]`. */
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

// Celda "de agarre": la que queda bajo el cursor al colocar la pieza. Se guarda
// como índice dentro de SHAPES[pieza] en vez de como coordenada porque rotar,
// reflejar y normalizar mapean cada celda preservando el orden del array, así
// que el índice sigue apuntando a la misma celda después de transformar.
// Se eligió en cada pieza una celda central, para que el click caiga sobre
// masa de la pieza y no sobre un hueco de su bounding box.
export const ANCHOR_INDEX: Record<PieceKey, number> = {
  F: 2, I: 2, L: 1, N: 2, P: 2, T: 3, U: 2, V: 0, W: 2, X: 2, Y: 2, Z: 2,
};
