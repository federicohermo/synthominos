import type { PieceKey } from '../../src/pieces/domain/pieces.types.ts';
import { SHAPES } from '../../src/pieces/domain/pieces.constants.ts';

/**
 * Las 12 letras, sacadas de `SHAPES` y **no escritas de nuevo**: si el dominio
 * agrega una pieza, los schemas de las tools la aceptan sin tocar el server.
 *
 * El cast fija la forma de tupla no vacia que `z.enum` necesita para inferir el
 * union type; los valores son los del dominio, no una copia.
 */
export const PIECE_KEYS = Object.keys(SHAPES) as [PieceKey, ...PieceKey[]];
