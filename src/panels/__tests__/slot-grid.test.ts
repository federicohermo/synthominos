import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  DOCK_COLUMNS, GRID_WIDTH_CEILING_PX, SLOT_GRID_GAP_PX, SLOT_PX, gridWidth, rectangleColumns,
} from '../slot-grid.ts';

const columnsFor = (n: number, ceiling: number) => rectangleColumns(n, ceiling, SLOT_PX, SLOT_GRID_GAP_PX);

describe('rectangleColumns', () => {
  it('AC-PNL-011 — each column count fits as soon as its width fits, and not one pixel before', () => {
    // The widths are written: a derivation from the slot would repeat the sum that this case checks.
    const widths: [columns: number, width: number][] = [[2, 100], [3, 152], [4, 204], [6, 308]];
    for (const [columns, width] of widths) {
      expect(gridWidth(columns, SLOT_PX, SLOT_GRID_GAP_PX), `${columns} columns`).toBe(width);
      expect(columnsFor(12, width), `${width} px`).toBe(columns);
      // Two columns is the floor: below it there is no proper divisor to give, so the answer stays 2.
      if (columns > 2) expect(columnsFor(12, width - 1), `${width - 1} px`).toBeLessThan(columns);
    }
  });

  it('AC-PNL-011 — for twelve pieces the count is 2, 3, 4 or 6 at each width, never 1, 5 or 12', () => {
    for (let width = 0; width <= 700; width++) {
      expect([2, 3, 4, 6], `${width} px`).toContain(columnsFor(12, width));
    }
  });

  it('AC-PNL-011 — a width that admits five columns gives four, with full rows', () => {
    const fiveFit = gridWidth(5, SLOT_PX, SLOT_GRID_GAP_PX);
    expect(fiveFit).toBe(256);
    expect(columnsFor(12, fiveFit)).toBe(4);
  });

  it('AC-PNL-011 — the grid width ceiling gives four columns by three rows', () => {
    expect(columnsFor(12, GRID_WIDTH_CEILING_PX)).toBe(4);
    expect(DOCK_COLUMNS).toBe(4);
    expect(12 / DOCK_COLUMNS).toBe(3);
    // The ceiling decides the shape: at the width of six columns the grid is six by two.
    expect(columnsFor(12, gridWidth(6, SLOT_PX, SLOT_GRID_GAP_PX))).toBe(6);
  });

  it('AC-PNL-012 — a width that admits fewer than two columns gives two, not one', () => {
    expect(columnsFor(12, 0)).toBe(2);
    expect(columnsFor(12, 99)).toBe(2);
  });

  it('AC-PNL-012 — a count with no proper divisor gives one column', () => {
    expect(columnsFor(7, 9999)).toBe(1);
    expect(columnsFor(3, 9999)).toBe(1);
  });

  it('AC-PNL-011 AC-PNL-012 — for any count and width, the largest proper divisor that fits, or the floor', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 1, max: 80 }),
      fc.integer({ min: 0, max: 12 }),
      (n, ceiling, track, gap) => {
        const proper = Array.from({ length: Math.max(n - 2, 0) }, (_, i) => i + 2).filter(c => n % c === 0);
        const fits = proper.filter(c => gridWidth(c, track, gap) <= ceiling);
        const expected = fits.length > 0 ? Math.max(...fits) : (proper[0] ?? 1);

        const columns = rectangleColumns(n, ceiling, track, gap);
        expect(columns).toBe(expected);
        expect(n % columns).toBe(0);
      },
    ));
  });
});
