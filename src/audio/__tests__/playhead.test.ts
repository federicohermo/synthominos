import { describe, it, expect } from 'vitest';
import { offsetAt } from '../playhead.ts';

/**
 * Ningun test de este archivo toca AudioContext, y es exactamente el motivo por el que
 * la cuenta vive fuera de `engine.ts`.
 *
 * El offset se puede afirmar con cuatro numeros, la lectura del reloj no. Mismo
 * argumento que separa `spectrum.ts` del AnalyserNode.
 *
 * Los tiempos usan intervalos de 0.25 s y origins enteros a proposito: son exactos en
 * binario, asi que un fallo es del algoritmo y no del redondeo.
 */

describe('offsetAt', () => {
  it('AC-PLY-027 — dentro del primer ciclo avanza un intervalo por intervalo', () => {
    for (let k = 0; k < 8; k++) expect(offsetAt(10 + k * 0.25, 10, 0.25, 8)).toBe(k);
  });

  it('AC-PLY-027 — es entero: no interpola dentro del intervalo (D6)', () => {
    expect(offsetAt(10 + 0.999 * 0.25, 10, 0.25, 8)).toBe(0);
    expect(offsetAt(10 + 1.001 * 0.25, 10, 0.25, 8)).toBe(1);
  });

  it('AC-PLY-027 — en el borde del ciclo vuelve a 0, no a 8', () => {
    expect(offsetAt(10 + 7 * 0.25, 10, 0.25, 8)).toBe(7);
    expect(offsetAt(10 + 8 * 0.25, 10, 0.25, 8)).toBe(0);
    expect(offsetAt(10 + 9 * 0.25, 10, 0.25, 8)).toBe(1);
  });

  it('AC-PLY-027 — varios ciclos adelante sigue dentro del rango', () => {
    expect(offsetAt(10 + (5 * 8 + 3) * 0.25, 10, 0.25, 8)).toBe(3);
    expect(offsetAt(10 + (1000 * 8 + 6) * 0.25, 10, 0.25, 8)).toBe(6);
    // Un ciclo realista: 55 intervalos son las 8 piezas medidas.
    expect(offsetAt(10 + (37 * 55 + 54) * 0.25, 10, 0.25, 55)).toBe(54);
  });

  it('AC-PLY-028 — ciclo 0: null, porque `x % 0` en JS es NaN', () => {
    // Es el tablero vacio, y se alcanza con solo apretar play.
    expect(offsetAt(11, 10, 0.25, 0)).toBeNull();
    expect(offsetAt(11, 10, 0.25, -3)).toBeNull();
    expect(offsetAt(11, 10, 0.25, 0.5)).toBeNull();
  });

  it('AC-PLY-028 — t anterior al origin: entero no negativo, no el -1 del % de JS', () => {
    // La ventana de CLOCK_START_DELAY entre startClock y el primer onset.
    expect(offsetAt(10 - 0.05, 10, 0.25, 8)).toBe(7);
    expect(offsetAt(10 - 0.25, 10, 0.25, 8)).toBe(7);
    expect(offsetAt(10 - 8 * 0.25, 10, 0.25, 8)).toBe(0);

    for (let k = 1; k <= 40; k++) {
      const v = offsetAt(10 - k * 0.25, 10, 0.25, 8) ?? NaN;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8);
    }
  });

  it('una sola pieza: el offset nunca se sale del ciclo corto', () => {
    for (const t of [9.9, 10, 10.1, 10.25, 12.5]) expect(offsetAt(t, 10, 0.25, 1)).toBe(0);
    // Un ciclo de 5 intervalos: la pieza sola mas el salto de vuelta a si misma.
    for (let k = -12; k < 30; k++) {
      const v = offsetAt(10 + k * 0.25, 10, 0.25, 5) ?? NaN;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBe(((k % 5) + 5) % 5);
    }
  });

  it('AC-PLY-028 — intervalo no positivo: null en vez de dividir por cero', () => {
    expect(offsetAt(11, 10, 0, 8)).toBeNull();
    expect(offsetAt(11, 10, -0.25, 8)).toBeNull();
  });

  it('AC-PLY-028 — argumentos no finitos: null', () => {
    expect(offsetAt(NaN, 10, 0.25, 8)).toBeNull();
    expect(offsetAt(11, NaN, 0.25, 8)).toBeNull();
    expect(offsetAt(11, 10, NaN, 8)).toBeNull();
    expect(offsetAt(11, 10, 0.25, NaN)).toBeNull();
    expect(offsetAt(Infinity, 10, 0.25, 8)).toBeNull();
    expect(offsetAt(-Infinity, 10, 0.25, 8)).toBeNull();
    expect(offsetAt(11, 10, Infinity, 8)).toBeNull();
    expect(offsetAt(11, 10, 0.25, Infinity)).toBeNull();
  });

  it('AC-PLY-028 — barrido con instantes que no caen en la grilla: nunca NaN', () => {
    for (const ciclo of [1, 5, 8, 55]) {
      for (let k = -60; k < 240; k++) {
        const v = offsetAt(10 + k * 0.0341, 10, 0.25, ciclo) ?? NaN;
        expect(Number.isNaN(v)).toBe(false);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(ciclo);
      }
    }
  });
});
