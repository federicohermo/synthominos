import type { Cell } from '../pieces/transform.ts';
import type { PieceKey } from '../pieces/pieces.ts';

/**
 * The rules of the board: where a piece lands, and whether a move is legal.
 *
 * Every function receives everything as a parameter instead of closing over state. That is
 * what makes them testable, and what spares the MCP server a second copy of the placement
 * rule. The route between two cells belongs to the circuit: `circuit/routing.ts`.
 *
 * **That includes the size of the board.** This file imports no dimension: the dimensions
 * arrive as `Dims` because they come from the viewport, and only the UI sees the viewport.
 */

/**
 * The smallest board that makes sense, in cells.
 *
 * The size of the board **is not a constant**: it comes from the viewport and arrives as a
 * parameter (`Dims`). What stays fixed is these two bounds.
 *
 * 5 x 5 and not 4 x 4, because 5 is the side of the smallest box that holds any pentomino in
 * any of its 8 orientations. The `I` alone sets the maximum on one axis: 5x1 lying down and
 * 1x5 standing. Below 5, some pieces fit in no position. `MINI_BOX` in `piece-mini.ts` uses
 * the same argument for another drawing: that one is the box of the thumbnail and this one is
 * the board, and they agree because both must hold the `I`.
 *
 * It is a hard floor: in a viewport where 5 cells of 73 px do not fit, the cell is what
 * shrinks. The board never has fewer than 5 x 5 cells. With fewer, some pieces of the palette
 * could not be placed anywhere, and that is worse than a small cell.
 */
export const GRID_MIN: Dims = { w: 5, h: 5 };

/**
 * The reference board: 10 x 6.
 *
 * It is not what the app draws: the viewport decides that. It is the REFERENCE board, and so
 * it lives here and not as two loose numbers in each caller. The MCP server uses it when the
 * query gives no dimensions, and so do the tests of the domain that have no reason to invent
 * a size. The pair stays 10 x 6 so that a query to `simulate_board` that gives no dimensions
 * keeps exactly the same answer.
 */
export const GRID_DEFAULT: Dims = { w: 10, h: 6 };

/**
 * How many pieces the board accepts, at any size.
 *
 * **It is a rule and not a consequence of the AREA.** On the reference board the area is
 * enough to deduce it: 60 cells and 5 for each pentomino give 12. With a board that comes
 * from the viewport it is not enough: 1920 x 1080 give 390 cells, which is 78 pieces.
 * `shortestCircuit` takes 12 for granted in its docblock, so the limit must be written, and
 * it is written here.
 *
 * And 78 is not a larger board: it is another problem. The circuit is solved with **exact**
 * Held-Karp, `O(n^2 * 2^n)`, and that is chosen on purpose: the greedy gives circuits 20.1 %
 * longer on average and 79 % longer in the worst case, and it is not deterministic between
 * equal boards. Measured on 26 x 14 = 364 cells, with the cache of distances by destination
 * in place:
 *
 * ```
 * pieces   buildSequence
 *   12        3.1 ms
 *   13        3.7 ms
 *   14        5.6 ms
 *   15        9.7 ms
 *   16       18.6 ms
 * ```
 *
 * It doubles for each piece, which is what `2^n` says. No optimization buys 78: that is 66
 * doublings.
 *
 * So the limit is written, and its value is **exactly what is true on the reference board**.
 * It rejects no board that the reference board allows. The rule guarantees the limit, and
 * not the area.
 */
export const MAX_PIEZAS = 12;

/**
 * A placed piece, with its cells in board coordinates.
 *
 * It does NOT carry the notes. They are DERIVABLE: `arpeggioFor(piece, rotation, mirror,
 * regimen)` gives exactly the same. A `notes` field in the state would only add the chance
 * of a contradiction. Nothing would stop a piece with `rotation: 1` and the notes of
 * rotation 0, and then the board, which derives (see `Board.tsx`), and the engine, which
 * would read the field, would say different things.
 *
 * `cells` is NOT derivable from the other fields: it depends on where the click was, and
 * that information exists only in the gesture.
 */
export interface PlacedPiece {
  id: string;
  piece: PieceKey;
  rotation: number;
  mirror: boolean;
  cells: Cell[];
  /**
   * The piece keeps its place and its time in the circuit but does NOT sound its notes.
   *
   * Five clicks go where its arpeggio would go, one for each cell, at the same offsets. The
   * order of the visit, the offsets of the other pieces and the length of the cycle do not
   * change.
   *
   * It lives here by the same argument as `cells`, and not by the one that keeps `notes`
   * out: **it is not derivable**. It does not come from the piece, the rotation or the
   * cells. It comes from a gesture, and that information exists only in the click.
   *
   * **Required, and not `muted?: boolean`.** An optional field would give two ways to say
   * "not muted": `false` and absent. This repo has that trap in `Click.note`: there the
   * ABSENCE of the field means something different from an explicit `undefined`, and
   * `proyectarAlMotor` (`playback/engine-bridge.ts`) has a ternary on purpose so that it
   * does not produce the third state, and that ternary has a test. Here the absence could
   * mean nothing, so it gets no chance.
   */
  muted: boolean;
}

/**
 * The dimensions of the board, in cells.
 *
 * **They are a parameter and not a constant.** The board has the size that fits the screen,
 * 26 × 15 on a desktop of 1920 × 1080, and the layer that knows it is the one that sees the
 * viewport: the UI. The domain cannot read it from anywhere: a caller must give it.
 *
 * The three functions that look at the board as a whole receive it: `isValid`,
 * `routeBetween` and `buildSequence`. From there it goes down. `music.ts`, `transform.ts`
 * and `invariants.ts` do not need it: a piece and its arpeggio do not depend on where the
 * board ends.
 *
 * `readonly` on the two fields: never mutate what React already received, and this travels
 * as a prop.
 */
export interface Dims {
  readonly w: number;
  readonly h: number;
}

/**
 * The cells that `shape` occupies when its grip cell lands on `(x, y)`.
 *
 * It receives `shape` already transformed, and `anchorIndex`, and does not compute them: the
 * caller has the shape memoized, so nothing rotates again on each move of the pointer. The
 * grip cell comes by index and not by a search, thanks to the invariant of the array order
 * (see `transform.ts`).
 *
 * `shape` comes in `readonly` because it is memoized: to mutate it is to mutate a value
 * that React already received.
 */
export function cellsAt(shape: readonly Cell[], anchorIndex: number, x: number, y: number): Cell[] {
  const [ax, ay] = shape[anchorIndex];
  const ox = x - ax;
  const oy = y - ay;
  return shape.map(([cx, cy]): Cell => [cx + ox, cy + oy]);
}

/**
 * Inside the board, and with no overlap with a placed piece.
 *
 * **`placed` must be the WHOLE board and not what is visible.** The board shrinks with the
 * window, and the pieces that stop fitting are stored and not drawn. A stored piece can have
 * cells inside the new grid: "does not fit entirely" is not "is all outside". A placement on
 * top of it would leave two overlapping pieces when the window grows. The filter of what is
 * visible is `cabeEn`, below. This function looks at everything.
 */
export function isValid(cells: Cell[], placed: readonly PlacedPiece[], dims: Dims): boolean {
  if (cells.some(([x, y]) => x < 0 || y < 0 || x >= dims.w || y >= dims.h)) return false;
  for (const p of placed) {
    const set = new Set(p.cells.map(([x, y]) => `${x},${y}`));
    if (cells.some(([x, y]) => set.has(`${x},${y}`))) return false;
  }
  return true;
}

/**
 * Whether the piece fits ENTIRELY in a board of `dims`.
 *
 * It is the other side of the paragraph of `isValid`, and it is necessary because the board
 * changes size with the window. A piece that stops fitting is not deleted: the repo has no
 * undo, and a drag of the window edge is not an edit gesture. It is stored whole. The board
 * does not draw it, it does not sound, it takes no click, and it comes back the same when
 * there is room again.
 *
 * **Entirely and not in part**: a piece with three cells inside and two outside does not fit
 * either. Half a painted piece would be a piece that the board shows and the circuit does
 * not visit, and what the user sees and what sounds cannot disagree.
 *
 * It is built on `isValid` with an empty board, and does not repeat the four limits: "fits
 * in the board" is exactly the first half of "the placement is legal", and to write it twice
 * is how the two come to say different things. `mcp-server/src/tools/simulateBoard.ts` does
 * the same to tell `fuera-del-tablero` from an overlap.
 *
 * It lives in a module and not inside `App.tsx` by the rule of `.agents/rules/ui.md`, that
 * the shell carries no pure function: here it has a test, and there it could not be exported.
 */
export function cabeEn(p: PlacedPiece, dims: Dims): boolean {
  return isValid(p.cells, [], dims);
}

/**
 * The piece that occupies `(x, y)`, or null.
 *
 * It walks every piece and every cell of each one, and that is MEASURED, because the
 * question was whether it holds when the board draws at the rate of the interval. With the
 * 12 pieces placed, which is the maximum and so the longest list to walk, a whole render of
 * the reference board is 60 calls and **4.1 us** in
 * total (p95 7.4 us). That is 0.07 us for each cell and 0.02 % of a frame of 16.7 ms. At
 * 160 bpm the interval is 93.75 ms: one call for each cell and each interval would still
 * leave four orders of magnitude to spare.
 *
 * **The cost is by CELL, so a larger board scales it and does not change it.** The piece
 * limit is 12 (`MAX_PIEZAS`), and that fixes the worst case of each call. What grows is the
 * number of calls: 390 cells on a desktop of 1920 x 1080 are 6.5 times the 60 above, so
 * about 27 us for each render and 0.16 % of the frame. Three orders of magnitude are still
 * to spare.
 *
 * So an index by cell is not necessary. And the playhead, which draws at the rate of the
 * interval, does not use this function: it reads the table by offset of
 * `playback/route-source.ts`. The reason is not cost: it must draw the route that sounds
 * and not the route of the current board.
 */
export function occupantAt(placed: readonly PlacedPiece[], x: number, y: number): PlacedPiece | null {
  for (const p of placed) {
    if (p.cells.some(([cx, cy]) => cx === x && cy === y)) return p;
  }
  return null;
}

/**
 * The index of `(x, y)` inside `p.cells`, or `-1` if `p` does not occupy that cell.
 *
 * A sibling of `occupantAt` and not a change of its signature: `occupantAt` answers WHICH
 * piece, this one answers WHICH cell of that piece, and the split leaves alone the callers
 * that need only the first.
 *
 * It exists so that the derivation from a cell to its note does not live inside `Board.tsx`.
 * The argument is not cost: five comparisons for each cell do not matter, on a board of 60
 * cells or of 390. It is coverage: a pure function is cheaper to exhaust than a render, and
 * a screenshot cannot tell a correct mapping from one shifted by one.
 *
 * The index it returns works directly against the CANONICAL shape, thanks to the invariant
 * of the array order: `cells` is built with `cellsAt`, which is a `map`, so cell `k` of the
 * board is still cell `k` of `SHAPES`.
 */
export function occupantCellIndex(p: PlacedPiece, x: number, y: number): number {
  return p.cells.findIndex(([cx, cy]) => cx === x && cy === y);
}
