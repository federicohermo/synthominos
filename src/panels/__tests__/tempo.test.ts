import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DRAG_STEP_PX, clampTempo, dragTempo, tempoKeyStep, wheelStep } from '../tempo.ts';
import { TEMPO_MAX, TEMPO_MIN } from '../../playback/scheduler.ts';

describe('clampTempo', () => {
  it('AC-PNL-024 — the two ends of the range are reached and not passed', () => {
    expect(clampTempo(-9999)).toBe(TEMPO_MIN);
    expect(clampTempo(TEMPO_MIN - 1)).toBe(TEMPO_MIN);
    expect(clampTempo(TEMPO_MIN)).toBe(TEMPO_MIN);
    expect(clampTempo(TEMPO_MAX)).toBe(TEMPO_MAX);
    expect(clampTempo(TEMPO_MAX + 1)).toBe(TEMPO_MAX);
    expect(clampTempo(9999)).toBe(TEMPO_MAX);
  });

  it('AC-PNL-024 — a tempo inside the range stays, rounded to a whole number', () => {
    expect(clampTempo(110)).toBe(110);
    expect(clampTempo(110.4)).toBe(110);
    expect(clampTempo(110.6)).toBe(111);
  });

  it('AC-PNL-024 AC-PNL-025 — any tempo comes out whole and inside the range', () => {
    fc.assert(fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), bpm => {
      const out = clampTempo(bpm);
      expect(Number.isInteger(out)).toBe(true);
      expect(out).toBeGreaterThanOrEqual(TEMPO_MIN);
      expect(out).toBeLessThanOrEqual(TEMPO_MAX);
    }));
  });
});

describe('wheelStep', () => {
  it('AC-PNL-024 — up adds one bpm and down takes one, for a small and a large wheel step', () => {
    expect(wheelStep(-100)).toBe(1);
    expect(wheelStep(-1)).toBe(1);
    expect(wheelStep(100)).toBe(-1);
    expect(wheelStep(1)).toBe(-1);
  });

  it('AC-PNL-024 — a horizontal wheel, with no vertical delta, does not change the tempo', () => {
    expect(wheelStep(0)).toBe(0);
  });
});

describe('tempoKeyStep', () => {
  it('AC-PNL-024 — up and right add one bpm, down and left take one', () => {
    expect(tempoKeyStep('ArrowUp')).toBe(1);
    expect(tempoKeyStep('ArrowRight')).toBe(1);
    expect(tempoKeyStep('ArrowDown')).toBe(-1);
    expect(tempoKeyStep('ArrowLeft')).toBe(-1);
  });

  it('AC-PNL-024 — another key gives null and not a zero step, so the caller keeps its default', () => {
    for (const key of ['f', 'Enter', ' ', 'Tab', 'Home', '']) {
      expect(tempoKeyStep(key), key).toBeNull();
    }
  });
});

describe('dragTempo', () => {
  it('AC-PNL-025 — up by two drag steps adds two bpm, and down by two takes two', () => {
    expect(dragTempo(110, -2 * DRAG_STEP_PX)).toBe(112);
    expect(dragTempo(110, 2 * DRAG_STEP_PX)).toBe(108);
    expect(dragTempo(TEMPO_MIN, -(TEMPO_MAX - TEMPO_MIN) * DRAG_STEP_PX)).toBe(TEMPO_MAX);
  });

  it('AC-PNL-025 — the pointer back at the start point gives the start tempo, also after the clamp', () => {
    expect(dragTempo(150, -9999)).toBe(TEMPO_MAX);
    expect(dragTempo(150, 0)).toBe(150);
    expect(dragTempo(150, 20)).toBe(140);
  });

  it('AC-PNL-025 — for any start inside the range, a higher pointer never gives a lower tempo, and the start point gives the start tempo', () => {
    fc.assert(fc.property(
      fc.integer({ min: TEMPO_MIN, max: TEMPO_MAX }), fc.integer({ min: -5000, max: 5000 }),
      fc.integer({ min: 0, max: 5000 }),
      (start, dy, higher) => {
        expect(dragTempo(start, dy - higher)).toBeGreaterThanOrEqual(dragTempo(start, dy));
        expect(dragTempo(start, 0)).toBe(start);
      },
    ));
  });
});
