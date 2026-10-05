import type { Sequence, ClockState } from './scheduler.ts';
import {
  midiToHz,
  scheduleVoice,
  scheduleClick,
  NOTE_INTERVALS,
  RELEASE_INTERVALS,
  GRACE_INTERVALS,
  GRACE_VELOCITY,
} from './voice.ts';
import { collectWindow, intervalDuration } from './scheduler.ts';
import { LOOKAHEAD, TICK_MS, HIT, CLOCK_START_DELAY, DEFAULT_BPM } from './scheduler.ts';
import { offsetAt } from './playhead-offset.ts';
import { FFT_SIZE, SMOOTHING } from '../spectrum/spectrum-bars.ts';

export const MASTER_GAIN = 0.3;

/** Seconds, not intervals: a scheduling latency does not scale with the tempo. */
export const PLAY_DELAY = 0.02;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;

/** It latches: a retry does not bring the sound back, it only logs the warning again. */
let fallado = false;

/** Lazy: a browser starts audio only inside a user gesture. Null when Web Audio is absent. */
export function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (fallado) return null;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;

    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  } catch (e) {
    // Clear the three together: a live `ctx` with a null `master` looks healthy to a caller.
    ctx = null;
    master = null;
    analyser = null;
    fallado = true;
    console.warn('Web Audio is not available', e);
    return null;
  }
  return ctx;
}

// Keep `<ArrayBuffer>`: later versions of TypeScript refuse a bare `Uint8Array` in
// `getByteFrequencyData`.
let freqBuf: Uint8Array<ArrayBuffer> | null = null;

/**
 * The returned array is reused between calls: copy it with `slice()` to keep it.
 * It reads `ctx`, not `audio()`: a draw loop must not create the context with no gesture.
 */
export function readSpectrum(): Uint8Array<ArrayBuffer> | null {
  if (!analyser || !ctx || ctx.state !== 'running') return null;
  if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
    freqBuf = new Uint8Array(analyser.frequencyBinCount);
  }
  analyser.getByteFrequencyData(freqBuf);
  return freqBuf;
}

export function playNotes(notes: number[]): void {
  const c = audio();
  if (!c || !master) return;
  const bus = master;
  const start = c.currentTime + PLAY_DELAY;
  const interval = intervalDuration(bpm);
  const dur = NOTE_INTERVALS * interval;
  const rel = RELEASE_INTERVALS * interval;
  notes.forEach((m, i) => scheduleVoice(c, bus, midiToHz(m), start + i * interval, dur, rel));
}

/** It resumes the context: call it from a user gesture. */
export function playNow(notes: number[]): void {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  playNotes(notes);
}

let active: Sequence = { steps: [], clicks: [], length: 0 };
let pending: Sequence | null = null;
const clock: ClockState = { origin: 0, scheduledUntil: 0 };
let timer: number | null = null;
let bpm = DEFAULT_BPM;

export const setBpm = (v: number): void => { bpm = v; };

/** The default lives also in the `useState` of `App.tsx`: change both. */
let clicksAudible = false;
export const setClicksAudible = (v: boolean): void => { clicksAudible = v; };

/** It queues the sequence: the sequence starts at the cycle boundary. */
export function setSequence(next: Sequence): void { pending = next; }

/** For a manual check from the browser console. */
export const sequenceInfo = (): { steps: number; clicks: number; crosses: number; length: number } => ({
  steps: active.steps.length,
  clicks: active.clicks.filter((c) => c.note === undefined).length,
  crosses: active.clicks.filter((c) => c.note !== undefined).length,
  length: active.length,
});

export const clockRunning = (): boolean => timer !== null;

/** `stopClock` and `startClock` do not reset it: a pause does not change the cycle. */
let cycleGen = 0;
export const cycleGeneration = (): number => cycleGen;

export function playheadOffset(): number | null {
  if (timer === null || !ctx || ctx.state !== 'running') return null;
  if (active.length <= 0) return null;
  const now = ctx.currentTime - outputLatency(ctx);
  // A swap leaves `origin` in the future while the tail of the old cycle sounds.
  if (now < clock.origin) return null;
  return offsetAt(now, clock.origin, intervalDuration(bpm), active.length);
}

// Firefox does not implement `outputLatency`, although `lib.dom.d.ts` declares it as a
// non-optional `number`.
function outputLatency(c: AudioContext): number {
  const out: number | undefined = c.outputLatency;
  if (typeof out === 'number' && Number.isFinite(out)) return out;
  const base: number | undefined = c.baseLatency;
  if (typeof base === 'number' && Number.isFinite(base)) return base;
  return 0;
}

function tick(c: AudioContext, bus: GainNode): void {
  const interval = intervalDuration(bpm);
  const dur = NOTE_INTERVALS * interval;
  const rel = RELEASE_INTERVALS * interval;
  const grace = GRACE_INTERVALS * interval;
  const w = collectWindow(c.currentTime, LOOKAHEAD, bpm, active, pending, clock);
  if (w.active !== active) cycleGen++;
  active = w.active;
  pending = w.pending;
  for (const hit of w.hits) {
    if (hit.kind === HIT.note) scheduleVoice(c, bus, hit.hz, hit.at, dur, rel);
    else if (hit.kind === HIT.cross) scheduleVoice(c, bus, hit.hz, hit.at, grace, rel, GRACE_VELOCITY);
    else if (clicksAudible) scheduleClick(c, bus, hit.at);
  }
}

export function startClock(): void {
  if (timer !== null) return;
  const c = audio();
  const bus = master;
  if (!c || !bus) return;
  if (c.state === 'suspended') void c.resume();
  clock.origin = c.currentTime + CLOCK_START_DELAY;
  // Strictly before `origin`: if not, the first onset of cycle 0 is skipped.
  clock.scheduledUntil = c.currentTime;
  timer = window.setInterval(() => tick(c, bus), TICK_MS);
}

export function stopClock(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}
