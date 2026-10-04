import { describe, it, expect } from 'vitest';
import { collectHits, collectWindow, barDuration, intervalDuration } from '../scheduler.ts';
import { offsetAt } from '../playhead.ts';
import { midiToHz, scheduleVoice } from '../voice.ts';
import { LOOKAHEAD, TICK_MS, HIT } from '../scheduler.constants.ts';
import { CLOCK_START_DELAY } from '../engine.constants.ts';
import { RELEASE_INTERVALS } from '../voice.constants.ts';
import type { Sequence, ClockState, Hit } from '../scheduler.types.ts';
import { offline, detectOnsets } from './test-context.ts';

const A4 = 69;
const VEL = 0.8;
const BPM = 110;
const TICK = TICK_MS / 1000;
/** Reloj recien arrancado, igual que startClock: scheduledUntil antes de origin. */
const ORIGIN = 0.05;
const recienArrancado = (): ClockState => ({ origin: ORIGIN, scheduledUntil: 0 });

/** Un recorrido. `length` primero porque sin el los offsets no significan nada. */
const seq = (
  length: number,
  steps: { offset: number; notes: number[] }[],
  clicks: Sequence['clicks'] = [],
): Sequence => ({ steps, clicks, length });

/** Un ciclo de 16 intervalos es exactamente un compas: el periodo de antes. */
const UN_COMPAS = 16;

/**
 * El cursor de compas, copiado tal cual, como oraculo de
 * no-regresion del reloj por origen.
 *
 * Es codigo muerto en produccion a proposito: la unica forma de afirmar que la
 * reformulacion no cambio ningun instante es tener las dos implementaciones vivas
 * y compararlas. Si el reloj por origen se revierte, este bloque se borra con el.
 *
 * `interval` se recibe por parametro y no de un `job.spread`, campo que no existe: el
 * espaciado del arpegio no es un dato del job sino que se deriva
 * del bpm. Pasarlo desde afuera no debilita el oraculo — lo que este
 * test compara es el mecanismo del RELOJ (cursor vs origen), no de donde sale el
 * espaciado, y las dos implementaciones siguen usando el mismo numero.
 *
 * El recorrido tampoco lo debilita: recibe los pasos sueltos porque no hay `Job`
 * que los agrupe, y se lo compara contra una secuencia de UN paso en offset 0 y ciclo de
 * 16 intervalos, que es un compas exacto. O sea el mismo periodo que este cursor
 * recorre, que es lo unico que el oraculo mide.
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
 * Corre `ticks` vueltas del temporizador desde t = 0, como el motor: una ventana de
 * LOOKAHEAD cada TICK_MS.
 *
 * El empalme del swap solo existe ENTRE dos llamadas consecutivas, asi que una sola
 * llamada no lo puede ver.
 *
 * Devuelve tambien `comprometido`: hasta donde habia emitido la secuencia vieja en el
 * momento de encolar la nueva. Es el dato con el que se deriva el borde esperado sin
 * copiar la cuenta que hace la implementacion.
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
 * QUE evento es, mas alla de cuando.
 *
 * Sin esto un onset de la secuencia vieja que cae exacto en el borde se confunde con el
 * de la nueva y el empalme parece sano cuando en realidad sono la secuencia equivocada.
 * Medido: la primera version de este oraculo comparaba solo instantes y dejaba pasar
 * esa mutacion entera.
 */
const clave = (h: Hit) => (h.kind === HIT.click ? 'click' : `${h.kind}:${h.hz.toFixed(4)}`);

/**
 * Todos los eventos de una secuencia en (desde, hasta], por enumeracion de la grilla.
 *
 * Enumera y filtra en vez de resolver el primer k en forma cerrada: si copiara la
 * cuenta de `firstOnsetAfter` no seria un oraculo, seria la misma implementacion
 * escrita dos veces.
 *
 * Vale con pasos de UNA nota: con arpegios, las notas de un onset que entra en la
 * ventana se emiten aunque caigan despues de `hasta`, y el filtro las contaria como
 * faltantes. Los que lo usan arman las secuencias asi a proposito.
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

describe('intervalDuration y barDuration', () => {
  it('AC-MUS-028 — a 100 bpm da el ARPEGGIO_SPREAD exacto de antes, sin epsilon', () => {
    // 0.15 era la constante que este spec borro. Que la formula nueva la
    // reproduzca EXACTA a 100 bpm es la garantia de que ahi no cambia nada.
    expect(intervalDuration(100)).toBe(0.15);
  });

  it('AC-MUS-028 — el arpegio (4 intervalos) mide siempre un cuarto de compas, exacto', () => {
    // La propiedad que compra el spec, no solo casos sueltos: a cualquier
    // tempo el arpegio ocupa la misma fraccion del compas.
    for (const bpm of [60, 100, 110, 160]) {
      expect(intervalDuration(bpm) * 4).toBe(barDuration(bpm) / 4);
    }
    expect(4 * intervalDuration(60)).toBe(1.0);
    expect(4 * intervalDuration(160)).toBe(0.375);
  });

  it('a 110 bpm el valor es periodico en binario: hace falta tolerancia', () => {
    expect(intervalDuration(110)).toBeCloseTo(0.1363636364, 9);
  });
});

describe('scheduler — reloj por origen', () => {
  const BAR = (60 / BPM) * 4;
  const unPaso = (notes: number[], offset = 0): Sequence => seq(UN_COMPAS, [{ offset, notes }]);

  it('AC-PLY-008 — N ciclos producen N disparos en los instantes esperados', () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    const hits = collectHits(0, 8, 120, unPaso([A4]), state);   // 120 bpm -> ciclo de 2 s
    expect(hits).toHaveLength(4);
    hits.forEach((h, k) => expect(h.at).toBeCloseTo(0.5 + k * 2, 9));
    expect(state.scheduledUntil).toBeCloseTo(8, 9);
  });

  it('cada paso aporta todas sus notas, espaciadas por el arpegio', () => {
    const interval = intervalDuration(120);
    const hits = collectHits(0, 2, 120, unPaso([60, 62, 64]), { origin: 0.5, scheduledUntil: 0 });
    expect(hits).toHaveLength(3);
    expect(hits[1].at - hits[0].at).toBeCloseTo(interval, 9);
    expect(hits[2].at - hits[1].at).toBeCloseTo(interval, 9);
  });

  it('dos pasos en el mismo offset suenan juntos', () => {
    // Notas unicas: con un solo elemento por array, hit y onset coinciden por
    // construccion sin importar el espaciado del arpegio.
    const s = seq(UN_COMPAS, [{ offset: 0, notes: [60] }, { offset: 0, notes: [64] }]);
    const hits = collectHits(0, 2, 120, s, { origin: 0.5, scheduledUntil: 0 });
    expect(hits).toHaveLength(2);
    expect(hits[0].at).toBeCloseTo(hits[1].at, 9);
  });

  it('sin pasos no agenda nada, pero el reloj igual avanza', () => {
    const state = recienArrancado();
    expect(collectHits(0, 8, 120, seq(UN_COMPAS, []), state)).toHaveLength(0);
    expect(state.scheduledUntil).toBeCloseTo(8, 9);
  });

  it('con length 0 no agenda ni se cuelga: el periodo seria cero', () => {
    // La guarda no es teorica: es el estado de "quite la ultima pieza". Sin ella
    // firstOnsetAfter divide por cero y el bucle de ciclos no termina, asi que si
    // esto se rompe el test no falla — se cuelga.
    const state = recienArrancado();
    expect(collectHits(0, 8, 120, seq(0, [{ offset: 0, notes: [A4] }]), state)).toHaveLength(0);
    expect(state.scheduledUntil).toBeCloseTo(8, 9);
    expect(Number.isFinite(state.scheduledUntil)).toBe(true);
  });

  it('una ventana ya cubierta no vuelve a emitir ni hace retroceder el reloj', () => {
    const state = recienArrancado();
    expect(collectHits(0, 1, BPM, unPaso([A4]), state)).toHaveLength(1);   // el primer onset
    expect(state.scheduledUntil).toBeCloseTo(1, 9);
    expect(collectHits(0, 0.5, BPM, unPaso([A4]), state)).toHaveLength(0);
    expect(state.scheduledUntil).toBeCloseTo(1, 9);                        // no retrocedio
  });

  it('el tempo cambia la duracion del ciclo', () => {
    expect(collectHits(0, 4, 60, unPaso([A4]), { origin: 0.5, scheduledUntil: 0 })).toHaveLength(1);
    expect(collectHits(0, 4, 240, unPaso([A4]), { origin: 0.5, scheduledUntil: 0 })).toHaveLength(4);
  });

  it('con un ciclo de un compas emite los mismos instantes que el cursor de compas', () => {
    const interval = intervalDuration(BPM);
    const nuevo = recienArrancado();
    const viejo = { nextBar: ORIGIN };
    const nuevos: number[] = [];
    const viejos: number[] = [];
    for (let i = 0; i < 400; i++) {                 // 10 s de ticks de 25 ms
      const t = i * TICK;
      nuevos.push(...collectHits(t, LOOKAHEAD, BPM, unPaso([A4, 64, 67]), nuevo).map(h => h.at));
      viejos.push(...collectHitsPorCursor(t, LOOKAHEAD, BPM, [{ notes: [A4, 64, 67] }], viejo, interval).map(h => h.at));
    }
    expect(viejos.length).toBeGreaterThan(0);
    expect(nuevos).toHaveLength(viejos.length);
    nuevos.forEach((at, i) => expect(at).toBeCloseTo(viejos[i], 6));
  });

  it('AC-PLY-011 — ventanas solapadas emiten cada onset una sola vez, y todos', () => {
    const LARGO = 19;                                  // primo: el offset no divide al ciclo
    const OFFSET = 7;
    const interval = intervalDuration(BPM);
    const cycle = LARGO * interval;
    const state = recienArrancado();
    const emitidos: number[] = [];
    let ultimo = 0;
    for (let i = 0; i < 400; i++) {
      const t = i * TICK;
      ultimo = t + LOOKAHEAD;
      // Una sola nota: hit === onset.
      const s = seq(LARGO, [{ offset: OFFSET, notes: [A4] }]);
      emitidos.push(...collectHits(t, LOOKAHEAD, BPM, s, state).map(h => h.at));
    }
    const esperados: number[] = [];
    for (let k = 0; ORIGIN + k * cycle + OFFSET * interval <= ultimo; k++) {
      esperados.push(ORIGIN + k * cycle + OFFSET * interval);
    }

    expect(new Set(emitidos).size).toBe(emitidos.length);   // ninguno repetido
    expect(emitidos).toHaveLength(esperados.length);        // ninguno perdido
    emitidos.forEach((at, i) => expect(at).toBeCloseTo(esperados[i], 9));
  });

  it('AC-PLY-011 — ningun hit cae en el pasado', () => {
    const state = recienArrancado();
    const s = seq(13, [{ offset: 9, notes: [60, 62, 64] }], [{ offset: 3 }]);
    for (let i = 0; i < 400; i++) {
      const t = i * TICK;
      for (const h of collectHits(t, LOOKAHEAD, BPM, s, state)) {
        expect(h.at).toBeGreaterThanOrEqual(t);
      }
    }
  });

  it('AC-PLY-012 — un salto de 10 ciclos se saltea, sin avalancha y sin trabarse', () => {
    const state = recienArrancado();
    const s = unPaso([60, 62, 64]);
    collectHits(0, LOOKAHEAD, BPM, s, state);
    const salto = LOOKAHEAD + 10 * BAR;
    // Como mucho un ciclo de notas: los 10 perdidos se descartan, no se recuperan.
    expect(collectHits(salto, LOOKAHEAD, BPM, s, state).length).toBeLessThanOrEqual(3);
    // Y el reloj no queda trabado: el ciclo siguiente vuelve a salir, uno solo.
    const sigue: number[] = [];
    for (let t = salto + LOOKAHEAD; t < salto + LOOKAHEAD + BAR; t += TICK) {
      sigue.push(...collectHits(t, LOOKAHEAD, BPM, s, state).map(h => h.at));
    }
    expect(sigue).toHaveLength(3);
  });
});

describe('el bpm afecta a una secuencia ya armada, sin rehacerla', () => {
  it('AC-PLY-007 — la misma secuencia cambia de espaciado si el bpm de la llamada cambia', () => {
    // Antes, el espaciado vivia en `job.spread`: cambiar el tempo sin reconstruir
    // el job no tenia ningun efecto sobre el arpegio. Ahora sale de `bpm`, que es
    // un parametro de `collectHits`, asi que agendar la MISMA secuencia con otro
    // bpm alcanza para que el espaciado cambie.
    const s = seq(UN_COMPAS, [{ offset: 0, notes: [60, 62, 64] }]);

    const lento = collectHits(0, 4, 60, s, { origin: 0.5, scheduledUntil: 0 });
    const rapido = collectHits(0, 4, 160, s, { origin: 0.5, scheduledUntil: 0 });

    const espaciadoLento = lento[1].at - lento[0].at;
    const espaciadoRapido = rapido[1].at - rapido[0].at;
    expect(espaciadoLento).toBeCloseTo(intervalDuration(60), 9);
    expect(espaciadoRapido).toBeCloseTo(intervalDuration(160), 9);
    // Y son distintos entre si: el punto del AC es que cambian, no solo que
    // cada uno coincide con su propio oraculo.
    expect(espaciadoRapido).toBeLessThan(espaciadoLento);
  });
});

describe('el arpegio mide un cuarto de compas', () => {
  it('AC-MUS-028 — el onset completo mide 1.000 s a 60 bpm y 0.375 s a 160 bpm', () => {
    const s = seq(UN_COMPAS, [{ offset: 0, notes: [60, 62, 64, 67, 69] }]);   // 5 notas, 4 intervalos punta a punta

    const lento = collectHits(0, 4, 60, s, { origin: 0, scheduledUntil: 0 });
    const rapido = collectHits(0, 4, 160, s, { origin: 0, scheduledUntil: 0 });

    // Los primeros 5 hits son las 5 notas del primer onset (el loop de ciclos
    // queda afuera del forEach de notas): la distancia entre la primera y la
    // ultima es el arpegio completo.
    expect(lento[4].at - lento[0].at).toBeCloseTo(1.0, 9);
    expect(rapido[4].at - rapido[0].at).toBeCloseTo(0.375, 9);
  });
});

describe('el offset dentro del ciclo', () => {
  const interval = intervalDuration(BPM);

  it('AC-PLY-008 — los onsets caen en origin + k * ciclo + offset * intervalo', () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    const i120 = intervalDuration(120);
    const s = seq(8, [{ offset: 2, notes: [A4] }]);   // ciclo de 8 intervalos = medio compas
    const hits = collectHits(0, 4, 120, s, state);
    const cycle = 8 * i120;
    expect(hits).toHaveLength(4);
    hits.forEach((h, k) => expect(h.at).toBeCloseTo(0.5 + k * cycle + 2 * i120, 9));
  });

  it('el arpegio se expande desde el onset desplazado', () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    const i120 = intervalDuration(120);
    const s = seq(UN_COMPAS, [{ offset: 8, notes: [60, 62, 64] }]);
    const hits = collectHits(0, 2.4, 120, s, state);
    expect(hits).toHaveLength(3);
    hits.forEach((h, i) => expect(h.at).toBeCloseTo(0.5 + 8 * i120 + i * i120, 9));
  });

  it('dos pasos con offset distinto arrancan en instantes distintos', () => {
    const state = recienArrancado();
    const s = seq(10, [{ offset: 0, notes: [60] }, { offset: 5, notes: [64] }]);
    const hits = collectHits(0, 10 * interval, BPM, s, state);
    expect(hits).toHaveLength(2);
    expect(hits[1].at - hits[0].at).toBeCloseTo(5 * interval, 9);
  });

  it('un click es un solo hit sin altura, en la misma grilla que los pasos', () => {
    const state = recienArrancado();
    const s = seq(6, [{ offset: 0, notes: [60, 62, 64, 67, 69] }], [{ offset: 3 }]);
    const hits = collectHits(0, 6 * interval, BPM, s, state);

    const notas = hits.filter(h => h.kind === HIT.note);
    const clicks = hits.filter(h => h.kind === HIT.click);
    expect(notas).toHaveLength(5);       // el arpegio se expande
    expect(clicks).toHaveLength(1);      // el click no: no tiene notas
    expect(clicks[0].at).toBeCloseTo(ORIGIN + 3 * interval, 9);
    // Y no lleva altura ni en tiempo de ejecucion: la union discriminada la deja
    // afuera de esta rama, y este test afirma que ademas no se cuela un campo suelto.
    expect(Object.keys(clicks[0]).sort()).toEqual(['at', 'kind']);
  });

  it('AC-PLY-007 — cambiar el tempo estira el recorrido sin reordenarlo', () => {
    const s = seq(10, [{ offset: 0, notes: [60] }, { offset: 5, notes: [67] }], [{ offset: 8 }]);
    // Fracciones de ciclo desde el origen: si son iguales a los dos tempos, el
    // patron es el mismo estirado, no otro patron.
    const fracciones = (bpm: number) => {
      const cycle = 10 * intervalDuration(bpm);
      // Arrancar 1 ms antes del origen y no mucho antes: la progresion de onsets
      // esta definida para todo k, asi que una ventana que empieza ciclos antes
      // del origen tambien emite los ciclos negativos.
      const state: ClockState = { origin: 1, scheduledUntil: 0.999 };
      return collectHits(0.999, 1.9 * cycle, bpm, s, state)
        .map(h => (h.at - 1) / cycle)
        .sort((x, y) => x - y);
    };
    const lento = fracciones(60);
    const rapido = fracciones(160);
    expect(lento).toHaveLength(6);    // 3 eventos x 2 ciclos
    expect(rapido).toHaveLength(6);
    lento.forEach((f, i) => expect(f).toBeCloseTo(rapido[i], 6));
  });

  it('AC-PLY-017 — nunca mas de LOOKAHEAD comprometido, tampoco con un ciclo largo', () => {
    // 55 y 66 intervalos son los ciclos medidos de 8 y 10 piezas: 7,5 s y 9,0 s a
    // 110 bpm. Es el caso que el recorrido hace posible y el compas no tenia, donde el
    // periodo pasa a ser 7 veces el compas y una implementacion que agendara "el
    // ciclo entero de una" comprometeria 75 veces el lookahead.
    for (const largo of [55, 66]) {
      const state = recienArrancado();
      const s = seq(largo, [
        { offset: 0, notes: [A4] },
        { offset: Math.floor(largo / 3), notes: [60] },
      ], [{ offset: largo - 1 }]);
      let emitidos = 0;
      for (let i = 0; i < 800; i++) {   // 20 s: mas de dos ciclos completos
        const t = i * TICK;
        for (const h of collectHits(t, LOOKAHEAD, BPM, s, state)) {
          expect(h.at).toBeLessThanOrEqual(t + LOOKAHEAD);
          emitidos++;
        }
      }
      expect(emitidos).toBeGreaterThan(0);   // que no pase por vacio
    }
  });

  /**
   * Renderiza UN ciclo de la secuencia dada, a ganancia unitaria.
   *
   * El horizonte de un ciclo entero es deliberadamente el que el motor real nunca
   * usa (alla es LOOKAHEAD): es la unica forma de juntar de una todos los onsets
   * del ciclo para medirlos como audio.
   */
  async function renderCiclo(s: Sequence) {
    const state = recienArrancado();
    const cycle = s.length * interval;
    const hits = collectHits(0, cycle, BPM, s, state);
    const ctx = offline(cycle + 1);
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(ctx.destination);
    // 0.35 s es una duracion de render arbitraria, no la duracion de nota del
    // instrumento (esa es NOTE_INTERVALS * intervalDuration(bpm)): este test mide
    // pico y cantidad de onsets, no cuanto dura cada nota.
    // El release SI sale del tempo: es lo unico de la envolvente que depende de el.
    const rel = RELEASE_INTERVALS * intervalDuration(BPM);
    for (const h of hits) if (h.kind === HIT.note) scheduleVoice(ctx, g, h.hz, h.at, 0.35, rel, VEL);
    return (await ctx.startRendering()).getChannelData(0);
  }

  const peak = (d: Float32Array) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  it('separar dos piezas en el recorrido baja el pico y separa los eventos', async () => {
    const A = [60, 62, 64, 67, 69];   // pentatonica mayor de C
    const B = [67, 69, 71, 74, 76];   // la de G
    const juntas = seq(UN_COMPAS, [{ offset: 0, notes: A }, { offset: 0, notes: B }]);
    const separadas = seq(UN_COMPAS, [{ offset: 0, notes: A }, { offset: 8, notes: B }]);
    const alineadas = await renderCiclo(juntas);
    const desfasadas = await renderCiclo(separadas);

    // El pico de dos piezas en el mismo instante es volumen apilado sobre la misma
    // voz; el de dos separadas es el de una pieza sola. Es el problema que ataca
    // desfasar las piezas, y que el recorrido mantiene resuelto.
    expect(peak(desfasadas)).toBeLessThan(peak(alineadas));
    // Y donde habia un evento pasan a haber dos: la textura que el volumen tapaba.
    expect(detectOnsets(desfasadas)).toHaveLength(detectOnsets(alineadas).length * 2);
  });
});

describe('el cruce por celda ocupada', () => {
  const interval = intervalDuration(BPM);

  /**
   * El predicado que estrecha un `Hit` a la rama del cruce.
   *
   * `filter` sobre una union no estrecha por si solo, y el `hz` vive en una sola rama.
   * El predicado explicito es lo que permite afirmar sobre el, que es justo la mitad
   * del contrato que un `hz?: number` habria dejado sin verificar.
   */
  const esCruce = (h: Hit): h is Extract<Hit, { kind: typeof HIT.cross }> => h.kind === HIT.cross;

  // Una altura cualquiera para el cruce, que de este lado del borde es todo lo que hay:
  // el motor ve un MIDI suelto y no la celda que lo origino, asi que la secuencia entra
  // escrita a mano y no derivada de un tablero.
  //
  // NO es el caso testigo del spec, y vale decir por que: con `CROSS_COST = 5` ese
  // tablero —`P` rot 1 en (3,2) e `Y` rot 1 en (7,2)— no pisa nada, porque rodea
  // por la fila 0 (lo fija `board-editing/domain/__tests__/board.test.ts`, "el tramo de la P a la Y no
  // pisa [7,1]"). Atar este test al testigo lo dejaria midiendo un cruce que no
  // ocurre, que es la misma trampa que `playback/ui/__tests__/route-source.test.ts`
  // esquiva eligiendo la `X`.
  const F5 = 77;

  it('un cruce con nota es una TERCERA clase de hit, con su altura', () => {
    const state = recienArrancado();
    const s = seq(8, [{ offset: 0, notes: [60] }], [{ offset: 3 }, { offset: 5, note: F5 }]);
    const hits = collectHits(0, 8 * interval, BPM, s, state);

    const mudos = hits.filter(h => h.kind === HIT.click);
    const cruces = hits.filter(esCruce);
    expect(hits).toHaveLength(3);        // la nota, el click mudo y el cruce
    expect(mudos).toHaveLength(1);
    expect(cruces).toHaveLength(1);
    // Misma grilla que todo lo demas: el cruce no cambia CUANDO suena, solo COMO.
    expect(cruces[0].at).toBeCloseTo(ORIGIN + 5 * interval, 9);
    // En Hz y no en MIDI: la conversion es del motor, igual que con `steps.notes`.
    expect(cruces[0].hz).toBeCloseTo(midiToHz(F5), 9);
    expect(Object.keys(cruces[0]).sort()).toEqual(['at', 'hz', 'kind']);
    // Y el mudo sigue sin altura: la union lo deja afuera, y ademas no se cuela un
    // campo suelto con `undefined` adentro.
    expect(Object.keys(mudos[0]).sort()).toEqual(['at', 'kind']);
  });

  it('AC-PLY-022 — apagar los clicks no puede apagar el cruce con altura', () => {
    const state = recienArrancado();
    const s = seq(8, [{ offset: 0, notes: [60] }], [{ offset: 3 }, { offset: 5, note: F5 }]);
    const hits = collectHits(0, 8 * interval, BPM, s, state);

    // `tick()` apaga la rama muda con un `else if (clicksAudible)`, o sea que con el
    // interruptor en false sobrevive todo lo que no es `HIT.click`. Esa rama no se
    // puede correr aca —`engine.ts` toca el singleton del AudioContext, que en estos
    // tests no existe—, asi que lo que este test clava es lo que la hace posible: que
    // el cruce con altura NO sea un click, ni siquiera un click con `hz`. Con el campo
    // opcional que AC13 descarta, este filtro se llevaria puesta la floritura y el
    // recorrido diria que cruzo por el vacio donde cruzo por una pieza.
    const conClicksApagados = hits.filter(h => h.kind !== HIT.click);
    expect(conClicksApagados.map(clave)).toEqual([
      `note:${midiToHz(60).toFixed(4)}`,
      `cross:${midiToHz(F5).toFixed(4)}`,
    ]);
  });

  it('el cruce sigue al tempo y al swap como cualquier otro evento', () => {
    // Que la clase nueva no se salga de las dos propiedades que sostienen el reloj:
    // periodicidad (dos ciclos, dos cruces) y independencia del tempo (la fraccion
    // del ciclo es la misma a 60 y a 160 bpm).
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

describe('la secuencia cambia al cerrar el ciclo', () => {
  const interval = intervalDuration(BPM);
  /** Dos pasos de una nota: cada hit ES un onset, asi que se pueden contar. */
  const A = seq(8, [{ offset: 0, notes: [60] }, { offset: 4, notes: [64] }]);
  const B = seq(6, [{ offset: 0, notes: [72] }], [{ offset: 3 }]);
  const TICKS = 240;        // 6 s
  const CAMBIO = 100;       // a mitad del tercer ciclo de A

  /** El primer cierre de ciclo de A posterior a lo que A ya tenia comprometido. */
  const bordeEsperado = (comprometido: number) => {
    const cycle = A.length * interval;
    for (let k = 1; k < 100; k++) {
      const b = ORIGIN + k * cycle;
      if (b > comprometido) return b;
    }
    throw new Error('sin borde en rango');
  };

  it('AC-PLY-015 — con la activa vacia la pendiente entra ya, no espera un ciclo que no existe', () => {
    // Sin este caso la primera pieza no sonaria nunca: no hay ciclo que cerrar.
    const state: ClockState = { origin: 0, scheduledUntil: 0 };
    const w = collectWindow(0.5, LOOKAHEAD, BPM, seq(0, []), B, state);

    expect(w.active).toBe(B);
    expect(w.pending).toBeNull();
    expect(state.origin).toBeCloseTo(0.5 + CLOCK_START_DELAY, 9);
    // Y el primer onset del ciclo nuevo SUENA: si scheduledUntil hubiera quedado en
    // origin en vez de antes, firstOnsetAfter lo saltearia y esto daria 0 hits.
    expect(w.hits).toHaveLength(1);
    expect(w.hits[0].at).toBeCloseTo(0.5 + CLOCK_START_DELAY, 9);
  });

  it('sin pendiente la activa sigue igual y el reloj no se mueve de su origen', () => {
    const state = recienArrancado();
    const w = collectWindow(0, LOOKAHEAD, BPM, A, null, state);
    expect(w.active).toBe(A);
    expect(w.pending).toBeNull();
    expect(state.origin).toBe(ORIGIN);
  });

  it('con pendiente pero antes del borde devuelve la MISMA referencia de la activa', () => {
    // No es un detalle de implementacion: `engine.ts` cuenta los swaps de ciclo
    // comparando por identidad (`w.active !== active`) y la UI ata a ese contador el
    // momento en que la cabeza lectora salta al circuito nuevo. Si esta
    // funcion devolviera una copia defensiva cuando NO hubo swap, el contador subiria 40
    // veces por segundo y la cabeza dibujaria el circuito nuevo antes de que suene — que
    // es exactamente el bug que AC9 existe para evitar, y ningun test de audio lo veria.
    // A mitad del primer ciclo de A y no en t = 0: con `origin` en 0.05 el borde del
    // ciclo 0 cae DENTRO del primer lookahead, asi que en t = 0 el swap ya ocurre y el
    // caso que hay que medir —hay pendiente pero el borde todavia no llego— no existe.
    const state = recienArrancado();
    const w = collectWindow(0.5, LOOKAHEAD, BPM, A, B, state);
    expect(w.active).toBe(A);
    expect(w.pending).toBe(B);
    expect(state.origin).toBe(ORIGIN);
  });

  it('AC-PLY-013 — cambiar la secuencia a mitad de ciclo no altera los hits hasta el borde', () => {
    const sinCambio = simular(A, TICKS, recienArrancado());
    const conCambio = simular(A, TICKS, recienArrancado(), { enTick: CAMBIO, a: B });
    const borde = bordeEsperado(conCambio.comprometido);

    // Hasta el borde los dos recorridos tienen que ser el MISMO audio, instante por
    // instante y nota por nota: encolar no interrumpe lo que esta sonando.
    const hasta = (hits: Hit[]) => hits.filter(h => h.at < borde - 1e-9);
    const conInstante = (h: Hit) => `${clave(h)}@${h.at.toFixed(9)}`;
    expect(hasta(conCambio.hits).map(conInstante)).toEqual(hasta(sinCambio.hits).map(conInstante));
    expect(hasta(conCambio.hits).length).toBeGreaterThan(4);   // que no pase por vacio

    // Y despues del borde difieren: el cambio efectivamente entro.
    expect(conCambio.hits.length).not.toBe(sinCambio.hits.length);
  });

  it('AC-PLY-013 — en el empalme del swap no se pierde ni se repite ningun onset', () => {
    const state = recienArrancado();
    const { hits, ultimo, comprometido } = simular(A, TICKS, state, { enTick: CAMBIO, a: B });
    const borde = bordeEsperado(comprometido);

    // La vieja hasta el borde (sin llegar a el) y la nueva desde el borde: el
    // instante del borde es el onset de offset 0 del ciclo nuevo, de nadie mas.
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
    // Que el empalme haya tenido las dos mitades: eventos de A antes y de B despues.
    expect(emitidos.filter(x => x.at < borde).length).toBeGreaterThan(4);
    expect(emitidos.filter(x => x.at >= borde).length).toBeGreaterThan(4);
    // Y que en el borde haya sonado la NUEVA, no un paso mas de la vieja.
    expect(emitidos.find(x => casiIgual(x.at, borde))?.clave).toBe(`note:${midiToHz(72).toFixed(4)}`);
  });

  it('AC-PLY-013 — el borde es el nuevo origin, y el primer onset del ciclo nuevo cae ahi', () => {
    const state = recienArrancado();
    const { hits, comprometido } = simular(A, TICKS, state, { enTick: CAMBIO, a: B });
    const borde = bordeEsperado(comprometido);

    expect(state.origin).toBeCloseTo(borde, 9);
    expect(hits.some(h => casiIgual(h.at, borde))).toBe(true);
    // Uno solo en el borde: si la vieja no se hubiera acotado, ahi habria dos.
    expect(hits.filter(h => casiIgual(h.at, borde))).toHaveLength(1);
  });

  it('el swap se decide antes de cruzar el borde: nada se agenda en el pasado', () => {
    // El horizonte es de 100 ms y el borde se mira cada 25 ms. Si el swap esperara a
    // que currentTime pasara el borde, el primer onset del ciclo nuevo ya seria
    // pasado al agendarlo. Se decide adentro del lookahead justamente para evitarlo.
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

  it('el swap deja `origin` en el FUTURO, asi que el ciclo nuevo todavia no suena', () => {
    // La contracara del test de arriba, y lo que obliga a la guarda `now < origin` de
    // `playheadOffset`. El swap se decide DENTRO del lookahead: cuando ocurre, `origin`
    // es el borde y todavia no llego, mientras lo que se escucha sigue siendo la cola
    // de la vieja, agendada hasta medio intervalo antes.
    //
    // Sin la guarda, `offsetAt` contesta —bien, como funcion total— la COLA del ciclo
    // nuevo, o sea `ciclo - 1`. Ese numero es el MAXIMO posible, y el velo de
    // `Playhead.tsx` destapa toda celda con `offset <= offset actual`: las cinco de la
    // pieza se estrenaban juntas en el cuadro del swap, o sea que el estreno celda por
    // celda no se veia nunca. Lo que se afirma aca es el hecho del scheduler que lo
    // causa; es testeable, y la lectura del reloj que lo consume no.
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
      // Sin latencia de salida y con ella: la resta solo agranda la ventana.
      for (const latencia of [0, 0.01, 0.05]) {
        expect(offsetAt(t - latencia, state.origin, interval, active.length)).toBe(active.length - 1);
      }
    }
    expect(swaps).toBe(1);
  });

  it('AC-PLY-037 — quitar la ultima pieza deja la secuencia vacia sin colgar el reloj', () => {
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
    // Y despues del cierre no vuelve a sonar nada.
    const borde = state.origin;
    expect(hits.filter(h => h.at >= borde)).toHaveLength(0);
  });

  it('AC-PLY-014 — encolar dos veces antes del cierre deja la ultima: se encola el recorrido entero', () => {
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
