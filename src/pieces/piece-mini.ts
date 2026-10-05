import { rotateN, reflect } from './transform.ts';
import { SHAPES } from './pieces.ts';
import type { Cell } from './transform.ts';
import type { PieceKey } from './pieces.ts';

/* The thumbnail of the palette says no note and no `#N`. It says the SHAPE.

   The ghost of the board says the notes better, on the cells where they will fall, so a
   panel that repeats the notes has no place. The shape is the one thing the ghost cannot
   answer: to see the ghost, the player must first choose the piece. One thumbnail alone
   can take 20 px for each cell in a panel of 252 px. Here twelve share that space. */

/**
 * The side of the box of the palette thumbnail, in cells.
 *
 * 5 is the smallest box that holds any pentomino in any of its 8 orientations. The `I`
 * alone sets the maximum on one axis, 5×1 flat and 1×5 upright, and no other piece is
 * larger than 4×2 or 3×3. With 4 the `I` does not fit.
 *
 * **With one orientation for each piece, the fixed box is MORE necessary, not less.** If
 * the twelve thumbnails shared one orientation, a row that goes out of line on a rotation
 * would go out of line whole and at once. Each piece remembers its own orientation and
 * the twelve change one at a time, so with no fixed box a rotation of the `I` alone would
 * move its eleven neighbors in the grid. This argument is written three times: here, at
 * `miniCells` in this file, and in `DESIGN.md`. The three must say the same.
 *
 * **It does not take `CELLS_PER_PIECE` from `pieces.ts`**, although that is 5 too. They
 * are two different numbers that are equal by chance. That one says how many cells a
 * piece has, a property of the model. This one says how many squares the box measures, a
 * decision of layout. To tie them would make a change from pentomino to hexomino move the
 * layout, and would make a larger box look like a change of the model.
 */
export const MINI_BOX = 5;

/**
 * The side of one cell of the thumbnail, in px.
 *
 * **The argument that chose this number is dead**, and that comes first because it was
 * the whole argument: the height of a row of cards that the palette shared with the
 * board, six columns of 8 px so as to take no height from the board. There is no row and
 * no card, and the cell size comes from the viewport. The palette is a `fixed` dock that
 * floats above the board and takes no pixel from it.
 *
 * What decides the number today is the BOX OF THE DOCK, which is `calc(var(--cell) * 2)`
 * wide: 146 px in the worst case, the floor. The twelve thumbnails and their letters must
 * fit in it. The count of columns resolves against the real width of the container
 * (`OrientationPanel.tsx`) and not against the breakpoint of the viewport, which says
 * nothing about the width of this box.
 *
 * 8 px stays because it is the smallest size that lets the SHAPE be read. With
 * `MINI_BOX = 5` the box is 40 px on a side, and below that the pieces that are three
 * cells wide look the same. It was not measured again with the dock in place. If the dock
 * changes its width, this is the number to measure again.
 */
export const MINI_CELL_PX = 8;

/**
 * The minimum width of one column of the grid of thumbnails, in px.
 *
 * It is derived and not typed: the box of the thumbnail (`MINI_BOX x MINI_CELL_PX` = 40),
 * plus the `px-2` of the button that holds it (8 on each side), plus its border (1 on
 * each side). If one of the two numbers above changes, this one follows.
 *
 * The count of columns does not come from a table of breakpoints, because a breakpoint
 * reads the width of the VIEWPORT, and the dock is a different variable. The dock is
 * `calc(var(--cell) * 2)` wide, between 146 and 360 px, while the viewport can be at
 * `xl`. At 1366 x 768 a breakpoint asks for SIX columns inside a box of 256 px. With
 * `repeat(auto-fill, minmax(MINI_PISTA_PX, 1fr))` the browser counts against the real
 * box. It is the same decision as `--cell`: one source for the number.
 */
export const MINI_PISTA_PX = MINI_BOX * MINI_CELL_PX + 16 + 2;

/**
 * The shape of a piece in the coordinates of the palette thumbnail: its five cells,
 * rotated, reflected and **centered** in a box of `MINI_BOX` × `MINI_BOX`.
 *
 * It is here and not inside the component that draws it, because
 * `react-refresh/only-export-components` forbids a `.tsx` to export anything that is not
 * the component, and the centering is arithmetic that goes wrong with no error. It is the
 * same move that made `cell-text.ts`.
 *
 * ## Why the box is fixed, and why it measures 5
 *
 * The box **does not fit its content**, and that lets the thumbnail show the CURRENT
 * orientation and not the canonical one. The `I` goes from 5×1 to 1×5 on a rotation. With
 * fitted boxes, the twelve buttons would reflow on each rotation: a control panel that
 * rearranges itself when you touch it moves the button just when you are about to press
 * it.
 *
 * Each piece remembers **its own** orientation, so the twelve change one at a time: a
 * rotation of the `I` alone would be enough to move its eleven neighbors out of line. The
 * fixed box is what makes that independence cost no layout.
 *
 * 5 is the smallest box that holds any pentomino in any of its 8 orientations: the
 * maximum on one axis is 5 and the `I` alone sets it. No other piece is larger than 4×2
 * or 3×3. With 4×4 the `I` does not fit.
 *
 * ## Here the array-order rule does NOT apply
 *
 * It must be said because all the rest of the repo states the opposite, and rightly. In
 * the domain, the cell at index `k` must be the same logical cell after a transformation:
 * `ANCHOR_INDEX`, the degree of each cell and the gates of the circuit depend on it. Not
 * here: the thumbnail does not number cells, does not connect them to degrees and does
 * not say what sounds. It only paints which squares are occupied. A different order of
 * its output would break nothing, so the centering can be a plain `map`.
 *
 * What does matter is the ORDER OF THE CHAIN: `rotateN` first and the reflection second,
 * as in `App.tsx`, `invariants.ts` and `describePiece.ts`. The reverse order compiles and
 * gives the wrong orientation in 48 of the 96 combinations: the palette would show one
 * piece and the board would place another.
 */
export function miniCells(piece: PieceKey, rotation: number, mirror: boolean): Cell[] {
  const rotada = rotateN(SHAPES[piece], rotation);
  // `rotateN` and `reflect` both normalize, so the shape arrives at (0,0): the minimum of
  // each axis is 0 and the maximum is the side minus one. Without that guarantee the
  // width would be `max - min + 1`. To read it before the normalization is one of the two
  // ways to get a shifted centering that still compiles.
  const forma = mirror ? reflect(rotada) : rotada;
  const ancho = Math.max(...forma.map((c) => c[0])) + 1;
  const alto = Math.max(...forma.map((c) => c[1])) + 1;
  // `floor` and not `round`: `round` is the other way to get it wrong with no error. With
  // `round`, a piece of even width in an odd box moves one place too far and sits against
  // the right edge in half of the orientations. With `floor` the odd spare square is
  // always on the same side, which is all it takes for the shape not to jump on a
  // rotation.
  const dx = Math.floor((MINI_BOX - ancho) / 2);
  const dy = Math.floor((MINI_BOX - alto) / 2);
  return forma.map(([x, y]): Cell => [x + dx, y + dy]);
}
