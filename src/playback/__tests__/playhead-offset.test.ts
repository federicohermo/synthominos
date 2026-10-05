import { describe, it, expect } from 'vitest';
import { offsetAt } from '../playhead-offset.ts';

/**
 * No test of this file touches an AudioContext. That is the reason the arithmetic lives
 * outside `engine.ts`.
 *
 * Four numbers are enough to assert the offset. The reading of the clock cannot be
 * asserted. The same argument separates `spectrum-bars.ts` from the AnalyserNode.
 *
 * The times use intervals of 0.25 s and integer origins on purpose: they are exact in
 * binary, so a failure comes from the algorithm and not from rounding.
 */

describe('offsetAt', () => {
  it('AC-PLY-027 — inside the first cycle the offset grows by one per interval', () => {
    for (let k = 0; k < 8; k++) expect(offsetAt(10 + k * 0.25, 10, 0.25, 8)).toBe(k);
  });

  it('AC-PLY-027 — the offset is an integer: no interpolation inside the interval', () => {
    expect(offsetAt(10 + 0.999 * 0.25, 10, 0.25, 8)).toBe(0);
    expect(offsetAt(10 + 1.001 * 0.25, 10, 0.25, 8)).toBe(1);
  });

  it('AC-PLY-027 — at the cycle boundary the offset returns to 0, not to 8', () => {
    expect(offsetAt(10 + 7 * 0.25, 10, 0.25, 8)).toBe(7);
    expect(offsetAt(10 + 8 * 0.25, 10, 0.25, 8)).toBe(0);
    expect(offsetAt(10 + 9 * 0.25, 10, 0.25, 8)).toBe(1);
  });

  it('AC-PLY-027 — many cycles later the offset stays in range', () => {
    expect(offsetAt(10 + (5 * 8 + 3) * 0.25, 10, 0.25, 8)).toBe(3);
    expect(offsetAt(10 + (1000 * 8 + 6) * 0.25, 10, 0.25, 8)).toBe(6);
    // A realistic cycle: 55 intervals is the measured cycle of 8 pieces.
    expect(offsetAt(10 + (37 * 55 + 54) * 0.25, 10, 0.25, 55)).toBe(54);
  });

  it('AC-PLY-028 — cycle length 0: null, because `x % 0` is NaN in JS', () => {
    // This is the empty board. One press of play reaches it.
    expect(offsetAt(11, 10, 0.25, 0)).toBeNull();
    expect(offsetAt(11, 10, 0.25, -3)).toBeNull();
    expect(offsetAt(11, 10, 0.25, 0.5)).toBeNull();
  });

  it('AC-PLY-028 — t before the origin: a non-negative integer, not the -1 of the JS %', () => {
    // The window of CLOCK_START_DELAY between startClock and the first onset.
    expect(offsetAt(10 - 0.05, 10, 0.25, 8)).toBe(7);
    expect(offsetAt(10 - 0.25, 10, 0.25, 8)).toBe(7);
    expect(offsetAt(10 - 8 * 0.25, 10, 0.25, 8)).toBe(0);

    for (let k = 1; k <= 40; k++) {
      const v = offsetAt(10 - k * 0.25, 10, 0.25, 8) ?? NaN;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8);
    }
  });

  it('one piece alone: the offset never leaves the short cycle', () => {
    for (const t of [9.9, 10, 10.1, 10.25, 12.5]) expect(offsetAt(t, 10, 0.25, 1)).toBe(0);
    // A cycle of 5 intervals: the piece alone, plus the jump back to itself.
    for (let k = -12; k < 30; k++) {
      const v = offsetAt(10 + k * 0.25, 10, 0.25, 5) ?? NaN;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBe(((k % 5) + 5) % 5);
    }
  });

  it('AC-PLY-028 — non-positive interval: null, not a division by zero', () => {
    expect(offsetAt(11, 10, 0, 8)).toBeNull();
    expect(offsetAt(11, 10, -0.25, 8)).toBeNull();
  });

  it('AC-PLY-028 — non-finite arguments: null', () => {
    expect(offsetAt(NaN, 10, 0.25, 8)).toBeNull();
    expect(offsetAt(11, NaN, 0.25, 8)).toBeNull();
    expect(offsetAt(11, 10, NaN, 8)).toBeNull();
    expect(offsetAt(11, 10, 0.25, NaN)).toBeNull();
    expect(offsetAt(Infinity, 10, 0.25, 8)).toBeNull();
    expect(offsetAt(-Infinity, 10, 0.25, 8)).toBeNull();
    expect(offsetAt(11, 10, Infinity, 8)).toBeNull();
    expect(offsetAt(11, 10, 0.25, Infinity)).toBeNull();
  });

  it('AC-PLY-028 — a sweep of instants off the grid: never NaN', () => {
    for (const ciclo of [1, 5, 8, 55]) {
      for (let k = -60; k < 240; k++) {
        const v = offsetAt(10 + k * 0.0341, 10, 0.25, ciclo) ?? NaN;
        expect(Number.isNaN(v)).toBe(false);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(ciclo);
      }
    }
  });
});
