import { describe, it, expect } from 'vitest';
import {
  midiToHz,
  scheduleVoice,
  scheduleClick,
  CLICK_SECONDS,
  RELEASE_INTERVALS,
  NOTE_INTERVALS,
  GRACE_INTERVALS,
  GRACE_VELOCITY,
} from '../voice.ts';
import { collectHits, intervalDuration, HIT } from '../scheduler.ts';
import { FFT_SIZE, SMOOTHING } from '../../spectrum/spectrum-bars.ts';
import type { ClockState } from '../scheduler.ts';
import { offline, peakNear, detectOnsets, zeroCrossHz, SR } from './test-context.ts';

const A4 = 69;
const VEL = 0.8;

/**
 * The release at the default tempo (0.12 s).
 *
 * These tests measure onsets and peaks, not the tail of the envelope, so a fixed value is
 * enough: the value that the instrument uses at 110 bpm. `voice.test.ts` checks that the
 * release follows the tempo.
 */
const REL = RELEASE_INTERVALS * intervalDuration(110);

describe('scheduler + synthesis together', () => {
  it('AC-PLY-010 — the hits sound where the scheduler said (+-6 ms)', async () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    // One note: the hit and the onset are the same instant by construction. A cycle of 16
    // intervals is exactly one bar: 2 s at 120 bpm.
    const hits = collectHits(0, 5, 120, { steps: [{ offset: 0, notes: [A4] }], clicks: [], length: 16 }, state);
    expect(hits).toHaveLength(3);

    const ctx = offline(5);
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(ctx.destination);
    for (const h of hits) if (h.kind === HIT.note) scheduleVoice(ctx, g, h.hz, h.at, 0.2, REL, VEL);
    const d = (await ctx.startRendering()).getChannelData(0);

    const onsets = detectOnsets(d);
    expect(onsets).toHaveLength(hits.length);
    onsets.forEach((t, i) => expect(Math.abs(t - hits[i].at)).toBeLessThan(0.006));
  });

  it('the note and the click of the circuit sound where the scheduler said, and the click takes no room', async () => {
    const bpm = 110;
    const interval = intervalDuration(bpm);
    const state: ClockState = { origin: 0.2, scheduledUntil: 0 };
    // One step, and a click three intervals later: the two kinds of hit on the same grid.
    const hits = collectHits(0, 6 * interval, bpm, {
      steps: [{ offset: 0, notes: [A4] }],
      clicks: [{ offset: 3 }],
      length: 6,
    }, state);
    expect(hits).toHaveLength(2);

    const ctx = offline(2);
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(ctx.destination);
    for (const h of hits) {
      if (h.kind === HIT.note) scheduleVoice(ctx, g, h.hz, h.at, interval, RELEASE_INTERVALS * interval, VEL);
      else scheduleClick(ctx, g, h.at);
    }
    const d = (await ctx.startRendering()).getChannelData(0);

    const onsets = detectOnsets(d);
    expect(onsets).toHaveLength(2);
    onsets.forEach((t, i) => expect(Math.abs(t - hits[i].at)).toBeLessThan(0.006));

    // The click does not enter the next interval: 80 ms later there is exact silence
    // (`CLICK_SECONDS` 0.05 plus 0.03). A note of the same instant would still sound
    // there (0.136 s plus the release). The click is an oscillator and not a buffer, so
    // its `stop()` gives that zero: without it, the epsilon where the exponential decay
    // ends would still sound here.
    const click = hits[1].at;
    expect(peakNear(d, click + 0.002)).toBeGreaterThan(0.1);
    expect(peakNear(d, click + CLICK_SECONDS + 0.03)).toBe(0);
  });

  it('AC-PLY-019 — the crossing of an occupied cell sounds its pitch, shorter and softer', async () => {
    const bpm = 110;
    const interval = intervalDuration(bpm);
    const rel = RELEASE_INTERVALS * interval;
    const state: ClockState = { origin: 0.2, scheduledUntil: 0 };
    // One piece and, four intervals later, a leg that enters an occupied cell, which
    // sounds F5 (MIDI 77).
    const hits = collectHits(0, 8 * interval, bpm, {
      steps: [{ offset: 0, notes: [A4] }],
      clicks: [{ offset: 4, note: 77 }],
      length: 8,
    }, state);
    expect(hits).toHaveLength(2);

    const ctx = offline(2);
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(ctx.destination);
    // The same dispatch that `tick()` makes. `tick()` cannot run here: `engine.ts`
    // touches the singleton of the AudioContext. The check is that, with those two
    // numbers, the crossing SOUNDS shorter and softer than a note.
    for (const h of hits) {
      if (h.kind === HIT.note) scheduleVoice(ctx, g, h.hz, h.at, NOTE_INTERVALS * interval, rel, VEL);
      else if (h.kind === HIT.cross) scheduleVoice(ctx, g, h.hz, h.at, GRACE_INTERVALS * interval, rel, GRACE_VELOCITY);
    }
    const d = (await ctx.startRendering()).getChannelData(0);

    const [nota, cruce] = [hits[0].at, hits[1].at];

    // It HAS a pitch, and the pitch is the one of the CELL: that separates it from the
    // click. The click has a pitch too, but one fixed pitch, a mark. The pitch of the
    // crossing comes from the musical model and changes with the cell that the leg
    // enters. It is measured in the sustain, after the transient.
    const hz = zeroCrossHz(d, cruce + 0.02, cruce + GRACE_INTERVALS * interval);
    expect(Math.abs(hz - midiToHz(77)) / midiToHz(77)).toBeLessThan(0.02);

    // SOFTER: 0.45 against 0.8, about -5 dB. The comparison is against the note rendered
    // in the same buffer and not against a number: a number would copy the constant.
    expect(peakNear(d, cruce + 0.003)).toBeLessThan(peakNear(d, nota + 0.003) * 0.7);
    expect(peakNear(d, cruce + 0.003)).toBeGreaterThan(0.2);

    // SHORTER: 0.75 + 0.88 intervals against 1 + 0.88. 1.75 intervals after the onset the
    // note still decays and the crossing is silent. The difference is 34 ms: it separates
    // a crossing from a note that has its own turn in the cycle.
    expect(peakNear(d, nota + 1.75 * interval)).toBeGreaterThan(0.02);
    expect(peakNear(d, cruce + 1.75 * interval)).toBe(0);
  });

  it('two notes that overlap add their amplitude', async () => {
    const render = async (freqs: number[]) => {
      const ctx = offline(1);
      const g = ctx.createGain();
      g.gain.value = 1;
      g.connect(ctx.destination);
      freqs.forEach(f => scheduleVoice(ctx, g, f, 0.1, 0.3, REL, 0.4));
      return (await ctx.startRendering()).getChannelData(0);
    };
    const solo = peakNear(await render([midiToHz(60)]), 0.2);
    const dueto = peakNear(await render([midiToHz(60), midiToHz(67)]), 0.2);

    // In the sustain each voice gives vel*sustain = 0.2. The voices add, but not in
    // phase, so the joint peak is between one voice alone and the theoretical maximum
    // of 0.4.
    expect(dueto).toBeGreaterThan(solo);
    expect(dueto).toBeLessThanOrEqual(0.4 + 1e-6);
    expect((await render([midiToHz(60)])).length).toBe(SR);
  });
});

describe('analyser', () => {
  it('AC-SPC-002 — the node is transparent: the signal that comes out is the same', async () => {
    // This does not check the analysis: getByteFrequencyData gives nothing useful
    // offline, which is why the mapping lives in spectrum-bars.ts. It checks the one part
    // that a test can assert without listening: the node in series does not change the
    // audio.
    const render = async (withAnalyser: boolean) => {
      const ctx = offline(1);
      const g = ctx.createGain();
      g.gain.value = 0.3;
      if (withAnalyser) {
        const an = ctx.createAnalyser();
        an.fftSize = FFT_SIZE;
        an.smoothingTimeConstant = SMOOTHING;
        g.connect(an);
        an.connect(ctx.destination);
      } else {
        g.connect(ctx.destination);
      }
      // 0.35 s is an arbitrary render duration: this test is about the transparency of
      // the analyser, not about the length of the note. That length is
      // NOTE_INTERVALS * intervalDuration(bpm), and no bpm applies here.
      scheduleVoice(ctx, g, midiToHz(60), 0.1, 0.35, REL, VEL);
      return (await ctx.startRendering()).getChannelData(0);
    };

    const directo = await render(false);
    const analizado = await render(true);
    expect(analizado.length).toBe(directo.length);
    for (let i = 0; i < directo.length; i++) {
      if (analizado[i] !== directo[i]) {
        throw new Error(`the analyser changed sample ${i}: ${directo[i]} -> ${analizado[i]}`);
      }
    }
  });
});
