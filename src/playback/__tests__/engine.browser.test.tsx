import { describe, it, expect, vi, afterEach } from 'vitest';
import { HIT, TICK_MS } from '../scheduler.ts';
import { MASTER_GAIN } from '../engine.ts';
import { FFT_SIZE } from '../../spectrum/spectrum-bars.ts';
import { DEFAULT_BPM } from '../scheduler.ts';
import type { Sequence } from '../scheduler.ts';

/**
 * The engine, against REAL Web Audio.
 *
 * `voice.ts`, `scheduler.ts` and `playhead-offset.ts` do not touch the singleton, so
 * their tests run in `node`, with an `OfflineAudioContext` of `node-web-audio-api` where
 * they need a context. This module **is** the one that creates the singleton, a
 * `new AudioContext()` kept in a module variable, and it also schedules with
 * `window.setInterval`. Neither exists in `environment: 'node'`. Measured without this
 * file: 107 statements at zero, 25 % of the coverage gap of `src/`. It is not UI: it is
 * the clock, the reconciliation of the loop and the dispatch to sound, on which the
 * timing of every sound depends.
 *
 * ## All the state belongs to the MODULE, so each case imports it again
 *
 * `ctx`, `master`, `analyser`, `active`, `pending`, `clock`, `timer`, `bpm`,
 * `clicksAudible` and `cycleGen` live in the module. A test that starts the clock leaves
 * it running for the next test, and a test that creates the `AudioContext` prevents the
 * test of the `catch` branch from creating it again: `audio()` returns the existing one.
 * With the fresh import of `motor()`, below, each case sees an engine just loaded, and
 * the order of the tests is not part of the oracle.
 */
type Engine = typeof import('../engine.ts');

/**
 * An engine just loaded, with its module state at zero.
 *
 * **`vi.resetModules()` does not work here.** In `environment: 'node'` it clears the
 * module registry of vitest, and the next `await import()` returns a new instance. In
 * the browser the ESM engine itself registers the modules by URL, and that registry
 * cannot be emptied. The `ctx` of the test before survives, `audio()` returns the
 * existing one, and the `catch` branch, which needs a context that does NOT exist yet, is
 * never reached.
 *
 * What works is a change of the URL: `?fresh=N` is another module for the browser, so
 * Vite serves it again and its `let` variables start at their initial values. It is the
 * only way to isolate a module singleton in browser mode.
 */
let n = 0;
const abiertos: Engine[] = [];

async function motor(): Promise<Engine> {
  const e = await (import(/* @vite-ignore */ `../engine.ts?fresh=${++n}`) as Promise<Engine>);
  abiertos.push(e);
  return e;
}

/** An alias of `motor`: every engine is registered for cleanup, with a clock or without. */
const conReloj = motor;

afterEach(async () => {
  for (const e of abiertos.splice(0)) {
    // The `setInterval` outlives the module: the next module does not know the timer of
    // the one before. Without this, a `tick` stays every 25 ms against a context that
    // nobody reads, and that disturbs the next tests.
    e.stopClock();
    // And the AudioContext must be closed: Chromium limits the number of contexts for
    // each document, and with a new module for each test the limit comes soon. To close
    // a closed context throws, so the `catch` is necessary.
    try { await e.audio()?.close(); } catch { /* it was already closed */ }
  }
  vi.unstubAllGlobals();
});

/** A wait of the real clock: the engine schedules against `currentTime`, which cannot be faked. */
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Waits until the playhead has a position to draw. It **polls, it does not sleep**.
 *
 * ## The wall clock and the audio clock are not the same clock
 *
 * `playheadOffset()` answers a number only when `ctx.currentTime` passes `clock.origin`,
 * and `startClock` sets `origin` to `currentTime + CLOCK_START_DELAY`. So the condition
 * lives in the **clock of the AudioContext**, which the render thread moves, not
 * `setTimeout`.
 *
 * A fixed sleep of `CLOCK_START_DELAY * 1000 + TICK_MS * 4` ms of wall time translates a
 * condition of the audio clock into a wait of the wall clock. With the four nodes of
 * `verify` competing for the CPU that translation breaks, and it is measured here:
 * **150 ms of wall time, 50.7 ms of audio time**. The starved render thread goes at one
 * third of the speed, with the context in `running` and the sequence already set. Also,
 * `outputLatency` is 40 ms in this Chromium and is subtracted before the comparison: of
 * the nominal margin of 100 ms, 60 ms remain, and less than that in audio time.
 *
 * The failure said none of that: it said `expected null not to be null` about an engine
 * that worked. It is the same failure mode that the retry loop of the test «null while
 * `origin` is still in the future» documents below, and the answer is the same: **stop
 * by the wall clock, but assert on the condition**.
 *
 * This does not weaken the assertion. The test still asks for an offset that is not null,
 * is an integer and is in range. It does not ask that the offset appears inside ONE fixed
 * sleep. The ceiling is generous on purpose (the real budget is ~150 ms) because this
 * does not measure how long it takes: the time budgets of `sequence.budget.test.ts` do
 * that, and they are skipped in CI because the runner is not a machine that can be
 * measured.
 */
async function esperarCabeza(e: Engine, limiteMs = 4000): Promise<number | null> {
  const hasta = performance.now() + limiteMs;
  let off = e.playheadOffset();
  while (off === null && performance.now() < hasta) {
    await esperar(TICK_MS);
    off = e.playheadOffset();
  }
  return off;
}

/**
 * A cycle with the three kinds of event, written by hand and not derived from a board.
 *
 * By hand because the engine does not import the circuit, in its tests too, and because
 * the check here is the DISPATCH of each kind, not its source: a note, a crossing and a
 * click, which are the three branches of the `for` of `tick()`.
 */
const CICLO: Sequence = {
  steps: [{ offset: 0, notes: [69, 71] }],
  clicks: [{ offset: 2, note: 76 }, { offset: 3 }],
  length: 8,
};

describe('audio() — the singleton and its graph', () => {
  it('it creates the context once and always returns it', async () => {
    const e = await motor();
    const c = e.audio();
    expect(c).not.toBeNull();
    // The second call does NOT build a new graph: if it did, each arpeggio would hang
    // from a different master, and the analyser would read a partial mix.
    expect(e.audio()).toBe(c);
  });

  it('the analyser goes BETWEEN the master and the destination, with the config of the repo', async () => {
    const e = await motor();
    const c = e.audio()!;
    // The assertion is what `readSpectrum` needs to answer something useful: the
    // analyser exists, it has the FFT size of the repo, and there are half as many bins.
    e.playNotes([69]);
    const bins = e.readSpectrum();
    expect(bins).not.toBeNull();
    expect(bins!.length).toBe(FFT_SIZE / 2);
    expect(c.state).toBe('running');
    expect(MASTER_GAIN).toBeGreaterThan(0);
  });

  it('AC-PLY-004 — with no Web Audio it returns null and warns, and does not break the app', async () => {
    // The app stays usable and silent, which is what the docblock promises. It is
    // checked because it is a promise about a browser that we do not have, and the only
    // way to know that it holds is to fake one.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('no Web Audio'); } });

    const e = await motor();
    expect(e.audio()).toBeNull();
    expect(warn).toHaveBeenCalled();

    // And each caller checks it: none of the three entry points to sound throws.
    expect(() => e.playNotes([69])).not.toThrow();
    expect(() => e.playNow([69])).not.toThrow();
    expect(() => e.startClock()).not.toThrow();
    expect(e.clockRunning()).toBe(false);
    expect(e.readSpectrum()).toBeNull();
    expect(e.playheadOffset()).toBeNull();

    warn.mockRestore();
  });

  it('AC-PLY-004 — the failure warns ONCE, not once for each click', async () => {
    // Without the failure latch, each call tries the constructor again. The calls come
    // from the user who plays the instrument, so the console would fill at one warning
    // for each click. The warn is counted and `audio()` is not checked: the answer is
    // null in both cases, and the difference is how many times the constructor is tried.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('no Web Audio'); } });

    const e = await motor();
    expect(e.audio()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    // The three entry points to sound plus one direct query: four more attempts.
    e.playNotes([69]);
    e.playNow([69]);
    e.startClock();
    expect(e.audio()).toBeNull();

    expect(warn, 'the latch holds: the second attempt does not reach the constructor').toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('readSpectrum() — the reused buffer', () => {
  it('AC-SPC-003 — it returns null while there is no signal to read', async () => {
    const e = await motor();
    // No context yet: `readSpectrum` does NOT create it, on purpose. Its caller is a
    // draw loop, and to create it there would be to create it with no user gesture.
    expect(e.readSpectrum()).toBeNull();
  });

  it('AC-SPC-004 — it is the SAME array between calls, which is what its docblock warns about', async () => {
    const e = await motor();
    e.audio();
    const a = e.readSpectrum();
    const b = e.readSpectrum();
    expect(a).not.toBeNull();
    // Identity and not content: a caller that keeps it will see it change. The
    // alternative, to allocate 60 times each second, is what the module rejects.
    expect(b).toBe(a);
  });
});

describe('playNotes / playNow', () => {
  it('playNotes schedules and does not resume: it is not a user gesture', async () => {
    const e = await motor();
    const c = e.audio()!;
    const antes = c.currentTime;
    e.playNotes([69, 71, 72, 74, 76]);
    // What can be observed without listening: it does not throw, it does not stop the
    // context, and the clock still runs.
    expect(c.state).toBe('running');
    expect(c.currentTime).toBeGreaterThanOrEqual(antes);
  });

  it('playNow resumes if the context is suspended, which is its only difference', async () => {
    const e = await motor();
    const c = e.audio()!;
    await c.suspend();
    expect(c.state).toBe('suspended');

    e.playNow([69]);
    await vi.waitFor(() => expect(c.state).toBe('running'));
  });

  it('and with the context already running it does not touch it', async () => {
    // The normal case: the user gesture that resumes is the FIRST one, and after it
    // `playNow` is `playNotes` with one more question.
    const e = await motor();
    const c = e.audio()!;
    expect(c.state).toBe('running');
    const reanudar = vi.spyOn(c, 'resume');

    e.playNow([69, 71]);
    expect(reanudar).not.toHaveBeenCalled();
    expect(c.state).toBe('running');
    reanudar.mockRestore();
  });

  it('with an empty arpeggio it schedules nothing and does not fail', async () => {
    const e = await motor();
    e.audio();
    expect(() => e.playNotes([])).not.toThrow();
  });
});

describe('the accessors of the engine', () => {
  it('sequenceInfo reports the sounding sequence, not the queued one', async () => {
    const e = await motor();
    // Before the first cycle the SOUNDING sequence is empty: `setSequence` queues, it
    // does not start the sequence. If the engine answered the queued sequence to the
    // question of what it scheduled, that would be worse than no function.
    e.setSequence(CICLO);
    expect(e.sequenceInfo()).toEqual({ steps: 0, clicks: 0, crosses: 0, length: 0 });
  });

  it('setBpm changes the tempo of the engine and does not touch the clock', async () => {
    const e = await motor();
    expect(e.clockRunning()).toBe(false);
    e.setBpm(DEFAULT_BPM * 2);
    e.setClicksAudible(true);
    // There is no getter, and that is correct: the bpm is observed in the spacing. The
    // assertion here is that to set it starts nothing and stops nothing.
    expect(e.clockRunning()).toBe(false);
  });

  it('cycleGeneration starts at 0 and does not reset on stop', async () => {
    const e = await conReloj();
    expect(e.cycleGeneration()).toBe(0);
    e.setSequence(CICLO);
    e.startClock();
    await vi.waitFor(() => expect(e.cycleGeneration()).toBeGreaterThan(0), { timeout: 2000 });
    const g = e.cycleGeneration();
    e.stopClock();
    // A pause does not change which cycle is sounding: a reset would make the UI believe
    // in a swap that did not occur.
    expect(e.cycleGeneration()).toBe(g);
  });
});

describe('the clock', () => {
  it('startClock is idempotent and stopClock too', async () => {
    // The `setInterval` calls are counted, not only `clockRunning()`: with the guard
    // deleted the clock STILL says that it runs, because `timer` is not null, and what
    // breaks is a second orphan timer that schedules each onset twice against the same
    // `scheduledUntil`. A mutation pass confirmed it: without this count, the deletion
    // of `if (timer !== null) return` left the test green.
    const intervalos = vi.spyOn(window, 'setInterval');
    const e = await conReloj();

    e.startClock();
    expect(e.clockRunning()).toBe(true);
    expect(intervalos).toHaveBeenCalledTimes(1);

    e.startClock();
    expect(e.clockRunning()).toBe(true);
    expect(intervalos, 'the second call must not open a second timer').toHaveBeenCalledTimes(1);

    const limpiados = vi.spyOn(window, 'clearInterval');
    e.stopClock();
    expect(e.clockRunning()).toBe(false);
    expect(limpiados).toHaveBeenCalledTimes(1);

    e.stopClock();
    expect(e.clockRunning()).toBe(false);
    expect(limpiados, 'two stops do not clear twice').toHaveBeenCalledTimes(1);

    intervalos.mockRestore();
    limpiados.mockRestore();
  });

  it('it resumes the suspended context on start', async () => {
    const e = await conReloj();
    const c = e.audio()!;
    await c.suspend();
    e.startClock();
    await vi.waitFor(() => expect(c.state).toBe('running'));
    expect(e.clockRunning()).toBe(true);
  });

  it('AC-PLY-015 — the first start makes the queued sequence the sounding one and counts the swap', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.setClicksAudible(true);
    e.startClock();

    // The first start goes through the branch `vigente.length <= 0` of `collectWindow`,
    // and THAT branch must raise the counter too: so the playhead appears in the first
    // cycle and not only in the second.
    await vi.waitFor(() => expect(e.sequenceInfo().length).toBe(CICLO.length), { timeout: 2000 });
    expect(e.cycleGeneration()).toBeGreaterThan(0);
    expect(e.sequenceInfo()).toEqual({
      steps: 1,
      clicks: 1,   // the `{ offset: 3 }` with no note
      crosses: 1,  // the `{ offset: 2, note: 76 }`
      length: CICLO.length,
    });
  });

  it('AC-PLY-021 — with the clicks off the cycle stays the same: it is mix, not model', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.setClicksAudible(false);
    e.startClock();

    await vi.waitFor(() => expect(e.sequenceInfo().length).toBe(CICLO.length), { timeout: 2000 });

    // The whole cycle, so that the dispatch reaches the click of offset 3 with the click
    // switch off: that branch is silenced, and to silence it must not shorten anything.
    let maximo = -1;
    for (let i = 0; i < 80 && maximo < CICLO.length - 1; i++) {
      const off = e.playheadOffset();
      if (off !== null) maximo = Math.max(maximo, off);
      await esperar(20);
    }
    expect(maximo).toBeGreaterThanOrEqual(CICLO.length - 1);

    // The clicks stay in the sequence and `collectHits` still emits them: the only
    // change is that `tick()` does not wire them to sound.
    expect(e.sequenceInfo().clicks).toBe(1);
    expect(e.sequenceInfo().length).toBe(CICLO.length);
  });
});

describe('playheadOffset()', () => {
  it('AC-PLY-029 — null while paused, even with a context', async () => {
    const e = await motor();
    e.audio();
    expect(e.playheadOffset()).toBeNull();
  });

  it('AC-PLY-029 — null with the clock running and an empty sequence', async () => {
    const e = await conReloj();
    e.startClock();
    expect(e.playheadOffset()).toBeNull();
  });

  it('AC-PLY-029 — null while `origin` is still in the future, and a number after', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.startClock();

    // Before the first tick the sounding sequence is still empty, so the null comes from
    // there.
    expect(e.playheadOffset()).toBeNull();

    // The window of interest is the one IN THE MIDDLE, and it is narrow on purpose: the
    // swap occurs in the first tick (25 ms), and it sets `origin` 50 ms after that tick
    // (`CLOCK_START_DELAY`). In those ~50 ms the sounding sequence IS the new one but
    // has not started to sound, and the answer must still be null. Without that guard,
    // `offsetAt` answers the TAIL of the cycle, the MAXIMUM offset, which is correct for
    // a total function. That number would uncover the five cells of the veil at once,
    // and never cell by cell.
    //
    // ## The sampling yields the thread in each turn and does not sleep a fixed interval
    //
    // The swap occurs inside a `setInterval`: to see it, the test must give the thread
    // back to the event loop. But a sleep of 2 ms in each turn loses samples, and the
    // test FLICKERS under instrumentation, where all is slowest. `setTimeout(0)` yields
    // the thread and spends no window, and the stop is by the wall clock and not by a
    // number of turns. That makes it independent of the speed of the machine.
    //
    // `vi.waitFor` does not work: its default interval is wider than the whole window.
    //
    // ## A lost window RETRIES, it does not fail
    //
    // Chromium clamps `setTimeout(0)` to 4 ms from the fifth nesting level, so the window
    // gives few samples. With the four nodes of `verify` competing for the CPU, one pause
    // takes the whole window, and the test would fail with nothing wrong. A time budget
    // on a loaded machine fails in the same way, and the same reason applies: a false
    // failure in the convergence node trains the reader to take a failure as noise.
    //
    // The retry does NOT weaken the assertion. `startClock` sets
    // `clock.origin = currentTime + CLOCK_START_DELAY` and then arms the timer. So on the
    // retry, with the sequence ALREADY sounding from the attempt before, the four guards
    // of `playheadOffset` are in the same state as in the first window, and the null
    // comes from `now < clock.origin`, which is exactly the guard to observe. The retry
    // removes the race against the first tick, not the condition.
    let visto = false;
    for (let intento = 0; !visto && intento < 5; intento++) {
      if (intento > 0) { e.stopClock(); e.startClock(); }
      let llego = false;
      const hasta = performance.now() + 400;
      while (performance.now() < hasta && !visto && !llego) {
        if (e.sequenceInfo().length > 0) {
          if (e.playheadOffset() === null) visto = true;
          else llego = true;   // `origin` passed: the window was lost
        }
        await esperar(0);
      }
    }
    expect(visto, 'the window between the swap and `origin` must be observed at least once').toBe(true);

    // And after `origin`, a number. It polls and does not sleep a fixed time: the
    // condition lives in the clock of the AudioContext and not in the wall clock. See
    // `esperarCabeza`.
    const off = await esperarCabeza(e);
    expect(off, 'after `origin` the playhead must have a cell to draw').not.toBeNull();
    expect(off!).toBeGreaterThanOrEqual(0);
    expect(off!).toBeLessThan(CICLO.length);
  });

  it('AC-PLY-029 — null with the context suspended, even with the clock running', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.startClock();
    expect(await esperarCabeza(e), 'the premise of the case: before the suspend there was a playhead').not.toBeNull();

    const c = e.audio()!;
    await c.suspend();
    // The playhead turns off: anything drawn there would be a lie.
    expect(e.playheadOffset()).toBeNull();
  });
});

describe('outputLatency — the chain that TypeScript believes unnecessary', () => {
  /**
   * Fakes a browser where `outputLatency` and `baseLatency` are missing, and returns how
   * to restore them.
   *
   * `lib.dom.d.ts` declares them as a non-optional `number`, but Firefox does not
   * implement the first one, and there `undefined` arrives. The fallback exists for
   * that. The `node` tests cannot exercise it: they run against `node-web-audio-api`,
   * where these numbers describe no real output.
   *
   * The missing browser is faked with a patch of the prototype BEFORE the module creates
   * its context. The function cannot be called directly: it is private to the module,
   * and an export only for the test would widen the surface for convenience. So it is
   * observed by its effect: `playheadOffset` subtracts the latency, and with the two
   * readings missing it must still answer a valid offset and not `NaN`.
   */
  function conLatencias(out: unknown, base: unknown): () => void {
    const proto = AudioContext.prototype;
    const antesOut = Object.getOwnPropertyDescriptor(proto, 'outputLatency');
    const antesBase = Object.getOwnPropertyDescriptor(proto, 'baseLatency');
    Object.defineProperty(proto, 'outputLatency', { get: () => out, configurable: true });
    Object.defineProperty(proto, 'baseLatency', { get: () => base, configurable: true });
    return () => {
      if (antesOut) Object.defineProperty(proto, 'outputLatency', antesOut);
      if (antesBase) Object.defineProperty(proto, 'baseLatency', antesBase);
    };
  }

  it.each([
    ['with no outputLatency, it falls back to baseLatency (the Firefox case)', undefined, 0.01],
    ['with neither of the two, it falls back to 0', undefined, undefined],
    ['with an outputLatency that is not finite, it does not use it either', NaN, undefined],
  ])('%s', async (_caso, out, base) => {
    const restaurar = conLatencias(out, base);
    try {
      const e = await conReloj();
      e.setSequence(CICLO);
      e.startClock();

      const off = await esperarCabeza(e);
      expect(off, 'with the two readings missing the playhead must still answer').not.toBeNull();
      // What the fallback gives: an integer offset in range, not a `NaN` that
      // `Playhead.tsx` would paint as a cell that does not exist.
      expect(Number.isInteger(off!)).toBe(true);
      expect(off!).toBeGreaterThanOrEqual(0);
      expect(off!).toBeLessThan(CICLO.length);
    } finally {
      restaurar();
    }
  });
});

describe('tick() — the dispatch of the three kinds', () => {
  it('AC-PLY-023 — the three branches of `kind` run in a cycle that has the three', async () => {
    // A test cannot listen. So the assertion is that the cycle with a note, a crossing
    // and a click runs whole with the clicks ON, which is the only branch with a
    // condition, and leaves the engine in a valid state.
    //
    // The wait is one CYCLE and not a few ticks, and the number comes from the
    // arithmetic of the instrument: at 110 bpm the interval is `barDuration/16` = 136 ms,
    // so the 8 intervals of `CICLO` last 1.09 s. With less than that the `for` reaches
    // the note of offset 0 but not the crossing of offset 2 or the click of offset 3.
    const e = await conReloj();
    e.setSequence(CICLO);
    e.setClicksAudible(true);
    e.startClock();

    await vi.waitFor(() => expect(e.sequenceInfo().steps).toBe(1), { timeout: 2000 });

    // The test follows the playhead and does not read `cycleGeneration`, which does NOT
    // move here: the counter counts SWAPS, and with no new queued sequence the cycle
    // repeats with no swap. The maximum offset reached proves that the `for` ran the
    // whole sequence, past the crossing of offset 2 and the click of offset 3, and not
    // only its start.
    let maximo = -1;
    for (let i = 0; i < 80; i++) {
      const off = e.playheadOffset();
      if (off !== null) maximo = Math.max(maximo, off);
      if (maximo >= CICLO.length - 1) break;
      await esperar(20);
    }

    expect(maximo).toBeGreaterThanOrEqual(CICLO.length - 1);
    expect(e.clockRunning()).toBe(true);
    expect(e.audio()!.state).toBe('running');
    expect(HIT.note).not.toBe(HIT.cross);
  });

  it('tick does not throw if the context goes away under it', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.startClock();
    await esperar(TICK_MS * 2);
    await e.audio()!.close();
    // The timer still fires against a closed context until someone stops it.
    await esperar(TICK_MS * 2);
    expect(e.clockRunning()).toBe(true);
  });

  it('AC-PLY-003 — with the graph half built, the engine does NOT say that it started', async () => {
    // Without the cleanup of the `catch`, a real browser can reach this state: if
    // `createGain()` fails, `audio()` goes to the `catch` and returns null, BUT `ctx` is
    // already assigned, so the `if (ctx) return ctx` of the next call answers a context
    // with `master` at null. From there `startClock`, which only checks that `audio()`
    // is not null, starts the timer, `clockRunning()` becomes `true`, the play button
    // offers pause, and nothing sounds: the soft failure enters by the one door that the
    // caller cannot check.
    //
    // The `catch` clears the three references together, so that state cannot occur.
    // This test asserts that consequence: with a partial failure the engine must answer
    // the SAME as with a total failure, that it did not start.
    //
    // The class inherits from the real AudioContext and is not a fake: so `state`,
    // `currentTime` and `resume` are the real ones, and the only difference is the part
    // to break.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class SinGain extends AudioContext {
      createGain(): GainNode { throw new Error('no gain'); }
    }
    vi.stubGlobal('AudioContext', SinGain);

    const e = await conReloj();
    expect(e.audio()).toBeNull();  // first call: it throws inside the try
    expect(e.audio()).toBeNull();  // second call: the catch cleared `ctx` and set the failure latch

    e.setSequence(CICLO);
    e.startClock();
    // The clock must not start on a broken graph. If it started, the UI would ask
    // `clockRunning()` and the answer would be yes.
    expect(e.clockRunning()).toBe(false);

    // And it still does not start after several ticks: there is no timer to fire them.
    await esperar(TICK_MS * 4);
    expect(e.clockRunning()).toBe(false);
    expect(e.sequenceInfo().steps).toBe(0);

    warn.mockRestore();
  });
});
