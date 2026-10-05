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

  it('in the order regime, a rotation outside 0..3 shifts cyclically and does not fall back to the major formula', () => {
    const rot0 = notesForRotation(0, DEFAULT_OCTAVE, 0, REGIMEN.orden);
    expect(notesForRotation(0, DEFAULT_OCTAVE, 4, REGIMEN.orden)).not.toEqual(rot0);
    expect(notesForRotation(0, DEFAULT_OCTAVE, 5, REGIMEN.orden)).toEqual(rot0);
  });

  it('in the order regime, a NEGATIVE rotation still gives a cyclic permutation', () => {
    const rot0 = notesForRotation(0, DEFAULT_OCTAVE, 0, REGIMEN.orden);
    for (const rot of [-1, -2, -5, -6]) {
      const ns = notesForRotation(0, DEFAULT_OCTAVE, rot, REGIMEN.orden);
      expect(ns).toHaveLength(5);
      expect(ns.every(n => Number.isInteger(n))).toBe(true);
      expect([...ns].sort((a, b) => a - b)).toEqual([...rot0].sort((a, b) => a - b));
    }
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
        const esperada = rot === 3 ? (BASE_MAP[p] + 7) % 12 : BASE_MAP[p];
        expect(ns[0] % 12).toBe(esperada);
      }
    }
  });

  it('AC-MUS-004 — the octave shift raises the note and does not wrap it', () => {
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

const notaDeCelda = (p: PieceKey, rot: number, k: number, regimen: RegimenDeRotacion): number =>
  notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, regimen)[degreeByCellIndex(SHAPES[p])[k]];

const distanciasDelArpegio = (p: PieceKey): number[] => {
  const grados = degreeByCellIndex(SHAPES[p]);
  const orden = grados.map((_, g) => SHAPES[p][grados.indexOf(g)]);
  return orden.slice(1).map((c, i) => Math.abs(c[0] - orden[i][0]) + Math.abs(c[1] - orden[i][1]));
};

const distanciaAlCentro = (p: PieceKey, k: number) => {
  const cent = centroid(SHAPES[p]);
  return Math.hypot(SHAPES[p][k][0] - cent[0], SHAPES[p][k][1] - cent[1]);
};

describe('scale regime: what survives a rotation (characterization)', () => {
  // 12 pieces x 3 rotations (all but 0) x 5 cells = 180.
  const ROTACIONES = [1, 2, 3];

  it('AC-MUS-010 — 36 of 180 cells keep their note, split 24 / 12 / 0', () => {
    const porRotacion = ROTACIONES.map(rot =>
      PIECES.reduce((n, p) =>
        n + SHAPES[p].reduce((m, _c, k) => m + (notaDeCelda(p, rot, k, REGIMEN.escala) === notaDeCelda(p, 0, k, REGIMEN.escala) ? 1 : 0), 0), 0));

    // `PENT_MAJOR` and `PENT_MINOR` share degrees 0 and 3 (24), `PENT_BLUES5` shares only 0 (12),
    // and the +7 of rotation 3 keeps none.
    expect(porRotacion).toEqual([24, 12, 0]);
    expect(porRotacion.reduce((a, b) => a + b, 0)).toBe(36);
  });

  it('AC-MUS-010 — degree 0 keeps the tonic at rotations 1 and 2, and NOT at 3', () => {
    for (const p of PIECES) {
      const tonica = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala)[0];
      expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 1, REGIMEN.escala)[0], `${p} rot1`).toBe(tonica);
      expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 2, REGIMEN.escala)[0], `${p} rot2`).toBe(tonica);
      expect(notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 3, REGIMEN.escala)[0], `${p} rot3`).not.toBe(tonica);
    }
  });
});

describe('the two regimes of rotation', () => {
  const FORMULAS = [PENT_MAJOR, PENT_MINOR, PENT_BLUES5, PENT_MAJOR];
  const TRANSPOSE = [0, 0, 0, 7];

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
    expect(distintas.every(clave => !clave.endsWith('/0'))).toBe(true);
  });

  it('AC-MUS-009 — the order regime leaves each piece with ONE set of pitches: 12 sets against 43', () => {
    const conjuntos = (regimen: RegimenDeRotacion) => new Set(
      PIECES.flatMap(p => [0, 1, 2, 3].map(rot =>
        [...notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, regimen)].sort((a, b) => a - b).join())));
    expect(conjuntos(REGIMEN.escala).size).toBe(43);
    expect(conjuntos(REGIMEN.orden).size).toBe(12);
  });

  it('AC-MUS-010 — in the order regime NO cell keeps its note on a rotation: 0 of 180', () => {
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
    const descensos: number[] = [];
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.orden);
        for (let i = 1; i < ns.length; i++) if (ns[i] < ns[i - 1]) descensos.push(ns[i - 1] - ns[i]);
      }
    }
    expect(descensos).toHaveLength(36);
    expect(new Set(descensos)).toEqual(new Set([9]));

    const pasos = PIECES.flatMap(p => [0, 1, 2, 3].flatMap(rot => {
      const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
      return ns.slice(1).map((n, i) => n - ns[i]);
    }));
    expect(Math.max(...pasos)).toBe(3);
    expect(Math.min(...pasos)).toBeGreaterThan(0);
  });

  it('AC-MUS-011 — in the order regime the register is 7 semitones narrower at the top: C4..G#5 against C4..D#6', () => {
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
    for (const p of PIECES) {
      const grados = degreeByCellIndex(SHAPES[p]);
      expect(grados).toHaveLength(5);
      expect([...grados].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('AC-MUS-018 — the arpeggio walks the 12 pieces whole, and passes over no cell', () => {
    const diagonales: Record<string, number> = {
      F: 1, I: 0, L: 0, N: 0, P: 0, T: 1, U: 0, V: 0, W: 0, X: 2, Y: 1, Z: 0,
    };
    for (const p of PIECES) {
      const d = distanciasDelArpegio(p);
      expect(d.filter(x => x > 1), p).toHaveLength(diagonales[p]);
      expect(d.filter(x => x > 2), p).toHaveLength(0);
    }
  });

  it('AC-MUS-020 — the witness case: the walk of the U placed at (7,4) has no jump', () => {
    const cells = cellsAt(rotateN(SHAPES.U, 1), ANCHOR_INDEX.U, 7, 4);
    const grados = degreeByCellIndex(SHAPES.U);
    const orden = grados.map((_, g) => cells[grados.indexOf(g)]);
    expect(orden).toEqual([[8, 3], [7, 3], [7, 4], [7, 5], [8, 5]]);
  });

  it('AC-MUS-021 — in I, X and Z degree 0 is NOT the cell on the centroid', () => {
    for (const p of ['I', 'X', 'Z'] as PieceKey[]) {
      expect(distanciaAlCentro(p, 2)).toBeLessThan(DEGREE_EPSILON);
      expect(degreeByCellIndex(SHAPES[p])[2]).not.toBe(0);
    }
    expect(degreeByCellIndex(SHAPES.I)).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('what the angular order decides', () => {
  it('AC-MUS-022 — it selects the DIRECTION of the walk, and applies in the 12 pieces', () => {
    // The `T` stays out: it has two different optimal walks, not one and its reverse.
    for (const p of PIECES.filter(k => k !== 'T')) {
      const derecho = degreeByCellIndex(SHAPES[p]);
      const alReves = pathThroughCells(SHAPES[p], angularRank(SHAPES[p]).map(r => 4 - r));
      expect(alReves[0], p).not.toBe(derecho.indexOf(0));
    }
  });

  it('AC-MUS-022 — the cell on the centroid leaves the ring, although it does not get degree 0', () => {
    for (const p of ['I', 'X', 'Z'] as PieceKey[]) {
      expect(angularRank(SHAPES[p])[2]).toBe(0);
    }
  });

  it('AC-MUS-022 — at equal angle the smaller index wins: the tie-break applies in F, I and T', () => {
    expect(angularRank(SHAPES.F)[1]).toBeLessThan(angularRank(SHAPES.F)[2]);
    expect(angularRank(SHAPES.I)[3]).toBeLessThan(angularRank(SHAPES.I)[4]);
    expect(angularRank(SHAPES.T)[3]).toBeLessThan(angularRank(SHAPES.T)[4]);
  });
});

describe('playOrderByCellIndex: the step of each cell', () => {
  it('AC-MUS-026 — without reflection it is the degree, and with reflection its exact inverse', () => {
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
    for (const p of PIECES) {
      const grados = degreeByCellIndex(SHAPES[p]);
      for (let rot = 0; rot < 4; rot++) {
        const ascendente = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
        const retrogrado = [...ascendente].reverse();
        for (let k = 0; k < grados.length; k++) {
          expect(notaDeCelda(p, rot, k, REGIMEN.escala)).toBe(ascendente[grados[k]]);
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
      expect(notaDeCelda(p, 0, k, REGIMEN.escala)).not.toBe(ascendente[4]);
    }
  });
});

/** Written by hand, in the order of `SHAPES`. The `Z` reads from high to low: its degrees run in reverse. */
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
