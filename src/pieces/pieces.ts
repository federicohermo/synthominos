import type { Cell } from './transform.ts';

/**
 * Las 12 piezas del juego, por su letra.
 *
 * Declarado explicito y no derivado de `keyof typeof BASE_MAP`: asi el tipo de las
 * piezas sale de la geometria y no de la tabla musical, y agregar una pieza sin
 * darle tonica pasa a ser error de compilacion.
 *
 * La letra describe la FORMA, no el sonido: la pieza `F` suena con tonica C.
 */
export type PieceKey = 'F' | 'I' | 'L' | 'N' | 'P' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

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
