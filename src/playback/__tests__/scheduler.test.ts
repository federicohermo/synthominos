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
/** As `startClock` leaves it: `scheduledUntil` before `origin`. */
const ORIGIN = 0.05;
const recienArrancado = (): ClockState => ({ origin: ORIGIN, scheduledUntil: 0 });

const seq = (
  length: number,
  steps: { offset: number; notes: number[] }[],
  clicks: Sequence['clicks'] = [],
): Sequence => ({ steps, clicks, length });

/** A cycle of 16 intervals is exactly one bar. */
const UN_COMPAS = 16;

/** A clock with a bar cursor, kept only as the oracle of the clock that counts from an origin. */
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

/** Which event, not only when: an old onset on the boundary has the instant of the new one. */
const clave = (h: Hit) => (h.kind === HIT.click ? 'click' : `${h.kind}:${h.hz.toFixed(4)}`);

/** For steps of one note only: the notes of an arpeggio can fall after `hasta`. */
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
    expect(intervalDuration(100)).toBe(0.15);
  });

  it('AC-MUS-028 — the arpeggio (4 intervals) is always a quarter of a bar, exactly', () => {
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
    const hits = collectHits(0, 8, 120, unPaso([A4]), state);
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
    // Without the guard this test does not fail: it hangs.
    const state = recienArrancado();
    expect(collectHits(0, 8, 120, seq(0, [{ offset: 0, notes: [A4] }]), state)).toHaveLength(0);
    expect(state.scheduledUntil).toBeCloseTo(8, 9);
    expect(Number.isFinite(state.scheduledUntil)).toBe(true);
  });

  it('a window already covered does not emit again and does not move the clock back', () => {
    const state = recienArrancado();
    expect(collectHits(0, 1, BPM, unPaso([A4]), state)).toHaveLength(1);
    expect(state.scheduledUntil).toBeCloseTo(1, 9);
    expect(collectHits(0, 0.5, BPM, unPaso([A4]), state)).toHaveLength(0);
    expect(state.scheduledUntil).toBeCloseTo(1, 9);
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
    for (let i = 0; i < 400; i++) {
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
      const s = seq(LARGO, [{ offset: OFFSET, notes: [A4] }]);
      emitidos.push(...collectHits(t, LOOKAHEAD, BPM, s, state).map(h => h.at));
    }
    const esperados: number[] = [];
    for (let k = 0; ORIGIN + k * cycle + OFFSET * interval <= ultimo; k++) {
      esperados.push(ORIGIN + k * cycle + OFFSET * interval);
    }

    expect(new Set(emitidos).size).toBe(emitidos.length);
    expect(emitidos).toHaveLength(esperados.length);
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
    expect(collectHits(salto, LOOKAHEAD, BPM, s, state).length).toBeLessThanOrEqual(3);
    const sigue: number[] = [];
    for (let t = salto + LOOKAHEAD; t < salto + LOOKAHEAD + BAR; t += TICK) {
      sigue.push(...collectHits(t, LOOKAHEAD, BPM, s, state).map(h => h.at));
    }
    expect(sigue).toHaveLength(3);
  });
});

describe('the bpm applies to a sequence already built, with no rebuild', () => {
  it('AC-PLY-007 — the same sequence changes its spacing if the bpm of the call changes', () => {
    const s = seq(UN_COMPAS, [{ offset: 0, notes: [60, 62, 64] }]);

    const lento = collectHits(0, 4, 60, s, { origin: 0.5, scheduledUntil: 0 });
    const rapido = collectHits(0, 4, 160, s, { origin: 0.5, scheduledUntil: 0 });

    const espaciadoLento = lento[1].at - lento[0].at;
    const espaciadoRapido = rapido[1].at - rapido[0].at;
    expect(espaciadoLento).toBeCloseTo(intervalDuration(60), 9);
    expect(espaciadoRapido).toBeCloseTo(intervalDuration(160), 9);
    expect(espaciadoRapido).toBeLessThan(espaciadoLento);
  });
});

describe('the arpeggio is a quarter of a bar', () => {
  it('AC-MUS-028 — the whole onset lasts 1.000 s at 60 bpm and 0.375 s at 160 bpm', () => {
    const s = seq(UN_COMPAS, [{ offset: 0, notes: [60, 62, 64, 67, 69] }]);

    const lento = collectHits(0, 4, 60, s, { origin: 0, scheduledUntil: 0 });
    const rapido = collectHits(0, 4, 160, s, { origin: 0, scheduledUntil: 0 });

    expect(lento[4].at - lento[0].at).toBeCloseTo(1.0, 9);
    expect(rapido[4].at - rapido[0].at).toBeCloseTo(0.375, 9);
  });
});

describe('the offset inside the cycle', () => {
  const interval = intervalDuration(BPM);

  it('AC-PLY-008 — the onsets fall at origin + k * cycle + offset * interval', () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    const i120 = intervalDuration(120);
    const s = seq(8, [{ offset: 2, notes: [A4] }]);
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
    expect(notas).toHaveLength(5);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].at).toBeCloseTo(ORIGIN + 3 * interval, 9);
    expect(Object.keys(clicks[0]).sort()).toEqual(['at', 'kind']);
  });

  it('AC-PLY-007 — a tempo change stretches the sequence and does not reorder it', () => {
    const s = seq(10, [{ offset: 0, notes: [60] }, { offset: 5, notes: [67] }], [{ offset: 8 }]);
    const fracciones = (bpm: number) => {
      const cycle = 10 * intervalDuration(bpm);
      // 1 ms before the origin: an earlier window also emits the negative cycles.
      const state: ClockState = { origin: 1, scheduledUntil: 0.999 };
      return collectHits(0.999, 1.9 * cycle, bpm, s, state)
        .map(h => (h.at - 1) / cycle)
        .sort((x, y) => x - y);
    };
    const lento = fracciones(60);
    const rapido = fracciones(160);
    expect(lento).toHaveLength(6);
    expect(rapido).toHaveLength(6);
    lento.forEach((f, i) => expect(f).toBeCloseTo(rapido[i], 6));
  });

  it('AC-PLY-017 — never more than LOOKAHEAD committed, with a long cycle too', () => {
    // 55 and 66 intervals are the measured cycles of 8 and 10 pieces.
    for (const largo of [55, 66]) {
      const state = recienArrancado();
      const s = seq(largo, [
        { offset: 0, notes: [A4] },
        { offset: Math.floor(largo / 3), notes: [60] },
      ], [{ offset: largo - 1 }]);
      let emitidos = 0;
      for (let i = 0; i < 800; i++) {
        const t = i * TICK;
        for (const h of collectHits(t, LOOKAHEAD, BPM, s, state)) {
          expect(h.at).toBeLessThanOrEqual(t + LOOKAHEAD);
          emitidos++;
        }
      }
      expect(emitidos).toBeGreaterThan(0);
    }
  });

  async function renderCiclo(s: Sequence) {
    const state = recienArrancado();
    const cycle = s.length * interval;
    const hits = collectHits(0, cycle, BPM, s, state);
    const ctx = offline(cycle + 1);
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(ctx.destination);
    const rel = RELEASE_INTERVALS * intervalDuration(BPM);
    for (const h of hits) if (h.kind === HIT.note) scheduleVoice(ctx, g, h.hz, h.at, 0.35, rel, VEL);
    return (await ctx.startRendering()).getChannelData(0);
  }

  const peak = (d: Float32Array) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  it('two pieces apart in the sequence lower the peak and separate the events', async () => {
    const A = [60, 62, 64, 67, 69];
    const B = [67, 69, 71, 74, 76];
    const juntas = seq(UN_COMPAS, [{ offset: 0, notes: A }, { offset: 0, notes: B }]);
    const separadas = seq(UN_COMPAS, [{ offset: 0, notes: A }, { offset: 8, notes: B }]);
    const alineadas = await renderCiclo(juntas);
    const desfasadas = await renderCiclo(separadas);

    expect(peak(desfasadas)).toBeLessThan(peak(alineadas));
    expect(detectOnsets(desfasadas)).toHaveLength(detectOnsets(alineadas).length * 2);
  });
});

describe('the crossing of an occupied cell', () => {
  const interval = intervalDuration(BPM);

  const esCruce = (h: Hit): h is Extract<Hit, { kind: typeof HIT.cross }> => h.kind === HIT.cross;

  const F5 = 77;

  it('a crossing with a note is a THIRD kind of hit, with its pitch', () => {
    const state = recienArrancado();
    const s = seq(8, [{ offset: 0, notes: [60] }], [{ offset: 3 }, { offset: 5, note: F5 }]);
    const hits = collectHits(0, 8 * interval, BPM, s, state);

    const mudos = hits.filter(h => h.kind === HIT.click);
    const cruces = hits.filter(esCruce);
    expect(hits).toHaveLength(3);
    expect(mudos).toHaveLength(1);
    expect(cruces).toHaveLength(1);
    expect(cruces[0].at).toBeCloseTo(ORIGIN + 5 * interval, 9);
    expect(cruces[0].hz).toBeCloseTo(midiToHz(F5), 9);
    expect(Object.keys(cruces[0]).sort()).toEqual(['at', 'hz', 'kind']);
    expect(Object.keys(mudos[0]).sort()).toEqual(['at', 'kind']);
  });

  it('AC-PLY-022 — the clicks off cannot silence the crossing', () => {
    const state = recienArrancado();
    const s = seq(8, [{ offset: 0, notes: [60] }], [{ offset: 3 }, { offset: 5, note: F5 }]);
    const hits = collectHits(0, 8 * interval, BPM, s, state);

    const conClicksApagados = hits.filter(h => h.kind !== HIT.click);
    expect(conClicksApagados.map(clave)).toEqual([
      `note:${midiToHz(60).toFixed(4)}`,
      `cross:${midiToHz(F5).toFixed(4)}`,
    ]);
  });

  it('the crossing follows the tempo and the cycle like any other event', () => {
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
  const A = seq(8, [{ offset: 0, notes: [60] }, { offset: 4, notes: [64] }]);
  const B = seq(6, [{ offset: 0, notes: [72] }], [{ offset: 3 }]);
  const TICKS = 240;
  const CAMBIO = 100;       // in the middle of the third cycle of A

  const bordeEsperado = (comprometido: number) => {
    const cycle = A.length * interval;
    for (let k = 1; k < 100; k++) {
      const b = ORIGIN + k * cycle;
      if (b > comprometido) return b;
    }
    throw new Error('no boundary in range');
  };

  it('AC-PLY-015 — with an empty sounding sequence the queued one enters at once, it does not wait for a cycle that does not exist', () => {
    const state: ClockState = { origin: 0, scheduledUntil: 0 };
    const w = collectWindow(0.5, LOOKAHEAD, BPM, seq(0, []), B, state);

    expect(w.active).toBe(B);
    expect(w.pending).toBeNull();
    expect(state.origin).toBeCloseTo(0.5 + CLOCK_START_DELAY, 9);
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
    // `engine.ts` counts the swaps by identity (`w.active !== active`). t = 0.5 and not 0: at
    // t = 0 the boundary of cycle 0 is inside the first lookahead, and the swap already occurs.
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

    const hasta = (hits: Hit[]) => hits.filter(h => h.at < borde - 1e-9);
    const conInstante = (h: Hit) => `${clave(h)}@${h.at.toFixed(9)}`;
    expect(hasta(conCambio.hits).map(conInstante)).toEqual(hasta(sinCambio.hits).map(conInstante));
    expect(hasta(conCambio.hits).length).toBeGreaterThan(4);

    expect(conCambio.hits.length).not.toBe(sinCambio.hits.length);
  });

  it('AC-PLY-013 — at the join of the swap no onset is lost and none comes out twice', () => {
    const state = recienArrancado();
    const { hits, ultimo, comprometido } = simular(A, TICKS, state, { enTick: CAMBIO, a: B });
    const borde = bordeEsperado(comprometido);

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
    expect(emitidos.filter(x => x.at < borde).length).toBeGreaterThan(4);
    expect(emitidos.filter(x => x.at >= borde).length).toBeGreaterThan(4);
    expect(emitidos.find(x => casiIgual(x.at, borde))?.clave).toBe(`note:${midiToHz(72).toFixed(4)}`);
  });

  it('AC-PLY-013 — the boundary is the new origin, and the first onset of the new cycle falls there', () => {
    const state = recienArrancado();
    const { hits, comprometido } = simular(A, TICKS, state, { enTick: CAMBIO, a: B });
    const borde = bordeEsperado(comprometido);

    expect(state.origin).toBeCloseTo(borde, 9);
    expect(hits.some(h => casiIgual(h.at, borde))).toBe(true);
    expect(hits.filter(h => casiIgual(h.at, borde))).toHaveLength(1);
  });

  it('the swap is decided before the boundary: nothing is scheduled in the past', () => {
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
