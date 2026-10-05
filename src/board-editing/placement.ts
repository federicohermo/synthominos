import type { Cell } from '../pieces/transform.ts';
import type { PieceKey } from '../pieces/pieces.ts';

/** 5 is the side of the smallest box that holds every pentomino in every orientation. */
export const GRID_MIN: Dims = { w: 5, h: 5 };

/** The reference board, not what the app draws: the viewport decides that. */
export const GRID_DEFAULT: Dims = { w: 10, h: 6 };

/** A rule and not a consequence of the area: the exact circuit is `O(n^2 * 2^n)`. */
export const MAX_PIEZAS = 12;

export interface PlacedPiece {
  id: string;
  piece: PieceKey;
  rotation: number;
  mirror: boolean;
  cells: Cell[];
  muted: boolean;
}

export interface Dims {
  readonly w: number;
  readonly h: number;
}

export function cellsAt(shape: readonly Cell[], anchorIndex: number, x: number, y: number): Cell[] {
  const [ax, ay] = shape[anchorIndex];
  const ox = x - ax;
  const oy = y - ay;
  return shape.map(([cx, cy]): Cell => [cx + ox, cy + oy]);
}

/** `placed` is the whole board, not the visible pieces: a stored piece can have cells inside the grid. */
export function isValid(cells: Cell[], placed: readonly PlacedPiece[], dims: Dims): boolean {
  if (cells.some(([x, y]) => x < 0 || y < 0 || x >= dims.w || y >= dims.h)) return false;
  for (const p of placed) {
    const set = new Set(p.cells.map(([x, y]) => `${x},${y}`));
    if (cells.some(([x, y]) => set.has(`${x},${y}`))) return false;
  }
  return true;
}

export function cabeEn(p: PlacedPiece, dims: Dims): boolean {
  return isValid(p.cells, [], dims);
}

export function occupantAt(placed: readonly PlacedPiece[], x: number, y: number): PlacedPiece | null {
  for (const p of placed) {
    if (p.cells.some(([cx, cy]) => cx === x && cy === y)) return p;
  }
  return null;
}

/** The index is also the index in the canonical shape: `cellsAt` is a `map`, so the order survives. */
export function occupantCellIndex(p: PlacedPiece, x: number, y: number): number {
  return p.cells.findIndex(([cx, cy]) => cx === x && cy === y);
}
