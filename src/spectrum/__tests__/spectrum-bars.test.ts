import { describe, it, expect } from 'vitest';
import { binsToBars } from '../spectrum-bars.ts';

/**
 * Ningun test de este archivo toca AudioContext, y no es una comodidad: es el
 * objetivo del diseno.
 *
 * AnalyserNode no rinde nada util en un OfflineAudioContext, asi que la unica forma
 * de verificar el mapeo es tenerlo separado del nodo.
 */

/** Un espectro con un solo bin encendido. Sonda para ver a que barra cae. */
function oneHot(binCount: number, i: number): Uint8Array {
  const bins = new Uint8Array(binCount);
  bins[i] = 255;
  return bins;
}

/** Cuantos bins caen en la barra `bar`, medido barriendo bin por bin. */
function spanOf(binCount: number, barCount: number, bar: number): number {
  let n = 0;
  for (let i = 0; i < binCount; i++) {
    if (binsToBars(oneHot(binCount, i), barCount)[bar] > 0) n++;
  }
  return n;
}

describe('binsToBars', () => {
  it('AC-SPC-005 — determinista y normalizado 0-1', () => {
    const bins = new Uint8Array(128).fill(255);
    expect(Array.from(binsToBars(bins, 8))).toEqual(new Array(8).fill(1));

    // Determinismo: la misma entrada dos veces da exactamente lo mismo.
    const half = new Uint8Array(128).fill(128);
    expect(Array.from(binsToBars(half, 16))).toEqual(Array.from(binsToBars(half, 16)));

    // Normalizacion: 255 es el maximo que devuelve getByteFrequencyData.
    // La tolerancia es de 6 digitos y no mas porque la salida es Float32Array:
    // 128/255 se redondea al float de 32 bits mas cercano al guardarse.
    for (const v of binsToBars(half, 16)) expect(v).toBeCloseTo(128 / 255, 6);
  });

  it('AC-SPC-006 — es el pico de la banda, no el promedio', () => {
    // Un unico bin fuerte dentro de una banda ancha tiene que llegar entero a la
    // barra: es el transitorio que el promedio se comeria.
    const bins = new Uint8Array(128);
    bins[100] = 255;
    const bars = binsToBars(bins, 8);
    expect(Math.max(...bars)).toBe(1);
  });

  it('AC-SPC-007 — la banda grave abarca menos bins que la aguda', () => {
    const grave = spanOf(128, 8, 0);
    const aguda = spanOf(128, 8, 7);
    expect(grave).toBeLessThan(aguda);
    expect(grave).toBeGreaterThan(0);   // ninguna banda queda ciega
  });

  it('AC-SPC-007 — el reparto es monotono: cada banda cubre al menos lo que la anterior', () => {
    const spans = Array.from({ length: 8 }, (_, b) => spanOf(128, 8, b));
    for (let b = 1; b < spans.length; b++) expect(spans[b]).toBeGreaterThanOrEqual(spans[b - 1]);
  });

  it('AC-SPC-008 — todos los bins llegan a alguna barra, incluido el mas agudo', () => {
    for (let i = 0; i < 128; i++) {
      expect(Math.max(...binsToBars(oneHot(128, i), 8))).toBe(1);
    }
  });

  it('AC-SPC-009 — bins en cero da todas las barras en cero', () => {
    expect(binsToBars(new Uint8Array(128), 8).every(v => v === 0)).toBe(true);
  });

  it('AC-SPC-010 — barCount mayor que la cantidad de bins: ninguna barra queda vacia', () => {
    const bars = binsToBars(new Uint8Array(4).fill(255), 32);
    expect(bars.length).toBe(32);
    expect(Array.from(bars)).toEqual(new Array(32).fill(1));
  });

  it('AC-SPC-011 — barCount de 1 devuelve el pico de todo el espectro', () => {
    expect(binsToBars(new Uint8Array(128).fill(255), 1)[0]).toBe(1);

    const bins = new Uint8Array(128);
    bins[127] = 51;                                  // el bin mas agudo, a 0.2
    expect(binsToBars(bins, 1)[0]).toBeCloseTo(0.2, 6);
  });

  it('AC-SPC-012 — entradas degeneradas devuelven un array vacio en vez de romper', () => {
    expect(binsToBars(new Uint8Array(128), 0).length).toBe(0);
    expect(binsToBars(new Uint8Array(128), -4).length).toBe(0);
    expect(binsToBars(new Uint8Array(0), 8).every(v => v === 0)).toBe(true);
  });
});
