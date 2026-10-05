import { describe, it, expect } from 'vitest';
import {
  midiToHz,
  scheduleVoice,
  scheduleClick,
  DEFAULT_VOICE,
  NOTE_INTERVALS,
  RELEASE_INTERVALS,
  DEFAULT_VELOCITY,
  CLICK_VELOCITY,
  CLICK_SECONDS,
  CLICK_MIDI,
} from '../voice.ts';
import { intervalDuration } from '../scheduler.ts';
import { offline, peakNear, zeroCrossHz, firstAudible } from './test-context.ts';

const A4 = 69;
const VEL = 0.8;

/**
 * The release at the default tempo.
 *
 * The release is in intervals, so a number needs a bpm. 110 bpm gives exactly 0.12 s.
 * The tests that are not about the tempo measure against that envelope.
 */
const REL = RELEASE_INTERVALS * intervalDuration(110);

/** Renders one voice at unit gain and returns the samples. */
async function renderVoice(at: number, dur: number, freq = midiToHz(A4), rel = REL) {
  const ctx = offline(at + dur + 1);
  const g = ctx.createGain();
  g.gain.value = 1;
  g.connect(ctx.destination);
  scheduleVoice(ctx, g, freq, at, dur, rel, VEL);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

/** The same for a click. The same shape on purpose: only the scheduled thing changes. */
async function renderClick(at: number, vel?: number) {
  const ctx = offline(at + 1);
  const g = ctx.createGain();
  g.gain.value = 1;
  g.connect(ctx.destination);
  scheduleClick(ctx, g, at, vel);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

describe('midiToHz', () => {
  it('anchors A4 at 440 and keeps the octaves', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 10);
    expect(midiToHz(81)).toBeCloseTo(880, 10);
    expect(midiToHz(57)).toBeCloseTo(220, 10);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);   // C4
  });
});

describe('synthesis', () => {
  it('AC-PLY-009 — the rendered frequency is the requested one (+-1 Hz)', async () => {
    const d = await renderVoice(0.05, 0.5);
    expect(zeroCrossHz(d, 0.2, 0.3)).toBeCloseTo(440, 0);
  });

  it('it works for any note, not only A4', async () => {
    const d = await renderVoice(0.05, 0.5, midiToHz(60));
    expect(Math.abs(zeroCrossHz(d, 0.2, 0.3) - midiToHz(60))).toBeLessThan(1);
  });

  it('the envelope reaches the expected peak and sustain', async () => {
    const at = 0.1, dur = 0.35;
    const d = await renderVoice(at, dur);
    const { attack, sustain } = DEFAULT_VOICE;

    // The real peak falls between samples: hence the margin of 5%.
    expect(peakNear(d, at + attack)).toBeGreaterThan(VEL * 0.95);
    expect(peakNear(d, at + attack)).toBeLessThanOrEqual(VEL * 1.001);

    const expectedSustain = VEL * sustain;
    expect(Math.abs(peakNear(d, at + dur - 0.02) - expectedSustain)).toBeLessThan(expectedSustain * 0.05);
  });

  it('exact silence outside the note', async () => {
    const at = 0.1, dur = 0.35;
    const d = await renderVoice(at, dur);
    expect(peakNear(d, at - 0.03)).toBe(0);
    expect(peakNear(d, at + dur + REL + 0.1)).toBe(0);
  });

  it('AC-PLY-009 — the note starts where it was scheduled (+-1 ms)', async () => {
    const at = 0.1;
    const d = await renderVoice(at, 0.3);
    expect(Math.abs(firstAudible(d) - at)).toBeLessThan(0.001);
  });

  it('and at another instant too, to rule out a coincidence', async () => {
    const at = 0.37;
    const d = await renderVoice(at, 0.3);
    expect(Math.abs(firstAudible(d) - at)).toBeLessThan(0.001);
  });
});

describe('dur in intervals (the envelope is the same)', () => {
  it('with dur = NOTE_INTERVALS * intervalDuration(bpm), the peak and the sustain keep their values', async () => {
    // The same pattern as the envelope test above: only the source of `dur` changes. If
    // scheduleVoice treated a `dur` in intervals differently from a literal, the peak or
    // the sustain would move.
    const bpm = 100;
    const dur = NOTE_INTERVALS * intervalDuration(bpm);   // 1 * 0.15 = 0.150 s
    const at = 0.1;
    const d = await renderVoice(at, dur);
    const { attack, sustain } = DEFAULT_VOICE;

    expect(peakNear(d, at + attack)).toBeGreaterThan(VEL * 0.95);
    expect(peakNear(d, at + attack)).toBeLessThanOrEqual(VEL * 1.001);
    const expectedSustain = VEL * sustain;
    expect(Math.abs(peakNear(d, at + dur - 0.02) - expectedSustain)).toBeLessThan(expectedSustain * 0.05);

    // Exact silence before `at`, and again after dur + release: the release starts where
    // `dur` ends, not before and not after.
    expect(peakNear(d, at - 0.03)).toBe(0);
    expect(peakNear(d, at + dur + REL + 0.1)).toBe(0);
  });

  it('AC-PLY-018 — at 60 bpm the note lasts longer than at 160: `dur` follows the tempo, it is not a fixed literal', async () => {
    const at = 0.1;
    const durLento = NOTE_INTERVALS * intervalDuration(60);     // 1 * 0.25    = 0.250 s
    const durRapido = NOTE_INTERVALS * intervalDuration(160);   // 1 * 0.09375 = 0.09375 s
    // The release follows the tempo as `dur` does: 0.22 s at 60 bpm and 0.0825 s at 160.
    const relLento = RELEASE_INTERVALS * intervalDuration(60);
    const relRapido = RELEASE_INTERVALS * intervalDuration(160);
    const { sustain } = DEFAULT_VOICE;
    const lento = await renderVoice(at, durLento, midiToHz(A4), relLento);
    const rapido = await renderVoice(at, durRapido, midiToHz(A4), relRapido);

    // At the instant where the note at 160 bpm has ended its release, the note at 60 bpm
    // still sustains. If `dur` did not come from the bpm (for example, a fixed 0.35 s),
    // the two curves would show the same state at that instant, and this test would
    // fail.
    const tSondeo = at + durRapido + relRapido + 0.02;
    expect(peakNear(rapido, tSondeo)).toBe(0);
    expect(peakNear(lento, tSondeo)).toBeGreaterThan(VEL * sustain * 0.9);
  });
});

describe('scheduleClick — a leg enters an empty cell', () => {
  it('it starts where it was scheduled (+-1 ms), like a note', async () => {
    const at = 0.37;
    const d = await renderClick(at);
    expect(Math.abs(firstAudible(d) - at)).toBeLessThan(0.001);
  });

  it('AC-PLY-020 — it lasts CLICK_SECONDS and no more: it does not enter the next interval', async () => {
    const at = 0.1;
    const d = await renderClick(at);
    expect(peakNear(d, at - 0.03)).toBe(0);
    // 30 ms after its end there is exact silence. A note at 110 bpm would still sound:
    // 0.136 s of note plus 0.12 s of release (0.88 intervals).
    expect(peakNear(d, at + CLICK_SECONDS + 0.03)).toBe(0);
    expect(peakNear(d, at + 0.002)).toBeGreaterThan(CLICK_VELOCITY * 0.75);
  });

  it('AC-PLY-020 — it HAS a pitch, and the pitch is CLICK_MIDI: it crosses zero at the rate of a note, not of noise', async () => {
    const at = 0.1;
    const d = await renderClick(at);
    // White noise crosses zero at a much higher rate: measured, 10815 Hz at a sample
    // rate of 44.1 kHz. The rate of crossings separates a sine from noise by a factor of
    // five. That is enough for this test to fail if someone puts the noise back by
    // mistake.
    //
    // The measure is the rate of crossings and NOT the centroid, although the centroid
    // is the number of the problem (~11000 Hz for the noise against ~2100 Hz for the
    // sine). `spectrum-bars.ts` documents that an AnalyserNode gives nothing offline, and
    // the repo has no DFT, so a centroid test would start by writing one. It would also
    // be fragile: the centroid of the sine is 2645 Hz with a rectangular window and
    // 2093 Hz, the exact fundamental, with a Hann window. So that number measures the
    // edge of the window and not the timbre. The rate of crossings does not depend on
    // that.
    const hz = zeroCrossHz(d, at + 0.002, at + 0.015);
    expect(Math.abs(hz - midiToHz(CLICK_MIDI)) / midiToHz(CLICK_MIDI)).toBeLessThan(0.02);
  });

  it('AC-PLY-020 — it sounds softer than a note: it goes with the circuit, it does not compete', async () => {
    const at = 0.1;
    const click = peakNear(await renderClick(at), at + 0.002);
    const nota = peakNear(await renderVoice(at, 0.15), at + DEFAULT_VOICE.attack);

    expect(click).toBeLessThanOrEqual(CLICK_VELOCITY + 1e-6);
    expect(nota).toBeGreaterThan(DEFAULT_VELOCITY * 0.95);
    expect(click).toBeLessThan(nota / 2);
  });

  it('the level can be overridden by parameter, as in scheduleVoice', async () => {
    const at = 0.1;
    const bajo = peakNear(await renderClick(at, CLICK_VELOCITY / 4), at + 0.002);
    expect(bajo).toBeLessThanOrEqual(CLICK_VELOCITY / 4 + 1e-6);
    expect(bajo).toBeGreaterThan(0);
  });
});

describe('the release in intervals', () => {
  it('AC-PLY-018 — the tail follows the tempo: the overlap of the arpeggio does not grow with the bpm', async () => {
    // A release in seconds breaks this property. Simultaneous voices =
    // `(NOTE_INTERVALS * interval + release) / interval`, which is
    // `1 + RELEASE_INTERVALS`: a number with NO bpm in it. It is measured as a tail: the
    // time that the note lasts after `dur`, in intervals, must be the same at the slowest
    // and at the fastest tempo.
    const at = 0.1;
    for (const bpm of [60, 160]) {
      const iv = intervalDuration(bpm);
      const dur = NOTE_INTERVALS * iv;
      const rel = RELEASE_INTERVALS * iv;
      const d = await renderVoice(at, dur, midiToHz(A4), rel);

      // Inside the release the note still sounds. After the release it does not.
      expect(peakNear(d, at + dur + rel * 0.5), `${bpm} bpm inside the release`).toBeGreaterThan(0);
      expect(peakNear(d, at + dur + rel + 0.05), `${bpm} bpm after the release`).toBe(0);
    }
  });

  it('at 110 bpm the release is exactly 0.12 s', () => {
    // The value of `RELEASE_INTERVALS` gives this on purpose: 0.12 s at the default
    // tempo.
    expect(RELEASE_INTERVALS * intervalDuration(110)).toBeCloseTo(0.12, 10);
  });
});
