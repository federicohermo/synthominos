import type { Cell } from '../../src/pieces/transform.ts';

/**
 * ASCII render of a shape, and the only geometry that the server writes by itself.
 *
 * That it is the only one is on purpose: **it is not domain**. Rotate, reflect, place
 * and validate come from `src/`. This only draws what they returned.
 *
 * It exists because a piece given as five coordinate pairs cannot be seen, and to see
 * the shape is half of what the tool answers.
 */

/** Occupied cell. */
const CELL = '#';
/** Grip cell: the one under the cursor at placement. */
const ANCHOR = '@';
/** Gap inside the bounding box. */
const EMPTY = '.';

/**
 * Draws `cells` in their bounding box, with the character that `charAt` selects by
 * INDEX in each one. The gaps of the bounding box stay as `EMPTY`.
 *
 * It translates by the minimum and does not assume a normalized shape: so it works for
 * a canonical shape and for cells already in board coordinates.
 *
 * `y` grows DOWN, because these are grid coordinates. So row 0 of the string is the top
 * row, and the drawing agrees with the screen.
 *
 * The INDEX is the only thing the two views need from the domain, so a parameter for
 * the character is enough: the grip cell comes by index and the degree also, because of
 * the invariant of the array order.
 */
function draw(cells: readonly Cell[], charAt: (k: number) => string): string {
  if (cells.length === 0) return '';

  const minx = Math.min(...cells.map(c => c[0]));
  const miny = Math.min(...cells.map(c => c[1]));
  const width = Math.max(...cells.map(c => c[0])) - minx + 1;
  const height = Math.max(...cells.map(c => c[1])) - miny + 1;

  const grid: string[][] = Array.from({ length: height }, () => Array<string>(width).fill(EMPTY));
  cells.forEach(([x, y], k) => {
    grid[y - miny][x - minx] = charAt(k);
  });

  return grid.map(row => row.join('')).join('\n');
}

/** Draws `cells` in their bounding box and marks the cell `anchorIndex`. */
export function renderAscii(cells: readonly Cell[], anchorIndex: number): string {
  return draw(cells, k => (k === anchorIndex ? ANCHOR : CELL));
}

/**
 * The same drawing, with the number of each cell in place of `#`.
 *
 * Each cell owns a degree, so `#####` says less than the `cellMap` next to it. To read
 * the mapping from `cellMap` alone, a reader must match five coordinate pairs against
 * the drawing by hand.
 *
 * It goes in a SEPARATE field and does not replace `ascii`: the two drawings say
 * different things. One shows the grip cell, the other the order in which the cells
 * sound. To overwrite the first would silently change the contract of the tool.
 *
 * `values` comes BY INDEX, as `degreeByCellIndex` and `playOrderByCellIndex` return it:
 * element `k` is the number of `cells[k]`. The signature is generic, numbers by index
 * and not "degrees", because each cell has TWO numberings and the tool draws the one of
 * the play order. A name that said `degrees` would invite a caller to feed it the other
 * one, and nothing would go red.
 *
 * A number of two digits would misalign the grid, so it falls back to `CELL`. Shapes of
 * up to 10 cells cannot cause it. If it does occur, a `#` out of place is better than a
 * crooked drawing.
 */
export function renderCellNumbers(cells: readonly Cell[], values: readonly number[]): string {
  return draw(cells, k => {
    const d = values[k];
    return Number.isInteger(d) && d >= 0 && d <= 9 ? String(d) : CELL;
  });
}

/** Width and height of the bounding box of a shape. */
export function sizeOf(cells: readonly Cell[]): { width: number; height: number } {
  if (cells.length === 0) return { width: 0, height: 0 };
  return {
    width: Math.max(...cells.map(c => c[0])) - Math.min(...cells.map(c => c[0])) + 1,
    height: Math.max(...cells.map(c => c[1])) - Math.min(...cells.map(c => c[1])) + 1,
  };
}
