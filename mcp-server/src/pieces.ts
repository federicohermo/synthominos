import type { PieceKey } from '../../src/pieces/pieces.ts';
import { SHAPES } from '../../src/pieces/pieces.ts';

/**
 * The 12 letters, read from `SHAPES` and **not written again**: if the domain adds a
 * piece, the schemas of the tools accept it with no change to the server.
 *
 * The cast gives the non-empty tuple shape that `z.enum` needs to infer the union type.
 * The values are those of the domain, not a copy.
 */
export const PIECE_KEYS = Object.keys(SHAPES) as [PieceKey, ...PieceKey[]];
