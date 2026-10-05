import { describe, it, expect } from 'vitest';
import { grillaPara, CELL_PX_OBJETIVO, NOTA_RAZON, PASO_RAZON } from '../grid-fit.ts';
import { GRID_MIN } from '../../board-editing/placement.ts';

/**
 * The only part that a test can check with no browser: the formula.
 *
 * The rest is wiring and lives in `use-grid.browser.test.tsx`: that `--cell` is written
 * with its unit, that a `resize` writes it again, that the dimensions come back as state.
 *
 * This file fixes three different things that the contract promises: that the board
 * **fits**, that it comes from the box, and that the cell size stays **near the target
 * of 73 px**.
 */

/** The table of the reference boxes, measured on real window sizes. */
const VIEWPORTS: [vw: number, vh: number, cols: number, rows: number, cell: number][] = [
  [1920, 1080, 26, 15, 72.0],
  [1512, 982, 21, 13, 72.0],
  [1440, 900, 20, 12, 72.0],
  [1366, 768, 19, 11, 69.8],
  [1280, 720, 18, 10, 71.1],
  [834, 1112, 11, 15, 74.1],
  [430, 932, 6, 13, 71.7],
  [375, 667, 5, 9, 74.1],
  // The only one where the minimum decides: 5 columns of 73 px do not fit in 320 px, so
  // the cell size gives way. Otherwise the board would scroll, which the contract forbids.
  [320, 568, 5, 8, 64.0],
];

describe('the board comes from the box', () => {
  it('AC-FIT-001 — the whole table of reference boxes', () => {
    for (const [vw, vh, cols, rows, cell] of VIEWPORTS) {
      const g = grillaPara(vw, vh);
      expect([g.dims.w, g.dims.h], `${vw}x${vh}`).toEqual([cols, rows]);
      expect(g.cell, `${vw}x${vh}`).toBeCloseTo(cell, 1);
    }
  });

  it('AC-FIT-002 — the count grows with the screen, and the cell size stays', () => {
    // The comparison that gives the fit its sense: this pair of boxes moves the COUNT of
    // cells and leaves the tile still. With a board fixed at 10 × 6, the same pair moves
    // the TILE from 73 to 180 px.
    const chico = grillaPara(730, 438);
    const grande = grillaPara(1920, 1080);
    expect(grande.dims.w * grande.dims.h).toBeGreaterThan(chico.dims.w * chico.dims.h * 6);
    expect(Math.abs(grande.cell - chico.cell)).toBeLessThan(2);
  });
});

/**
 * How far the epsilon of the `floor` can exceed the box, in px.
 *
 * It is not a tolerance of convenience. The epsilon exists so that `20.999999997` counts
 * as 21 columns, and the symmetric price is that a width that gives `21 - 1e-13` also
 * counts as 21. Measured in the sweep below, the worst case is a box `916 px` wide, where
 * the board exceeds it by **1e-13 px**. A browser does layout in units of 1/64 px, so
 * that is not one pixel of scroll: it is zero, rounded to more digits than the layout
 * has.
 */
const ROCE = 1e-6;

describe('the board fits, always', () => {
  it('AC-FIT-004 — the board overflows no box of the table', () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { dims, cell } = grillaPara(vw, vh);
      expect(dims.w * cell, `width ${vw}x${vh}`).toBeLessThanOrEqual(vw + ROCE);
      expect(dims.h * cell, `height ${vw}x${vh}`).toBeLessThanOrEqual(vh + ROCE);
    }
  });

  it('AC-FIT-005 — the leftover is always less than one cell, on BOTH axes', () => {
    // This is the half that the third step of the formula adds, and it makes "fills the
    // screen" a literal claim: a leftover of one full cell means that one more row or
    // column fits.
    for (const [vw, vh] of VIEWPORTS) {
      const { dims, cell } = grillaPara(vw, vh);
      expect(vw - dims.w * cell, `width ${vw}x${vh}`).toBeLessThan(cell);
      expect(vh - dims.h * cell, `height ${vw}x${vh}`).toBeLessThan(cell);
    }
  });

  it('AC-FIT-005 — and also in the disproportionate boxes, which is why the third step exists', () => {
    // Without the new count against the real cell size, at 2000 × 300 the minimum of 5
    // rows forces a cell of 60 px and leaves 380 px of width: six unused columns. The two
    // cases are the same one turned over, so the test checks both: a wrong `Math.min`
    // passes one of them.
    for (const [vw, vh] of [[2000, 300], [300, 2000]]) {
      const { dims, cell } = grillaPara(vw, vh);
      expect(vw - dims.w * cell, `width ${vw}x${vh}`).toBeLessThan(cell);
      expect(vh - dims.h * cell, `height ${vw}x${vh}`).toBeLessThan(cell);
    }
  });

  it('AC-FIT-006 — the count is the LARGEST that fits, in a sweep of 243 widths', () => {
    // A sweep and not one case: the test checks the property of the two steps together,
    // that `cols` is the largest count that fits. A `floor` with no epsilon breaks it at
    // the widths where `vw / cell` is exactly an integer and floating point gives
    // `20.999999997`. One case alone does not find which widths those are.
    for (let vw = 300; vw <= 2000; vw += 7) {
      const { dims, cell } = grillaPara(vw, 800);
      expect(dims.w * cell, `${vw}`).toBeLessThanOrEqual(vw + ROCE);
      expect((dims.w + 1) * cell, `${vw}`).toBeGreaterThan(vw);
    }
  });
});

describe('the tile keeps its look', () => {
  it('AC-FIT-003 — the cell size stays near the target in every box', () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { cell } = grillaPara(vw, vh);
      expect(cell, `${vw}x${vh}`).toBeGreaterThanOrEqual(64);
      expect(cell, `${vw}x${vh}`).toBeLessThanOrEqual(CELL_PX_OBJETIVO * 1.02);
    }
  });

  it('AC-FIT-015 — at the target cell size the two typographic ratios give the exact measured px', () => {
    // This is why the gap around the text needs no new measurement: at `CELL_PX_OBJETIVO`
    // the note name is 19 px and the `#N` is 13 px, the two numbers that the repo measured
    // with a `Range`.
    expect(CELL_PX_OBJETIVO * NOTA_RAZON).toBeCloseTo(19, 10);
    expect(CELL_PX_OBJETIVO * PASO_RAZON).toBeCloseTo(13, 10);
  });

  it('AC-FIT-007 — it never returns less than `GRID_MIN`, even with a box of one pixel', () => {
    // The floor is not defensive: below 5 × 5 some pentominoes fit in no position, and a
    // board where the `I` cannot be placed is not a small board, it is a broken one. A box
    // of 1 × 1 does not exist in a browser, but it does in a test that mounts the hook on
    // a node not measured yet.
    for (const [vw, vh] of [[1, 1], [0, 0], [100, 3000]]) {
      const { dims } = grillaPara(vw, vh);
      expect(dims.w, `${vw}x${vh}`).toBeGreaterThanOrEqual(GRID_MIN.w);
      expect(dims.h, `${vw}x${vh}`).toBeGreaterThanOrEqual(GRID_MIN.h);
    }
  });
});
