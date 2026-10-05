import { describe, it, expect, vi, afterEach } from 'vitest';
import { HIT, TICK_MS } from '../scheduler.ts';
import { MASTER_GAIN } from '../engine.ts';
import { FFT_SIZE } from '../../spectrum/spectrum-bars.ts';
import { DEFAULT_BPM } from '../scheduler.ts';
import type { Sequence } from '../scheduler.ts';

type Engine = typeof import('../engine.ts');

// `vi.resetModules()` does not work in browser mode: the browser registers a module by its
// URL. A new query string gives a new module, with its state at the initial values.
let n = 0;
const abiertos: Engine[] = [];

async function motor(): Promise<Engine> {
  const e = await (import(/* @vite-ignore */ `../engine.ts?fresh=${++n}`) as Promise<Engine>);
  abiertos.push(e);
  return e;
}

const conReloj = motor;

afterEach(async () => {
  for (const e of abiertos.splice(0)) {
    e.stopClock();
    // Chromium limits the AudioContexts of a document, and each test loads a new module.
    try { await e.audio()?.close(); } catch { /* it was already closed */ }
  }
  vi.unstubAllGlobals();
});

/** A real wait: the engine schedules against `currentTime`, which cannot be faked. */
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Polls and does not sleep: the condition lives in the audio clock, and on a loaded machine
// 150 ms of wall time were 50.7 ms of audio time.
async function esperarCabeza(e: Engine, limiteMs = 4000): Promise<number | null> {
  const hasta = performance.now() + limiteMs;
  let off = e.playheadOffset();
  while (off === null && performance.now() < hasta) {
    await esperar(TICK_MS);
    off = e.playheadOffset();
  }
  return off;
}

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
    expect(e.audio()).toBe(c);
  });

  it('the analyser goes BETWEEN the master and the destination, with the config of the repo', async () => {
    const e = await motor();
    const c = e.audio()!;
    e.playNotes([69]);
    const bins = e.readSpectrum();
    expect(bins).not.toBeNull();
    expect(bins!.length).toBe(FFT_SIZE / 2);
    expect(c.state).toBe('running');
    expect(MASTER_GAIN).toBeGreaterThan(0);
  });

  it('AC-PLY-004 — with no Web Audio it returns null and warns, and does not break the app', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('no Web Audio'); } });

    const e = await motor();
    expect(e.audio()).toBeNull();
    expect(warn).toHaveBeenCalled();

    expect(() => e.playNotes([69])).not.toThrow();
    expect(() => e.playNow([69])).not.toThrow();
    expect(() => e.startClock()).not.toThrow();
    expect(e.clockRunning()).toBe(false);
    expect(e.readSpectrum()).toBeNull();
    expect(e.playheadOffset()).toBeNull();

    warn.mockRestore();
  });

  it('AC-PLY-004 — the failure warns ONCE, not once for each click', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('no Web Audio'); } });

    const e = await motor();
    expect(e.audio()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

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
    expect(e.readSpectrum()).toBeNull();
  });

  it('AC-SPC-004 — it is the SAME array between calls, which is what its docblock warns about', async () => {
    const e = await motor();
    e.audio();
    const a = e.readSpectrum();
    const b = e.readSpectrum();
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });
});

describe('playNotes / playNow', () => {
  it('playNotes schedules and does not resume: it is not a user gesture', async () => {
    const e = await motor();
    const c = e.audio()!;
    const antes = c.currentTime;
    e.playNotes([69, 71, 72, 74, 76]);
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
    e.setSequence(CICLO);
    expect(e.sequenceInfo()).toEqual({ steps: 0, clicks: 0, crosses: 0, length: 0 });
  });

  it('setBpm changes the tempo of the engine and does not touch the clock', async () => {
    const e = await motor();
    expect(e.clockRunning()).toBe(false);
    e.setBpm(DEFAULT_BPM * 2);
    e.setClicksAudible(true);
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
    expect(e.cycleGeneration()).toBe(g);
  });
});

describe('the clock', () => {
  it('startClock is idempotent and stopClock too', async () => {
    // `clockRunning()` cannot see a second timer: without this count, the deletion of the guard
    // of `startClock` leaves the test green.
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

    await vi.waitFor(() => expect(e.sequenceInfo().length).toBe(CICLO.length), { timeout: 2000 });
    expect(e.cycleGeneration()).toBeGreaterThan(0);
    expect(e.sequenceInfo()).toEqual({
      steps: 1,
      clicks: 1,
      crosses: 1,
      length: CICLO.length,
    });
  });

  it('AC-PLY-021 — with the clicks off the cycle stays the same: it is mix, not model', async () => {
    const e = await conReloj();
    e.setSequence(CICLO);
    e.setClicksAudible(false);
    e.startClock();

    await vi.waitFor(() => expect(e.sequenceInfo().length).toBe(CICLO.length), { timeout: 2000 });

    let maximo = -1;
    for (let i = 0; i < 80 && maximo < CICLO.length - 1; i++) {
      const off = e.playheadOffset();
      if (off !== null) maximo = Math.max(maximo, off);
      await esperar(20);
    }
    expect(maximo).toBeGreaterThanOrEqual(CICLO.length - 1);

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

    expect(e.playheadOffset()).toBeNull();

    // The window between the swap and `origin` is ~50 ms. `vi.waitFor` polls wider than that,
    // and a loaded machine can lose it whole. A restart of the clock opens the same window
    // again, so the test retries.
    let visto = false;
    for (let intento = 0; !visto && intento < 5; intento++) {
      if (intento > 0) { e.stopClock(); e.startClock(); }
      let llego = false;
      const hasta = performance.now() + 400;
      while (performance.now() < hasta && !visto && !llego) {
        if (e.sequenceInfo().length > 0) {
          if (e.playheadOffset() === null) visto = true;
          else llego = true;
        }
        await esperar(0);
      }
    }
    expect(visto, 'the window between the swap and `origin` must be observed at least once').toBe(true);

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
    expect(e.playheadOffset()).toBeNull();
  });
});

describe('outputLatency — the chain that TypeScript believes unnecessary', () => {
  /** `lib.dom.d.ts` types `outputLatency` as a `number`, but Firefox does not implement it. */
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
    const e = await conReloj();
    e.setSequence(CICLO);
    e.setClicksAudible(true);
    e.startClock();

    await vi.waitFor(() => expect(e.sequenceInfo().steps).toBe(1), { timeout: 2000 });

    // `cycleGeneration` counts swaps and does not move when a cycle repeats, so the test follows
    // the playhead. The 8 intervals of `CICLO` last 1.09 s at 110 bpm.
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
    await esperar(TICK_MS * 2);
    expect(e.clockRunning()).toBe(true);
  });

  it('AC-PLY-003 — with the graph half built, the engine does NOT say that it started', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class SinGain extends AudioContext {
      createGain(): GainNode { throw new Error('no gain'); }
    }
    vi.stubGlobal('AudioContext', SinGain);

    const e = await conReloj();
    expect(e.audio()).toBeNull();
    expect(e.audio()).toBeNull();  // the `catch` cleared `ctx`

    e.setSequence(CICLO);
    e.startClock();
    expect(e.clockRunning()).toBe(false);

    await esperar(TICK_MS * 4);
    expect(e.clockRunning()).toBe(false);
    expect(e.sequenceInfo().steps).toBe(0);

    warn.mockRestore();
  });
});
