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
import { FFT_SIZE, SMOOTHING } from '../engine.ts';
import type { ClockState } from '../scheduler.ts';
import { offline, peakNear, detectOnsets, zeroCrossHz, SR } from './test-context.ts';

const A4 = 69;
const VEL = 0.8;

/**
 * El release al tempo por defecto (0,12 s).
 *
 * Estos tests miden onsets y picos, no la cola de la envolvente, asi que les alcanza
 * con un valor fijo — el mismo que el instrumento usa a 110 bpm. Quien verifica que el
 * release siga al tempo es `voice.test.ts`.
 */
const REL = RELEASE_INTERVALS * intervalDuration(110);

describe('scheduler + sintesis integrados', () => {
  it('AC-PLY-010 — los disparos se oyen donde el scheduler dijo (+-6 ms)', async () => {
    const state: ClockState = { origin: 0.5, scheduledUntil: 0 };
    // Una sola nota: hit y onset coinciden por construccion. Y un ciclo de 16
    // intervalos es un compas exacto, o sea el periodo de antes: a
    // 120 bpm da los mismos 2 s que este test medía con `phase`.
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

  it('la nota y el click del recorrido suenan donde el scheduler dijo, y el click no ocupa lugar', async () => {
    const bpm = 110;
    const interval = intervalDuration(bpm);
    const state: ClockState = { origin: 0.2, scheduledUntil: 0 };
    // Un paso y un cruce por celda vacia tres intervalos despues: el caso que el
    // recorrido hace posible, con las dos clases de hit en la misma grilla.
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

    // El click no invade el intervalo que sigue: 80 ms despues ya es silencio
    // absoluto (`CLICK_SECONDS` 0,05 mas 0,03), donde una nota del mismo instante
    // todavia estaria sonando (0,136 s mas el release). El click es
    // un oscilador y no un buffer, asi que ese cero lo garantiza su `stop()`: sin el,
    // el epsilon en el que muere la caida exponencial seguiria sonando aca.
    const click = hits[1].at;
    expect(peakNear(d, click + 0.002)).toBeGreaterThan(0.1);
    expect(peakNear(d, click + CLICK_SECONDS + 0.03)).toBe(0);
  });

  it('AC-PLY-019 — el cruce por celda ocupada suena su altura, mas corto y mas suave', async () => {
    const bpm = 110;
    const interval = intervalDuration(bpm);
    const rel = RELEASE_INTERVALS * interval;
    const state: ClockState = { origin: 0.2, scheduledUntil: 0 };
    // Una pieza y, cuatro intervalos despues, el recorrido pisando una celda ocupada
    // que suena F5 (MIDI 77) — el caso testigo.
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
    // El mismo despacho que hace `tick()`, que no se puede correr aca: `engine.ts`
    // toca el singleton del AudioContext. Lo que se verifica es que con esos dos
    // numeros el cruce SUENA como floritura y no como una nota mas.
    for (const h of hits) {
      if (h.kind === HIT.note) scheduleVoice(ctx, g, h.hz, h.at, NOTE_INTERVALS * interval, rel, VEL);
      else if (h.kind === HIT.cross) scheduleVoice(ctx, g, h.hz, h.at, GRACE_INTERVALS * interval, rel, GRACE_VELOCITY);
    }
    const d = (await ctx.startRendering()).getChannelData(0);

    const [nota, cruce] = [hits[0].at, hits[1].at];

    // TIENE altura, y es la de la CELDA: eso es lo que lo separa del click. Desde el
    // el click tambien tiene altura, pero es una sola y siempre la misma
    // —una marca—, mientras que esta sale del modelo y cambia con lo que se piso. Se
    // mide en el sostenido, despues del transitorio.
    const hz = zeroCrossHz(d, cruce + 0.02, cruce + GRACE_INTERVALS * interval);
    expect(Math.abs(hz - midiToHz(77)) / midiToHz(77)).toBeLessThan(0.02);

    // Mas SUAVE: 0.45 contra 0.8, unos -5 dB. Se compara contra la nota renderizada en
    // el mismo buffer y no contra un numero, que seria copiar la constante.
    expect(peakNear(d, cruce + 0.003)).toBeLessThan(peakNear(d, nota + 0.003) * 0.7);
    expect(peakNear(d, cruce + 0.003)).toBeGreaterThan(0.2);

    // Mas CORTO: 0,75 + 0,88 intervalos contra 1 + 0,88. A 1,75 intervalos del onset
    // la nota todavia esta cayendo y el cruce ya se apago — 34 ms de diferencia, que
    // es lo que separa a una floritura de una nota que ocupa su lugar en el ciclo.
    expect(peakNear(d, nota + 1.75 * interval)).toBeGreaterThan(0.02);
    expect(peakNear(d, cruce + 1.75 * interval)).toBe(0);
  });

  it('dos notas superpuestas suman amplitud', async () => {
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

    // En sostenido cada voz aporta vel*sustain = 0.2. Suman, pero no en fase, asi
    // que el pico conjunto queda entre una voz sola y el maximo teorico de 0.4.
    expect(dueto).toBeGreaterThan(solo);
    expect(dueto).toBeLessThanOrEqual(0.4 + 1e-6);
    expect((await render([midiToHz(60)])).length).toBe(SR);
  });
});

describe('analizador', () => {
  it('AC-SPC-002 — el nodo es transparente: la senal que sale es la misma', async () => {
    // No verifica el analisis —getByteFrequencyData no rinde nada util offline,
    // por eso el mapeo vive en spectrum-bars.ts— sino la unica parte del AC1 que se
    // puede afirmar sin escuchar: insertar el nodo en serie no altera el audio.
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
      // 0.35 s es una duracion de render arbitraria: este test es sobre la
      // transparencia del analizador, no sobre cuanto dura la nota (esa cuenta
      // es NOTE_INTERVALS * intervalDuration(bpm), y no hay
      // bpm en juego aca).
      scheduleVoice(ctx, g, midiToHz(60), 0.1, 0.35, REL, VEL);
      return (await ctx.startRendering()).getChannelData(0);
    };

    const directo = await render(false);
    const analizado = await render(true);
    expect(analizado.length).toBe(directo.length);
    for (let i = 0; i < directo.length; i++) {
      if (analizado[i] !== directo[i]) {
        throw new Error(`el analizador altero la muestra ${i}: ${directo[i]} -> ${analizado[i]}`);
      }
    }
  });
});
