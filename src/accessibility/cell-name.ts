import { EDICION } from '../board-editing/input.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { CellText } from '../musical-model/cell-text.ts';
import type { Edicion } from '../board-editing/input.ts';

// The LAST step, not the count of steps: the steps go from 0 to 4 and the name says that
// range as it is, with no renumbering. `Board.tsx` has the same rule for the `#N` it draws
// in the corner: the step is the index that the domain gives (0..4), and what the cell
// shows is exactly what the tests and the `playOrder` of the MCP server answer. The
// accessible name CANNOT differ: the `title` is the echo of the name, so a renumbering
// here leaves the cell with `#0` while the tooltip and the screen reader say "paso 1".
// Two channels that give different numbers for the same datum is exactly what the repo
// prevents.
//
// It is a module constant so that `cellNameFor` does not repeat the literal with no reason.
const ULTIMO_PASO = 4;

// The coordinate as speech, counted from 1 and with no parentheses. The full argument is
// in the docblock of `cellNameFor`, below. It is a module function because the TWO texts
// of this file use it: the cell name and the announcement of the edit. Written twice, the
// screen reader could count the rows in two ways, one for each text.
const coordenada = (x: number, y: number) => `fila ${y + 1}, columna ${x + 1}`;

/**
 * What an OCCUPIED cell adds to its accessible name: the piece, whether it is muted, and
 * its `CellText`, the step and the note.
 *
 * `Board.tsx` calculates that `CellText` for that one cell, with the chain `occupantAt` +
 * `occupantCellIndex` + `cellTextFor`.
 *
 * The three fields travel together, in one object, and not as two separate parameters
 * (`occupant: PlacedPiece | null` + `cell: CellText | null`). The reason is what happens
 * when they are apart. An occupied cell ALWAYS has text: `occupantAt` already guarantees
 * that the piece covers the cell, so `occupantCellIndex` never gives -1. So "occupied but
 * with no text" is not a fourth case of the domain. It is a fourth case that the
 * SIGNATURE would invent. `cellNameFor` would have to decide what to say there, and that
 * state never exists on the other side. It is the same class of problem that makes
 * `PlacedPiece.muted` required and not `muted?: boolean` (see its doc in
 * `board-editing/placement.ts`): a signature more permissive than reality is a branch
 * that no real caller reaches, and that still needs an invented test to stay at 100%
 * coverage.
 */
export interface CeldaOcupada {
  readonly piece: PieceKey;
  readonly muted: boolean;
  readonly cell: CellText;
}

/**
 * The accessible name of a board cell: what a screen reader announces when the focus
 * enters the `gridcell` of `Board.tsx`.
 *
 * ## Why it lives in `accessibility/cell-name.ts` and not inside `Board.tsx`
 *
 * For the same reason as `cell-text.ts`, which documents it in the same detail:
 * `react-refresh/only-export-components` forbids a `.tsx` to export anything but the
 * component. So a test cannot import a pure function written inside `Board.tsx`, and
 * cannot test it. A `.ts` file is the only way to put it under test: a node test covers
 * the free cell, the occupied cell and the muted cell, with no Chromium and no mounted
 * component.
 *
 * ## The signature: the coordinate + the object already built, not `placed` again
 *
 * It takes `x`, `y` and `CeldaOcupada | null`, which `Board.tsx` ALREADY has at the point
 * where it builds the `title`. It does not take `placed: PlacedPiece[]` to call
 * `occupantAt` again inside. That chain repeated here would be the SECOND copy of the
 * same derivation (see the doc of `cellTextFor` in `cell-text.ts`): two places that
 * calculate the same thing are two places that can go out of sync. A copy of that kind
 * gave a wrong `#N` on a reflected piece, and no test saw it.
 *
 * ## The ghost does NOT enter, and why the signature is enough to guarantee it
 *
 * The ghost is TRANSIENT: it depends on where the pointed cell is, not on what is placed.
 * An accessible name that changes with the pointed cell would make the screen reader
 * announce a cell different from the real one: the focus did not move, but the name did.
 * The `title` does show the ghost: it is a mouse tooltip, not something a screen reader
 * announces on focus. The accessible name does not.
 *
 * The exclusion is not an `if` that the caller must remember to write: it is structural.
 * In `Board.tsx` the ghost fills only the variable `cell` (through `ghostIndex`), never
 * `occ`. `occ` comes only from `occupantAt(placed, x, y)`, which knows nothing of the
 * pointed cell. `CeldaOcupada` requires the three fields together, and `occ` is the only
 * source of `piece` and `muted`. So a `CeldaOcupada` cannot be built from the ghost
 * alone: a caller that builds the argument from the ghost cell **has no source for the
 * rest** and would have to invent it. A cell with a ghost and no real occupant still
 * passes `null`, the same path as a free cell with no ghost. That is correct: for the
 * accessible tree, both are "nothing is placed here yet".
 *
 * ## Prose and not notation
 *
 * `(3,2)` reads badly: a screen reader says "parenthesis, three, comma, two,
 * parenthesis" or skips it, depending on the engine. So the row and the column are
 * counted from 1 (for a person, not an index) and go in phrases separated by commas,
 * with no parentheses and no signs. It is the same language as the slot names in
 * `OrientationPanel.tsx`, `"F, rotación 90°, reflejada"`: a list of facts as speech, with
 * the state attached to the noun it modifies (`"reflejada"` there, `"muteada"` here) and
 * not in a separate field. The piece letter is said as it is, not spelled out, after the
 * same precedent.
 *
 * "libre" and not "vacía" for the cell with no occupant: the contract and the comments
 * of `Board.tsx` call this cell free. One word avoids two names for the same state, one
 * in the code and one in what the screen reader announces.
 *
 * The step is said as `paso N de 4` and NOT renumbered to `de 1 a 5`: the number is the
 * index of the domain, the one the cell draws as `#N` and the one the tests and the
 * `playOrder` of the MCP server answer. The `title` is the echo of the name, so a
 * renumbering here leaves the cell with `#0` while the tooltip and the screen reader say
 * "paso 1": two channels that give different numbers for the same datum. The `de 4` is
 * what the name adds to the `title`: without the total, a person who does not see the
 * board cannot tell whether step 4 is the last one or six more follow.
 */
export function cellNameFor(x: number, y: number, occupied: CeldaOcupada | null): string {
  if (!occupied) return `${coordenada(x, y)}, libre`;
  const muteo = occupied.muted ? ' muteada' : '';
  return `${coordenada(x, y)}, pieza ${occupied.piece}${muteo}, nota ${occupied.cell.note}, `
    + `paso ${occupied.cell.step} de ${ULTIMO_PASO}`;
}

/**
 * What the `aria-live` region of the shell announces after an edit of the board: place,
 * remove or mute.
 *
 * These are the only three things that change the board.
 *
 * ## Why it comes from here and not from a string written in `App.tsx`
 *
 * Because the announcement and the cell name say the SAME coordinate, and written in two
 * files they can go out of sync: one counts the rows from 0 and the other from 1, or one
 * says `(3,2)` and the other "fila 3, columna 4". The two come from `coordenada`, above.
 * It is also the reason why `cellNameFor` does not live inside `Board.tsx`: a `.tsx`
 * cannot export this, so no test can reach it, and what a screen reader says is exactly
 * the kind of decision that breaks in silence.
 *
 * ## `edicion` is the SAME union that decides the gesture
 *
 * It is `Edicion`, the one `accionDeClick` returns, not a free verb. So the announcement
 * cannot describe an edit that the board does not do. The four branches of `EDICION`
 * fall into three phrases: `colocar` and `colocarMuteada` share theirs because what
 * separates them, whether the piece sounds, is already said by `muteada`.
 *
 * ## `muteada` is the state in which the piece ENDS
 *
 * Not the one it had. In the shell it comes from the same variable that is stored in
 * `PlacedPiece.muted`, so the announcement cannot promise a mute different from the one
 * the board applies. `quitar` does not say it: the piece is gone, and what matters is
 * which piece and from where. But it still receives it: to ask the caller to decide when
 * the field matters would move this same decision to the shell, and this file exists to
 * take it out of there.
 *
 * ## "con sonido" and not "desmuteada"
 *
 * It is what the piece gets back, not the undoing of an operation: the word must say in
 * which state the piece ends, not which button was pressed. The same criterion as "libre"
 * above: the name of the state, not the name of the gesture.
 */
export function anuncioDeEdicion(
  edicion: Edicion, piece: PieceKey, x: number, y: number, muteada: boolean,
): string {
  if (edicion === EDICION.quitar) return `pieza ${piece} quitada de ${coordenada(x, y)}`;
  if (edicion === EDICION.mutear) {
    return `pieza ${piece} ${muteada ? 'muteada' : 'con sonido'} en ${coordenada(x, y)}`;
  }
  return `pieza ${piece} colocada${muteada ? ' muteada' : ''} en ${coordenada(x, y)}`;
}
