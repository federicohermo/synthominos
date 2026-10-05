import { GRID_MIN } from '../board-editing/placement.ts';
import type { Dims } from '../board-editing/placement.ts';

/**
 * The TARGET cell size, in px.
 *
 * The board has no fixed size in cells: the board is what fits the box at this size. So
 * this number does not decide how big the board is: the screen decides that. It decides
 * **how big a tile looks**.
 *
 * ```
 * 1. how many fit             c0 = max(GRID_MIN.w, round(vw / CELL_PX_OBJETIVO))
 *                             r0 = max(GRID_MIN.h, round(vh / CELL_PX_OBJETIVO))
 * 2. the real size            cell = min(vw / c0, vh / r0)
 * 3. how many fit at THAT     cols = max(GRID_MIN.w, floor(vw / cell))
 *                             rows = max(GRID_MIN.h, floor(vh / cell))
 * ```
 *
 * The formula is `grillaPara`, in this file, where it has a test.
 * `board-fit/use-grid.ts` writes its result to the DOM. Everything that depends on the
 * cell size reads `var(--cell)` and not this number. The browser resolves a custom
 * property on each element, so a resize of the window moves the cells, the veil and the
 * playhead **with no React re-render**.
 *
 * Measured on the real boxes:
 *
 * ```
 * box             cols x rows   cells    cell     note name
 * 1920 x 1080      26 x  15      390     72.0 px  18.7 px
 * 1512 x  982      21 x  13      273     72.0 px  18.7 px
 * 1440 x  900      20 x  12      240     72.0 px  18.7 px
 * 1366 x  768      19 x  11      209     69.8 px  18.2 px
 * 1280 x  720      18 x  10      180     71.1 px  18.5 px
 *  834 x 1112      11 x  15      165     74.1 px  19.3 px
 *  430 x  932       6 x  13       78     71.7 px  18.7 px
 *  375 x  667       5 x   9       45     74.1 px  19.3 px
 *  320 x  568       5 x   8       40     64.0 px  16.7 px
 * ```
 *
 * The real cell size stays between 64 and 74.1 px: the rounding moves it 4.4 % at most.
 * The exception is the last box, where the minimum of 5 columns of `GRID_MIN` does not
 * fit at 73 px and **the cell shrinks so that nothing scrolls**.
 *
 * ## Why 73 and not 60
 *
 * The argument is **typographic**. A cell of 60 px holds the note name only with the font
 * fixed at 19 px. Measured with a `Range` on the text node, in the rendered font, the
 * names with a sharp (`D#4`, all equal because `tabular-nums` makes the digits equal)
 * take 35.4 px at 19 px. With the type proportional to the cell (the ratios below), a
 * cell of 60 px gives a note name of 15.6 px, below the size that the repo measured as
 * necessary. **73 is the cell size where the note name is exactly the measured 19 px.**
 *
 * The number grows with the font, so measure it again each time the ratios below change.
 * That is the trap of this number.
 */
export const CELL_PX_OBJETIVO = 73;

/**
 * The ratios that make each measure of the tile proportional to the cell size.
 *
 * Each one is `measure_at_the_target / CELL_PX_OBJETIVO`, with the denominator taken from
 * the SYMBOL and not written by hand: so the 73 lives in one place. At `--cell = 73` the
 * seven give back the exact px of each measure, so the tile looks **the same** at the
 * target cell size. That avoids a new measurement of the gap around the text, the trap
 * that the docblock above names.
 *
 * They are used as `calc(var(--cell) * RAZON)` in an inline style, never as a class:
 * Tailwind scans the source and does not generate an interpolated class.
 *
 * The list, with the measure each one comes from:
 *
 * ```
 * NOTA_RAZON      19 px   the `text-[19px]` of the note name
 * PASO_RAZON      13 px   the `text-[13px]` of the `#N`
 * AIRE_RAZON       2 px   the `p-0.5` between the cell box and the tile
 * RADIO_RAZON      8 px   the `rounded-lg`, said TWICE on the same object
 * RESERVA_RAZON    8 px   the `pb-2` that leaves height for the note name above the `#N`
 * PASO_ABAJO_RAZON     2 px   the `bottom-0.5` of the `#N`
 * PASO_DERECHA_RAZON   6 px   the `right-1.5` of the `#N`
 * ```
 *
 * **The border of 1 px is NOT in this list, on purpose.** See the comment next to the
 * `border` in `Board.tsx`.
 */
export const NOTA_RAZON = 19 / CELL_PX_OBJETIVO;
export const PASO_RAZON = 13 / CELL_PX_OBJETIVO;
export const AIRE_RAZON = 2 / CELL_PX_OBJETIVO;
export const RADIO_RAZON = 8 / CELL_PX_OBJETIVO;
export const RESERVA_RAZON = 8 / CELL_PX_OBJETIVO;
export const PASO_ABAJO_RAZON = 2 / CELL_PX_OBJETIVO;
export const PASO_DERECHA_RAZON = 6 / CELL_PX_OBJETIVO;

/**
 * The two widths of the focus ring of a cell, **as ratios of the cell size**.
 *
 * ## Why TWO and not one
 *
 * Because any of the 12 colors can be under the focused cell, and the two extremes of
 * the reference sheet are `#FFFF00` (the `V`) and `#0000FF` (the `W`): one tone alone is
 * lost against one of them. The light band goes inside and the dark band outside. A CSS
 * `outline` has one color only, so TWO properties are necessary. DESIGN.md sets this.
 *
 * ## Where each band falls, which decides the numbers
 *
 * A cell has two parts: the cell box, of size `--cell`, and the rounded tile inside it,
 * with the gap of `AIRE_RAZON` between the two (the padding in `Board.tsx`). The two
 * bands share that gap and the border of the tile, and both are drawn INWARD from the
 * cell box:
 *
 * ```
 *   0 → 1 gap    DARK band    on the gap, that is, on the light background
 *   1 → 2 gaps   LIGHT band   on the black border of the tile and the start of its color
 * ```
 *
 * **That is why they are ratios and not two numbers of 2 px.**
 * The split above does not say "2 px". It says "one band on the gap and the next one on
 * the tile", so the two numbers are the gap said twice. With a proportional gap and
 * these two fixed at 2 px, at a cell size of 180 px the gap is 4.93 px and BOTH bands
 * fall fully inside it: the light band does not reach the tile, it stays on the same
 * light background as the dark band, and the ring has one tone only. That is exactly the
 * failure that these two numbers exist to prevent.
 *
 * They are equal to the gap because the gap is the unit of the split: the light band
 * must reach the tile to be on the color of the piece, which is the color it was chosen
 * against. With that split the ring ALWAYS shows: on `#FFFF00` the light band disappears
 * but the dark band is on the light background, and on `#0000FF` the opposite occurs.
 *
 * ## Why inward and not outward, which is the obvious choice
 *
 * Because of the paint order. An `outline` is painted at the end of the stacking
 * context, above everything. But a `box-shadow` is painted in the background phase of
 * the element, and the tiles of all the cells are `relative`, that is, POSITIONED: they
 * are painted later. With an outward ring, the neighbor tiles would cover the dark band
 * on the four sides and the light band would show above them: a ring of one tone, which
 * is exactly what these two numbers exist to prevent. Inward there is no competition:
 * the dark band falls on the gap, which nothing paints.
 *
 * It also solves the clipping. Drawn inward, the ring does not go one pixel outside the
 * cell box, so it cannot make the scroll area larger and it cannot be clipped on the
 * cells at the edge. The `overflow-hidden` of the root container does the clipping, and
 * the ring does not reach it.
 */
export const ANILLO_FOCO_OSCURO_RAZON = AIRE_RAZON;
export const ANILLO_FOCO_CLARO_RAZON = AIRE_RAZON;

/**
 * What to draw to fill a box of `vw × vh` with cells of about 73 px: how many fit and the
 * size of each one.
 *
 * It keeps the cell near 73 px and solves for the COUNT. A board fixed at 10 × 6 that
 * solves for the SIZE of the cell gives a cell of 180 px on a desktop.
 *
 * ```
 * 1. how many fit at the target   c0 = max(GRID_MIN.w, round(vw / CELL_PX_OBJETIVO))
 *                                 r0 = max(GRID_MIN.h, round(vh / CELL_PX_OBJETIVO))
 * 2. the real size                cell = min(vw / c0, vh / r0)
 * 3. how many fit at THAT         cols = max(GRID_MIN.w, floor(vw / cell))
 *                                 rows = max(GRID_MIN.h, floor(vh / cell))
 * ```
 *
 * ## Step 2 is what guarantees that nothing scrolls
 *
 * `min` of the two axes: the cell is square, so the tighter dimension decides. The
 * maximum would give a board that overflows on the other axis, and the board must never
 * overflow its box.
 *
 * ## Step 3 looks redundant and it is not
 *
 * The first two steps already give a board that fits. But the axis that does **not**
 * decide can have a leftover of more than one cell when the box is very disproportionate:
 * at 2000 × 300 the minimum of 5 rows forces a cell of 60 px and leaves 380 px of width,
 * that is, six unused columns. A new count against the real cell size closes that. It
 * still cannot overflow, because `floor(vw / cell) · cell ≤ vw` by the definition of
 * `floor`. In the nine real boxes of the table of `CELL_PX_OBJETIVO` this step changes no
 * number.
 *
 * The `+ EPS` of the `floor` is not defensive. When the axis that decides is the one that
 * step 1 counted, which is the normal case, `vw / cell` is exactly `c0` in real
 * arithmetic but can give `25.999999996` in floating point, and there the `floor`
 * **removes a real column**.
 *
 * ## The minimums are a hard floor
 *
 * `GRID_MIN` comes from `placement.ts`: 5 × 5 is the smallest board that holds every
 * pentomino in every orientation. Below that, some pieces of the palette cannot be
 * placed anywhere. So in a box with no room for 5 cells of 73 px, the cell size gives
 * way (320 × 568 → 64 px) and never the count.
 *
 * It is a pure function, and it lives here and not in `use-grid.ts` so that its test
 * runs in `environment: 'node'`, with no browser and no synthetic `resize`. What stays on
 * the other side is wiring: read the box, write the custom property and store the
 * dimensions. The `browser` project covers that.
 */
export function grillaPara(vw: number, vh: number): { dims: Dims; cell: number } {
  const c0 = Math.max(GRID_MIN.w, Math.round(vw / CELL_PX_OBJETIVO));
  const r0 = Math.max(GRID_MIN.h, Math.round(vh / CELL_PX_OBJETIVO));
  const cell = Math.min(vw / c0, vh / r0);
  // A box with a side of zero (a container not measured yet, or the app inside a
  // `display: none`) would give a division by zero and a `NaN` that reaches
  // `gridTemplateColumns`. The answer is the minimum board with cells of size zero: that
  // is what a box with no size must draw, and when the box gets a size the `resize`
  // passes through here again.
  if (cell <= 0) return { dims: GRID_MIN, cell: 0 };
  const EPS = 1e-9;
  return {
    dims: {
      w: Math.max(GRID_MIN.w, Math.floor(vw / cell + EPS)),
      h: Math.max(GRID_MIN.h, Math.floor(vh / cell + EPS)),
    },
    cell,
  };
}
