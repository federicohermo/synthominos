import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  KEYBOARD_STEP_PX, START_MARGIN_PX, VISIBLE_MARGIN_PX,
  arrowStep, dockStartPosition, movePanel, signalPanelStartPosition,
} from '../drag.ts';
import type { Box, Position } from '../drag.ts';

const VIEWPORT: Box = { width: 1536, height: 695 };
/** The dock of four columns by three rows, as Chromium measures it. */
const DOCK: Box = { width: 220, height: 268 };

/** The width of a box at `x` that is inside a viewport of width `vw`. */
const inView = (x: number, width: number, vw: number) => Math.min(x + width, vw) - Math.max(x, 0);

describe('movePanel', () => {
  it('AC-PNL-005 — a move past each of the four edges keeps the visible margin in the viewport', () => {
    const middle: Position = { x: 600, y: 300 };
    const left = movePanel(middle, { dx: -9999, dy: 0 }, VIEWPORT, DOCK);
    const right = movePanel(middle, { dx: 9999, dy: 0 }, VIEWPORT, DOCK);
    const up = movePanel(middle, { dx: 0, dy: -9999 }, VIEWPORT, DOCK);
    const down = movePanel(middle, { dx: 0, dy: 9999 }, VIEWPORT, DOCK);

    expect(left).toEqual({ x: VISIBLE_MARGIN_PX - DOCK.width, y: 300 });
    expect(inView(left.x, DOCK.width, VIEWPORT.width)).toBe(VISIBLE_MARGIN_PX);
    expect(right).toEqual({ x: VIEWPORT.width - VISIBLE_MARGIN_PX, y: 300 });
    expect(inView(right.x, DOCK.width, VIEWPORT.width)).toBe(VISIBLE_MARGIN_PX);
    // The top limit is 0 and not a margin: the handle is on the top edge.
    expect(up).toEqual({ x: 600, y: 0 });
    expect(down).toEqual({ x: 600, y: VIEWPORT.height - VISIBLE_MARGIN_PX });
  });

  it('AC-PNL-005 — a drop at (-9999, -9999) leaves the top edge at the viewport top and a strip inside', () => {
    const lost = movePanel({ x: 0, y: 0 }, { dx: -9999, dy: -9999 }, VIEWPORT, DOCK);
    expect(lost.y).toBe(0);
    expect(inView(lost.x, DOCK.width, VIEWPORT.width)).toBe(VISIBLE_MARGIN_PX);
  });

  it('AC-PNL-003 — a move that reaches no edge moves the panel by the whole delta', () => {
    expect(movePanel({ x: 600, y: 300 }, { dx: -37, dy: 41 }, VIEWPORT, DOCK)).toEqual({ x: 563, y: 341 });
  });

  it('AC-PNL-005 — a viewport smaller than the margin puts the panel at the edge, with finite numbers', () => {
    const noWindow = movePanel({ x: 10, y: 10 }, { dx: 0, dy: 0 }, { width: 0, height: 0 }, DOCK);
    expect(noWindow).toEqual({ x: -VISIBLE_MARGIN_PX, y: -VISIBLE_MARGIN_PX });
  });

  it('AC-PNL-003 AC-PNL-005 — for any move, the top edge and the visible margin stay in the viewport', () => {
    const side = (max: number) => fc.integer({ min: VISIBLE_MARGIN_PX, max });
    const coordinate = fc.integer({ min: -20_000, max: 20_000 });
    fc.assert(fc.property(
      side(4000), side(3000), side(900), side(900), coordinate, coordinate, coordinate, coordinate,
      (vw, vh, bw, bh, x, y, dx, dy) => {
        const viewport = { width: vw, height: vh };
        const box = { width: bw, height: bh };
        const to = movePanel({ x, y }, { dx, dy }, viewport, box);

        expect(to.y).toBeGreaterThanOrEqual(0);
        expect(vh - to.y).toBeGreaterThanOrEqual(VISIBLE_MARGIN_PX);
        expect(inView(to.x, bw, vw)).toBeGreaterThanOrEqual(VISIBLE_MARGIN_PX);

        const free = x + dx >= VISIBLE_MARGIN_PX - bw && x + dx <= vw - VISIBLE_MARGIN_PX
          && y + dy >= 0 && y + dy <= vh - VISIBLE_MARGIN_PX;
        if (free) expect(to).toEqual({ x: x + dx, y: y + dy });
      },
    ));
  });
});

describe('arrowStep', () => {
  it('AC-PNL-004 — each arrow gives one keyboard step in its direction', () => {
    expect(arrowStep('ArrowLeft')).toEqual({ dx: -KEYBOARD_STEP_PX, dy: 0 });
    expect(arrowStep('ArrowRight')).toEqual({ dx: KEYBOARD_STEP_PX, dy: 0 });
    expect(arrowStep('ArrowUp')).toEqual({ dx: 0, dy: -KEYBOARD_STEP_PX });
    expect(arrowStep('ArrowDown')).toEqual({ dx: 0, dy: KEYBOARD_STEP_PX });
  });

  it('AC-PNL-004 — another key gives null and not a zero step, so the caller keeps its default', () => {
    for (const key of ['f', 'Enter', ' ', 'Tab', 'PageUp', 'Home', '']) {
      expect(arrowStep(key), key).toBeNull();
    }
  });

  it('AC-PNL-004 — an arrow moves the panel one keyboard step', () => {
    const step = arrowStep('ArrowRight') ?? { dx: 0, dy: 0 };
    expect(movePanel({ x: 100, y: 100 }, step, VIEWPORT, DOCK)).toEqual({ x: 100 + KEYBOARD_STEP_PX, y: 100 });
  });
});

describe('the start positions', () => {
  it('AC-PNL-009 — the dock starts at the start margin from the top edge and the right edge', () => {
    // 220 is written and not derived: a derivation would repeat the sum that this case checks.
    for (const viewport of [VIEWPORT, { width: 1920, height: 1080 }, { width: 375, height: 667 }]) {
      const dock = dockStartPosition(viewport);
      expect(dock.y, `${viewport.width} px`).toBe(START_MARGIN_PX);
      expect(viewport.width - (dock.x + 220), `${viewport.width} px`).toBe(START_MARGIN_PX);
    }
  });

  it('AC-PNL-009 — the signal panel starts at the start margin from the left and the bottom, with the cell of its viewport', () => {
    // Three cells that `grillaPara` gives for three windows: the target cell of 73 px misses all three.
    const cases: [width: number, height: number, cell: number][] = [
      [1536, 695, 69.5], [1920, 1080, 72], [375, 667, 74.1],
    ];
    for (const [width, height, cell] of cases) {
      const signal = signalPanelStartPosition({ width, height });
      expect(signal.x, `${width} × ${height}`).toBe(START_MARGIN_PX);
      expect(height - (signal.y + cell), `${width} × ${height}`).toBeCloseTo(START_MARGIN_PX, 0);
    }
  });
});
