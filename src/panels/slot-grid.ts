import { SHAPES } from '../pieces/pieces.ts';
import { MINI_BOX, MINI_CELL_PX } from '../pieces/piece-mini.ts';

/** In px: the air on each side of the thumbnail box, inside its slot. */
export const SLOT_INSET_PX = 4;

export const SLOT_PX = MINI_BOX * MINI_CELL_PX + SLOT_INSET_PX * 2;

export const SLOT_GRID_GAP_PX = 4;

/** Four columns need 204 px and six need 308 px: this ceiling gives four columns by three rows. */
export const GRID_WIDTH_CEILING_PX = 220;

export function gridWidth(columns: number, track: number, gap: number): number {
  return columns * track + (columns - 1) * gap;
}

/** Not `repeat(auto-fill, …)`: it gives the most columns that fit, a divisor or not, and leaves holes. */
export function rectangleColumns(n: number, ceiling: number, track: number, gap: number): number {
  let smallest = 1;
  let largestThatFits = 0;
  for (let c = 2; c < n; c++) {
    if (n % c !== 0) continue;
    if (smallest === 1) smallest = c;
    if (gridWidth(c, track, gap) <= ceiling) largestThatFits = c;
  }
  return largestThatFits === 0 ? smallest : largestThatFits;
}

export const DOCK_COLUMNS = rectangleColumns(
  Object.keys(SHAPES).length, GRID_WIDTH_CEILING_PX, SLOT_PX, SLOT_GRID_GAP_PX,
);
