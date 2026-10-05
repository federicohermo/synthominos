import { midiToHz } from './voice.ts';

/**
 * `offset` and `length` are intervals. `ClockState` and `Hit.at` are seconds of the clock
 * of the context. No type forces the conversion, `intervalDuration(bpm)`.
 */
export interface Sequence {
  steps: { offset: number; notes: number[] }[];
  /** With `note`, in MIDI, the crossed cell is occupied. Without it, the cell is empty. */
  clicks: { offset: number; note?: number }[];
  length: number;
}

export interface ClockState {
  origin: number;
  scheduledUntil: number;
}

export type HitKind = (typeof HIT)[keyof typeof HIT];

export type Hit =
  | { kind: typeof HIT.note; hz: number; at: number }
  | { kind: typeof HIT.cross; hz: number; at: number }
  | { kind: typeof HIT.click; at: number };

export const DEFAULT_BPM = 110;

export const TEMPO_MIN = 60;
export const TEMPO_MAX = 160;

/** Seconds. */
export const LOOKAHEAD = 0.1;

export const TICK_MS = 25;

export const BEATS_PER_BAR = 4;

export const SUBDIVISIONS_PER_BEAT = 4;

export const HIT = { note: 'note', click: 'click', cross: 'cross' } as const;

/** Seconds. More than `TICK_MS`, so that the first turn of the timer comes before cycle 0. */
export const CLOCK_START_DELAY = 0.05;

/** Seconds. */
export const barDuration = (bpm: number): number => (60 / bpm) * BEATS_PER_BAR;

/** Seconds. */
export const intervalDuration = (bpm: number): number =>
  barDuration(bpm) / (BEATS_PER_BAR * SUBDIVISIONS_PER_BEAT);

function firstOnsetAfter(after: number, origin: number, bar: number, phase: number): number {
  // `floor + 1`, not `ceil`: an onset on the edge of a window would be emitted twice.
  const k = Math.floor((after - origin) / bar - phase) + 1;
  return origin + (k + phase) * bar;
}

/** It mutates `state.scheduledUntil`. */
export function collectHits(
  fromTime: number,
  horizon: number,
  bpm: number,
  sequence: Sequence,
  state: ClockState,
): Hit[] {
  const until = fromTime + horizon;
  const out: Hit[] = [];

  // `fromTime` drops the cycles that a throttled tab lost.
  const from = Math.max(state.scheduledUntil, fromTime);
  // `collectWindow` passes a negative horizon when the boundary is already behind.
  if (from >= until) return out;

  // `<= 0`: a zero period divides by zero, and with a negative one the loop does not end.
  if (sequence.length <= 0) {
    state.scheduledUntil = until;
    return out;
  }

  const interval = intervalDuration(bpm);
  const cycle = sequence.length * interval;

  for (const step of sequence.steps) {
    for (let at = firstOnsetAfter(from, state.origin, cycle, step.offset / sequence.length); at <= until; at += cycle) {
      step.notes.forEach((m, i) => out.push({ kind: HIT.note, hz: midiToHz(m), at: at + i * interval }));
    }
  }

  for (const click of sequence.clicks) {
    const hz = click.note === undefined ? null : midiToHz(click.note);
    for (let at = firstOnsetAfter(from, state.origin, cycle, click.offset / sequence.length); at <= until; at += cycle) {
      out.push(hz === null ? { kind: HIT.click, at } : { kind: HIT.cross, hz, at });
    }
  }

  state.scheduledUntil = until;
  return out;
}

/** It mutates `state`. */
export function collectWindow(
  fromTime: number,
  horizon: number,
  bpm: number,
  active: Sequence,
  pending: Sequence | null,
  state: ClockState,
): { hits: Hit[]; active: Sequence; pending: Sequence | null } {
  const hits: Hit[] = [];
  let vigente = active;
  let enEspera = pending;

  if (enEspera !== null) {
    if (vigente.length <= 0) {
      // `scheduledUntil` strictly before `origin`: if not, the onset on `origin` is skipped.
      vigente = enEspera;
      enEspera = null;
      state.origin = fromTime + CLOCK_START_DELAY;
      state.scheduledUntil = fromTime;
    } else {
      const interval = intervalDuration(bpm);
      const cycle = vigente.length * interval;
      const from = Math.max(state.scheduledUntil, fromTime);
      const borde = state.origin + (Math.floor((from - state.origin) / cycle) + 1) * cycle;

      if (borde <= fromTime + horizon) {
        // Half an interval before the boundary: if not, the old cycle schedules its offset 0
        // on the boundary and the event sounds twice.
        const corte = borde - interval / 2;
        hits.push(...collectHits(fromTime, corte - fromTime, bpm, vigente, state));

        vigente = enEspera;
        enEspera = null;
        state.origin = borde;
        // No test fails without this line. It keeps `scheduledUntil` strictly before the
        // new `origin`.
        state.scheduledUntil = corte;
      }
    }
  }

  hits.push(...collectHits(fromTime, horizon, bpm, vigente, state));
  return { hits, active: vigente, pending: enEspera };
}
