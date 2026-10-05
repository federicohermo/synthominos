import { describe, it, expect } from 'vitest';
import { offsetAt } from '../playhead-offset.ts';

// Intervals of 0.25 s and integer origins are exact in binary: a failure is not a rounding.

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
    // 55 intervals is the measured cycle of 8 pieces.
    expect(offsetAt(10 + (37 * 55 + 54) * 0.25, 10, 0.25, 55)).toBe(54);
  });

  it('AC-PLY-028 — cycle length 0: null, because `x % 0` is NaN in JS', () => {
    expect(offsetAt(11, 10, 0.25, 0)).toBeNull();
    expect(offsetAt(11, 10, 0.25, -3)).toBeNull();
    expect(offsetAt(11, 10, 0.25, 0.5)).toBeNull();
  });

  it('AC-PLY-028 — t before the origin: a non-negative integer, not the -1 of the JS %', () => {
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
