import { describe, it, expect } from 'vitest';
import { miniCells } from '../piece-mini.ts';
import { rotateN, reflect, normalize } from '../transform.ts';
import { SHAPES, CELLS_PER_PIECE } from '../pieces.ts';
import { MINI_BOX } from '../piece-mini.ts';
import type { PieceKey } from '../pieces.ts';

/**
 * `miniCells` is arithmetic of the kind that **compiles the same when it is wrong**.
 *
 * A `round` in place of a `floor`, or the width read before the normalization, puts the
 * piece against an edge in some orientations and not in others. So the tests cover the
 * whole space (12 pieces × 4 rotations × 2 reflections) and not a sample: it is the same
 * space that `check_invariants` covers.
 */
const PIEZAS = Object.keys(SHAPES) as PieceKey[];

/** The 96 combinations, so that no test writes them again. */
const COMBINACIONES: [PieceKey, number, boolean][] = PIEZAS.flatMap((p) =>
  [0, 1, 2, 3].flatMap((r): [PieceKey, number, boolean][] => [[p, r, false], [p, r, true]]),
);

const nombre = (p: PieceKey, r: number, m: boolean) => `${p} rot${r}${m ? ' reflected' : ''}`;

describe('the space that these tests cover', () => {
  it('is the 96 combinations and the twelve pieces', () => {
    // A guard of this file: if someone edits the `flatMap` and leaves half, the `for`
    // loops below would pass the same with fewer cases.
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
    // This is the test that catches the `round`: with it, a shape of even width in an odd
    // box moves one place too far and the left margin is larger than the right one. With
    // `floor` the spare square is ALWAYS at the right and at the bottom, so the
    // difference is 0 or 1 and never -1.
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
    // If this stopped being true, `MINI_BOX` could go down to 4. If it starts to fail,
    // the box is too small.
    const acostada = miniCells('I', 0, false);
    const parada = miniCells('I', 1, false);
    expect(new Set(acostada.map((c) => c[0])).size).toBe(MINI_BOX);
    expect(new Set(parada.map((c) => c[1])).size).toBe(MINI_BOX);
  });
});

describe('the box does not depend on the orientation', () => {
  it('no orientation of any piece leaves the box', () => {
    // The box is drawn with five fixed tracks, so the reflow that the fixed box avoids
    // does not depend on this pure function. What this function does guarantee is that
    // the shape does not overflow the box at the bottom, which would bring the reflow
    // back another way.
    const fuera = COMBINACIONES.filter(([p, r, m]) =>
      miniCells(p, r, m).some(([x, y]) => x < 0 || y < 0 || x >= MINI_BOX || y >= MINI_BOX));
    expect(fuera.map(([p, r, m]) => nombre(p, r, m))).toEqual([]);
  });
});

describe('it composes `rotateN` and `reflect`, and does not write them again', () => {
  it('normalized, the result is the same shape as the chain made by hand', () => {
    // The comparison is with `normalize` of the result and not with "the result before
    // the centering": the signature does not expose that middle step and has no need to.
    // The centering is a translation, so the normalization undoes it exactly.
    for (const [p, r, m] of COMBINACIONES) {
      const rotada = rotateN(SHAPES[p], r);
      const esperado = m ? reflect(rotada) : rotada;
      expect(normalize(miniCells(p, r, m)), nombre(p, r, m)).toEqual(esperado);
    }
  });

  it('AC-PCS-014 — the order of the chain is rotation and THEN reflection', () => {
    // The reverse order compiles and gives the wrong orientation in 48 of the 96. This
    // test finds the pieces where the two chains differ, so that the assertion is not
    // empty, and verifies that `miniCells` follows the chain of `App.tsx`,
    // `invariants.ts` and `describePiece.ts`.
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
    // `rotateN` and `reflect` return new arrays, but the `map` of the centering runs on
    // what they return: if one of the two started to mutate its input, the palette would
    // corrupt the table of shapes of the domain on each rotation.
    const antes = JSON.stringify(SHAPES);
    for (const [p, r, m] of COMBINACIONES) miniCells(p, r, m);
    expect(JSON.stringify(SHAPES)).toBe(antes);
  });
});
