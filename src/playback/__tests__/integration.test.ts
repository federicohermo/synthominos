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

/** 0.12 s: the release at 110 bpm. */
const REL = RELEASE_INTERVALS * intervalDuration(110);

describe('scheduler + synthesis together', () => {
  it('AC-PLY-010 — the hits sound where the scheduler said (+-6 ms)', async () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
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

    // The `stop()` of the oscillator gives an exact zero, not the epsilon where the decay ends.
    const click = hits[1].at;
    expect(peakNear(d, click + 0.002)).toBeGreaterThan(0.1);
    expect(peakNear(d, click + CLICK_SECONDS + 0.03)).toBe(0);
  });

  it('AC-PLY-019 — the crossing of an occupied cell sounds its pitch, shorter and softer', async () => {
    const bpm = 110;
    const interval = intervalDuration(bpm);
    const rel = RELEASE_INTERVALS * interval;
    const state: ClockState = { origin: 0.2, scheduledUntil: 0 };
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
    for (const h of hits) {
      if (h.kind === HIT.note) scheduleVoice(ctx, g, h.hz, h.at, NOTE_INTERVALS * interval, rel, VEL);
      else if (h.kind === HIT.cross) scheduleVoice(ctx, g, h.hz, h.at, GRACE_INTERVALS * interval, rel, GRACE_VELOCITY);
    }
    const d = (await ctx.startRendering()).getChannelData(0);

    const [nota, cruce] = [hits[0].at, hits[1].at];

    const hz = zeroCrossHz(d, cruce + 0.02, cruce + GRACE_INTERVALS * interval);
    expect(Math.abs(hz - midiToHz(77)) / midiToHz(77)).toBeLessThan(0.02);

    expect(peakNear(d, cruce + 0.003)).toBeLessThan(peakNear(d, nota + 0.003) * 0.7);
    expect(peakNear(d, cruce + 0.003)).toBeGreaterThan(0.2);

    // At 1.75 intervals the crossing is over (0.75 + 0.88) and the note is not (1 + 0.88).
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

    // Each voice sustains at vel * sustain = 0.2: two voices in phase give 0.4.
    expect(dueto).toBeGreaterThan(solo);
    expect(dueto).toBeLessThanOrEqual(0.4 + 1e-6);
    expect((await render([midiToHz(60)])).length).toBe(SR);
  });
});

describe('analyser', () => {
  it('AC-SPC-002 — the node is transparent: the signal that comes out is the same', async () => {
    // `getByteFrequencyData` gives nothing useful offline, so only the transparency is tested.
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
