import { describe, it, expect } from 'vitest';
import { binsToBars } from '../spectrum-bars.ts';

/**
 * No test of this file touches an AudioContext, and that is the goal of the design.
 *
 * An AnalyserNode gives nothing useful in an OfflineAudioContext, so the only way to verify
 * the mapping is to keep it apart from the node.
 */

/** A spectrum with one bin lit. A probe to see which bar it falls in. */
function oneHot(binCount: number, i: number): Uint8Array {
  const bins = new Uint8Array(binCount);
  bins[i] = 255;
  return bins;
}

/** How many bins fall in the bar `bar`, measured bin by bin. */
function spanOf(binCount: number, barCount: number, bar: number): number {
  let n = 0;
  for (let i = 0; i < binCount; i++) {
    if (binsToBars(oneHot(binCount, i), barCount)[bar] > 0) n++;
  }
  return n;
}

describe('binsToBars', () => {
  it('AC-SPC-005 — deterministic and normalized from 0 to 1', () => {
    const bins = new Uint8Array(128).fill(255);
    expect(Array.from(binsToBars(bins, 8))).toEqual(new Array(8).fill(1));

    // Determinism: the same input twice gives exactly the same output.
    const half = new Uint8Array(128).fill(128);
    expect(Array.from(binsToBars(half, 16))).toEqual(Array.from(binsToBars(half, 16)));

    // Normalization: 255 is the maximum that getByteFrequencyData returns.
    // The tolerance is 6 digits and no more because the output is a Float32Array:
    // 128/255 is rounded to the nearest 32-bit float when it is stored.
    for (const v of binsToBars(half, 16)) expect(v).toBeCloseTo(128 / 255, 6);
  });

  it('AC-SPC-006 — it is the peak of the band, not the mean', () => {
    // One strong bin inside a wide band must reach the bar whole: it is the transient
    // that the mean would flatten.
    const bins = new Uint8Array(128);
    bins[100] = 255;
    const bars = binsToBars(bins, 8);
    expect(Math.max(...bars)).toBe(1);
  });

  it('AC-SPC-007 — the low band covers fewer bins than the high band', () => {
    const grave = spanOf(128, 8, 0);
    const aguda = spanOf(128, 8, 7);
    expect(grave).toBeLessThan(aguda);
    expect(grave).toBeGreaterThan(0);   // no band is blind
  });

  it('AC-SPC-007 — the split is monotonic: each band covers at least as many bins as the band below it', () => {
    const spans = Array.from({ length: 8 }, (_, b) => spanOf(128, 8, b));
    for (let b = 1; b < spans.length; b++) expect(spans[b]).toBeGreaterThanOrEqual(spans[b - 1]);
  });

  it('AC-SPC-008 — every bin reaches some bar, the highest included', () => {
    for (let i = 0; i < 128; i++) {
      expect(Math.max(...binsToBars(oneHot(128, i), 8))).toBe(1);
    }
  });

  it('AC-SPC-009 — bins at zero give every bar at zero', () => {
    expect(binsToBars(new Uint8Array(128), 8).every(v => v === 0)).toBe(true);
  });

  it('AC-SPC-010 — a barCount larger than the number of bins: no bar is empty', () => {
    const bars = binsToBars(new Uint8Array(4).fill(255), 32);
    expect(bars.length).toBe(32);
    expect(Array.from(bars)).toEqual(new Array(32).fill(1));
  });

  it('AC-SPC-011 — a barCount of 1 returns the peak of the whole spectrum', () => {
    expect(binsToBars(new Uint8Array(128).fill(255), 1)[0]).toBe(1);

    const bins = new Uint8Array(128);
    bins[127] = 51;                                  // the highest bin, at 0.2
    expect(binsToBars(bins, 1)[0]).toBeCloseTo(0.2, 6);
  });

  it('AC-SPC-012 — degenerate inputs return an empty array and do not throw', () => {
    expect(binsToBars(new Uint8Array(128), 0).length).toBe(0);
    expect(binsToBars(new Uint8Array(128), -4).length).toBe(0);
    expect(binsToBars(new Uint8Array(0), 8).every(v => v === 0)).toBe(true);
  });
});
