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

/**
 * The application layer of the audio: the singletons and the API that the UI uses.
 *
 * It is the only one of the three layers that touches the global `AudioContext`.
 * `voice.ts` and `scheduler.ts` get it as a parameter and do not import this module.
 * The import graph holds that separation, and it lets an OfflineAudioContext render
 * them.
 *
 * It is NOT a barrel: it does not re-export voice or scheduler as a block.
 */

/** The gain of the master bus. */
export const MASTER_GAIN = 0.3;

/**
 * The margin of an immediate play, so that nothing is scheduled in the past.
 *
 * In SECONDS and not in intervals, unlike everything musical (`NOTE_INTERVALS`,
 * `RELEASE_INTERVALS`, the offsets of the sequence). This is not music. It is a
 * SCHEDULING latency: how much future an event needs so that it is not late. It has no
 * relation to the beat and must not scale with the tempo: at 60 bpm a larger margin
 * gives nothing, and at 160 bpm a smaller one is still not enough. It is the same
 * deliberate exception as `CLICK_SECONDS`, for another reason.
 */
export const PLAY_DELAY = 0.02;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;

/**
 * Whether the build of the graph failed. It is state, not configuration: it starts as
 * false and the `catch` of `audio()` sets it. The docblock below says why it latches.
 */
let fallado = false;

/**
 * The AudioContext of the module: one for each tab, not one for each component instance.
 *
 * It is created lazily, because browsers require a user gesture to start audio.
 *
 * It returns null if the browser has no Web Audio: the app stays usable but silent, and
 * each caller must check it.
 *
 * ## A PARTIAL failure cannot leave the context alive
 *
 * `ctx` is assigned BEFORE the gain and the analyser are created. So anything that
 * throws after `new AudioContext()` leaves through the `catch` and returns null, but
 * the context is already assigned. If the `catch` did not clear it, the next call would
 * enter through `if (ctx) return ctx` and answer a context with `master` as null. A
 * caller that checks only the context would take it as healthy: the clock would start,
 * `clockRunning()` would become `true`, `alternarTransporte` would believe it and the
 * play button would offer pause, while no note sounds. It is the soft failure that this
 * layer makes every caller check, and it would enter through the only door the caller
 * cannot see: the caller asks if the engine started, and the engine answers yes.
 *
 * So the `catch` clears the three references together. The half-built context is NOT
 * closed: `close()` returns a promise, and that needs an empty rejection handler that
 * never runs. That is one function without coverage against the threshold of 100, and
 * the repo has no way to silence it. The context stays alive with no reference.
 *
 * ## The flag LATCHES, and that is the price
 *
 * Without it, each call tries the constructor again and logs the warning again: one
 * click, one warning. With it, the app stays silent until a reload, also when the cause
 * was transient. Two reasons make that acceptable. The retry does not bring the sound
 * back either: all it adds is that warning for each click. And a state that recovers
 * alone is a state that nobody can reproduce.
 */
export function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (fallado) return null;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;

    // The analyser goes BETWEEN the master and the destination, not on a parallel
    // branch: so it sees exactly the mix that goes to the speakers. It is transparent
    // to the audio, it does not change the signal that passes through it, so it does
    // not change how anything sounds.
    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  } catch (e) {
    // The three together: a live `ctx` with `master` as null is the degraded state
    // that the docblock describes, and the only one the UI cannot tell from a healthy
    // one.
    ctx = null;
    master = null;
    analyser = null;
    fallado = true;
    console.warn('Web Audio is not available', e);
    return null;
  }
  return ctx;
}

/**
 * The read buffer of the spectrum. See the warning in readSpectrum().
 *
 * The `<ArrayBuffer>` is written and CANNOT be simplified to a bare `Uint8Array`,
 * although today's `pnpm typecheck` accepts it. From TypeScript 5.7 the typed arrays
 * are generic in their buffer, and a bare `Uint8Array` means
 * `Uint8Array<ArrayBufferLike>`, which includes `SharedArrayBuffer`. The `lib.dom.d.ts`
 * of 5.8.3, the version pinned in the repo, still declares
 * `getByteFrequencyData(array: Uint8Array)`, so it compiles. Later versions narrow it
 * to `Uint8Array<ArrayBuffer>`, and there the bare form is a TS2345. Measured: green
 * with 5.8.3 and an error with 7.0.2 on this same line, so an editor can flag it while
 * the repo is green.
 *
 * To write it is not defensive: `new Uint8Array(n)` ALWAYS allocates an `ArrayBuffer`,
 * so this is the real type of the value, and the bare form says more than is true. It
 * is also the only way out that keeps the "zero `any`, zero `@ts-ignore`" of the repo.
 *
 * `binsToBars` takes the wide `Uint8Array` on purpose: it only reads, so it has no
 * reason to refuse a shared buffer. The narrowing belongs to the caller of the browser
 * API, not to the consumer of the numbers.
 */
let freqBuf: Uint8Array<ArrayBuffer> | null = null;

/**
 * The frequency magnitudes of the last processed block, 0-255 for each bin.
 *
 * It returns null when there is no signal to look at yet: with no context (nobody
 * clicked yet) or with the context suspended. That is useful to the caller: an array of
 * zeros and "there is no audio" are drawn differently. It also avoids creating the
 * AudioContext from the draw loop, which runs without a user gesture.
 *
 * CAUTION: the Uint8Array is reused between calls, so that nothing is allocated 60
 * times a second. A caller that keeps it sees it change underneath. The intended
 * consumer is a draw loop, which reads it and drops it in the same frame. To keep it,
 * copy it with slice().
 */
export function readSpectrum(): Uint8Array<ArrayBuffer> | null {
  if (!analyser || !ctx || ctx.state !== 'running') return null;
  if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
    freqBuf = new Uint8Array(analyser.frequencyBinCount);
  }
  analyser.getByteFrequencyData(freqBuf);
  return freqBuf;
}

/**
 * Plays an arpeggio on the singleton, immediately.
 *
 * It is NOT the only path from note to sound: tick() calls scheduleVoice() directly,
 * because collectHits already returned the expanded instants, and a pass through here
 * would calculate again the spacing that the scheduler already applied.
 *
 * The two paths share the RHYTHM, not only the timbre: the step of the arpeggio, the
 * duration of the note and its release come from intervalDuration with the bpm of this
 * module, here and in tick(). It is one rule and it follows the bpm. A fixed number of
 * seconds copied in the two places would ignore the tempo, and somebody would have to
 * keep the two equal.
 *
 * What is NOT unified is HOW the arpeggio is expanded: a change to the line below does
 * not reach the cycle, and a change to collectHits does not reach here. A change of the
 * timbre in DEFAULT_VOICE does reach the two.
 */
export function playNotes(notes: number[]): void {
  const c = audio();
  // ## Why the guard keeps its two halves
  //
  // The second half is not reachable from outside: the `catch` of `audio()` clears
  // `ctx` and `master` together, so a live context implies a live master. It stays
  // because it stops a FUTURE failure (a new line between the assignment of `ctx` and
  // that of the master, or a path that does not exist yet) from reaching
  // `scheduleVoice` with a null destination, and because the narrowing of the `const`
  // below comes from it.
  //
  // It has this comment because an "unreachable branch" is just what the repo asks to
  // delete: this is the argued exception. It can stay written because coverage does
  // not flag it: the `return` DOES run, through the first half, with Web Audio absent,
  // and the second half is evaluated on each arpeggio. In `tick()` that is not so, and
  // the guard lives in `startClock`: the docblock of `tick()` has the argument.
  if (!c || !master) return;
  // `bus` and not a `!` on `master`: the `forEach` below is a closure, and there
  // TypeScript loses the narrowing, because `master` is a module `let` and any call in
  // between could reassign it. The const freezes it, and the repo forbids the non-null
  // assertion for the same reason as `any`.
  const bus = master;
  const start = c.currentTime + PLAY_DELAY;
  const interval = intervalDuration(bpm);
  const dur = NOTE_INTERVALS * interval;
  const rel = RELEASE_INTERVALS * interval;
  notes.forEach((m, i) => scheduleVoice(c, bus, midiToHz(m), start + i * interval, dur, rel));
}

/** Plays immediately and resumes the context. Call it from a user gesture. */
export function playNow(notes: number[]): void {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  playNotes(notes);
}

// ## Clock

/**
 * The sounding sequence, and the queued sequence that starts when this cycle ends.
 *
 * Two and not one: to place or to remove a piece does not interrupt what sounds.
 * `collectWindow` changes one for the other, at the cycle boundary.
 */
let active: Sequence = { steps: [], clicks: [], length: 0 };
let pending: Sequence | null = null;
const clock: ClockState = { origin: 0, scheduledUntil: 0 };
let timer: number | null = null;
let bpm = DEFAULT_BPM;

export const setBpm = (v: number): void => { bpm = v; };

/**
 * Whether the clicks of the sequence sound. It is MIX, not model.
 *
 * It lives here and not in the sequence for that reason: to switch them off does not
 * change the sequence. The clicks stay in the `Sequence` and `collectHits` still emits
 * them; `tick()` only stops wiring them to sound. To filter them before would make the
 * sequence be built again for something that the board does not decide, and the cycle
 * would look different with the volume.
 *
 * It is a loose parameter on purpose: if it disturbs, it goes down or off, and the
 * model is not touched. It comes from listening: the clicks of a long jump pile up and
 * cover the phrase.
 *
 * **Only the clicks.** A crossing sounds the note of the crossed cell, and that is
 * MODEL: it is the crossed piece that answers, not a decoration of the mix. So `tick()`
 * dispatches it through its own branch of `kind` and this switch does not touch it. To
 * switch it off would make the sequence say that it crossed an empty cell where it
 * crossed a piece. It is also the reason why `HIT` has three keys and not two with an
 * optional field: without a discriminant, this function would have nothing to switch
 * off.
 *
 * **It starts as `false`**, and this is the second place where that default lives. The
 * other is the `useState` of `App.tsx`, which `useMotorSincronizado`
 * (`playback/use-engine.ts`) sends to the engine in its mount effect. That one
 * overwrites the other does not make a disagreement harmless: it is the same value
 * declared twice, exactly what `App.tsx` avoids for the tempo when it takes
 * `DEFAULT_BPM`. The reason for the default is written where the user sees it, in
 * `App.tsx`.
 */
let clicksAudible = false;
export const setClicksAudible = (v: boolean): void => { clicksAudible = v; };

/**
 * Queues the new sequence. It does NOT touch what sounds: the new sequence starts at
 * the cycle boundary.
 *
 * The wait for the boundary lets the whole circuit change its order, and the pattern
 * does not jump in the middle of a phrase.
 *
 * The price is measured, and it is the most expensive decision of the circuit model:
 * with 8 pieces at 110 bpm the cycle lasts 7.5 s, so a piece just placed can take that
 * long to sound inside the cycle. What sounds at once is its arpeggio, through the
 * other path to sound (`playNotes`).
 *
 * Only the last one is kept: two changes before the boundary count as one, because
 * what is queued is the WHOLE sequence and not a delta.
 */
export function setSequence(next: Sequence): void { pending = next; }

/**
 * The SOUNDING sequence in numbers, exposed for a manual check from the console.
 *
 * It reports the sounding sequence and not the queued one: to ask the engine what it
 * scheduled and get what it has not scheduled yet would be worse than no function.
 */
// `clicks` and `crosses` apart: the `clicks` field of the `Sequence` mixes the two, but
// the engine tells them apart (`setClicksAudible` switches one off and not the other),
// and this function exists to look at the engine without hearing it. One number would
// make the reader listen to know which is which, and that is what cannot be done.
export const sequenceInfo = (): { steps: number; clicks: number; crosses: number; length: number } => ({
  steps: active.steps.length,
  clicks: active.clicks.filter((c) => c.note === undefined).length,
  crosses: active.clicks.filter((c) => c.note !== undefined).length,
  length: active.length,
});

export const clockRunning = (): boolean => timer !== null;

/**
 * How many times the engine started a new sounding sequence since the module loaded.
 *
 * It is the only thing that knows the exact INSTANT when the new cycle starts to sound.
 * The UI has the sounding/queued pair of the circuit (`playback/route-source.ts`) but
 * cannot derive the boundary: `collectWindow` decides the swap inside the lookahead,
 * half an interval before the boundary, and no count over `placed` sees it come.
 *
 * It starts at 0 and stopClock/startClock do NOT reset it: a pause does not change
 * which cycle is in force, so a reset would make the UI believe in a swap that did not
 * happen.
 */
let cycleGen = 0;
export const cycleGeneration = (): number => cycleGen;

/**
 * The interval of the cycle where the playhead is, or null if there is nothing to mark.
 *
 * It returns null when paused, with no context, with a context that is not running,
 * with an empty sounding sequence, and BEFORE the sounding sequence starts to sound
 * (see below). That is information and not a failure, like `readSpectrum()` at rest:
 * "there is no playhead" and "the playhead is at 0" are drawn differently.
 *
 * It reads `ctx` and not `audio()` for the same reason as readSpectrum: the intended
 * caller is a draw loop, and to create the AudioContext from there would be to do it
 * without a user gesture.
 *
 * It looks at the SOUNDING sequence, not the queued one: the playhead must follow what
 * sounds. `playback/route-source.ts` makes the UI draw the correct circuit under it.
 *
 * ## `now < origin` is "not started yet", and there is nothing to draw there
 *
 * `collectWindow` starts the queued sequence INSIDE the lookahead and leaves `origin`
 * on the boundary, which is in the future at that moment: measured, up to 82 ms at 110
 * bpm, plus the output latency. In that window the sounding sequence is already the
 * new one, but what is heard is still the tail of the old one, which stays scheduled
 * up to half an interval before the boundary. The same happens at the first start,
 * with the 50 ms of `CLOCK_START_DELAY`.
 *
 * Without this cut, `offsetAt` answers the TAIL of the new cycle, `cycle - 1`, which is
 * correct for a total function. But that number is the MAXIMUM possible, and it takes
 * the veil off the five cells in `playhead-loop.ts` at once: the cells never lose the
 * veil one by one, not after a placement with the cycle running and not after play. A
 * test of `scheduler.test.ts` pins the cause: the swap leaves `origin` in the future.
 *
 * The price is that the playhead goes off for that window at each swap. That is
 * correct: the old sequence ended and the new one has not started, so any cell drawn
 * there would be a lie.
 */
export function playheadOffset(): number | null {
  if (timer === null || !ctx || ctx.state !== 'running') return null;
  if (active.length <= 0) return null;
  const now = ctx.currentTime - outputLatency(ctx);
  if (now < clock.origin) return null;
  return offsetAt(now, clock.origin, intervalDuration(bpm), active.length);
}

/**
 * How long it takes to hear what is scheduled at `currentTime`. If it is not
 * subtracted, the playhead is always early, and on an instrument the image seems to lie.
 *
 * The chain `outputLatency` → `baseLatency` → 0 is NOT redundant, although the type
 * says so: `lib.dom.d.ts` declares `outputLatency` as a non-optional `number`, but
 * Firefox does not implement it and there the property is `undefined`. So the two reads
 * are typed by hand as `number | undefined`, and not hidden with an `any` or a
 * `@ts-ignore`, which the repo forbids: the fallback must survive a TypeScript that
 * believes it is not necessary.
 *
 * The node tests run on node-web-audio-api, where these numbers describe no real
 * output. `engine.browser.test.tsx` tests the chain. The size of the latency is
 * checked in the browser and by ear.
 */
function outputLatency(c: AudioContext): number {
  const out: number | undefined = c.outputLatency;
  if (typeof out === 'number' && Number.isFinite(out)) return out;
  const base: number | undefined = c.baseLatency;
  if (typeof base === 'number' && Number.isFinite(base)) return base;
  return 0;
}

/**
 * The wiring to sound of one lookahead window.
 *
 * ## It gets the destination as a parameter, and that is NOT cosmetic
 *
 * A guard like that of `playNotes` (`const c = audio(); if (!c || !master) return;`)
 * has a `return` that cannot run here. The `catch` of `audio()` clears `ctx` together
 * with `master`, the timer exists only after `audio()` answered, and from then the pair
 * cannot split.
 *
 * The guard lives in the only place where it is reachable: `startClock`, which runs
 * with Web Audio absent. Here the signature replaces it. The signature is stronger
 * than the guard: nobody has to remember the check, the call does not compile without
 * the pair. It is also what the repo asks for an unreachable branch: make it reachable
 * or delete it, never silence it. Measured: the guard written here gives one statement
 * and one branch uncovered against the threshold of 100, in its two forms: the `return`
 * of the negated `if`, and the implicit `else` of the positive `if`.
 */
function tick(c: AudioContext, bus: GainNode): void {
  // The bpm does not change inside one turn, so the duration and the release are
  // calculated once, and all the notes of this window are measured against one tempo.
  const interval = intervalDuration(bpm);
  const dur = NOTE_INTERVALS * interval;
  const rel = RELEASE_INTERVALS * interval;
  // The crossing shares the release with the note. What sets it apart is the shorter
  // body and the lower amplitude, not another timbre, so only its `dur` is its own.
  // See GRACE_INTERVALS: below 0.75 the envelope breaks at the fastest tempo of the
  // instrument.
  const grace = GRACE_INTERVALS * interval;
  // All the decision, the swap at the cycle boundary included, lives in the scheduler,
  // which a test can run. Here stays the wiring to sound, which cannot run without an
  // AudioContext. See the docblock of collectWindow.
  const w = collectWindow(c.currentTime, LOOKAHEAD, bpm, active, pending, clock);
  // Identity of reference and not a comparison of content: `collectWindow` returns the
  // SAME reference when there was no swap and that of the queued sequence when there
  // was one. So one `!==` covers its TWO branches, that of the cycle boundary and that
  // of `vigente.length <= 0`, and the scheduler does not need to know that somebody
  // counts.
  //
  // That it counts the second one too matters more than it seems: the first start
  // always goes through it (an empty sounding sequence, a clock just started). If the
  // count did not go up there, the playhead would not appear in the first cycle and
  // would appear in all the next ones. That symptom is hard to diagnose later.
  if (w.active !== active) cycleGen++;
  active = w.active;
  pending = w.pending;
  // Three kinds and three branches. The crossing goes through `scheduleVoice` and not
  // through a new function: it is a note, with two other numbers. And `clicksAudible`
  // does not look at it: it switches off only the branch of the click.
  //
  // **There is no fourth branch, for two different reasons.**
  //
  // The first click of the cycle has no accent: all the clicks are identical, because
  // the circuit **has no strong beat**. `buildSequence` fixes the start at index 0 only
  // to remove the equivalent rotations of one circuit, so the "1" is a conventional
  // starting point and not the start of anything. An accent would invent a beginning
  // for the circuit, and that would be a decision of the MODEL and not of the timbre.
  // The place to discuss it is `circuit/sequence.ts`.
  //
  // And a muted piece has no branch of its own: its cells emit the same `Click` without
  // `note` as an empty cell, so they go through this same `clicksAudible`. With the
  // clicks off, that gives **full silence** over a muted piece. That is the intended
  // answer and not an uncovered case: to mute a piece is to take it out of the sound,
  // and to switch off the clicks is to take out of the sound what the circuit says
  // when it crosses an empty cell. The two point to silence, so silence is correct. To
  // split the two meanings would cost a fourth `HIT` and a discriminant in `Click`:
  // two new types to tell apart two ways to be silent.
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
  // The two halves. The second one is the guard that `tick()` does not have: this is
  // its home. To start the clock is what makes `clockRunning()` answer `true` and the
  // play button offer pause, so this is THE place where the engine cannot lie about
  // being whole. `audio()` does not return a context without a master (the `catch`
  // clears them together), but the function that starts the clock must check it
  // anyway: it is the only function whose answer the UI shows.
  if (!c || !bus) return;
  if (c.state === 'suspended') void c.resume();
  clock.origin = c.currentTime + CLOCK_START_DELAY;
  // Strictly BEFORE origin: firstOnsetAfter returns the first onset AFTER what is
  // already emitted. With scheduledUntil = origin the first onset of cycle 0 would be
  // skipped, and the first sound would come one cycle late: 7.5 s with 8 pieces, not
  // one bar. The swap of collectWindow has the same trap.
  clock.scheduledUntil = c.currentTime;
  // The pair travels in the closure and is not read from the module on each turn: the
  // guard above checked it, and it cannot change while the timer lives. When the timer
  // stops, the closure goes with it.
  timer = window.setInterval(() => tick(c, bus), TICK_MS);
}

export function stopClock(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}
