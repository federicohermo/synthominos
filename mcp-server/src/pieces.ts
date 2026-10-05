import type { PieceKey } from '../../src/pieces/pieces.ts';
import { SHAPES } from '../../src/pieces/pieces.ts';

/** The cast gives the non-empty tuple that `z.enum` needs. */
export const PIECE_KEYS = Object.keys(SHAPES) as [PieceKey, ...PieceKey[]];
