import { describe, it, expect } from 'vitest';
import {
  cabeEn,
  cellsAt,
  isValid,
  occupantAt,
  occupantCellIndex,
  GRID_DEFAULT,
} from '../placement.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.ts';
import type { Cell } from '../../pieces/transform.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../placement.ts';

/**
 * This whole file measures the REFERENCE board, which is 10 x 6.
 *
 * The board comes from the box, so the functions take it as a parameter and a test must
 * choose one. This file chooses `GRID_DEFAULT`. What depends on the dimensions has its
 * own cases with other dimensions: `cabeEn`.
 */
const { w: GRID_W, h: GRID_H } = GRID_DEFAULT;

const PIECES = Object.keys(SHAPES) as PieceKey[];

/** A placed piece with the given cells. The board does not read the other fields. */
const piezaEn = (id: string, cells: Cell[]): PlacedPiece =>
  ({ id, piece: 'I', rotation: 0, mirror: false, cells, muted: false });

describe('cellsAt', () => {
  it('AC-BRD-001 — the grip cell lands exactly on the clicked cell', () => {
    // This is the property that makes a placement feel exact.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(base) : base;
          const idx = ANCHOR_INDEX[p];
          for (const [x, y] of [[0, 0], [3, 2], [9, 5]] as Cell[]) {
            expect(cellsAt(shape, idx, x, y)[idx]).toEqual([x, y]);
          }
        }
      }
    }
  });

  it('translates the whole shape with no deformation', () => {
    const shape: Cell[] = [[0,0],[1,0],[2,0],[3,0],[4,0]];
    expect(cellsAt(shape, 2, 5, 3)).toEqual([[3,3],[4,3],[5,3],[6,3],[7,3]]);
  });

  it('keeps the order of the array: cell k is still cell k', () => {
    const shape: Cell[] = [[2,2],[0,0],[1,1]];
    const got = cellsAt(shape, 0, 7, 7);
    // The grip cell is cell 0, which was at (2,2): the offset is (+5,+5).
    expect(got).toEqual([[7,7],[5,5],[6,6]]);
  });

  it('does not mutate the shape it receives', () => {
    const shape: Cell[] = [[0,0],[1,0]];
    const copia = shape.map(([x, y]): Cell => [x, y]);
    cellsAt(shape, 0, 4, 4);
    expect(shape).toEqual(copia);
  });
});

describe('isValid', () => {
  it('accepts a piece that fits in an empty board', () => {
    expect(isValid([[0,0],[1,0],[2,0]], [], GRID_DEFAULT)).toBe(true);
  });

  it('AC-BRD-003 — rejects at each of the four edges', () => {
    expect(isValid([[-1,0]], [], GRID_DEFAULT)).toBe(false);                 // left
    expect(isValid([[0,-1]], [], GRID_DEFAULT)).toBe(false);                 // top
    expect(isValid([[GRID_W,0]], [], GRID_DEFAULT)).toBe(false);             // right
    expect(isValid([[0,GRID_H]], [], GRID_DEFAULT)).toBe(false);             // bottom
  });

  it('the corners of the board are legal and their outside neighbors are not', () => {
    expect(isValid([[0,0],[GRID_W-1,GRID_H-1]], [], GRID_DEFAULT)).toBe(true);
    expect(isValid([[GRID_W-1,GRID_H]], [], GRID_DEFAULT)).toBe(false);
  });

  it('rejects the overlap with a placed piece', () => {
    const placed = [piezaEn('1', [[2,2],[3,2],[4,2]])];
    expect(isValid([[4,2]], placed, GRID_DEFAULT)).toBe(false);              // overlap on one cell
    expect(isValid([[2,2],[3,2],[4,2]], placed, GRID_DEFAULT)).toBe(false);  // full overlap
    expect(isValid([[2,3],[3,3],[4,3]], placed, GRID_DEFAULT)).toBe(true);   // just below, free
  });

  it('AC-BRD-003 — reads ALL the placed pieces, not only the first one', () => {
    const placed = [piezaEn('1', [[0,0]]), piezaEn('2', [[5,5]])];
    expect(isValid([[5,5]], placed, GRID_DEFAULT)).toBe(false);
  });

  it('a placement outside the board is illegal even when it overlaps nothing', () => {
    expect(isValid([[8,0],[9,0],[10,0]], [], GRID_DEFAULT)).toBe(false);
  });

  it('the 12 pieces fit in the board at rotation 0', () => {
    for (const p of PIECES) {
      const shape = rotateN(SHAPES[p], 0);
      expect(isValid(cellsAt(shape, ANCHOR_INDEX[p], 4, 2), [], GRID_DEFAULT)).toBe(true);
    }
  });
});

describe('`cabeEn`: whether the piece fits WHOLE in the current board', () => {
  it('AC-FIT-019 — a piece that fits whole does, whatever is placed', () => {
    // It does not read the overlap, on purpose: the question is "is it drawn or not", and
    // two overlapped pieces cannot exist, because `isValid` does not let them in.
    const p = piezaEn('a', [[0,0],[1,0],[2,0],[3,0],[4,0]]);
    expect(cabeEn(p, GRID_DEFAULT)).toBe(true);
    expect(cabeEn(p, { w: 5, h: 5 })).toBe(true);
  });

  it('AC-FIT-019 — a piece that passes by ONE cell does not fit, at any of the four edges', () => {
    // This is the half that decides what is drawn: "three cells inside and two outside"
    // must give false, or the board would show half a piece that the circuit does not
    // visit.
    expect(cabeEn(piezaEn('a', [[3,0],[4,0],[5,0]]), { w: 5, h: 5 })).toBe(false);   // right
    expect(cabeEn(piezaEn('a', [[0,3],[0,4],[0,5]]), { w: 5, h: 5 })).toBe(false);   // bottom
    expect(cabeEn(piezaEn('a', [[-1,0],[0,0]]), GRID_DEFAULT)).toBe(false);          // left
    expect(cabeEn(piezaEn('a', [[0,-1],[0,0]]), GRID_DEFAULT)).toBe(false);          // top
  });

  it('AC-FIT-020 — the same piece fits or not, depending on the board, which is why the function exists', () => {
    // The central case: the window shrinks and the piece does not fit, and the piece did
    // not change. To shrink the window and then grow it returns the piece.
    const alBorde = piezaEn('a', [[7,1],[8,1],[9,1]]);
    expect(cabeEn(alBorde, GRID_DEFAULT)).toBe(true);
    expect(cabeEn(alBorde, { w: 6, h: 6 })).toBe(false);
    expect(cabeEn(alBorde, GRID_DEFAULT)).toBe(true);
  });
});

describe('occupantAt', () => {
  it('returns the piece that occupies the cell', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[5,3]]);
    expect(occupantAt([a, b], 2, 1)).toBe(a);
    expect(occupantAt([a, b], 5, 3)).toBe(b);
  });

  it('returns null on a free cell and on an empty board', () => {
    expect(occupantAt([piezaEn('a', [[1,1]])], 0, 0)).toBeNull();
    expect(occupantAt([], 0, 0)).toBeNull();
  });

  it('does not confuse (x,y) with (y,x)', () => {
    const a = piezaEn('a', [[1,4]]);
    expect(occupantAt([a], 1, 4)).toBe(a);
    expect(occupantAt([a], 4, 1)).toBeNull();
  });
});

describe('occupantCellIndex', () => {
  it('on an occupied cell it returns the index of that cell in the piece', () => {
    const a = piezaEn('a', [[1,1],[2,1],[3,1]]);
    expect(occupantCellIndex(a, 1, 1)).toBe(0);
    expect(occupantCellIndex(a, 2, 1)).toBe(1);
    expect(occupantCellIndex(a, 3, 1)).toBe(2);
  });

  it('on a cell that the piece does not occupy it returns -1', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    expect(occupantCellIndex(a, 0, 0)).toBe(-1);      // free and far
    expect(occupantCellIndex(a, 3, 1)).toBe(-1);      // free and adjacent
    expect(occupantCellIndex(a, 1, 2)).toBe(-1);      // does not confuse (x,y) with (y,x)
  });

  it('with two adjacent pieces the index comes from the queried piece', () => {
    // This case breaks an implementation that searches for the cell in the whole board:
    // (3,1) and (4,1) belong to `b`, and their index inside `b` is not the one they would
    // have counted from `a`.
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[3,1],[4,1]]);
    expect(occupantCellIndex(a, 3, 1)).toBe(-1);
    expect(occupantCellIndex(b, 3, 1)).toBe(0);
    expect(occupantCellIndex(b, 4, 1)).toBe(1);
    expect(occupantCellIndex(a, 2, 1)).toBe(1);
    expect(occupantCellIndex(b, 2, 1)).toBe(-1);
  });

  it('composed with occupantAt: first which piece, then which cell of that piece', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[3,1],[4,1]]);
    const ocupante = occupantAt([a, b], 4, 1) ?? a;   // the ?? is not exercised: with null, the index would be -1 and the test would still fail
    expect(ocupante).toBe(b);
    expect(occupantCellIndex(ocupante, 4, 1)).toBe(1);
  });

  it('the index holds against the canonical shape in the 96 orientations', () => {
    // The derivation cell→note depends on this: cell k of the board must still be cell k
    // of SHAPES after the rotation, the reflection and the translation. `cellsAt` is a
    // `map`, so the index survives the three steps.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(base) : base;
          const cells = cellsAt(shape, ANCHOR_INDEX[p], 5, 3);
          const pieza = piezaEn(`${p}-${rot}-${mirror}`, cells);
          for (let k = 0; k < cells.length; k++) {
            expect(occupantCellIndex(pieza, cells[k][0], cells[k][1])).toBe(k);
          }
        }
      }
    }
  });
});