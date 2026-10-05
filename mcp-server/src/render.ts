import type { Cell } from '../../src/pieces/transform.ts';

const CELL = '#';
const ANCHOR = '@';
const EMPTY = '.';

/** `y` grows down: row 0 of the string is the top row. */
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

export function renderAscii(cells: readonly Cell[], anchorIndex: number): string {
  return draw(cells, k => (k === anchorIndex ? ANCHOR : CELL));
}

/** A number of two digits would misalign the grid, so it falls back to `CELL`. */
export function renderCellNumbers(cells: readonly Cell[], values: readonly number[]): string {
  return draw(cells, k => {
    const d = values[k];
    return Number.isInteger(d) && d >= 0 && d <= 9 ? String(d) : CELL;
  });
}

export function sizeOf(cells: readonly Cell[]): { width: number; height: number } {
  if (cells.length === 0) return { width: 0, height: 0 };
  return {
    width: Math.max(...cells.map(c => c[0])) - Math.min(...cells.map(c => c[0])) + 1,
    height: Math.max(...cells.map(c => c[1])) - Math.min(...cells.map(c => c[1])) + 1,
  };
}
