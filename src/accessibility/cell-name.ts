import { EDICION } from '../board-editing/input.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { CellText } from '../musical-model/cell-text.ts';
import type { Edicion } from '../board-editing/input.ts';

// The last step, not the count: the name says the index of the domain, the same `#N` that
// the cell draws.
const ULTIMO_PASO = 4;

// Counted from 1, with no parentheses: a screen reader says `(3,2)` sign by sign, or skips it.
const coordenada = (x: number, y: number) => `fila ${y + 1}, columna ${x + 1}`;

export interface CeldaOcupada {
  readonly piece: PieceKey;
  readonly muted: boolean;
  readonly cell: CellText;
}

/** The ghost does not enter: a name that follows the pointer would announce a cell the focus is not on. */
export function cellNameFor(x: number, y: number, occupied: CeldaOcupada | null): string {
  if (!occupied) return `${coordenada(x, y)}, libre`;
  const muteo = occupied.muted ? ' muteada' : '';
  return `${coordenada(x, y)}, pieza ${occupied.piece}${muteo}, nota ${occupied.cell.note}, `
    + `paso ${occupied.cell.step} de ${ULTIMO_PASO}`;
}

/** `muteada` is the state in which the piece ends. */
export function anuncioDeEdicion(
  edicion: Edicion, piece: PieceKey, x: number, y: number, muteada: boolean,
): string {
  if (edicion === EDICION.quitar) return `pieza ${piece} quitada de ${coordenada(x, y)}`;
  if (edicion === EDICION.mutear) {
    return `pieza ${piece} ${muteada ? 'muteada' : 'con sonido'} en ${coordenada(x, y)}`;
  }
  return `pieza ${piece} colocada${muteada ? ' muteada' : ''} en ${coordenada(x, y)}`;
}
