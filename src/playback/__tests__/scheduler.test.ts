import { describe, it, expect } from 'vitest';
import {
  collectHits,
  collectWindow,
  barDuration,
  intervalDuration,
  LOOKAHEAD,
  TICK_MS,
  HIT,
} from '../scheduler.ts';
import { offsetAt } from '../playhead-offset.ts';
import { midiToHz, scheduleVoice, RELEASE_INTERVALS } from '../voice.ts';
import { CLOCK_START_DELAY } from '../scheduler.ts';
import type { Sequence, ClockState, Hit } from '../scheduler.ts';
import { offline, detectOnsets } from './test-context.ts';

const A4 = 69;
const VEL = 0.8;
const BPM = 110;
const TICK = TICK_MS / 1000;
/** A clock that just started, as startClock leaves it: scheduledUntil before origin. */
const ORIGIN = 0.05;
const recienArrancado = (): ClockState => ({ origin: ORIGIN, scheduledUntil: 0 });

/** A sequence. `length` goes first because the offsets mean nothing without it. */
const seq = (
  length: number,
  steps: { offset: number; notes: number[] }[],
  clicks: Sequence['clicks'] = [],
): Sequence => ({ steps, clicks, length });

/** A cycle of 16 intervals is exactly one bar. */
const UN_COMPAS = 16;

/**
 * A clock that moves a bar cursor, kept here as the oracle of the clock that counts from
 * an origin.
 *
 * It is not production code, on purpose: two implementations side by side are the only
 * way to assert that the origin clock gives the same instants as a cursor. If the origin
 * clock goes away, this block goes with it.
 *
 * `interval` comes by parameter: the spacing of the arpeggio comes from the bpm. That
 * does not weaken the oracle. This test compares the mechanism of the CLOCK (cursor
 * against origin), not the source of the spacing, and the two implementations use the
 * same number.
 *
 * The sequence does not weaken it either. The cursor gets loose steps, and it is
 * compared against a sequence of ONE step at offset 0 with a cycle of 16 intervals,
 * which is exactly one bar. That is the period that this cursor walks, and the period is
 * all that the oracle measures.
 */
function collectHitsPorCursor(
  fromTime: number,
  horizon: number,
  bpm: number,
  steps: Iterable<{ notes: number[] }>,
  state: { nextBar: number },
  interval: number,
): { at: number }[] {
  const bar = (60 / bpm) * 4;
  const out: { at: number }[] = [];
  const list = [...steps];
  if (state.nextBar < fromTime) state.nextBar = fromTime + 0.05;
  while (state.nextBar < fromTime + horizon) {
    for (const step of list) {
      step.notes.forEach((_, i) => out.push({ at: state.nextBar + i * interval }));
    }
    state.nextBar += bar;
  }
  return out;
}

/**
 * Runs `ticks` turns of the timer from t = 0, as the engine does: one window of
 * LOOKAHEAD each TICK_MS.
 *
 * The join of the swap exists only BETWEEN two consecutive calls, so one call cannot see
 * it.
 *
 * It also returns `comprometido`: how far the old sequence had emitted at the moment the
 * new one was queued. With it the test derives the expected boundary and does not copy
 * the arithmetic of the implementation.
 */
function simular(
  inicial: Sequence,
  ticks: number,
  state: ClockState,
  cambio?: { enTick: number; a: Sequence },
): { hits: Hit[]; ultimo: number; comprometido: number } {
  let active = inicial;
  let pending: Sequence | null = null;
  const hits: Hit[] = [];
  let comprometido = 0;
  let ultimo = 0;

  for (let i = 0; i < ticks; i++) {
    const t = i * TICK;
    if (cambio && i === cambio.enTick) {
      comprometido = Math.max(state.scheduledUntil, t);
      pending = cambio.a;
    }
    const w = collectWindow(t, LOOKAHEAD, BPM, active, pending, state);
    active = w.active;
    pending = w.pending;
    hits.push(...w.hits);
    ultimo = t + LOOKAHEAD;
  }
  return { hits, ultimo, comprometido };
}

/**
 * WHICH event it is, not only when.
 *
 * Without this, an onset of the old sequence that falls exactly on the boundary is
 * confused with the onset of the new one, and the join looks correct when the wrong
 * sequence sounded. Measured: an oracle that compares only instants lets that whole
 * mutation through.
 */
const clave = (h: Hit) => (h.kind === HIT.click ? 'click' : `${h.kind}:${h.hz.toFixed(4)}`);

/**
 * All the events of a sequence in (desde, hasta], by enumeration of the grid.
 *
 * It enumerates and filters, and does not solve the first k in closed form: a copy of
 * the arithmetic of `firstOnsetAfter` would not be an oracle, it would be the same
 * implementation written twice.
 *
 * It holds for steps of ONE note. With arpeggios, the notes of an onset that enters the
 * window are emitted even when they fall after `hasta`, and the filter would count them
 * as missing. The callers build their sequences that way on purpose.
 */
function eventosDe(
  s: Sequence, origin: number, interval: number, desde: number, hasta: number,
): { at: number; clave: string }[] {
  const cycle = s.length * interval;
  const eventos = [
    ...s.steps.map(x => ({ offset: x.offset, clave: `note:${midiToHz(x.notes[0]).toFixed(4)}` })),
    ...s.clicks.map(x => ({
      offset: x.offset,
      clave: x.note === undefined ? 'click' : `cross:${midiToHz(x.note).toFixed(4)}`,
    })),
  ];
  const out: { at: number; clave: string }[] = [];
  for (let k = -1; origin + k * cycle <= hasta; k++) {
    for (const e of eventos) {
      const at = origin + k * cycle + e.offset * interval;
      if (at > desde && at <= hasta) out.push({ at, clave: e.clave });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const casiIgual = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const mismoEvento = (
  a: { at: number; clave: string },
  b: { at: number; clave: string },
) => casiIgual(a.at, b.at) && a.clave === b.clave;

describe('intervalDuration and barDuration', () => {
  it('AC-MUS-028 — at 100 bpm the interval is exactly 0.15 s, with no epsilon', () => {
    // At 100 bpm the formula gives the same double as the literal 0.15, so `toBe` holds
    // with no tolerance. At 110 bpm, below, it does not.
    expect(intervalDuration(100)).toBe(0.15);
  });

  it('AC-MUS-028 — the arpeggio (4 intervals) is always a quarter of a bar, exactly', () => {
    // The property, not only single cases: at any tempo the arpeggio takes the same
    // fraction of the bar.
    for (const bpm of [60, 100, 110, 160]) {
      expect(intervalDuration(bpm) * 4).toBe(barDuration(bpm) / 4);
    }
    expect(4 * intervalDuration(60)).toBe(1.0);
    expect(4 * intervalDuration(160)).toBe(0.375);
  });

  it('at 110 bpm the value is periodic in binary: a tolerance is necessary', () => {
    expect(intervalDuration(110)).toBeCloseTo(0.1363636364, 9);
  });
});

describe('scheduler — the clock counts from an origin', () => {
  const BAR = (60 / BPM) * 4;
  const unPaso = (notes: number[], offset = 0): Sequence => seq(UN_COMPAS, [{ offset, notes }]);

  it('AC-PLY-008 — N cycles give N hits at the expected instants', () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    const hits = collectHits(0, 8, 120, unPaso([A4]), state);   // 120 bpm -> a cycle of 2 s
    expect(hits).toHaveLength(4);
    hits.forEach((h, k) => expect(h.at).toBeCloseTo(0.5 + k * 2, 9));
    expect(state.scheduledUntil).toBeCloseTo(8, 9);
  });

  it('each step gives all its notes, spaced by the arpeggio', () => {
    const interval = intervalDuration(120);
    const hits = collectHits(0, 2, 120, unPaso([60, 62, 64]), { origin: 0.5, scheduledUntil: 0 });
    expect(hits).toHaveLength(3);
    expect(hits[1].at - hits[0].at).toBeCloseTo(interval, 9);
    expect(hits[2].at - hits[1].at).toBeCloseTo(interval, 9);
  });

  it('two steps at the same offset sound together', () => {
    // Single notes: with one element in each array, the hit and the onset are the same
    // instant by construction, whatever the spacing of the arpeggio.
    const s = seq(UN_COMPAS, [{ offset: 0, notes: [60] }, { offset: 0, notes: [64] }]);
    const hits = collectHits(0, 2, 120, s, { origin: 0.5, scheduledUntil: 0 });
    expect(hits).toHaveLength(2);
    expect(hits[0].at).toBeCloseTo(hits[1].at, 9);
  });

  it('with no steps it schedules nothing, but the clock still moves forward', () => {
    const state = recienArrancado();
    expect(collectHits(0, 8, 120, seq(UN_COMPAS, []), state)).toHaveLength(0);
    expect(state.scheduledUntil).toBeCloseTo(8, 9);
  });

  it('with length 0 it schedules nothing and does not hang: the period would be zero', () => {
    // The guard is not theoretical: this is the state after the user removes the last
    // piece. Without it, firstOnsetAfter divides by zero and the loop of cycles does not
    // end. So if this breaks, the test does not fail: it hangs.
    const state = recienArrancado();
    expect(collectHits(0, 8, 120, seq(0, [{ offset: 0, notes: [A4] }]), state)).toHaveLength(0);
    expect(state.scheduledUntil).toBeCloseTo(8, 9);
    expect(Number.isFinite(state.scheduledUntil)).toBe(true);
  });

  it('a window already covered does not emit again and does not move the clock back', () => {
    const state = recienArrancado();
    expect(collectHits(0, 1, BPM, unPaso([A4]), state)).toHaveLength(1);   // the first onset
    expect(state.scheduledUntil).toBeCloseTo(1, 9);
    expect(collectHits(0, 0.5, BPM, unPaso([A4]), state)).toHaveLength(0);
    expect(state.scheduledUntil).toBeCloseTo(1, 9);                        // it did not move back
  });

  it('the tempo changes the length of the cycle', () => {
    expect(collectHits(0, 4, 60, unPaso([A4]), { origin: 0.5, scheduledUntil: 0 })).toHaveLength(1);
    expect(collectHits(0, 4, 240, unPaso([A4]), { origin: 0.5, scheduledUntil: 0 })).toHaveLength(4);
  });

  it('with a cycle of one bar it emits the same instants as the bar cursor', () => {
    const interval = intervalDuration(BPM);
    const nuevo = recienArrancado();
    const viejo = { nextBar: ORIGIN };
    const nuevos: number[] = [];
    const viejos: number[] = [];
    for (let i = 0; i < 400; i++) {                 // 10 s of ticks of 25 ms
      const t = i * TICK;
      nuevos.push(...collectHits(t, LOOKAHEAD, BPM, unPaso([A4, 64, 67]), nuevo).map(h => h.at));
      viejos.push(...collectHitsPorCursor(t, LOOKAHEAD, BPM, [{ notes: [A4, 64, 67] }], viejo, interval).map(h => h.at));
    }
    expect(viejos.length).toBeGreaterThan(0);
    expect(nuevos).toHaveLength(viejos.length);
    nuevos.forEach((at, i) => expect(at).toBeCloseTo(viejos[i], 6));
  });

  it('AC-PLY-011 — windows that overlap emit each onset once, and all of them', () => {
    const LARGO = 19;                                  // prime: the offset does not divide the cycle
    const OFFSET = 7;
    const interval = intervalDuration(BPM);
    const cycle = LARGO * interval;
    const state = recienArrancado();
    const emitidos: number[] = [];
    let ultimo = 0;
    for (let i = 0; i < 400; i++) {
      const t = i * TICK;
      ultimo = t + LOOKAHEAD;
      // One note: hit === onset.
      const s = seq(LARGO, [{ offset: OFFSET, notes: [A4] }]);
      emitidos.push(...collectHits(t, LOOKAHEAD, BPM, s, state).map(h => h.at));
    }
    const esperados: number[] = [];
    for (let k = 0; ORIGIN + k * cycle + OFFSET * interval <= ultimo; k++) {
      esperados.push(ORIGIN + k * cycle + OFFSET * interval);
    }

    expect(new Set(emitidos).size).toBe(emitidos.length);   // none twice
    expect(emitidos).toHaveLength(esperados.length);        // none lost
    emitidos.forEach((at, i) => expect(at).toBeCloseTo(esperados[i], 9));
  });

  it('AC-PLY-011 — no hit falls in the past', () => {
    const state = recienArrancado();
    const s = seq(13, [{ offset: 9, notes: [60, 62, 64] }], [{ offset: 3 }]);
    for (let i = 0; i < 400; i++) {
      const t = i * TICK;
      for (const h of collectHits(t, LOOKAHEAD, BPM, s, state)) {
        expect(h.at).toBeGreaterThanOrEqual(t);
      }
    }
  });

  it('AC-PLY-012 — a jump of 10 cycles is skipped, with no burst and no stall', () => {
    const state = recienArrancado();
    const s = unPaso([60, 62, 64]);
    collectHits(0, LOOKAHEAD, BPM, s, state);
    const salto = LOOKAHEAD + 10 * BAR;
    // At most one cycle of notes: the 10 lost cycles are dropped, not recovered.
    expect(collectHits(salto, LOOKAHEAD, BPM, s, state).length).toBeLessThanOrEqual(3);
    // And the clock does not stall: the next cycle comes out again, once.
    const sigue: number[] = [];
    for (let t = salto + LOOKAHEAD; t < salto + LOOKAHEAD + BAR; t += TICK) {
      sigue.push(...collectHits(t, LOOKAHEAD, BPM, s, state).map(h => h.at));
    }
    expect(sigue).toHaveLength(3);
  });
});

describe('the bpm applies to a sequence already built, with no rebuild', () => {
  it('AC-PLY-007 — the same sequence changes its spacing if the bpm of the call changes', () => {
    // The spacing comes from `bpm`, a parameter of `collectHits`. So to schedule the SAME
    // sequence with another bpm is enough to change the spacing.
    const s = seq(UN_COMPAS, [{ offset: 0, notes: [60, 62, 64] }]);

    const lento = collectHits(0, 4, 60, s, { origin: 0.5, scheduledUntil: 0 });
    const rapido = collectHits(0, 4, 160, s, { origin: 0.5, scheduledUntil: 0 });

    const espaciadoLento = lento[1].at - lento[0].at;
    const espaciadoRapido = rapido[1].at - rapido[0].at;
    expect(espaciadoLento).toBeCloseTo(intervalDuration(60), 9);
    expect(espaciadoRapido).toBeCloseTo(intervalDuration(160), 9);
    // And they differ from each other: the point of the criterion is that they change,
    // not only that each one agrees with its own oracle.
    expect(espaciadoRapido).toBeLessThan(espaciadoLento);
  });
});

describe('the arpeggio is a quarter of a bar', () => {
  it('AC-MUS-028 — the whole onset lasts 1.000 s at 60 bpm and 0.375 s at 160 bpm', () => {
    const s = seq(UN_COMPAS, [{ offset: 0, notes: [60, 62, 64, 67, 69] }]);   // 5 notes, 4 intervals end to end

    const lento = collectHits(0, 4, 60, s, { origin: 0, scheduledUntil: 0 });
    const rapido = collectHits(0, 4, 160, s, { origin: 0, scheduledUntil: 0 });

    // The first 5 hits are the 5 notes of the first onset (the loop of cycles is outside
    // the forEach of notes): the distance from the first to the last is the whole
    // arpeggio.
    expect(lento[4].at - lento[0].at).toBeCloseTo(1.0, 9);
    expect(rapido[4].at - rapido[0].at).toBeCloseTo(0.375, 9);
  });
});

describe('the offset inside the cycle', () => {
  const interval = intervalDuration(BPM);

  it('AC-PLY-008 — the onsets fall at origin + k * cycle + offset * interval', () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    const i120 = intervalDuration(120);
    const s = seq(8, [{ offset: 2, notes: [A4] }]);   // a cycle of 8 intervals = half a bar
    const hits = collectHits(0, 4, 120, s, state);
    const cycle = 8 * i120;
    expect(hits).toHaveLength(4);
    hits.forEach((h, k) => expect(h.at).toBeCloseTo(0.5 + k * cycle + 2 * i120, 9));
  });

  it('the arpeggio expands from the shifted onset', () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    const i120 = intervalDuration(120);
    const s = seq(UN_COMPAS, [{ offset: 8, notes: [60, 62, 64] }]);
    const hits = collectHits(0, 2.4, 120, s, state);
    expect(hits).toHaveLength(3);
    hits.forEach((h, i) => expect(h.at).toBeCloseTo(0.5 + 8 * i120 + i * i120, 9));
  });

  it('two steps with different offsets start at different instants', () => {
    const state = recienArrancado();
    const s = seq(10, [{ offset: 0, notes: [60] }, { offset: 5, notes: [64] }]);
    const hits = collectHits(0, 10 * interval, BPM, s, state);
    expect(hits).toHaveLength(2);
    expect(hits[1].at - hits[0].at).toBeCloseTo(5 * interval, 9);
  });

  it('a click is one hit with no pitch, on the same grid as the steps', () => {
    const state = recienArrancado();
    const s = seq(6, [{ offset: 0, notes: [60, 62, 64, 67, 69] }], [{ offset: 3 }]);
    const hits = collectHits(0, 6 * interval, BPM, s, state);

    const notas = hits.filter(h => h.kind === HIT.note);
    const clicks = hits.filter(h => h.kind === HIT.click);
    expect(notas).toHaveLength(5);       // the arpeggio expands
    expect(clicks).toHaveLength(1);      // the click does not: it has no notes
    expect(clicks[0].at).toBeCloseTo(ORIGIN + 3 * interval, 9);
    // And it carries no pitch at run time either: the discriminated union keeps it out
    // of this branch, and this test asserts that no loose field gets in.
    expect(Object.keys(clicks[0]).sort()).toEqual(['at', 'kind']);
  });

  it('AC-PLY-007 — a tempo change stretches the sequence and does not reorder it', () => {
    const s = seq(10, [{ offset: 0, notes: [60] }, { offset: 5, notes: [67] }], [{ offset: 8 }]);
    // Fractions of the cycle from the origin: if they are equal at the two tempos, the
    // pattern is the same one stretched, not another pattern.
    const fracciones = (bpm: number) => {
      const cycle = 10 * intervalDuration(bpm);
      // Start 1 ms before the origin and not much earlier: the progression of onsets is
      // defined for every k, so a window that starts cycles before the origin also emits
      // the negative cycles.
      const state: ClockState = { origin: 1, scheduledUntil: 0.999 };
      return collectHits(0.999, 1.9 * cycle, bpm, s, state)
        .map(h => (h.at - 1) / cycle)
        .sort((x, y) => x - y);
    };
    const lento = fracciones(60);
    const rapido = fracciones(160);
    expect(lento).toHaveLength(6);    // 3 events x 2 cycles
    expect(rapido).toHaveLength(6);
    lento.forEach((f, i) => expect(f).toBeCloseTo(rapido[i], 6));
  });

  it('AC-PLY-017 — never more than LOOKAHEAD committed, with a long cycle too', () => {
    // 55 and 66 intervals are the measured cycles of 8 and 10 pieces: 7.5 s and 9.0 s at
    // 110 bpm. With the circuit the period can be 7 times the bar, and an implementation
    // that scheduled the whole cycle at once would commit 75 times the lookahead.
    for (const largo of [55, 66]) {
      const state = recienArrancado();
      const s = seq(largo, [
        { offset: 0, notes: [A4] },
        { offset: Math.floor(largo / 3), notes: [60] },
      ], [{ offset: largo - 1 }]);
      let emitidos = 0;
      for (let i = 0; i < 800; i++) {   // 20 s: more than two full cycles
        const t = i * TICK;
        for (const h of collectHits(t, LOOKAHEAD, BPM, s, state)) {
          expect(h.at).toBeLessThanOrEqual(t + LOOKAHEAD);
          emitidos++;
        }
      }
      expect(emitidos).toBeGreaterThan(0);   // so that it does not pass on nothing
    }
  });

  /**
   * Renders ONE cycle of the given sequence, at unit gain.
   *
   * The horizon of a whole cycle is, on purpose, one that the real engine never uses
   * (there it is LOOKAHEAD): it is the only way to collect all the onsets of the cycle at
   * once and measure them as audio.
   */
  async function renderCiclo(s: Sequence) {
    const state = recienArrancado();
    const cycle = s.length * interval;
    const hits = collectHits(0, cycle, BPM, s, state);
    const ctx = offline(cycle + 1);
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(ctx.destination);
    // 0.35 s is an arbitrary render duration, not the note length of the instrument
    // (that is NOTE_INTERVALS * intervalDuration(bpm)): this test measures the peak and
    // the number of onsets, not the length of each note.
    // The release DOES come from the tempo: here it is the only part of the envelope
    // that depends on it.
    const rel = RELEASE_INTERVALS * intervalDuration(BPM);
    for (const h of hits) if (h.kind === HIT.note) scheduleVoice(ctx, g, h.hz, h.at, 0.35, rel, VEL);
    return (await ctx.startRendering()).getChannelData(0);
  }

  const peak = (d: Float32Array) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  it('two pieces apart in the sequence lower the peak and separate the events', async () => {
    const A = [60, 62, 64, 67, 69];   // the major pentatonic of C
    const B = [67, 69, 71, 74, 76];   // the one of G
    const juntas = seq(UN_COMPAS, [{ offset: 0, notes: A }, { offset: 0, notes: B }]);
    const separadas = seq(UN_COMPAS, [{ offset: 0, notes: A }, { offset: 8, notes: B }]);
    const alineadas = await renderCiclo(juntas);
    const desfasadas = await renderCiclo(separadas);

    // The peak of two pieces at the same instant is level stacked on the same voice. The
    // peak of two pieces apart is the peak of one piece. The circuit keeps the pieces
    // apart, and that solves the problem.
    expect(peak(desfasadas)).toBeLessThan(peak(alineadas));
    // And where there was one event there are two: the texture that the level covered.
    expect(detectOnsets(desfasadas)).toHaveLength(detectOnsets(alineadas).length * 2);
  });
});

describe('the crossing of an occupied cell', () => {
  const interval = intervalDuration(BPM);

  /**
   * The predicate that narrows a `Hit` to the branch of the crossing.
   *
   * `filter` on a union does not narrow by itself, and `hz` lives in one branch only. The
   * explicit predicate lets the test assert on `hz`: the half of the contract that an
   * `hz?: number` would leave unchecked.
   */
  const esCruce = (h: Hit): h is Extract<Hit, { kind: typeof HIT.cross }> => h.kind === HIT.cross;

  // Any pitch for the crossing. On this side that is all there is: the engine sees a MIDI
  // number and not the cell it came from, so the sequence is written by hand and not
  // derived from a board.
  //
  // It is NOT the board of `P` rot 1 at (3,2) and `Y` rot 1 at (7,2), and the reason
  // matters: with `CROSS_COST = 5` that circuit enters no occupied cell, because it goes
  // around by row 0 (`circuit/__tests__/routing.test.ts` fixes it, in the test of
  // AC-CIR-004 about the leg from the P to the Y). A test tied to that board would
  // measure a crossing that does not occur. `playback/__tests__/route-source.test.ts`
  // avoids the same trap with the `X`.
  const F5 = 77;

  it('a crossing with a note is a THIRD kind of hit, with its pitch', () => {
    const state = recienArrancado();
    const s = seq(8, [{ offset: 0, notes: [60] }], [{ offset: 3 }, { offset: 5, note: F5 }]);
    const hits = collectHits(0, 8 * interval, BPM, s, state);

    const mudos = hits.filter(h => h.kind === HIT.click);
    const cruces = hits.filter(esCruce);
    expect(hits).toHaveLength(3);        // the note, the click and the crossing
    expect(mudos).toHaveLength(1);
    expect(cruces).toHaveLength(1);
    // The same grid as all the others: the crossing does not change WHEN it sounds, only
    // HOW.
    expect(cruces[0].at).toBeCloseTo(ORIGIN + 5 * interval, 9);
    // In Hz and not in MIDI: the conversion belongs to the engine, as with `steps.notes`.
    expect(cruces[0].hz).toBeCloseTo(midiToHz(F5), 9);
    expect(Object.keys(cruces[0]).sort()).toEqual(['at', 'hz', 'kind']);
    // And the click still has no pitch: the union keeps it out, and no loose field with
    // `undefined` gets in.
    expect(Object.keys(mudos[0]).sort()).toEqual(['at', 'kind']);
  });

  it('AC-PLY-022 — the clicks off cannot silence the crossing', () => {
    const state = recienArrancado();
    const s = seq(8, [{ offset: 0, notes: [60] }], [{ offset: 3 }, { offset: 5, note: F5 }]);
    const hits = collectHits(0, 8 * interval, BPM, s, state);

    // `tick()` silences the click branch with an `else if (clicksAudible)`, so with the
    // click switch off all that is not `HIT.click` remains. That branch cannot run here:
    // `engine.ts` touches the singleton of the AudioContext, which does not exist in
    // these tests. So this test fixes what makes it possible: the crossing is NOT a
    // click, not even a click with `hz`. With an optional `hz` field on the click, this
    // filter would also remove the crossing, and the sequence would say that the leg
    // entered an empty cell where it entered a piece.
    const conClicksApagados = hits.filter(h => h.kind !== HIT.click);
    expect(conClicksApagados.map(clave)).toEqual([
      `note:${midiToHz(60).toFixed(4)}`,
      `cross:${midiToHz(F5).toFixed(4)}`,
    ]);
  });

  it('the crossing follows the tempo and the cycle like any other event', () => {
    // This kind of hit must keep the two properties that hold the clock: periodicity (two
    // cycles, two crossings) and independence from the tempo (the fraction of the cycle
    // is the same at 60 and at 160 bpm).
    const s = seq(10, [{ offset: 0, notes: [60] }], [{ offset: 7, note: F5 }]);
    const fracciones = (bpm: number) => {
      const cycle = 10 * intervalDuration(bpm);
      const state: ClockState = { origin: 1, scheduledUntil: 0.999 };
      return collectHits(0.999, 1.9 * cycle, bpm, s, state)
        .filter(esCruce)
        .map(h => (h.at - 1) / cycle)
        .sort((x, y) => x - y);
    };
    const lento = fracciones(60);
    const rapido = fracciones(160);
    expect(lento).toHaveLength(2);
    expect(rapido).toHaveLength(2);
    lento.forEach((f, i) => expect(f).toBeCloseTo(rapido[i], 6));
  });
});

describe('the sequence changes at the cycle boundary', () => {
  const interval = intervalDuration(BPM);
  /** Two steps of one note: each hit IS an onset, so they can be counted. */
  const A = seq(8, [{ offset: 0, notes: [60] }, { offset: 4, notes: [64] }]);
  const B = seq(6, [{ offset: 0, notes: [72] }], [{ offset: 3 }]);
  const TICKS = 240;        // 6 s
  const CAMBIO = 100;       // in the middle of the third cycle of A

  /** The first cycle boundary of A after what A had already committed. */
  const bordeEsperado = (comprometido: number) => {
    const cycle = A.length * interval;
    for (let k = 1; k < 100; k++) {
      const b = ORIGIN + k * cycle;
      if (b > comprometido) return b;
    }
    throw new Error('no boundary in range');
  };

  it('AC-PLY-015 — with an empty sounding sequence the queued one enters at once, it does not wait for a cycle that does not exist', () => {
    // Without this case the first piece would never sound: there is no cycle to end.
    const state: ClockState = { origin: 0, scheduledUntil: 0 };
    const w = collectWindow(0.5, LOOKAHEAD, BPM, seq(0, []), B, state);

    expect(w.active).toBe(B);
    expect(w.pending).toBeNull();
    expect(state.origin).toBeCloseTo(0.5 + CLOCK_START_DELAY, 9);
    // And the first onset of the new cycle SOUNDS: with scheduledUntil at origin and not
    // before it, firstOnsetAfter would skip it and this would give 0 hits.
    expect(w.hits).toHaveLength(1);
    expect(w.hits[0].at).toBeCloseTo(0.5 + CLOCK_START_DELAY, 9);
  });

  it('with no queued sequence the sounding one stays the same and the clock keeps its origin', () => {
    const state = recienArrancado();
    const w = collectWindow(0, LOOKAHEAD, BPM, A, null, state);
    expect(w.active).toBe(A);
    expect(w.pending).toBeNull();
    expect(state.origin).toBe(ORIGIN);
  });

  it('with a queued sequence but before the boundary it returns the SAME reference of the sounding one', () => {
    // This is not an implementation detail: `engine.ts` counts the swaps by identity
    // (`w.active !== active`), and the UI ties to that count the moment when the playhead
    // changes to the new sequence. If this function returned a defensive copy when there
    // was NO swap, the count would go up 40 times each second and the playhead would draw
    // the new sequence before it sounds. BR-PLY-018 forbids exactly that, and no audio
    // test would see it.
    // In the middle of the first cycle of A and not at t = 0: with `origin` at 0.05 the
    // boundary at the start of cycle 0 falls INSIDE the first lookahead. So at t = 0 the
    // swap already occurs, and the case to measure (a queued sequence, with the boundary
    // still ahead) does not exist.
    const state = recienArrancado();
    const w = collectWindow(0.5, LOOKAHEAD, BPM, A, B, state);
    expect(w.active).toBe(A);
    expect(w.pending).toBe(B);
    expect(state.origin).toBe(ORIGIN);
  });

  it('AC-PLY-013 — a sequence queued in the middle of the cycle does not change the hits up to the boundary', () => {
    const sinCambio = simular(A, TICKS, recienArrancado());
    const conCambio = simular(A, TICKS, recienArrancado(), { enTick: CAMBIO, a: B });
    const borde = bordeEsperado(conCambio.comprometido);

    // Up to the boundary the two runs must be the SAME audio, instant by instant and note
    // by note: to queue does not interrupt what sounds.
    const hasta = (hits: Hit[]) => hits.filter(h => h.at < borde - 1e-9);
    const conInstante = (h: Hit) => `${clave(h)}@${h.at.toFixed(9)}`;
    expect(hasta(conCambio.hits).map(conInstante)).toEqual(hasta(sinCambio.hits).map(conInstante));
    expect(hasta(conCambio.hits).length).toBeGreaterThan(4);   // so that it does not pass on nothing

    // And after the boundary they differ: the change did enter.
    expect(conCambio.hits.length).not.toBe(sinCambio.hits.length);
  });

  it('AC-PLY-013 — at the join of the swap no onset is lost and none comes out twice', () => {
    const state = recienArrancado();
    const { hits, ultimo, comprometido } = simular(A, TICKS, state, { enTick: CAMBIO, a: B });
    const borde = bordeEsperado(comprometido);

    // The old one up to the boundary (not including it) and the new one from the
    // boundary: the instant of the boundary is the onset of offset 0 of the new cycle,
    // and of nothing else.
    const esperados = [
      ...eventosDe(A, ORIGIN, interval, 0, borde - 1e-9),
      ...eventosDe(B, borde, interval, borde - 1e-9, ultimo),
    ].sort((a, b) => a.at - b.at);
    const emitidos = hits.map(h => ({ at: h.at, clave: clave(h) })).sort((a, b) => a.at - b.at);

    const perdidos = esperados.filter(e => !emitidos.some(x => mismoEvento(x, e)));
    const inesperados = emitidos.filter(x => !esperados.some(e => mismoEvento(x, e)));
    const repetidos = emitidos.filter((x, i) => emitidos.findIndex(y => mismoEvento(y, x)) !== i);

    expect({ perdidos, inesperados, repetidos, total: emitidos.length })
      .toEqual({ perdidos: [], inesperados: [], repetidos: [], total: esperados.length });
    // The join must have its two halves: events of A before and of B after.
    expect(emitidos.filter(x => x.at < borde).length).toBeGreaterThan(4);
    expect(emitidos.filter(x => x.at >= borde).length).toBeGreaterThan(4);
    // And at the boundary the NEW one sounded, not one more step of the old one.
    expect(emitidos.find(x => casiIgual(x.at, borde))?.clave).toBe(`note:${midiToHz(72).toFixed(4)}`);
  });

  it('AC-PLY-013 — the boundary is the new origin, and the first onset of the new cycle falls there', () => {
    const state = recienArrancado();
    const { hits, comprometido } = simular(A, TICKS, state, { enTick: CAMBIO, a: B });
    const borde = bordeEsperado(comprometido);

    expect(state.origin).toBeCloseTo(borde, 9);
    expect(hits.some(h => casiIgual(h.at, borde))).toBe(true);
    // Only one at the boundary: if the old sequence were not bounded, there would be two.
    expect(hits.filter(h => casiIgual(h.at, borde))).toHaveLength(1);
  });

  it('the swap is decided before the boundary: nothing is scheduled in the past', () => {
    // The horizon is 100 ms and the boundary is checked every 25 ms. If the swap waited
    // for currentTime to pass the boundary, the first onset of the new cycle would be in
    // the past when it is scheduled. The swap is decided inside the lookahead to prevent
    // that.
    const state = recienArrancado();
    let active: Sequence = A;
    let pending: Sequence | null = B;
    for (let i = 0; i < TICKS; i++) {
      const t = i * TICK;
      const w = collectWindow(t, LOOKAHEAD, BPM, active, pending, state);
      active = w.active;
      pending = w.pending;
      for (const h of w.hits) expect(h.at).toBeGreaterThanOrEqual(t);
    }
  });

  it('the swap leaves `origin` in the FUTURE, so the new cycle does not sound yet', () => {
    // The other side of the test above, and the reason for the guard `now < origin` of
    // `playheadOffset`. The swap is decided INSIDE the lookahead: when it occurs,
    // `origin` is the boundary and is still ahead, and what sounds is still the tail of
    // the old sequence, scheduled up to half an interval before.
    //
    // Without the guard, `offsetAt` answers the TAIL of the new cycle, `cycle - 1`. That
    // is correct for a total function. But that number is the MAXIMUM, and the veil that
    // `Playhead.tsx` draws uncovers each cell with `offset <= current offset`: the five
    // cells of the piece would lose the veil together in the frame of the swap, and
    // never cell by cell. This test asserts the fact of the scheduler that causes it.
    // That fact can be tested. The reading of the clock that uses it cannot.
    const state = recienArrancado();
    let active: Sequence = A;
    let pending: Sequence | null = B;
    let swaps = 0;
    for (let i = 0; i < TICKS; i++) {
      const t = i * TICK;
      const previa = active;
      const w = collectWindow(t, LOOKAHEAD, BPM, active, pending, state);
      active = w.active;
      pending = w.pending;
      if (active === previa) continue;

      swaps++;
      expect(state.origin).toBeGreaterThan(t);
      expect(state.origin - t).toBeLessThanOrEqual(LOOKAHEAD);
      // Without output latency and with it: the subtraction only makes the window wider.
      for (const latencia of [0, 0.01, 0.05]) {
        expect(offsetAt(t - latencia, state.origin, interval, active.length)).toBe(active.length - 1);
      }
    }
    expect(swaps).toBe(1);
  });

  it('AC-PLY-037 — removing the last piece leaves the sequence empty and does not hang the clock', () => {
    const state = recienArrancado();
    const vacia = seq(0, []);
    let active: Sequence = A;
    let pending: Sequence | null = null;
    const hits: Hit[] = [];
    for (let i = 0; i < TICKS; i++) {
      const t = i * TICK;
      if (i === CAMBIO) pending = vacia;
      const w = collectWindow(t, LOOKAHEAD, BPM, active, pending, state);
      active = w.active;
      pending = w.pending;
      hits.push(...w.hits);
    }
    expect(active).toBe(vacia);
    // And after the boundary nothing sounds again.
    const borde = state.origin;
    expect(hits.filter(h => h.at >= borde)).toHaveLength(0);
  });

  it('AC-PLY-014 — two queues before the boundary leave the last one: the whole sequence is queued', () => {
    const state = recienArrancado();
    const C = seq(5, [{ offset: 0, notes: [80] }]);
    let active: Sequence = A;
    let pending: Sequence | null = null;
    for (let i = 0; i < TICKS; i++) {
      const t = i * TICK;
      if (i === CAMBIO) pending = B;
      if (i === CAMBIO + 1) pending = C;
      const w = collectWindow(t, LOOKAHEAD, BPM, active, pending, state);
      active = w.active;
      pending = w.pending;
    }
    expect(active).toBe(C);
  });
});
