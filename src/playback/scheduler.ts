import { midiToHz } from './voice.ts';

/**
 * A scheduler with lookahead: it decides WHAT sounds and WHEN, and makes no sound.
 *
 * Like `voice.ts`, it does not know the singleton of the `AudioContext`: it gets the
 * times as parameters. So a test can call it with arbitrary instants and compare with
 * what is expected, with no dependence on real time.
 *
 * **The clock is an origin, not a cursor.** `ClockState` is two scalars, and the onsets
 * of the cycle, `origin + (k * cycle + offset) * interval`, are solved in closed form.
 * The period is the cycle, and the phase of an event is `offset / length`: a fraction
 * of the period. `firstOnsetAfter` knows a period and a phase, and nothing of the
 * circuit.
 *
 * **CAUTION with the two units.** `Sequence` speaks in INTERVALS (`offset` and `length`
 * are whole numbers of cells) and `ClockState` and `Hit.at` in SECONDS of the clock of
 * the context. The conversion is `intervalDuration(bpm)` and no type forces it: a
 * `length` added to an instant typechecks and sounds wrong.
 */

/**
 * One cycle ready to sound: all that the engine needs to know, and nothing more.
 *
 * The model is a CIRCUIT: a closed circuit visits the pieces, and the cells that it
 * crosses between one piece and the next sound as it passes. In the circuit a crossed
 * cell carries its cell and its instant, because there the circuit IS the model.
 *
 * Here the cell does not travel: the engine can sound pitches and does not know what a
 * board is. What crosses is the MIDI number, and a count of the crossed cells is not
 * enough: the circuit can enter an OCCUPIED cell and that crossing sounds the note of
 * the cell, so `clicks` carries its `note` in MIDI.
 *
 * So this shape is that of the circuit LESS `pieceId` and LESS `cell`:
 * `playback/engine-bridge.ts` is the only bridge between the two, and it gives the
 * sequence without those fields. It is a pure function with a test. It is a
 * PROJECTION, not a translation: the `offset`, the `notes` and the `note` of the
 * crossing travel as they are, in MIDI and with no new calculation. That holds only
 * while the two shapes stay structurally compatible.
 */
export interface Sequence {
  /**
   * Each stop of the circuit: the interval where it starts and the notes it plays.
   *
   * No `pieceId`: the engine has nobody to give it back to. The UI is what needs to
   * know which piece sounded, and the UI looks at the sequence of the circuit, not at
   * this one.
   */
  steps: { offset: number; notes: number[] }[];
  /**
   * The cells that the circuit crosses between one piece and the next. No `cell`: see
   * above.
   *
   * `note` present = the crossed cell is OCCUPIED, and the crossing sounds its pitch.
   * Absent = an empty cell, and the click sounds. It is in MIDI, the same unit as
   * `steps.notes`, and `collectHits` converts it to Hz.
   */
  clicks: { offset: number; note?: number }[];
  /**
   * The length of the whole cycle, in INTERVALS, the same unit as each `offset`.
   *
   * In intervals and not in seconds because the interval is the rhythmic unit of the
   * instrument (`intervalDuration(bpm) = barDuration(bpm) / 16`): so the circuit keeps
   * its shape at any tempo and is not tied to the bpm it was built with. Measured:
   * with 8 pieces the cycle is ~55 intervals, which is 7.5 s at 110 bpm.
   */
  length: number;
}

export interface ClockState {
  /** The instant where cycle 0 starts, on the clock of the context. */
  origin: number;
  /**
   * The instant up to which the onsets are already emitted.
   *
   * Without it each onset would be emitted four times: the timer wakes every 25 ms and
   * the horizon is 100 ms, so consecutive windows overlap.
   */
  scheduledUntil: number;
}

/**
 * The kind of event of a `Hit`.
 *
 * Derived from `HIT` and not an `enum`: `erasableSyntaxOnly` refuses enums, and it is
 * the same option that lets node load these modules with no build. Because it is
 * derived, a new kind of event is a change in one place.
 */
export type HitKind = (typeof HIT)[keyof typeof HIT];

/**
 * An event to sound: what sounds, and at what instant on the clock of the context.
 *
 * A discriminated union and NOT one object with `hz?: number`. The optional field would
 * let a click with a pitch, and a note without one, pass in silence: a construction
 * error would become an `undefined` that nobody looks at. The bug is not one of types:
 * the type does not force a decision.
 *
 * With the union, `kind` forces a choice and the compiler demands the `hz` in the
 * branch that carries it.
 *
 * The THIRD branch tests the same argument: the crossing carries a pitch, and the short
 * way out would be an `hz?: number` on the branch of the click. That is the same trap,
 * and a worse one, because `tick()` DISPATCHES by `kind`: `setClicksAudible` must
 * switch off the click and let the crossing sound, and with an optional field that
 * decision would be an `hz === undefined` that the compiler does not force anyone to
 * look at.
 *
 * `cross` and `note` have the same shape on purpose and do not collapse into one: what
 * tells them apart is not the data they carry but how they sound. The crossing is
 * shorter and softer (`GRACE_INTERVALS`, `GRACE_VELOCITY`), and `tick()` decides that
 * from the `kind`.
 */
export type Hit =
  | { kind: typeof HIT.note; hz: number; at: number }
  | { kind: typeof HIT.cross; hz: number; at: number }
  | { kind: typeof HIT.click; at: number };

/** The initial tempo. The engine and the state of the UI share it: it is one number. */
export const DEFAULT_BPM = 110;

/** The slowest and the fastest tempo, in bpm. The initial value is `DEFAULT_BPM`. */
export const TEMPO_MIN = 60;
export const TEMPO_MAX = 160;

/** How much future each turn of the timer schedules, in seconds. */
export const LOOKAHEAD = 0.1;

/** How often the timer wakes, in ms. It fires no note: it decides when to look. */
export const TICK_MS = 25;

/**
 * The beats of one bar. The instrument is in 4/4.
 *
 * Do not confuse it with the width of the board, which is not a fixed number either:
 * that one says how many cells there are, and this one says in how many beats the bar
 * divides. The board is a circuit and the engine does not look at it.
 */
export const BEATS_PER_BAR = 4;

/**
 * The number of parts in one beat. With 4, the unit is the sixteenth note.
 *
 * It is the finest grid of the instrument: all that is measured in time, the step of
 * the arpeggio and the duration of a note, is counted in intervals, not in seconds.
 * Because it is a constant and not a loose number, the subdivision changes in one place
 * and the arpeggio and the note stay in sync.
 */
export const SUBDIVISIONS_PER_BEAT = 4;

/**
 * The THREE kinds of sound event of the circuit: the note of a piece, the click and the
 * crossing.
 *
 * A piece plays the note. An empty cell that the circuit crosses between one piece and
 * the next gives the click. And the crossing of an OCCUPIED cell sounds the note of
 * that cell.
 *
 * Three keys and not two with an optional field: the long argument is in the docblock
 * of `Hit`. Also, `tick()` dispatches `cross` and `click` differently:
 * `setClicksAudible` switches off only the second, and without a discriminant it would
 * have nothing to switch off.
 *
 * A const object with a derived union (`HitKind`) and not an `enum`:
 * `erasableSyntaxOnly` refuses them, and it is the same option that lets node load
 * these modules with no build. The values are strings equal to their keys so that a
 * `Hit` is readable as it comes out in a log or in a test, with no number to translate.
 */
export const HIT = { note: 'note', click: 'click', cross: 'cross' } as const;

/**
 * The margin between the start of the clock and the start of cycle 0.
 *
 * It gives the first turn of the timer (25 ms) time to come before the first onset. If
 * the timer is later than this, the start of cycle 0 is skipped and not recovered,
 * consistent with the rest of the clock.
 *
 * In SECONDS for the same reason as `PLAY_DELAY`: it is measured against `TICK_MS`,
 * which is a latency of the timer, not against the beat.
 */
export const CLOCK_START_DELAY = 0.05;

/**
 * The duration of one bar, in seconds. The 60 converts minutes to seconds.
 *
 * Exported because it is a rule, not a detail: anyone who wants to know how long `n`
 * bars last at a given tempo needs it, and to write it again is to have two definitions
 * of the bar.
 */
export const barDuration = (bpm: number): number => (60 / bpm) * BEATS_PER_BAR;

/**
 * The duration of one interval, the rhythmic unit of the instrument, in seconds.
 *
 * Defined ON barDuration and not with its own formula: so there is one place where the
 * bar becomes seconds, and the interval cannot drift from the bar that it divides.
 *
 * Exported for the same reason as barDuration: it is a rule, not a detail. A step of
 * the arpeggio that is a constant in seconds (0.15) does not look at the tempo: the
 * arpeggio of 5 notes lasts 4 * 0.15 = 0.6 s at any bpm, 25 % of the bar at 100 bpm but
 * 40 % at 160, where the baseline showed that the pieces overlap. Derived from the bar,
 * the arpeggio always lasts `bar / 4` (1.000 s at 60 bpm, 0.375 s at 160) and its share
 * of the bar does not depend on the tempo. At 100 bpm the interval is exactly 0.15 s.
 */
export const intervalDuration = (bpm: number): number =>
  barDuration(bpm) / (BEATS_PER_BAR * SUBDIVISIONS_PER_BEAT);

/**
 * The first onset of a periodic progression strictly after `after`.
 *
 * **The parameter is named `bar`, and what it gets is the CYCLE.** The period is the
 * cycle of the circuit, and `phase` is `offset / sequence.length`. Written as a
 * fraction of the period, the progression is the same for a bar and for a cycle, so
 * this function knows a period and a phase and nothing more.
 *
 * `floor(x) + 1` and not `ceil(x)`: the aim is the first k with onset > after, not >=.
 * With `ceil`, an onset that falls exactly on the edge of a window would be emitted
 * twice: when one window closes and when the next one opens.
 *
 * `k` can be negative if `after` is before the origin, and that is correct: the
 * progression is defined for every k. It happens only in the first window after
 * startClock, with phases near 1, and at most it emits the tail of cycle -1 in the 50
 * ms before the first onset. It never gives an onset before `after`, which is the
 * property that matters.
 */
function firstOnsetAfter(after: number, origin: number, bar: number, phase: number): number {
  const k = Math.floor((after - origin) / bar - phase) + 1;
  return origin + (k + phase) * bar;
}

/**
 * Decides WHAT sounds and WHEN, and makes no sound.
 *
 * Its separation from scheduleVoice makes the scheduler testable: a test can call it
 * with arbitrary times and compare with what is expected, with no dependence on real
 * time.
 *
 * The onsets of a step are the progression `origin + (k + offset / length) * cycle`.
 * The first `k` is solved in closed form, not with a cursor that advances. So each step
 * has its own place in the circuit and a whole cycle is never emitted at once: **never
 * more than `horizon` of audio is committed**, so a pause stops the scheduling inside
 * the lookahead. It matters because the cycle is long: with 8 pieces it is 7.5 s at 110
 * bpm.
 *
 * The clicks and the crossings are on the same grid as the steps and come from the same
 * calculation. The only difference is that they have no notes to expand, so each one
 * gives one event for each onset. They are of two kinds, empty cell or occupied cell,
 * and this function decides which: the one below (`collectWindow`) only joins cycles,
 * and `engine.ts` only dispatches what comes out of here.
 *
 * It mutates `state.scheduledUntil`.
 */
export function collectHits(
  fromTime: number,
  horizon: number,
  bpm: number,
  sequence: Sequence,
  state: ClockState,
): Hit[] {
  const until = fromTime + horizon;
  const out: Hit[] = [];

  // To start from scheduledUntil avoids emitting again what the last window gave. To
  // start from fromTime when the clock is ahead DROPS the cycles lost to the throttling
  // of the tab and does not try to recover them. This replaces an explicit recovery
  // guard: there is no loop to bound, because the first k comes in closed form and to
  // skip 10 cycles costs the same as to skip 1.
  const from = Math.max(state.scheduledUntil, fromTime);
  // Without this cut, a window smaller than the last one would move scheduledUntil
  // BACK and what was emitted would come out again. It also makes a negative horizon
  // harmless, which is how collectWindow bounds the old cycle when the boundary is
  // already behind.
  if (from >= until) return out;

  // The guard of the empty cycle: the period is `length * interval`, which is 0, and
  // firstOnsetAfter divides by it. It is the real state of "I removed the last piece",
  // not a theoretical case. With `<= 0` and not `=== 0` because a negative period does
  // not divide by zero, but it makes `at += cycle` go back: the loop does not end. The
  // clock still advances: the guard is against the division, not a reason to freeze
  // it.
  if (sequence.length <= 0) {
    state.scheduledUntil = until;
    return out;
  }

  // It depends only on the bpm of this call, so it is calculated once and not for each
  // note: inside the forEach it would be 5 divisions for each step and each cycle of
  // the window.
  const interval = intervalDuration(bpm);
  const cycle = sequence.length * interval;

  for (const step of sequence.steps) {
    // `at += cycle` accumulates floating-point error. What makes it harmless is that
    // each call calculates the first onset from origin again: there is no drift
    // BETWEEN calls, which is where it would matter. Also, when tick() calls it the
    // loop makes at most one turn: a horizon of 0.1 s against the shortest measured
    // cycle, 2.5 s with two pieces. But that is a property of THAT caller and not of
    // the function: with a horizon of several cycles it makes several turns, and the
    // tests use it so on purpose.
    for (let at = firstOnsetAfter(from, state.origin, cycle, step.offset / sequence.length); at <= until; at += cycle) {
      step.notes.forEach((m, i) => out.push({ kind: HIT.note, hz: midiToHz(m), at: at + i * interval }));
    }
  }

  for (const click of sequence.clicks) {
    // Outside the loop for the same reason as `interval`: the kind of the event and its
    // pitch do not depend on the cycle it falls in, and the loop can make several
    // turns with a horizon of several cycles. `null` and not `undefined` so that the
    // branch that chooses the `kind` is a comparison and not a read of a field that
    // can be absent.
    const hz = click.note === undefined ? null : midiToHz(click.note);
    for (let at = firstOnsetAfter(from, state.origin, cycle, click.offset / sequence.length); at <= until; at += cycle) {
      // The third kind of event starts here. The crossing of an OCCUPIED cell sounds
      // the note of that cell, and the engine must tell it from the click: `tick()`
      // schedules them with different constants and `setClicksAudible` switches off
      // only the click.
      out.push(hz === null ? { kind: HIT.click, at } : { kind: HIT.cross, hz, at });
    }
  }

  state.scheduledUntil = until;
  return out;
}

/**
 * One whole turn of the timer: it collects the window and, if a sequence is queued,
 * starts it at the cycle BOUNDARY.
 *
 * It lives here and not in `engine.ts` for a measurable reason: `engine.ts` touches the
 * singleton of the `AudioContext`, which a node test does not have, so what is written
 * there needs a browser to run. The join of the swap is the most delicate part of the
 * model, and it is just the part that a test must assert with exact instants.
 * `engine.ts` stays as the wiring: it calls this function and sends the events to
 * sound.
 *
 * It returns the resulting sounding and queued sequences and does not mutate them: the
 * caller holds them, and this module has no state of its own.
 *
 * It mutates `state` (origin and scheduledUntil).
 */
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
      // With no sounding cycle there is no boundary to wait for: the queued sequence
      // starts NOW. Without this case the first piece would never sound, because
      // there is no cycle to end. The two scalars are set as in startClock and for
      // the same reason: scheduledUntil strictly BEFORE origin. Otherwise
      // firstOnsetAfter, which gives the first onset AFTER what is emitted, skips the
      // onset that falls exactly on origin, and the first sound is lost in silence,
      // with no error.
      vigente = enEspera;
      enEspera = null;
      state.origin = fromTime + CLOCK_START_DELAY;
      state.scheduledUntil = fromTime;
    } else {
      const interval = intervalDuration(bpm);
      const cycle = vigente.length * interval;
      // What is already committed: the same count as collectHits, so that the boundary
      // falls after all that the old sequence scheduled.
      const from = Math.max(state.scheduledUntil, fromTime);
      // `floor + 1` and not `ceil`, like firstOnsetAfter: the first boundary STRICTLY
      // after what is committed. With floor, to skip 10 cycles for a hidden tab costs
      // the same as to skip 1, and `borde > from >= fromTime` is guaranteed: the swap
      // is decided BEFORE the boundary is crossed, inside the lookahead, so no onset
      // of the new cycle is scheduled in the past or lost for a late look.
      const borde = state.origin + (Math.floor((from - state.origin) / cycle) + 1) * cycle;

      if (borde <= fromTime + horizon) {
        // Half an interval before the boundary, and not the exact boundary: the onsets
        // fall on `origin + integer * interval`, so that half interval holds none. The
        // old cycle loses nothing, but the boundary is OUTSIDE its window. Without
        // this, the old sequence schedules its own onset of offset 0 on the boundary,
        // the new one schedules its own at the same instant, and the two sound: that
        // is the "no event doubled" half of the swap.
        const corte = borde - interval / 2;
        hits.push(...collectHits(fromTime, corte - fromTime, bpm, vigente, state));

        vigente = enEspera;
        enEspera = null;
        state.origin = borde;
        // And the other half, "no event lost": the swap leaves scheduledUntil strictly
        // BEFORE the new origin. Otherwise firstOnsetAfter skips the onset that falls
        // exactly on the boundary, and the new cycle starts after its own start.
        //
        // Written as an assignment and not as a `Math.min`: the invariant already
        // holds alone, because `borde` is chosen after all that is committed, so
        // scheduledUntil never passes it. Measured: with this line removed no test
        // breaks. It stays because it is the POSTCONDITION that keeps the first onset,
        // and it must not depend on how the boundary was derived three lines above. To
        // lower it cannot double an event either: in (corte, borde) there are no
        // onsets, of the old sequence or of the new one.
        state.scheduledUntil = corte;
      }
    }
  }

  hits.push(...collectHits(fromTime, horizon, bpm, vigente, state));
  return { hits, active: vigente, pending: enEspera };
}
