import { describe, it, expect } from 'vitest';
import { buildSequence, cellsByPlayOrder, gates, noteAtCell } from '../sequence.ts';
import { isValid, GRID_DEFAULT } from '../../board-editing/placement.ts';
import { routeBetween, CROSS_COST } from '../routing.ts';
import {
  degreeByCellIndex,
  notesForRotation,
  playOrderByCellIndex,
  BASE_MAP,
  DEFAULT_OCTAVE,
  REGIMEN,
} from '../../musical-model/music.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, CELLS_PER_PIECE } from '../../pieces/pieces.ts';
import type { Cell } from '../../pieces/transform.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../../board-editing/placement.ts';
import { place as colocar, TWELVE as DOCE } from './tiling.ts';

const PIECES = Object.keys(SHAPES) as PieceKey[];

/**
 * The arpeggio of a placed piece, composed by hand: `BASE_MAP` + `notesForRotation` + the
 * retrograde.
 *
 * It is the oracle of `arpeggioFor`, so it does not call it: if it did, the tests of the
 * notes of each step would be tautologies.
 */
const notasDe = (p: PlacedPiece): number[] => {
  const asc = notesForRotation(BASE_MAP[p.piece], DEFAULT_OCTAVE, p.rotation, REGIMEN.escala);
  return p.mirror ? [...asc].reverse() : asc;
};

/**
 * The cells in PLAY ORDER, derived outside `sequence.ts` so that they can be checked
 * against it. The retrograde is applied here for the same reason as in `notes`.
 */
const celdasEnOrden = (p: PlacedPiece): Cell[] => {
  const g = degreeByCellIndex(SHAPES[p.piece]);
  const porGrado = g.map((_, d) => p.cells[g.indexOf(d)]);
  return p.mirror ? porGrado.reverse() : porGrado;
};

/**
 * The two gates, derived outside `sequence.ts`.
 *
 * They are read from the play order and NOT from degrees 0 and 4: by degree, a reflected
 * piece gives the two swapped.
 */
const puertas = (p: PlacedPiece): { entrada: Cell; salida: Cell } => {
  const orden = celdasEnOrden(p);
  return { entrada: orden[0], salida: orden[CELLS_PER_PIECE - 1] };
};

/**
 * The leg between two pieces: from the exit gate of one to the entry gate of the other,
 * with what is in between.
 *
 * It takes the WHOLE board and not only the two pieces, because the route can cross any of
 * the twelve.
 */
const rutaEntre = (a: PlacedPiece, b: PlacedPiece, board: readonly PlacedPiece[]) =>
  routeBetween(puertas(a).salida, puertas(b).entrada, board, GRID_DEFAULT);

/**
 * The two numbers of a leg, which are not the same number.
 *
 * The COST orders the circuit: each occupied cell entered costs `CROSS_COST` and not 1.
 * The MOVES measure time, one interval for each move. When the leg crosses nothing they
 * differ only by the one that separates moves from intermediate cells. When it crosses,
 * they differ by more.
 */
const costoEntre = (a: PlacedPiece, b: PlacedPiece, board: readonly PlacedPiece[]): number => {
  const r = rutaEntre(a, b, board);
  return r.path.length + r.crossed.length * (CROSS_COST - 1);
};

const pasosEntre = (a: PlacedPiece, b: PlacedPiece, board: readonly PlacedPiece[]): number =>
  rutaEntre(a, b, board).steps;

const misma = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];

/** The 12 boards of 1 to 12 pieces that come from cutting the tiling. */
const PREFIJOS = DOCE.map((_, i) => DOCE.slice(0, i + 1));

describe('the tiling that the tests use', () => {
  it('the 12 pieces fit with no overlap and cover the 60 cells', () => {
    // If this fails, everything measured on PREFIJOS measures something else.
    const acumulado: PlacedPiece[] = [];
    for (const p of DOCE) {
      expect(isValid(p.cells, acumulado, GRID_DEFAULT), p.piece).toBe(true);
      acumulado.push(p);
    }
    expect(new Set(DOCE.flatMap((p) => p.cells.map((c) => c.join(',')))).size).toBe(60);
  });
});

describe('edges', () => {
  it('AC-CIR-013 — an empty board does not sound and its cycle length is zero', () => {
    expect(buildSequence([], REGIMEN.escala, GRID_DEFAULT)).toEqual({ steps: [], clicks: [], order: [], length: 0 });
  });

  it('AC-CIR-013 — with one piece there are no clicks: the circuit exists BETWEEN pieces', () => {
    // The decision came from listening. A leg from the piece to itself, from its exit gate
    // to its entry gate, puts clicks ON the piece itself when the route ignores the
    // pieces. Measured with a `Z` on (0,1)(1,1)(1,0)(2,0)(3,0): d=3 and the route
    // [[2,0],[1,0]], two hits on top of the arpeggio that had just sounded, not a circuit.
    //
    // Those coordinates are of another shape of the `Z`, the reflected `N`. They stay as
    // written and are not computed again with the shape of today: it is the measurement
    // behind the decision, and to write it with another number would invent a measurement
    // that nobody made. What the decision states does not depend on which piece it was.
    //
    // Routes that go around the pieces remove the symptom: measured, with the `Z` on
    // (4,2) the leg from the piece to itself goes AROUND it and its two clicks fall on
    // empty cells. The decision does not change: what was wrong was not that the clicks
    // fell on the piece, it was that there is nowhere to go. The circuit exists BETWEEN
    // pieces.
    for (const [pieza, rot] of [['F', 0], ['Z', 0], ['I', 1], ['X', 0]] as const) {
      const sola = colocar(pieza, rot, false, 4, 2);
      const seq = buildSequence([sola], REGIMEN.escala, GRID_DEFAULT);
      expect(seq.clicks).toEqual([]);
      expect(seq.steps).toEqual([{ pieceId: pieza, offset: 0, notes: notasDe(sola) }]);
      expect(seq.length).toBe(CELLS_PER_PIECE);
    }
  });

  it('AC-CIR-013 — the single piece repeats CONTIGUOUS with itself, with no overlap', () => {
    // The length is 5 and not 4, although the five notes span 4 intervals: with 4, the
    // last note of one pass and the first of the next would fall on the same interval.
    // With 5 the repetition falls one interval after the last note, which is exactly the
    // rule that two adjacent pieces follow.
    const seq = buildSequence([colocar('F', 0, false, 1, 1)], REGIMEN.escala, GRID_DEFAULT);
    const ultimaNota = seq.steps[0].offset + CELLS_PER_PIECE - 1;
    expect(seq.length - ultimaNota).toBe(1);
  });
});

describe('the gates of a piece', () => {
  it('with NO reflection the entry gate is the cell of degree 0 and the exit gate the cell of degree 4', () => {
    // The canonical `F` gives the degrees [0,1,2,3,4]: its path starts at index 0 and ends
    // at index 4, the only case where the mapping equals the order of the array. The
    // numbers are written by hand: to derive them here would leave the test with no
    // oracle.
    expect(degreeByCellIndex(SHAPES.F)).toEqual([0, 1, 2, 3, 4]);
    const f = colocar('F', 0, false, 1, 1);
    expect(f.cells).toEqual([[0, 1], [1, 0], [1, 1], [1, 2], [2, 2]]);
    expect(puertas(f).entrada).toEqual([0, 1]);
    expect(puertas(f).salida).toEqual([2, 2]);
    // And it is what the real function returns: with no reflection the play order IS the
    // degree order.
    expect(gates(f)).toEqual({ entrada: [0, 1], salida: [2, 2] });

    // And it is what the circuit uses: the leg that leaves `F` starts at ITS EXIT GATE,
    // not at its entry gate and not at its grip cell. With one piece there is no leg,
    // because the circuit exists between pieces, so a second piece is needed.
    const otra = colocar('P', 0, false, 7, 1);
    const seq = buildSequence([f, otra], REGIMEN.escala, GRID_DEFAULT);
    const primero = seq.steps[0].pieceId === 'F' ? f : otra;
    const segundo = primero === f ? otra : f;
    const tramo = rutaEntre(primero, segundo, [f, otra]);
    expect(seq.clicks.map((c) => c.cell).slice(0, tramo.steps - 1)).toEqual(tramo.path);
  });

  it('they come from the CANONICAL shape: computed on the transformed shape, 53 of the 96 orientations move', () => {
    // It is the most expensive trap of this module. A rotation moves the origin of the
    // angle, which chooses the end where the path is entered, so
    // `degreeByCellIndex(formaTransformada)` compiles the same and returns another
    // mapping. The count is measured and not approximate, so that the day someone
    // "simplifies" the derivation the test says exactly how much changed.
    let distintas = 0;
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[k], rot);
          const shape = mirror ? reflect(base) : base;
          const p = colocar(k, rot, mirror, 5, 3);
          // Both sides are derived BY DEGREE and with no retrograde, on purpose: this test
          // measures `degreeByCellIndex` on the canonical shape against the transformed
          // one, not the gates. To go through `puertas` would mix in the reflection, and
          // the 53 would not say what it says.
          const naive = degreeByCellIndex(shape);
          const canonicos = degreeByCellIndex(SHAPES[k]);
          const canonico = [p.cells[canonicos.indexOf(0)], p.cells[canonicos.indexOf(CELLS_PER_PIECE - 1)]];
          const recalculado = [p.cells[naive.indexOf(0)], p.cells[naive.indexOf(CELLS_PER_PIECE - 1)]];
          if (JSON.stringify(canonico) !== JSON.stringify(recalculado)) distintas++;
        }
      }
    }
    expect(distintas).toBe(53);
  });

  it('AC-CIR-008 — the entry gate and the exit gate are never the same cell, in the 96 orientations', () => {
    // Two other things protect `routeBetween` from the degenerate case today. Two pieces
    // do not overlap, and a leg goes from the exit gate of one to the entry gate of
    // ANOTHER. And with one piece there is no leg (the guard of `n === 1` in
    // `buildSequence`). This property is the one that would make safe a future leg that
    // leaves and enters the same piece.
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const { entrada, salida } = puertas(colocar(k, rot, mirror, 5, 3));
          expect(entrada, `${k}/${rot}/${mirror}`).not.toEqual(salida);
        }
      }
    }
  });
});

/**
 * The note that the board shows on a cell of the piece: the degree BY INDEX on the
 * canonical shape, and the ASCENDING arpeggio, with no retrograde.
 *
 * It is the chain copied by hand, `occupantCellIndex` -> `degreeByCellIndex` ->
 * `notesForRotation`, and not a call to the function under test: if the oracle came from
 * `cellsByPlayOrder`, the test would be a tautology.
 */
const notaPintadaEn = (p: PlacedPiece, c: Cell): number => {
  const grados = degreeByCellIndex(SHAPES[p.piece]);
  const asc = notesForRotation(BASE_MAP[p.piece], DEFAULT_OCTAVE, p.rotation, REGIMEN.escala);
  const k = p.cells.findIndex((q) => q[0] === c[0] && q[1] === c[1]);
  return asc[grados[k]];
};

describe('`cellsByPlayOrder`: the cell of each note', () => {
  it('`[j]` is the cell that the board shows with `notes[j]`, in the 96 orientations', () => {
    // The property that ties the two ends of the model. The board derives the note of a
    // cell by DEGREE on the ascending arpeggio, and the sequence plays the notes in the
    // order of `notes`, with the retrograde applied. If the two derivations do not agree,
    // the playhead lights one cell and another one sounds. This test prevents that bug.
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const p = colocar(k, rot, mirror, 5, 3);
          const orden = cellsByPlayOrder(p);
          expect(orden, `${k}/${rot}/${mirror}`).toHaveLength(CELLS_PER_PIECE);
          for (let j = 0; j < CELLS_PER_PIECE; j++) {
            expect(notaPintadaEn(p, orden[j]), `${k}/${rot}/${mirror} note ${j}`).toBe(notasDe(p)[j]);
          }
          // And they are the five cells of the piece: none repeats and none is invented.
          expect(new Set(orden.map((c) => c.join(','))).size).toBe(CELLS_PER_PIECE);
          expect(new Set(orden.map((c) => c.join(',')))).toEqual(new Set(p.cells.map((c) => c.join(','))));
        }
      }
    }
  });

  it('the reflection is the only thing that separates it from the degree order', () => {
    // Written apart because it is the half of the model that a derivation by degree
    // misses: with no `mirror` the play order IS the degree order, and with `mirror` it is
    // its exact reverse. Half of the placement space falls on the second side.
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const derecha = cellsByPlayOrder(colocar(k, rot, false, 5, 3));
        const reflejada = cellsByPlayOrder(colocar(k, rot, true, 5, 3));
        const g = degreeByCellIndex(SHAPES[k]);
        const porGrado = (p: PlacedPiece) => g.map((_, d) => p.cells[g.indexOf(d)]);
        expect(derecha, `${k}/${rot}`).toEqual(porGrado(colocar(k, rot, false, 5, 3)));
        expect(reflejada, `${k}/${rot} reflected`).toEqual([...porGrado(colocar(k, rot, true, 5, 3))].reverse());
      }
    }
  });

  it('it does not touch the cell array of the piece', () => {
    // `reverse()` mutates, and the array that is reversed must be the intermediate one and
    // never `p.cells`: the rule of the repo is not to mutate what React already has.
    const l = colocar('L', 0, true, 1, 1);
    const antes = JSON.stringify(l.cells);
    cellsByPlayOrder(l).reverse();
    expect(JSON.stringify(l.cells)).toBe(antes);
  });
});

describe('`noteAtCell`: which note is on a cell', () => {
  it('AC-MUS-016 — it is exactly the note that the board SHOWS, in the 96 orientations', () => {
    // The two ends of the same chain: `cell-text.ts` derives it to DRAW the note of a
    // cell, and this function derives it to SOUND when a leg enters the cell. If the two
    // drifted apart, the cell would show one note and sound another. This test is where
    // that drift is caught.
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const p = colocar(k, rot, mirror, 5, 3);
          for (const c of p.cells) {
            expect(noteAtCell(p, c, REGIMEN.escala), `${k}/${rot}/${mirror} ${c}`).toBe(notaPintadaEn(p, c));
          }
        }
      }
    }
  });

  it('AC-MUS-016 — null if the cell is not of the piece', () => {
    // It is not a decorative edge: it lets `buildSequence` ask about any cell of a route
    // without first finding out if something is under it.
    const f = colocar('F', 0, false, 1, 1);
    expect(noteAtCell(f, [9, 5], REGIMEN.escala)).toBeNull();
    expect(noteAtCell(f, [0, 0], REGIMEN.escala)).toBeNull();
    for (const c of f.cells) expect(noteAtCell(f, c, REGIMEN.escala)).not.toBeNull();
  });

  it('AC-MUS-025 — it comes from the ASCENDING arpeggio and not from the one with the retrograde applied', () => {
    // The expensive trap: the arpeggio of the piece comes in PLAY order, so with the
    // retrograde applied if the piece is reflected. To index THAT array with the degree of
    // the cell reads the shape forward against a reversed arpeggio. With the reflected `L`
    // the two readings differ in four of its five cells. The fifth is the cell of degree
    // 2, which is its own mirror.
    const l = colocar('L', 0, true, 1, 1);
    const grados = degreeByCellIndex(SHAPES.L);
    const ascendente = notesForRotation(BASE_MAP.L, DEFAULT_OCTAVE, 0, REGIMEN.escala);
    const real = l.cells.map((c) => noteAtCell(l, c, REGIMEN.escala));
    expect(real).toEqual(l.cells.map((_, k) => ascendente[grados[k]]));
    const espejado = l.cells.map((_, k) => notasDe(l)[grados[k]]);
    expect(real.filter((n, k) => n !== espejado[k])).toHaveLength(4);
  });

  it('AC-MUS-016 — under `orden` it returns the note of the regime of the piece, not the note of `escala`', () => {
    // `noteAtCell` gives the `Click.note` of a crossing: the note that sounds when a leg
    // ENTERS an occupied cell. If it stayed in `escala` while the board plays `orden`, the
    // cell would show one note and sound another. It is the bug that the docblock of the
    // function exists to prevent, here with two regimes and not with two arpeggios.
    //
    // The oracle is the same chain copied by hand, with the regime inside: not a call to
    // the function under test.
    const notaPintadaBajo = (p: PlacedPiece, c: Cell): number => {
      const grados = degreeByCellIndex(SHAPES[p.piece]);
      const asc = notesForRotation(BASE_MAP[p.piece], DEFAULT_OCTAVE, p.rotation, REGIMEN.orden);
      const k = p.cells.findIndex((q) => q[0] === c[0] && q[1] === c[1]);
      return asc[grados[k]];
    };

    let distintas = 0;
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const p = colocar(k, rot, mirror, 5, 3);
          for (const c of p.cells) {
            expect(noteAtCell(p, c, REGIMEN.orden), `${k}/${rot}/${mirror} ${c}`).toBe(notaPintadaBajo(p, c));
            if (noteAtCell(p, c, REGIMEN.orden) !== noteAtCell(p, c, REGIMEN.escala)) distintas++;
          }
        }
      }
    }
    // And the two branches must NOT always return the same, or the test above would pass
    // with the regime ignored. Over the 480 cells of the space, 12 pieces x 4 rotations x
    // 5 cells x 2 reflections, 312 differ. The 168 that agree are explained: the 120 of
    // rotation 0, where the two regimes are identical, and 48 more at rotation 3, where
    // `PENT_MAJOR` transposed +7 and the major scale shifted 3 both start on the fifth and
    // the sixth: two degrees for each piece, 12 pieces, 2 reflections. Rotations 1 and 2
    // share none.
    expect(distintas).toBe(312);
  });
});

describe('the gates follow the melody, with reflection too', () => {
  it('AC-CIR-008 — the witness case `L`/0/reflected: entry gate [0,0] and exit gate [1,3]', () => {
    // Measured with `describe_piece` and `simulate_board`: [1,3] is degree 0 (the note D4)
    // and [0,0] is degree 4 (the note B4). With the retrograde the first note that sounds
    // is B4. A derivation by degree enters at [1,3], so at the LAST note, and the leg
    // before it walks up to that cell.
    const l = colocar('L', 0, true, 1, 1);
    expect(degreeByCellIndex(SHAPES.L)).toEqual([3, 2, 1, 0, 4]);
    expect(l.cells).toEqual([[1, 0], [1, 1], [1, 2], [1, 3], [0, 0]]);
    expect(gates(l)).toEqual({ entrada: [0, 0], salida: [1, 3] });
    expect(notaPintadaEn(l, gates(l).entrada)).toBe(notasDe(l)[0]);
  });

  it('AC-CIR-008 — in the 96 orientations the entry gate is the cell of the first note and the exit gate the cell of the last', () => {
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const p = colocar(k, rot, mirror, 5, 3);
          const { entrada, salida } = gates(p);
          expect(notaPintadaEn(p, entrada), `${k}/${rot}/${mirror} entry`).toBe(notasDe(p)[0]);
          expect(notaPintadaEn(p, salida), `${k}/${rot}/${mirror} exit`).toBe(notasDe(p)[CELLS_PER_PIECE - 1]);
        }
      }
    }
  });

  it('with reflection they are EXACTLY the gates by degree, swapped, in the 48 reflected orientations', () => {
    // The test above, entry gate different from exit gate, passes with the two swapped:
    // it is not enough. This one fixes how the reflection moves the gates: every
    // reflected piece swaps them against the derivation by degree.
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const p = colocar(k, rot, true, 5, 3);
        const g = degreeByCellIndex(SHAPES[k]);
        const viejo = { entrada: p.cells[g.indexOf(0)], salida: p.cells[g.indexOf(CELLS_PER_PIECE - 1)] };
        expect(gates(p), `${k}/${rot}`).toEqual({ entrada: viejo.salida, salida: viejo.entrada });
      }
    }
  });

  it('the entry gate is ALWAYS step 0 and the exit gate step 4, in the 96', () => {
    // It is what the number in the corner of the cell promises on screen, because the
    // board paints the step and not the degree: the playhead enters at `#0` and counts up.
    // With the degree the promise would hold only in the 48 unreflected orientations: in
    // the reflected ones the playhead would enter at `#4` and count down. This test
    // prevents that bug.
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const p = colocar(k, rot, mirror, 5, 3);
          const pasos = playOrderByCellIndex(SHAPES[k], mirror);
          const celdaDelPaso = (n: number) => p.cells[pasos.indexOf(n)];
          expect(gates(p), `${k}/${rot}/${mirror}`).toEqual({
            entrada: celdaDelPaso(0),
            salida: celdaDelPaso(CELLS_PER_PIECE - 1),
          });
        }
      }
    }
  });

  it('with no reflection nothing moves: the 48 unreflected orientations give the gates by degree', () => {
    // The other half of the statement: on a board with no reflected piece, the gates are
    // the cells of degrees 0 and 4.
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const p = colocar(k, rot, false, 5, 3);
        const g = degreeByCellIndex(SHAPES[k]);
        expect(gates(p), `${k}/${rot}`).toEqual({
          entrada: p.cells[g.indexOf(0)],
          salida: p.cells[g.indexOf(CELLS_PER_PIECE - 1)],
        });
      }
    }
  });
});

/** All the permutations of `a`. Only for the brute force of the tests. */
const permutaciones = (a: number[]): number[][] => {
  if (a.length <= 1) return [a];
  const out: number[][] = [];
  for (let i = 0; i < a.length; i++) {
    const resto = [...a.slice(0, i), ...a.slice(i + 1)];
    for (const p of permutaciones(resto)) out.push([a[i], ...p]);
  }
  return out;
};

/** The `(n-1)!` circuits that start at piece 0. Every cycle goes through it. */
const circuitos = (n: number): number[][] =>
  permutaciones([...Array(n - 1).keys()].map((i) => i + 1)).map((p) => [0, ...p]);

const costoDelCircuito = (orden: number[], board: PlacedPiece[]): number =>
  orden.reduce((s, _, t) => s + costoEntre(board[orden[t]], board[orden[(t + 1) % orden.length]], board), 0);

/** What the circuit LASTS, which is not what it costs: the moves of each leg. */
const pasosDelCircuito = (orden: number[], board: PlacedPiece[]): number =>
  orden.reduce((s, _, t) => s + pasosEntre(board[orden[t]], board[orden[(t + 1) % orden.length]], board), 0);

const ordenDe = (board: PlacedPiece[]): number[] =>
  buildSequence(board, REGIMEN.escala, GRID_DEFAULT).steps.map((s) => board.findIndex((p) => p.id === s.pieceId));

/**
 * Four pieces where the shortest circuit is NOT the placement order.
 *
 * Placed W, P, F, X; the circuit visits W, X, F, P and costs 19 against the 25 of the
 * placement order. It is the concrete case that makes the difference audible: to move a
 * piece reorders the music.
 *
 * The matrix that orders the circuit is not the bare distance: each occupied cell entered
 * adds `CROSS_COST`, so a leg that goes through a piece can lose against a longer one that
 * goes around it.
 */
const CUATRO = [
  colocar('W', 0, false, 6, 4),
  colocar('P', 0, false, 4, 4),
  colocar('F', 0, false, 8, 2),
  colocar('X', 0, false, 2, 2),
];

describe('the order is that of the shortest circuit, not the placement order', () => {
  it('AC-CIR-009 — with four pieces the circuit reorders the placement and costs less', () => {
    expect(CUATRO.every((p, i) => isValid(p.cells, CUATRO.slice(0, i), GRID_DEFAULT))).toBe(true);
    expect(ordenDe(CUATRO)).toEqual([0, 3, 2, 1]);
    expect(costoDelCircuito([0, 3, 2, 1], CUATRO)).toBe(19);
    expect(costoDelCircuito([0, 1, 2, 3], CUATRO)).toBe(25);
    // And here the distinction shows at its clearest: **the cost orders, the moves measure
    // time.** The winner costs 19 and lasts 19, but `0>1>3>2` costs 21 and lasts 17. So
    // the chosen circuit is NOT the shortest in time, because each occupied cell entered
    // adds `CROSS_COST` to the cost and ONE interval to the clock. If the cost leaked into
    // the offsets, the cycle would stretch for each cell entered and the board would sound
    // different from what it shows.
    expect(costoDelCircuito([0, 1, 3, 2], CUATRO)).toBe(21);
    expect(pasosDelCircuito([0, 1, 3, 2], CUATRO)).toBe(17);
    expect(pasosDelCircuito([0, 3, 2, 1], CUATRO)).toBe(19);
    expect(buildSequence(CUATRO, REGIMEN.escala, GRID_DEFAULT).length).toBe(4 * (CELLS_PER_PIECE - 1) + 19);
  });

  it('AC-CIR-010 — no other circuit is shorter, verified by brute force up to 7 pieces', () => {
    // Held-Karp against the full enumeration: it is the only thing that tells "exact" from
    // "a heuristic that is right almost always". It stops at 7 because 7 pieces already
    // give 720 circuits for each board, and the value of the test does not grow with the
    // eighth.
    for (const board of [CUATRO, ...PREFIJOS.slice(1, 7)]) {
      const optimo = Math.min(...circuitos(board.length).map((o) => costoDelCircuito(o, board)));
      const elegido = costoDelCircuito(ordenDe(board), board);
      expect(elegido, `${board.length} pieces`).toBe(optimo);
      // The cycle length is measured with the MOVES and not with the cost just compared:
      // what orders the circuit and what it lasts are two different numbers, and to
      // confuse them would stretch the cycle for each cell entered.
      expect(buildSequence(board, REGIMEN.escala, GRID_DEFAULT).length).toBe(board.length * (CELLS_PER_PIECE - 1) + pasosDelCircuito(ordenDe(board), board));
    }
  });
});

describe('two adjacent pieces are contiguous', () => {
  it('AC-CIR-011 — with a leg of 1 move there are no clicks and the next note falls one interval after the last', () => {
    // `L` leaves at (2,0) and `N` enters at (3,0); `N` leaves at (2,3) and `L` enters at
    // (1,3). The two legs of the circuit have 1 move, so the pattern is contiguous in both
    // directions and there is no silence at either join.
    //
    // A pair of legs of 1 move both ways depends on where the TWO gates of each piece
    // fall, so a change of the order of the notes moves it.
    const f = colocar('L', 0, false, 1, 1);
    const p = colocar('N', 1, false, 3, 2);
    expect(isValid(p.cells, [f], GRID_DEFAULT)).toBe(true);
    expect(pasosEntre(f, p, [f, p])).toBe(1);
    expect(pasosEntre(p, f, [f, p])).toBe(1);
    // One move is zero cells in between, so there is nothing to enter and the leg costs
    // nothing: the crossing cost does not touch the contiguous case.
    expect(costoEntre(f, p, [f, p])).toBe(0);
    expect(costoEntre(p, f, [f, p])).toBe(0);

    const seq = buildSequence([f, p], REGIMEN.escala, GRID_DEFAULT);
    expect(seq.clicks).toEqual([]);
    expect(seq.steps.map((s) => s.offset)).toEqual([0, CELLS_PER_PIECE]);
    // The last note of `L` sounds at interval 4 and the first of `N` at interval 5.
    expect(seq.steps[1].offset - (seq.steps[0].offset + CELLS_PER_PIECE - 1)).toBe(1);
    expect(seq.length).toBe(2 * (CELLS_PER_PIECE - 1) + 2);
  });
});

describe('the offsets and the clicks', () => {
  it('AC-CIR-012 — each piece spans 4 intervals, and the leg to the next one is added on top', () => {
    for (const board of PREFIJOS) {
      const seq = buildSequence(board, REGIMEN.escala, GRID_DEFAULT);
      const orden = ordenDe(board);
      expect(seq.steps[0].offset).toBe(0);
      for (let t = 1; t < board.length; t++) {
        // MOVES and not cost: a crossing costs `CROSS_COST` but lasts one interval.
        const salto = pasosEntre(board[orden[t - 1]], board[orden[t]], board);
        expect(seq.steps[t].offset - seq.steps[t - 1].offset).toBe(CELLS_PER_PIECE - 1 + salto);
      }
    }
  });

  it('AC-CIR-012 — the cycle closes with the leg from the last piece to the first added too', () => {
    // Without that leg the loop would close early and the return to the start would sound
    // like a cut.
    //
    // From `PREFIJOS[1]`: with ONE piece there is no return leg, because the circuit
    // exists between pieces. The two tests of the single piece in `edges` cover that case.
    for (const board of PREFIJOS.slice(1)) {
      const seq = buildSequence(board, REGIMEN.escala, GRID_DEFAULT);
      const orden = ordenDe(board);
      const vuelta = pasosEntre(board[orden[board.length - 1]], board[orden[0]], board);
      expect(seq.length).toBe(seq.steps[board.length - 1].offset + CELLS_PER_PIECE - 1 + vuelta);
      expect(seq.length).toBe(board.length * (CELLS_PER_PIECE - 1) + pasosDelCircuito(orden, board));
    }
  });

  it('AC-CIR-014 — a leg of d moves leaves exactly d-1 clicks, and they are the cells of the route', () => {
    // The number is NOT computed apart: it is the length of the route. That makes it
    // impossible for the cell that is drawn and the cell that sounds to disagree.
    //
    // From `PREFIJOS[1]` for the same reason as the test above: with one piece there are
    // no legs, and so no clicks.
    for (const board of PREFIJOS.slice(1)) {
      const seq = buildSequence(board, REGIMEN.escala, GRID_DEFAULT);
      const orden = ordenDe(board);
      const esperados: Cell[] = [];
      for (let t = 0; t < board.length; t++) {
        const tramo = rutaEntre(board[orden[t]], board[orden[(t + 1) % board.length]], board);
        expect(tramo.path.length).toBe(tramo.steps - 1);
        esperados.push(...tramo.path);
      }
      expect(seq.clicks.map((c) => c.cell)).toEqual(esperados);
    }
  });

  it('AC-CIR-015 — the clicks strictly increase and none falls on the interval of a note', () => {
    // Without this guarantee two clicks could fall on the same interval, and the engine,
    // which sees only the offset, would schedule both: two times CLICK_VELOCITY is 62 % of
    // a note, and the amplitudes would add up. The engine does not need the cell to sound,
    // but the cell lets the guarantee be verified HERE.
    for (const board of PREFIJOS) {
      const seq = buildSequence(board, REGIMEN.escala, GRID_DEFAULT);
      const notas = new Set<number>();
      for (const s of seq.steps) for (let i = 0; i < CELLS_PER_PIECE; i++) notas.add(s.offset + i);

      const offsets = seq.clicks.map((c) => c.offset);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i], `${board.length} pieces, click ${i}`).toBeGreaterThan(offsets[i - 1]);
      }
      for (const o of offsets) expect(notas.has(o), `click at ${o}`).toBe(false);
      // And everything falls inside the cycle: nothing sounds after the loop starts again.
      for (const o of [...offsets, ...seq.steps.map((s) => s.offset + CELLS_PER_PIECE - 1)]) {
        expect(o).toBeLessThan(seq.length);
      }
    }
  });
});

/**
 * The witness of the crossing with a note: the `X` on (1,1), with the `F` and the `N`
 * placed so that the circuit pays less to go through it than around it.
 *
 * ## Why this board
 *
 * The arpeggio walks the piece, so the `X` enters and leaves by two opposite arms. Its
 * central cell is not a gate, and a leg that reaches the `X` is not forced to cross it.
 * Measured: on the board `X`(4,2) + `F`(3,4) + `I`(5,0) no leg crosses any cell, and its
 * 10 clicks all fall on empty cells.
 *
 * So the crossing is **a cost, not an impossibility**. This board exercises it from that
 * side: to go around the `X` costs more than to pay the three crossings. The full tiling
 * below covers the case where there is no alternative.
 */
const CON_X = [colocar('X', 0, false, 1, 1), colocar('F', 0, false, 3, 2), colocar('N', 0, false, 2, 4)];

/** Raw Manhattan: only to state that two cells are neighbours on the grid. */
const manhattanEntre = (a: Cell, b: Cell): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

describe('the crossing carries the note of the cell it enters', () => {
  it('AC-CIR-016 — to go through the X sounds the notes of the X, cell by cell', () => {
    expect(CON_X.every((p, i) => isValid(p.cells, CON_X.slice(0, i), GRID_DEFAULT))).toBe(true);
    const equis = CON_X[0];
    expect(equis.cells).toEqual([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]);

    // The gates of the `X` are two OPPOSITE arms, not its centre.
    expect(gates(equis)).toEqual({ entrada: [2, 1], salida: [1, 0] });

    const seq = buildSequence(CON_X, REGIMEN.escala, GRID_DEFAULT);
    const cruce = seq.clicks.filter((c) => equis.cells.some((q) => misma(q, c.cell)));

    // THREE crossings, and one is the central cell: the leg back to the `X` enters by one
    // arm and goes through the centre to reach the entry gate. A route around the `X`
    // exists and costs more: with `CROSS_COST = 5` the route goes around all it can, and
    // pays these three because they cost less than the detour.
    expect(cruce.map((c) => [c.cell, c.note])).toEqual([[[2, 1], 69], [[1, 2], 71], [[1, 1], 76]]);
    // And the note is the one that the board shows on that cell, not a second count.
    for (const c of cruce) expect(c.note).toBe(notaPintadaEn(equis, c.cell));
    // The last crossing of the cycle is the centre, and the centre is a neighbour of the
    // entry gate: it is paid on the way IN, where the geometry of the `X` is tight.
    expect(seq.clicks[seq.clicks.length - 1].cell).toEqual([1, 1]);
    expect(manhattanEntre([1, 1], gates(equis).entrada)).toBe(1);

    // The empty cell of the same cycle carries no note: a MISSING `note` says "nothing was
    // here", so no third state is needed.
    const vacia = seq.clicks.find((c) => misma(c.cell, [2, 0]));
    expect(vacia).toBeDefined();
    expect(vacia?.note).toBeUndefined();
  });

  it('AC-CIR-017 — in the 12 prefixes: there is a `note` if and only if the cell is occupied', () => {
    // The whole guarantee: no click invents a note on an empty cell, and none is silent on
    // an occupied one.
    for (const board of PREFIJOS) {
      for (const click of buildSequence(board, REGIMEN.escala, GRID_DEFAULT).clicks) {
        const duenio = board.find((p) => p.cells.some((q) => misma(q, click.cell)));
        const donde = `${board.length} pieces, click at ${click.cell}`;
        if (duenio === undefined) expect(click.note, donde).toBeUndefined();
        else expect(click.note, donde).toBe(notaPintadaEn(duenio, click.cell));
      }
    }
  });

  it('AC-CIR-017 — the full tiling: with no empty cell, the 13 clicks carry a note', () => {
    // The limit case of the model. With the 60 cells occupied the crossing cost can avoid
    // nothing and every click is a crossing: the circuit does not go silent when it cannot
    // avoid a piece. It still sounds, and it says on what.
    const seq = buildSequence(DOCE, REGIMEN.escala, GRID_DEFAULT);
    expect(seq.clicks).toHaveLength(13);
    expect(seq.clicks.every((c) => c.note !== undefined)).toBe(true);
  });
});

describe('the notes of each step', () => {
  it('AC-MUS-017 — they come from the piece with the retrograde applied', () => {
    // A reflection reverses the ORDER IN WHICH the notes SOUND, and `arpeggioFor` applies
    // it. To reverse again here would undo the reflection.
    const v = colocar('V', 0, true, 2, 2);
    const ascendente = notesForRotation(BASE_MAP.V, DEFAULT_OCTAVE, 0, REGIMEN.escala);
    expect(buildSequence([v], REGIMEN.escala, GRID_DEFAULT).steps[0].notes).toEqual([...ascendente].reverse());
  });

  it('each call returns its own arrays: to mutate one sequence does not touch the next', () => {
    // `Step.notes` is mutable by contract. The notes are derived and not stored in the
    // piece, so what must be guaranteed is that two sequences of the SAME board do not
    // share the array.
    const f = colocar('F', 0, false, 1, 1);
    const primera = buildSequence([f], REGIMEN.escala, GRID_DEFAULT);
    primera.steps[0].notes[0] = -1;
    expect(buildSequence([f], REGIMEN.escala, GRID_DEFAULT).steps[0].notes[0]).not.toBe(-1);
  });
});

describe('determinism', () => {
  it('AC-CIR-022 — the same board always gives the same sequence', () => {
    // Without this two identical boards could sound different by how the JS engine walked
    // the `for`. There is no `Math.random`, no date and no float: the integer count
    // guarantees it.
    for (const board of PREFIJOS) {
      expect(buildSequence(board, REGIMEN.escala, GRID_DEFAULT)).toEqual(buildSequence(board, REGIMEN.escala, GRID_DEFAULT));
      expect(buildSequence([...board], REGIMEN.escala, GRID_DEFAULT)).toEqual(buildSequence(board, REGIMEN.escala, GRID_DEFAULT));
    }
  });

  it('AC-CIR-021 — between two circuits of equal cost the one with the smaller indices wins', () => {
    // The index is the THIRD criterion and decides only when the two before it tie, so the
    // board must tie in cost **AND** in moves. Measured: F, Z, Y leave two circuits,
    // 0→1→2 and 0→2→1, both at cost 19 and 14 moves.
    //
    // **A board that ties must be searched again with each change of the model, never
    // inherited**, and that is the point of the test: a tie depends on the model. Three
    // boards lost their tie so. One of (P, W, F) tied at 16 with the bare distance and at
    // 14 with a crossing cost of 2, and with 5 it does not tie (15 against 17). One of
    // (F, I, L) tied at 24, and a change of the order of the notes moved the gates, and
    // with them the whole matrix (13 against 20). A change of the SHAPE of the `Z` moved
    // its gates and broke a tie of these same three pieces, with the `Z` at rotation 1 on
    // (6,4). An inherited board leaves the test green and exercises nothing, which is the
    // only way this test can lie. So the two `expect` lines of cost and moves come first.
    const board = [
      colocar('F', 0, false, 8, 4),
      colocar('Z', 0, false, 3, 4),
      colocar('Y', 0, false, 6, 2),
    ];
    expect(circuitos(3).map((o) => costoDelCircuito(o, board))).toEqual([19, 19]);
    expect(circuitos(3).map((o) => pasosDelCircuito(o, board))).toEqual([14, 14]);
    expect(ordenDe(board)).toEqual([0, 1, 2]);
  });

  it('AC-CIR-020 — the PLACEMENT ORDER does not change what sounds: 120 permutations, one cycle', () => {
    // The property that the circuit promises: "the geometry decides the order". The
    // failure was found by using the app, not by reading code.
    //
    // With the crossing cost, the cost of a leg is not its number of moves: a crossing
    // costs `CROSS_COST` and lasts ONE interval. So two circuits can cost the same and
    // last different times, and if the tie-break reads only the index, which IS the
    // placement order, the same board sounds different by the order in which it was built.
    //
    // Measured on THIS board: `N>X>U>I>P` and `N>P>X>U>I` **both cost 32** and have **21
    // and 25 moves**, so cycles of 41 and 45 intervals. Without the criterion of the moves
    // the one with the smaller index wins, which is the placement order, and the board
    // sounds four intervals longer or shorter by how it was built. Over 120 random boards
    // of 5 pieces it happened on 8.3 %; with the moves as the second criterion it happens
    // on 0 %.
    //
    // The board is another than the one of the test above, for the same reason: it needs
    // two optimal circuits that differ in MOVES, or the tie-break is not exercised and the
    // test passes with nothing measured. With the gates where they are, the board
    // (N, V, Z, U, F) does not meet that.
    const spec: [PieceKey, number, number, number][] = [
      ['N', 3, 6, 1], ['X', 0, 4, 1], ['U', 3, 2, 3], ['I', 3, 0, 2], ['P', 1, 8, 2],
    ];
    const armar = (orden: number[]): PlacedPiece[] => {
      const out: PlacedPiece[] = [];
      for (const i of orden) {
        const [piece, rot, x, y] = spec[i];
        const p = colocar(piece, rot, false, x, y);
        expect(isValid(p.cells, out, GRID_DEFAULT), `${piece} does not fit in the order ${orden}`).toBe(true);
        out.push(p);
      }
      return out;
    };

    const permutaciones = (a: number[]): number[][] => a.length <= 1 ? [a]
      : a.flatMap((x, i) => permutaciones([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));

    const ordenes = permutaciones([0, 1, 2, 3, 4]);
    expect(ordenes).toHaveLength(120);

    // The circuit is compared as a CYCLIC sequence, rotated to start always at the same
    // piece, because the cycle is closed and has no start: to start at another piece is
    // not to sound different, it is the same lap seen from another point.
    const vistos = new Set<string>();
    const largos = new Set<number>();
    for (const orden of ordenes) {
      const seq = buildSequence(armar(orden), REGIMEN.escala, GRID_DEFAULT);
      const ids = seq.steps.map((st) => st.pieceId);
      const k = ids.indexOf('N');
      vistos.add([...ids.slice(k), ...ids.slice(0, k)].join('>'));
      largos.add(seq.length);
    }
    expect([...largos]).toEqual([41]);
    expect([...vistos]).toHaveLength(1);

    // And the chosen cycle must be the SHORT one of the two that tie in cost, not any of
    // them: at equal cost, fewer moves is less silence.
    expect(circuitos(5).filter((o) => costoDelCircuito(o, armar([0, 1, 2, 3, 4])) === 32)
      .map((o) => pasosDelCircuito(o, armar([0, 1, 2, 3, 4]))).sort((a, b) => a - b)[0]).toBe(21);
  });

  it('AC-CIR-021 — the chosen circuit is the lexicographically smallest among all the optimal ones', () => {
    for (const board of [CUATRO, ...PREFIJOS.slice(1, 7)]) {
      const todos = circuitos(board.length);
      const optimo = Math.min(...todos.map((o) => costoDelCircuito(o, board)));
      const lexmin = todos
        .filter((o) => costoDelCircuito(o, board) === optimo)
        .map((o) => o.join(','))
        .sort()[0];
      expect(ordenDe(board).join(','), `${board.length} pieces`).toBe(lexmin);
    }
  });
});

/**
 * Mute: a piece that keeps its place and its time in the circuit and does not sound its
 * notes.
 *
 * What these tests fix is not that mute "works" but that **it changes nothing else**. The
 * circuit is chosen with `puertas`, `rutas` and Held-Karp, and none of the three reads
 * `muted`. If one ever did, mute would reorder the music, and the gesture could not answer
 * the question it exists for, "how does this sound without the N", because the question
 * would change the answer.
 */
const mutando = (board: readonly PlacedPiece[], i: number): PlacedPiece[] =>
  board.map((p, k) => k === i ? { ...p, muted: true } : p);

describe('mute does not move the circuit', () => {
  it('AC-CIR-018 — the same visit order, the same offsets and the same cycle length', () => {
    const normal = buildSequence(CUATRO, REGIMEN.escala, GRID_DEFAULT);
    for (let i = 0; i < CUATRO.length; i++) {
      const muteada = buildSequence(mutando(CUATRO, i), REGIMEN.escala, GRID_DEFAULT);
      expect(muteada.order, `piece ${i}`).toEqual(normal.order);
      expect(muteada.length, `piece ${i}`).toBe(normal.length);
    }
  });

  it('the steps of the other pieces stay identical', () => {
    const normal = buildSequence(CUATRO, REGIMEN.escala, GRID_DEFAULT);
    const muteada = buildSequence(mutando(CUATRO, 0), REGIMEN.escala, GRID_DEFAULT);
    const id = CUATRO[0].id;
    expect(muteada.steps).toEqual(normal.steps.filter((s) => s.pieceId !== id));
  });

  it('AC-CIR-018 — the clicks of the LEGS fall on the same offsets and the same cells', () => {
    const normal = buildSequence(CUATRO, REGIMEN.escala, GRID_DEFAULT);
    const muteada = buildSequence(mutando(CUATRO, 0), REGIMEN.escala, GRID_DEFAULT);
    // The offsets that the muted piece takes are exactly those of its arpeggio.
    const suyos = new Set(normal.steps.filter((s) => s.pieceId === CUATRO[0].id)
      .flatMap((s) => Array.from({ length: CELLS_PER_PIECE }, (_, j) => s.offset + j)));
    const delRecorrido = muteada.clicks.filter((c) => !suyos.has(c.offset));
    // Identical offsets and cells: no route moved by one cell.
    expect(delRecorrido.map(({ offset, cell }) => ({ offset, cell })))
      .toEqual(normal.clicks.map(({ offset, cell }) => ({ offset, cell })));
    expect(muteada.clicks).toHaveLength(normal.clicks.length + CELLS_PER_PIECE);
    // The only thing they can lose is the NOTE, and only the ones that cross the muted
    // piece: a crossing on a muted piece does not sound. On this board a leg crosses the
    // `W`, so the case really exists and need not be invented.
    const celdasW = new Set(CUATRO[0].cells.map((c) => `${c[0]},${c[1]}`));
    const perdieron = normal.clicks.filter((c, k) => c.note !== undefined && delRecorrido[k].note === undefined);
    expect(perdieron.length).toBeGreaterThan(0);
    expect(perdieron.every((c) => celdasW.has(`${c.cell[0]},${c.cell[1]}`))).toBe(true);
  });
});

describe('the muted piece emits five silent clicks and no step', () => {
  it('AC-PLY-024 — the five fall where its notes were, cell by cell', () => {
    const normal = buildSequence(CUATRO, REGIMEN.escala, GRID_DEFAULT);
    const muteada = buildSequence(mutando(CUATRO, 0), REGIMEN.escala, GRID_DEFAULT);
    const paso = normal.steps.find((s) => s.pieceId === CUATRO[0].id)!;
    const celdas = cellsByPlayOrder(CUATRO[0]);

    // Zero `Step` for that piece.
    expect(muteada.steps.some((s) => s.pieceId === CUATRO[0].id)).toBe(false);

    // And five clicks with NO `note`, in the same play order: the cell of click `j` is the
    // cell where note `j` would have sounded.
    for (let j = 0; j < CELLS_PER_PIECE; j++) {
      const c = muteada.clicks.find((k) => k.offset === paso.offset + j);
      expect(c, `note ${j}`).toBeDefined();
      expect(c!.cell, `note ${j}`).toEqual(celdas[j]);
      // The ABSENCE of the field and not an explicit `undefined`: the docblock of `Click`
      // makes that distinction, and `proyectarAlMotor` keeps it with a ternary.
      expect('note' in c!, `note ${j}`).toBe(false);
    }
  });
});

describe('a single muted piece goes through the early return and does not sound either', () => {
  it('AC-PLY-025 — five silent clicks, zero steps and the cycle of the arpeggio', () => {
    // `n === 1` builds its `Step` without the loop (`sequence.ts`), so an implementation
    // that changed only the loop would leave this board, the only one that can be muted in
    // full, as the only one that sounds.
    const s = buildSequence([colocar('F', 0, false, 2, 2, true)], REGIMEN.escala, GRID_DEFAULT);
    expect(s.steps).toEqual([]);
    expect(s.clicks).toHaveLength(CELLS_PER_PIECE);
    expect(s.clicks.every((c) => !('note' in c))).toBe(true);
    expect(s.clicks.map((c) => c.offset)).toEqual([0, 1, 2, 3, 4]);
    expect(s.length).toBe(CELLS_PER_PIECE);
    // And it is still in the circuit: mute does not take it out.
    expect(s.order).toEqual([{ pieceId: 'F', offset: 0 }]);
  });
});

describe('a crossing on a muted piece does not sound', () => {
  it('AC-PLY-026 — the crossings on the X lose their note when it is muted', () => {
    // `CON_X` is the board where a leg CROSSES the `X`, and those crossings sound the note
    // of the cell, which is exactly the note that mute turns off.
    const normal = buildSequence(CON_X, REGIMEN.escala, GRID_DEFAULT);
    const conNota = normal.clicks.filter((c) => c.note !== undefined);
    // A guard of the test itself: if the board stopped crossing, the `expect` lines below
    // would have nothing to walk and this would pass empty.
    expect(conNota.length).toBeGreaterThan(0);
    const celdasX = new Set(CON_X[0].cells.map((c) => `${c[0]},${c[1]}`));
    expect(conNota.every((c) => celdasX.has(`${c.cell[0]},${c.cell[1]}`))).toBe(true);

    const muteada = buildSequence(mutando(CON_X, 0), REGIMEN.escala, GRID_DEFAULT);
    for (const c of conNota) {
      const k = muteada.clicks.find((q) => q.offset === c.offset)!;
      expect(k.cell).toEqual(c.cell);
      expect('note' in k, `crossing at ${c.offset}`).toBe(false);
    }
    // The crossing does not go away: it still costs and it still lasts. So the circuit
    // does not move.
    expect(muteada.order).toEqual(normal.order);
    expect(muteada.length).toBe(normal.length);
  });
});

describe('two events never fall on the same interval, with mute too', () => {
  it('AC-CIR-015 — no offset repeats between clicks or collides with a note', () => {
    // Mute puts a new kind of click inside the same intervals that an arpeggio takes. If
    // two events coincided, the engine would schedule both and the amplitudes would add
    // up.
    for (const board of [CUATRO, CON_X]) {
      for (let i = 0; i < board.length; i++) {
        const s = buildSequence(mutando(board, i), REGIMEN.escala, GRID_DEFAULT);
        const ocupados = new Map<number, string>();
        for (const st of s.steps) {
          for (let j = 0; j < st.notes.length; j++) {
            expect(ocupados.has(st.offset + j)).toBe(false);
            ocupados.set(st.offset + j, `note ${st.pieceId}`);
          }
        }
        for (const c of s.clicks) {
          expect(ocupados.get(c.offset), `offset ${c.offset} with piece ${i} muted`).toBeUndefined();
          ocupados.set(c.offset, 'click');
        }
        // And the cycle is covered in full, with no holes: so a gap of the muted piece is
        // heard in its place and not as a shortened pattern.
        expect(ocupados.size).toBe(s.length);
      }
    }
  });
});
