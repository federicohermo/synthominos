import { describe, it, expect } from 'vitest';
import { miniCells } from '../piece-mini.ts';
import { rotateN, reflect, normalize } from '../transform.ts';
import { SHAPES, CELLS_PER_PIECE } from '../pieces.ts';
import { MINI_BOX } from '../piece-mini.ts';
import type { PieceKey } from '../pieces.ts';

const PIEZAS = Object.keys(SHAPES) as PieceKey[];

const COMBINACIONES: [PieceKey, number, boolean][] = PIEZAS.flatMap((p) =>
  [0, 1, 2, 3].flatMap((r): [PieceKey, number, boolean][] => [[p, r, false], [p, r, true]]),
);

const nombre = (p: PieceKey, r: number, m: boolean) => `${p} rot${r}${m ? ' reflected' : ''}`;

describe('the space that these tests cover', () => {
  it('is the 96 combinations and the twelve pieces', () => {
    expect(PIEZAS).toHaveLength(12);
    expect(COMBINACIONES).toHaveLength(96);
  });
});

describe('the shape fits the box and is centered', () => {
  it('the five cells are within 0..4 on the two axes', () => {
    for (const [p, r, m] of COMBINACIONES) {
      const celdas = miniCells(p, r, m);
      expect(celdas, nombre(p, r, m)).toHaveLength(CELLS_PER_PIECE);
      for (const [x, y] of celdas) {
        expect(x >= 0 && x < MINI_BOX, `${nombre(p, r, m)} x=${x}`).toBe(true);
        expect(y >= 0 && y < MINI_BOX, `${nombre(p, r, m)} y=${y}`).toBe(true);
      }
    }
  });

  it('the margin is symmetric but for the odd square, which is always on the same side', () => {
    for (const [p, r, m] of COMBINACIONES) {
      const celdas = miniCells(p, r, m);
      const xs = celdas.map((c) => c[0]);
      const ys = celdas.map((c) => c[1]);
      const izq = Math.min(...xs);
      const der = MINI_BOX - 1 - Math.max(...xs);
      const arriba = Math.min(...ys);
      const abajo = MINI_BOX - 1 - Math.max(...ys);
      expect(der - izq, `${nombre(p, r, m)} horizontal`).toBeGreaterThanOrEqual(0);
      expect(der - izq, `${nombre(p, r, m)} horizontal`).toBeLessThanOrEqual(1);
      expect(abajo - arriba, `${nombre(p, r, m)} vertical`).toBeGreaterThanOrEqual(0);
      expect(abajo - arriba, `${nombre(p, r, m)} vertical`).toBeLessThanOrEqual(1);
    }
  });

  it('the `I` is the case that sets the box: it fills one whole axis with no margin', () => {
    const acostada = miniCells('I', 0, false);
    const parada = miniCells('I', 1, false);
    expect(new Set(acostada.map((c) => c[0])).size).toBe(MINI_BOX);
    expect(new Set(parada.map((c) => c[1])).size).toBe(MINI_BOX);
  });
});

describe('the box does not depend on the orientation', () => {
  it('no orientation of any piece leaves the box', () => {
    const fuera = COMBINACIONES.filter(([p, r, m]) =>
      miniCells(p, r, m).some(([x, y]) => x < 0 || y < 0 || x >= MINI_BOX || y >= MINI_BOX));
    expect(fuera.map(([p, r, m]) => nombre(p, r, m))).toEqual([]);
  });
});

describe('it composes `rotateN` and `reflect`, and does not write them again', () => {
  it('normalized, the result is the same shape as the chain made by hand', () => {
    for (const [p, r, m] of COMBINACIONES) {
      const rotada = rotateN(SHAPES[p], r);
      const esperado = m ? reflect(rotada) : rotada;
      expect(normalize(miniCells(p, r, m)), nombre(p, r, m)).toEqual(esperado);
    }
  });

  it('AC-PCS-014 — the order of the chain is rotation and THEN reflection', () => {
    const difieren = COMBINACIONES.filter(([p, r, m]) =>
      m && JSON.stringify(reflect(rotateN(SHAPES[p], r))) !== JSON.stringify(rotateN(reflect(SHAPES[p]), r)));
    expect(difieren.length).toBeGreaterThan(0);
    for (const [p, r, m] of difieren) {
      expect(normalize(miniCells(p, r, m)), nombre(p, r, m)).toEqual(reflect(rotateN(SHAPES[p], r)));
    }
  });
});

describe('determinism', () => {
  it('same input, same result', () => {
    for (const [p, r, m] of COMBINACIONES) {
      expect(miniCells(p, r, m), nombre(p, r, m)).toEqual(miniCells(p, r, m));
    }
  });

  it('does not mutate `SHAPES`', () => {
    const antes = JSON.stringify(SHAPES);
    for (const [p, r, m] of COMBINACIONES) miniCells(p, r, m);
    expect(JSON.stringify(SHAPES)).toBe(antes);
  });
});
