import { describe, it, expect } from 'vitest';
import { grillaPara, CELL_PX_OBJETIVO, NOTA_RAZON, PASO_RAZON } from '../grid-fit.ts';
import { GRID_MIN } from '../../board-editing/placement.ts';

const VIEWPORTS: [vw: number, vh: number, cols: number, rows: number, cell: number][] = [
  [1920, 1080, 26, 15, 72.0],
  [1512, 982, 21, 13, 72.0],
  [1440, 900, 20, 12, 72.0],
  [1366, 768, 19, 11, 69.8],
  [1280, 720, 18, 10, 71.1],
  [834, 1112, 11, 15, 74.1],
  [430, 932, 6, 13, 71.7],
  [375, 667, 5, 9, 74.1],
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
    const chico = grillaPara(730, 438);
    const grande = grillaPara(1920, 1080);
    expect(grande.dims.w * grande.dims.h).toBeGreaterThan(chico.dims.w * chico.dims.h * 6);
    expect(Math.abs(grande.cell - chico.cell)).toBeLessThan(2);
  });
});

/** The epsilon of the `floor` lets the board exceed the box by 1e-13 px at most, measured at 916 px. */
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
    for (const [vw, vh] of VIEWPORTS) {
      const { dims, cell } = grillaPara(vw, vh);
      expect(vw - dims.w * cell, `width ${vw}x${vh}`).toBeLessThan(cell);
      expect(vh - dims.h * cell, `height ${vw}x${vh}`).toBeLessThan(cell);
    }
  });

  it('AC-FIT-005 — and also in the disproportionate boxes, which is why the third step exists', () => {
    for (const [vw, vh] of [[2000, 300], [300, 2000]]) {
      const { dims, cell } = grillaPara(vw, vh);
      expect(vw - dims.w * cell, `width ${vw}x${vh}`).toBeLessThan(cell);
      expect(vh - dims.h * cell, `height ${vw}x${vh}`).toBeLessThan(cell);
    }
  });

  it('AC-FIT-006 — the count is the LARGEST that fits, in a sweep of 243 widths', () => {
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
    expect(CELL_PX_OBJETIVO * NOTA_RAZON).toBeCloseTo(19, 10);
    expect(CELL_PX_OBJETIVO * PASO_RAZON).toBeCloseTo(13, 10);
  });

  it('AC-FIT-007 — it never returns less than `GRID_MIN`, even with a box of one pixel', () => {
    for (const [vw, vh] of [[1, 1], [0, 0], [100, 3000]]) {
      const { dims } = grillaPara(vw, vh);
      expect(dims.w, `${vw}x${vh}`).toBeGreaterThanOrEqual(GRID_MIN.w);
      expect(dims.h, `${vw}x${vh}`).toBeGreaterThanOrEqual(GRID_MIN.h);
    }
  });
});
