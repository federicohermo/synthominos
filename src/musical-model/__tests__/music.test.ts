import { describe, it, expect } from 'vitest';
import {
  angularRank,
  arpeggioFor,
  degreeByCellIndex,
  midiFor,
  midiName,
  notesForRotation,
  playOrderByCellIndex,
  BASE_MAP,
  CHROMATIC,
  DEFAULT_OCTAVE,
  DEGREE_EPSILON,
  PENT_MAJOR,
  PENT_MINOR,
  PENT_BLUES5,
  REGIMEN,
  NOTES_PER_PIECE,
} from '../music.ts';
import { centroid, normalize, pathThroughCells, reflect, rotateN } from '../../pieces/transform.ts';
import { cellsAt } from '../../board-editing/placement.ts';
import { ANCHOR_INDEX, SHAPES } from '../../pieces/pieces.ts';
import type { Cell } from '../../pieces/transform.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { RegimenDeRotacion } from '../music.ts';

const PIECES = Object.keys(BASE_MAP) as PieceKey[];

describe('midiFor', () => {
  it('AC-MUS-003 — puts C4 at 60', () => {
    expect(midiFor(0, 4)).toBe(60);
    expect(midiFor(9, 4)).toBe(69);   // A4
  });

  it('one octave is 12 semitones', () => {
    expect(midiFor(0, 5) - midiFor(0, 4)).toBe(12);
  });
});

describe('midiName', () => {
  it('AC-MUS-003 — is the inverse of midiFor over the 12 pitch classes and several octaves', () => {
    for (let o = 0; o <= 8; o++) {
      for (let pc = 0; pc < 12; pc++) {
        expect(midiName(midiFor(pc, o))).toBe(`${CHROMATIC[pc]}${o}`);
      }
    }
  });
});

describe('notesForRotation', () => {
  it('AC-MUS-005 — each rotation uses its formula, on C', () => {
    const base = midiFor(0, DEFAULT_OCTAVE);
    expect(notesForRotation(0, DEFAULT_OCTAVE, 0, REGIMEN.escala)).toEqual(PENT_MAJOR.map(iv => base + iv));
    expect(notesForRotation(0, DEFAULT_OCTAVE, 1, REGIMEN.escala)).toEqual(PENT_MINOR.map(iv => base + iv));
    expect(notesForRotation(0, DEFAULT_OCTAVE, 2, REGIMEN.escala)).toEqual(PENT_BLUES5.map(iv => base + iv));
    expect(notesForRotation(0, DEFAULT_OCTAVE, 3, REGIMEN.escala)).toEqual(PENT_MAJOR.map(iv => base + iv + 7));
  });

  it('in the scale regime, a rotation outside 0..3 falls back to the major formula', () => {
    expect(notesForRotation(0, DEFAULT_OCTAVE, 4, REGIMEN.escala)).toEqual(notesForRotation(0, DEFAULT_OCTAVE, 0, REGIMEN.escala));
  });

  // The title above says the scale regime on purpose: the two regimes do NOT do the same
  // out of range, and that divergence is the argument to bound the type of `rotation`.
  // While it is a `number`, the edge has a test.
  it('in the order regime, a rotation outside 0..3 shifts cyclically and does not fall back to the major formula', () => {
    const rot0 = notesForRotation(0, DEFAULT_OCTAVE, 0, REGIMEN.orden);
    // `rot: 4` is NOT rotation 0: it is shift 4, so the last note comes first.
    expect(notesForRotation(0, DEFAULT_OCTAVE, 4, REGIMEN.orden)).not.toEqual(rot0);
    expect(notesForRotation(0, DEFAULT_OCTAVE, 5, REGIMEN.orden)).toEqual(rot0);
  });

  // The `%` of JS keeps the sign of the dividend, so a single modulo leaves `base[-1]`:
  // `undefined`, which `midiName` paints as `undefinedNaN` in the cell. It is the same
  // hole that the modulo exists to close, on the other side of zero.
  it('in the order regime, a NEGATIVE rotation still gives a cyclic permutation', () => {
    const rot0 = notesForRotation(0, DEFAULT_OCTAVE, 0, REGIMEN.orden);
    for (const rot of [-1, -2, -5, -6]) {
      const ns = notesForRotation(0, DEFAULT_OCTAVE, rot, REGIMEN.orden);
      expect(ns).toHaveLength(5);
      expect(ns.every(n => Number.isInteger(n))).toBe(true);
      expect([...ns].sort((a, b) => a - b)).toEqual([...rot0].sort((a, b) => a - b));
    }
    // `-5` is one whole turn backward: the net shift is 0.
    expect(notesForRotation(0, DEFAULT_OCTAVE, -5, REGIMEN.orden)).toEqual(rot0);
  });

  it('AC-MUS-001 AC-MUS-006 — returns 5 distinct ascending notes for the 48 combinations of the scale regime', () => {
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
        expect(ns).toHaveLength(5);
        expect(new Set(ns).size).toBe(5);
        for (let i = 1; i < ns.length; i++) expect(ns[i]).toBeGreaterThan(ns[i - 1]);
      }
    }
  });

  it('the lowest note of a piece is its tonic', () => {
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
        // Rotation 3 transposes +7, so its lowest note is the fifth, not the tonic.
        const esperada = rot === 3 ? (BASE_MAP[p] + 7) % 12 : BASE_MAP[p];
        expect(ns[0] % 12).toBe(esperada);
      }
    }
  });

  it('AC-MUS-004 — the octave shift raises the note and does not wrap it', () => {
    // Z (tonic B = 11) + the major sixth (9) passes B: the note goes up one octave and
    // does not come back to the low end. It is a design decision, not a bug.
    const ns = notesForRotation(BASE_MAP.Z, DEFAULT_OCTAVE, 0, REGIMEN.escala);
    expect(ns[4] - ns[0]).toBe(9);
    expect(midiName(ns[0])).toBe('B4');
    expect(midiName(ns[4])).toBe('G#5');
  });

  it('AC-MUS-006 — the span is never more than a tenth', () => {
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
        const ambito = ns[4] - ns[0];
        expect(ambito).toBeGreaterThanOrEqual(7);
        expect(ambito).toBeLessThanOrEqual(10);
      }
    }
  });
});

/**
 * The whole cell→note derivation, as the code that draws the board builds it.
 *
 * The degree comes from the CANONICAL shape indexed by `k`, and the note comes from the
 * ASCENDING arpeggio indexed by that degree.
 *
 * The regime is a parameter and not a fixed `escala`: it is the only thing that separates
 * the count of the 36 cells that survive a rotation from the count of 0.
 */
const notaDeCelda = (p: PieceKey, rot: number, k: number, regimen: RegimenDeRotacion): number =>
  notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, regimen)[degreeByCellIndex(SHAPES[p])[k]];

/** How far the arpeggio moves from one note to the next. */
const distanciasDelArpegio = (p: PieceKey): number[] => {
  const grados = degreeByCellIndex(SHAPES[p]);
  const orden = grados.map((_, g) => SHAPES[p][grados.indexOf(g)]);
  return orden.slice(1).map((c, i) => Math.abs(c[0] - orden[i][0]) + Math.abs(c[1] - orden[i][1]));
};

const distanciaAlCentro = (p: PieceKey, k: number) => {
  const cent = centroid(SHAPES[p]);
  return Math.hypot(SHAPES[p][k][0] - cent[0], SHAPES[p][k][1] - cent[1]);
};

/**
 * CHARACTERIZATION tests of the scale regime.
 *
 * They describe no new rule: they freeze the rule of the scale regime, so that to break
 * it fails here and not in a listening session three steps later.
 *
 * They do not freeze the notes, which the frozen reference below does. They freeze the
 * property that a rotation KEEPS part of the material. That is exactly what the order
 * regime does not do, so without it written here the comparison of the two regimes would
 * have nothing to measure against.
 */
describe('scale regime: what survives a rotation (characterization)', () => {
  // 12 pieces x 3 rotations (all but 0) x 5 cells = 180. Rotation 0 stays out because it
  // is the reference of the comparison, not one more case.
  const ROTACIONES = [1, 2, 3];

  it('AC-MUS-010 — 36 of 180 cells keep their note, split 24 / 12 / 0', () => {
    const porRotacion = ROTACIONES.map(rot =>
      PIECES.reduce((n, p) =>
        n + SHAPES[p].reduce((m, _c, k) => m + (notaDeCelda(p, rot, k, REGIMEN.escala) === notaDeCelda(p, 0, k, REGIMEN.escala) ? 1 : 0), 0), 0));

    // The three numbers are EXPLAINED and not measured by chance: the formulas share
    // degrees. `PENT_MAJOR` and `PENT_MINOR` agree at degrees 0 and 3 (2 degrees x 12
    // pieces = 24), `PENT_MAJOR` and `PENT_BLUES5` only at 0 (12), and rotation 3
    // transposes ALL by +7, so it keeps none.
    expect(porRotacion).toEqual([24, 12, 0]);
    expect(porRotacion.reduce((a, b) => a + b, 0)).toBe(36);
  });

  it('AC-MUS-010 — degree 0 keeps the tonic at rotations 1 and 2, and NOT at 3', () => {
    // This is the property that makes `BASE_MAP` heard as identity: a rotation changes
    // the scale of a piece but leaves it anchored to its note. Rotation 3 is the only
    // exception, and the +7 transposition causes it.
    for (const p of PIECES) {
      const tonica = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala)[0];
      expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 1, REGIMEN.escala)[0], `${p} rot1`).toBe(tonica);
      expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 2, REGIMEN.escala)[0], `${p} rot2`).toBe(tonica);
      expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 3, REGIMEN.escala)[0], `${p} rot3`).not.toBe(tonica);
    }
  });
});

/**
 * The order regime, the second branch of `notesForRotation`.
 *
 * The oracle of these tests is NOT `notesForRotation`: the expected notes are composed by
 * hand from the formulas and the rule of the `octShift`, because a regression test that
 * calls the function it verifies verifies nothing.
 */
describe('the two regimes of rotation', () => {
  const FORMULAS = [PENT_MAJOR, PENT_MINOR, PENT_BLUES5, PENT_MAJOR];
  const TRANSPOSE = [0, 0, 0, 7];

  /** The formula on the tonic, with the octave shift. Written by hand on purpose. */
  const desdeLaFormula = (p: PieceKey, formula: readonly number[], transpose: number): number[] =>
    formula.map(iv => {
      const total = BASE_MAP[p] + iv + transpose;
      return midiFor(((total % 12) + 12) % 12, DEFAULT_OCTAVE + Math.floor(total / 12));
    });

  it('in the scale regime the 48 combinations give exactly the four formulas written by hand', () => {
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala), `${p}/${rot}`)
          .toEqual(desdeLaFormula(p, FORMULAS[rot], TRANSPOSE[rot]));
      }
    }
  });

  it('AC-MUS-007 — in the order regime rotation r shifts the arpeggio r positions on the major pentatonic', () => {
    for (const p of PIECES) {
      const base = desdeLaFormula(p, PENT_MAJOR, 0);
      for (let rot = 0; rot < 4; rot++) {
        expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.orden), `${p}/${rot}`)
          .toEqual(base.map((_n, j) => base[(j + rot) % base.length]));
      }
    }
  });

  it('AC-MUS-008 — at rotation 0 the two regimes are identical, over the 12 pieces', () => {
    // This makes the comparison AUDITABLE: the two regimes have a common origin and
    // diverge only on a rotation. With any other fixed formula in the order regime the
    // two systems would meet at no point, and the comparison would be of two different
    // instruments, not of two rules.
    for (const p of PIECES) {
      expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.orden), p)
        .toEqual(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala));
    }
  });

  it('AC-MUS-008 — the two differ in 36 of the 48 combinations, and the 12 that agree are those at rotation 0', () => {
    const distintas: string[] = [];
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const a = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
        const b = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.orden);
        if (a.join() !== b.join()) distintas.push(`${p}/${rot}`);
      }
    }
    expect(distintas).toHaveLength(36);
    // And the 12 identical ones are EXACTLY those at rotation 0, not any twelve.
    expect(distintas.every(clave => !clave.endsWith('/0'))).toBe(true);
  });

  it('AC-MUS-009 — the order regime leaves each piece with ONE set of pitches: 12 sets against 43', () => {
    // It is the measure of what the regime simplifies, and the cost of the variety that
    // the scale regime buys: any two pieces of the board can share not one note, so what
    // is heard depends less on how the circuit was built than on which formulas came up.
    const conjuntos = (regimen: RegimenDeRotacion) => new Set(
      PIECES.flatMap(p => [0, 1, 2, 3].map(rot =>
        [...notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, regimen)].sort((a, b) => a - b).join())));
    expect(conjuntos(REGIMEN.escala).size).toBe(43);
    expect(conjuntos(REGIMEN.orden).size).toBe(12);
  });

  it('AC-MUS-010 — in the order regime NO cell keeps its note on a rotation: 0 of 180', () => {
    // The zero is GUARANTEED, not measured by chance: a cyclic shift of `k != 0` over `n`
    // elements has fixed points only if `gcd(k, n) > 1`, and here `n` is
    // `NOTES_PER_PIECE`. The gcd is verified BEFORE the count, so that the test still
    // means something if someone changes `NOTES_PER_PIECE`: with a scale of 6 notes,
    // `k = 2` and `k = 3` would have fixed points and this 0 would stop being true.
    // Written as a bare "we expect 0" it would be a magic number.
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    for (let k = 1; k <= 3; k++) {
      expect(gcd(k, NOTES_PER_PIECE), `gcd(${k}, ${NOTES_PER_PIECE}) must be 1`).toBe(1);
    }

    const conservadas = [1, 2, 3].reduce((n, rot) =>
      n + PIECES.reduce((m, p) =>
        m + SHAPES[p].reduce((c, _celda, k) =>
          c + (notaDeCelda(p, rot, k, REGIMEN.orden) === notaDeCelda(p, 0, k, REGIMEN.orden) ? 1 : 0), 0), 0), 0);
    expect(conservadas).toBe(0);
  });

  it('AC-MUS-006 AC-MUS-011 — in the order regime the arpeggio does not always rise: one descent of exactly 9 semitones', () => {
    // Measured and NOT predicted. The top note comes back down, and always by the same
    // distance: the ceiling of `PENT_MAJOR` is 9 above the tonic. It is not "up to 9". It
    // is written as a test because it is what the ear must judge, and because the variant
    // that would avoid it (a conditional `+12`) is one line away, so it is good that to
    // apply it fails here and shows.
    const descensos: number[] = [];
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.orden);
        for (let i = 1; i < ns.length; i++) if (ns[i] < ns[i - 1]) descensos.push(ns[i - 1] - ns[i]);
      }
    }
    // One for each arpeggio in the 36 combinations that move. The 12 at rotation 0 have
    // none, because they are the major pentatonic with no shift.
    expect(descensos).toHaveLength(36);
    expect(new Set(descensos)).toEqual(new Set([9]));

    // And in the scale regime the largest rise is 3, because the four formulas rise.
    const pasos = PIECES.flatMap(p => [0, 1, 2, 3].flatMap(rot => {
      const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
      return ns.slice(1).map((n, i) => n - ns[i]);
    }));
    expect(Math.max(...pasos)).toBe(3);
    expect(Math.min(...pasos)).toBeGreaterThan(0);
  });

  it('AC-MUS-011 — in the order regime the register is 7 semitones narrower at the top: C4..G#5 against C4..D#6', () => {
    // The other half, and its cause is written: the fixed formula does not have the +7
    // transposition of rotation 3, which in the scale regime pushes the pieces with a
    // high tonic almost one octave higher. It is a declared consequence of the request,
    // not an effect to correct.
    const registro = (regimen: RegimenDeRotacion) => {
      const todas = PIECES.flatMap(p => [0, 1, 2, 3].flatMap(rot =>
        notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, regimen)));
      return [midiName(Math.min(...todas)), midiName(Math.max(...todas))];
    };
    expect(registro(REGIMEN.escala)).toEqual(['C4', 'D#6']);
    expect(registro(REGIMEN.orden)).toEqual(['C4', 'G#5']);
  });
});

describe('degreeByCellIndex', () => {
  it('the 12 pieces give a permutation of [0,1,2,3,4]', () => {
    // A permutation and not "five numbers from 0 to 4": no degree is repeated or missing,
    // which guarantees that the piece sounds its five notes and not four.
    for (const p of PIECES) {
      const grados = degreeByCellIndex(SHAPES[p]);
      expect(grados).toHaveLength(5);
      expect([...grados].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('AC-MUS-018 — the arpeggio walks the 12 pieces whole, and passes over no cell', () => {
    // The request: from one note to the next, the walk reaches a cell that TOUCHES the
    // one before. Orthogonal where the shape allows it, and diagonal in the four that
    // cannot: `F`, `T`, `Y` and `X`, whose graph of cells is a tree with a node of 3 or 4
    // links. `transform.test.ts` proves against brute force that the diagonal is the
    // exception and not the rule. This test verifies what that buys.
    const diagonales: Record<string, number> = {
      F: 1, I: 0, L: 0, N: 0, P: 0, T: 1, U: 0, V: 0, W: 0, X: 2, Y: 1, Z: 0,
    };
    for (const p of PIECES) {
      const d = distanciasDelArpegio(p);
      // Manhattan 2 between touching cells is exactly one diagonal move. 3 or more would
      // be to pass over something, which the walk never does.
      expect(d.filter(x => x > 1), p).toHaveLength(diagonales[p]);
      expect(d.filter(x => x > 2), p).toHaveLength(0);
    }
  });

  it('AC-MUS-020 — the witness case: the walk of the U placed at (7,4) has no jump', () => {
    // The placement of the screenshots of the request: `U` rotated 90°, grip cell at
    // (7,4). With the angular order alone, the second note is at (8,5), two cells down
    // across the gap of the U, and the next three go back over the walk.
    const cells = cellsAt(rotateN(SHAPES.U, 1), ANCHOR_INDEX.U, 7, 4);
    const grados = degreeByCellIndex(SHAPES.U);
    const orden = grados.map((_, g) => cells[grados.indexOf(g)]);
    expect(orden).toEqual([[8, 3], [7, 3], [7, 4], [7, 5], [8, 5]]);
  });

  it('AC-MUS-021 — in I, X and Z degree 0 is NOT the cell on the centroid', () => {
    // It is deliberate: in the `I`, a start at the center of a line of five forces a jump
    // of 4 cells that the shape does not need. Degree 0 is the end where the walk of the
    // piece starts, not the center of the figure.
    for (const p of ['I', 'X', 'Z'] as PieceKey[]) {
      expect(distanciaAlCentro(p, 2)).toBeLessThan(DEGREE_EPSILON);
      expect(degreeByCellIndex(SHAPES[p])[2]).not.toBe(0);
    }
    // The walk of the `I` goes from end to end, which a degree 0 at the center prevents.
    expect(degreeByCellIndex(SHAPES.I)).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('what the angular order decides', () => {
  it('AC-MUS-022 — it selects the DIRECTION of the walk, and applies in the 12 pieces', () => {
    // A walk and its reverse chain the same moves, so the first three criteria ALWAYS
    // leave them tied. The angular rank breaks the tie: the walk that starts at the cell
    // of smallest rank wins. With the rank reversed, the walks go the other way.
    // It is measured on the eleven pieces whose optimal walk is unique but for its
    // direction. The `T` stays out, and not for convenience: it has TWO different optimal
    // walks, not one and its reverse, so a reversed rank does not mirror it. It changes
    // its walk. It is the only one, and it is the same piece that the criterion of the
    // diagonal moved.
    for (const p of PIECES.filter(k => k !== 'T')) {
      const derecho = degreeByCellIndex(SHAPES[p]);
      const alReves = pathThroughCells(SHAPES[p], angularRank(SHAPES[p]).map(r => 4 - r));
      expect(alReves[0], p).not.toBe(derecho.indexOf(0));
    }
  });

  it('AC-MUS-022 — the cell on the centroid leaves the ring, although it does not get degree 0', () => {
    // `Math.atan2(0, 0)` returns `0` in silence: without the exception, the central cell
    // of `I`, `X` and `Z` would enter the ring as if it were to the east and would shift
    // the rank of all the others. That would change the direction of the walk.
    for (const p of ['I', 'X', 'Z'] as PieceKey[]) {
      expect(angularRank(SHAPES[p])[2]).toBe(0);
    }
  });

  it('AC-MUS-022 — at equal angle the smaller index wins: the tie-break applies in F, I and T', () => {
    // The three pieces with cells collinear with the centroid. The criterion is WRITTEN
    // in the comparator and not left to a stable `sort`. With stability guaranteed since
    // ES2019 the result would be the same, but the rule would be said nowhere.
    expect(angularRank(SHAPES.F)[1]).toBeLessThan(angularRank(SHAPES.F)[2]);
    expect(angularRank(SHAPES.I)[3]).toBeLessThan(angularRank(SHAPES.I)[4]);
    expect(angularRank(SHAPES.T)[3]).toBeLessThan(angularRank(SHAPES.T)[4]);
  });
});

describe('playOrderByCellIndex: the step of each cell', () => {
  it('AC-MUS-026 — without reflection it is the degree, and with reflection its exact inverse', () => {
    // It is the whole definition of the function, and also the only difference between
    // the two numbers that the model gives a cell: the degree says WHICH note, the step
    // says WHEN. The reflection moves the second and not the first.
    for (const p of PIECES) {
      const grados = degreeByCellIndex(SHAPES[p]);
      expect(playOrderByCellIndex(SHAPES[p], false), p).toEqual(grados);
      expect(playOrderByCellIndex(SHAPES[p], true), p).toEqual(grados.map(g => 4 - g));
    }
  });

  it('step 0 exists once and the steps are a permutation of 0..4, reflected or not', () => {
    for (const p of PIECES) {
      for (const mirror of [false, true]) {
        const pasos = playOrderByCellIndex(SHAPES[p], mirror);
        expect([...pasos].sort(), `${p}/${mirror}`).toEqual([0, 1, 2, 3, 4]);
      }
    }
  });

  it('AC-MUS-026 — `arpeggioFor` indexed by STEP gives the same note as the ascending arpeggio by DEGREE', () => {
    // The two correct pairs, and the reason they cannot be crossed: in a reflected piece
    // `ascending[step]` would give the mirrored note. The board uses the second pair for
    // the note, and the step only for the number in the corner. This test says that the
    // first pair would do as well, and that the mix would not.
    for (const p of PIECES) {
      for (const mirror of [false, true]) {
        const grados = degreeByCellIndex(SHAPES[p]);
        const pasos = playOrderByCellIndex(SHAPES[p], mirror);
        const asc = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala);
        const enOrden = arpeggioFor(p, 0, mirror, REGIMEN.escala);
        for (let k = 0; k < 5; k++) {
          expect(enOrden[pasos[k]], `${p}/${mirror} cell ${k}`).toBe(asc[grados[k]]);
        }
      }
    }
  });

  it('accepts arbitrary shapes, like `degreeByCellIndex`', () => {
    // It takes cells and not a `PieceKey`, and the length comes from the array: the
    // inverse is `n-1-degree` and not `4-degree`, so a shape of two cells mirrors too.
    // The angular ring decides which of the two is degree 0, and the test does not
    // hardcode it: what this function adds is the INVERSION, and that is what the test
    // measures.
    const dos: Cell[] = [[0, 0], [1, 0]];
    const g = degreeByCellIndex(dos);
    expect(playOrderByCellIndex(dos, false)).toEqual(g);
    expect(playOrderByCellIndex(dos, true)).toEqual(g.map(d => 1 - d));
    expect(playOrderByCellIndex([], false)).toEqual([]);
    expect(playOrderByCellIndex([], true)).toEqual([]);
  });
});

describe('the mapping travels by index over the 96 orientations', () => {
  it('AC-MUS-023 — cell k of the transformed shape is still cell k of the canonical shape', () => {
    // What holds the travel by index is that `rotateN` and `reflect` are a `map`. The
    // test UNDOES the transformation and does not compute the degree again: if cell k
    // comes back to its canonical place, then the degree computed on the canonical shape
    // describes the same cell in the 96 orientations.
    for (const p of PIECES) {
      const canonica = normalize(SHAPES[p]);
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const girada = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(girada) : girada;
          const vuelta = rotateN(mirror ? reflect(shape) : shape, (4 - rot) % 4);
          expect(vuelta).toEqual(canonica);
        }
      }
    }
  });

  it('AC-MUS-023 — the degree computed again on the transformed shape is NOT equivalent: it differs in 53 of the 96', () => {
    // A rotation moves the origin of the angle, and the angle selects the DIRECTION of
    // the walk. So the new computation gives another permutation in more than half of the
    // orientations, and a test written as
    // `degreeByCellIndex(transformedShape) == canonical mapping` would be a red test and
    // not a verification. Measured: 75 with the angular order alone as the mapping, and
    // 53 with the walk. It is lower because the walk itself is invariant: a rotation and
    // a reflection keep which cells touch, and all that moves is the end at which the
    // walk starts.
    let distintas = 0;
    for (const p of PIECES) {
      const canonico = degreeByCellIndex(SHAPES[p]).join('');
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const girada = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(girada) : girada;
          if (degreeByCellIndex(shape).join('') !== canonico) distintas++;
        }
      }
    }
    expect(distintas).toBe(53);
  });
});

describe('the walk survives the 8 orientations', () => {
  it('AC-MUS-023 — the distances of the arpeggio do not change on a rotation, a reflection or a translation', () => {
    // This lets the mapping be computed on the canonical shape and travel by index:
    // rotation, reflection and normalization are isometries of the grid, so they keep the
    // Manhattan distance, and with it which cells touch. A walk on the canonical shape is
    // a walk in the 96. If this failed, the walk of a piece could be whole in one
    // rotation and full of jumps in another.
    for (const p of PIECES) {
      const grados = degreeByCellIndex(SHAPES[p]);
      const canonicas = distanciasDelArpegio(p);
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const girada = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(girada) : girada;
          const orden = grados.map((_, g) => shape[grados.indexOf(g)]);
          const medidas = orden.slice(1)
            .map((c, i) => Math.abs(c[0] - orden[i][0]) + Math.abs(c[1] - orden[i][1]));
          expect(medidas).toEqual(canonicas);
        }
      }
    }
  });
});

describe('the reflection does not change the note of a cell', () => {
  it('AC-MUS-025 — the cell of degree g shows note g of the ASCENDING arpeggio, not of the retrograde', () => {
    // A reflection reverses the ORDER IN WHICH the notes SOUND, not which note belongs to
    // each cell. So `notesForRotation` does not take the reflection, and the visual
    // reading always comes from the ascending arpeggio. If it came from the reversed one,
    // the four cells of a degree other than 2 would be mirrored.
    for (const p of PIECES) {
      const grados = degreeByCellIndex(SHAPES[p]);
      for (let rot = 0; rot < 4; rot++) {
        const ascendente = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
        const retrogrado = [...ascendente].reverse();
        for (let k = 0; k < grados.length; k++) {
          expect(notaDeCelda(p, rot, k, REGIMEN.escala)).toBe(ascendente[grados[k]]);
          // Degree 2 is the center of the arpeggio: the only one that the retrograde
          // leaves in place.
          if (grados[k] !== 2) expect(notaDeCelda(p, rot, k, REGIMEN.escala)).not.toBe(retrogrado[grados[k]]);
        }
      }
    }
  });

  it('the cell of degree 0 keeps the lowest note, not the highest', () => {
    for (const p of PIECES) {
      const k = degreeByCellIndex(SHAPES[p]).indexOf(0);
      const ascendente = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala);
      expect(notaDeCelda(p, 0, k, REGIMEN.escala)).toBe(ascendente[0]);
      expect(notaDeCelda(p, 0, k, REGIMEN.escala)).not.toBe(ascendente[4]);   // what the retrograde would give
    }
  });
});

/**
 * The cell→note mapping, frozen: rotation 0, octave 4, not reflected.
 *
 * **The source is the measured table**, not the reference sheet. The sheet does not
 * describe this mapping: the walk gives each degree to another cell in 9 of the 12
 * pieces. What the sheet still fixes is WHICH five notes each piece has.
 *
 * The names are written BY HAND and not derived from a run of the model: it is a
 * reference only because it is not derived again. It catches a mapping that moves by
 * accident.
 *
 * **The row of the `Z` WAS derived again, and it is the only exception.** It does not
 * contradict the rule above. The rule forbids a table generated again to turn a red test
 * green, because then the reference refers to nothing. Here the INPUT changed: the `Z`
 * was written as the reflected `N`, and the Z pentomino is another shape, so the old row
 * described a different piece from the one the table names. The other eleven rows did
 * not move.
 *
 * The row of the `Z` reads from the highest note to the lowest, and that is not a
 * transcription error: the real `Z` has a cell on its centroid, the one at index 2, and
 * that changes how the degrees are shared.
 *
 * The cells are in the order of the array of `SHAPES`, which is the order that indexes
 * the mapping. The second test verifies it, to catch a shifted transcription.
 */
const REFERENCIA: Record<PieceKey, [Cell, string][]> = {
  F: [[[0, 1], 'C4'],  [[1, 0], 'D4'],  [[1, 1], 'E4'],  [[1, 2], 'G4'],  [[2, 2], 'A4']],
  I: [[[0, 0], 'A#4'], [[1, 0], 'G#4'], [[2, 0], 'F4'],  [[3, 0], 'D#4'], [[4, 0], 'C#4']],
  L: [[[0, 0], 'A4'],  [[0, 1], 'F#4'], [[0, 2], 'E4'],  [[0, 3], 'D4'],  [[1, 0], 'B4']],
  N: [[[0, 0], 'C5'],  [[1, 0], 'A#4'], [[1, 1], 'G4'],  [[2, 1], 'F4'],  [[3, 1], 'D#4']],
  P: [[[0, 0], 'G#4'], [[0, 1], 'F#4'], [[1, 0], 'B4'],  [[1, 1], 'E4'],  [[2, 0], 'C#5']],
  T: [[[0, 0], 'A4'],  [[1, 0], 'C5'],  [[2, 0], 'D5'],  [[1, 1], 'G4'],  [[1, 2], 'F4']],
  U: [[[0, 0], 'C#5'], [[0, 1], 'D#5'], [[1, 0], 'A#4'], [[2, 0], 'G#4'], [[2, 1], 'F#4']],
  V: [[[0, 0], 'B4'],  [[0, 1], 'A4'],  [[0, 2], 'G4'],  [[1, 0], 'D5'],  [[2, 0], 'E5']],
  W: [[[0, 0], 'F5'],  [[1, 0], 'D#5'], [[1, 1], 'C5'],  [[2, 1], 'A#4'], [[2, 2], 'G#4']],
  X: [[[1, 0], 'F#5'], [[0, 1], 'C#5'], [[1, 1], 'E5'],  [[2, 1], 'A4'],  [[1, 2], 'B4']],
  Y: [[[0, 0], 'G5'],  [[1, 0], 'F5'],  [[2, 0], 'D5'],  [[3, 0], 'C5'],  [[2, 1], 'A#4']],
  Z: [[[0, 0], 'G#5'], [[1, 0], 'F#5'], [[1, 1], 'D#5'], [[1, 2], 'C#5'], [[2, 2], 'B4']],
};

/**
 * The cell that carries the tonic: the one of degree 0, where the walk of the piece
 * starts.
 *
 * That of the `Z` is 4 for the same reason that its row of `REFERENCIA` reads from high
 * to low: its shape gives the degrees in reverse.
 */
const TONICA_EN: Record<PieceKey, number> = {
  F: 0, I: 4, L: 3, N: 4, P: 3, T: 4, U: 4, V: 2, W: 4, X: 3, Y: 4, Z: 4,
};

describe('the frozen reference', () => {
  it('AC-MUS-024 — the 12 pieces sound cell by cell like the table', () => {
    for (const p of PIECES) {
      const leida = SHAPES[p].map((_, k) => midiName(notaDeCelda(p, 0, k, REGIMEN.escala)));
      expect(leida).toEqual(REFERENCIA[p].map(([, nombre]) => nombre));
    }
  });

  it('the table names the cells in the order of the array of SHAPES', () => {
    for (const p of PIECES) {
      expect(REFERENCIA[p].map(([celda]) => celda)).toEqual(SHAPES[p]);
    }
  });

  it('AC-MUS-002 — the cell of degree 0 sounds the tonic of the piece', () => {
    for (const p of PIECES) {
      const k = TONICA_EN[p];
      expect(degreeByCellIndex(SHAPES[p])[k]).toBe(0);
      expect(notaDeCelda(p, 0, k, REGIMEN.escala) % 12).toBe(BASE_MAP[p]);
    }
  });
});
