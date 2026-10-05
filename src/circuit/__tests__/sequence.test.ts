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

const notasDe = (p: PlacedPiece): number[] => {
  const asc = notesForRotation(BASE_MAP[p.piece], DEFAULT_OCTAVE, p.rotation, REGIMEN.escala);
  return p.mirror ? [...asc].reverse() : asc;
};

const celdasEnOrden = (p: PlacedPiece): Cell[] => {
  const g = degreeByCellIndex(SHAPES[p.piece]);
  const porGrado = g.map((_, d) => p.cells[g.indexOf(d)]);
  return p.mirror ? porGrado.reverse() : porGrado;
};

const puertas = (p: PlacedPiece): { entrada: Cell; salida: Cell } => {
  const orden = celdasEnOrden(p);
  return { entrada: orden[0], salida: orden[CELLS_PER_PIECE - 1] };
};

const rutaEntre = (a: PlacedPiece, b: PlacedPiece, board: readonly PlacedPiece[]) =>
  routeBetween(puertas(a).salida, puertas(b).entrada, board, GRID_DEFAULT);

const costoEntre = (a: PlacedPiece, b: PlacedPiece, board: readonly PlacedPiece[]): number => {
  const r = rutaEntre(a, b, board);
  return r.path.length + r.crossed.length * (CROSS_COST - 1);
};

const pasosEntre = (a: PlacedPiece, b: PlacedPiece, board: readonly PlacedPiece[]): number =>
  rutaEntre(a, b, board).steps;

const misma = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];

const PREFIJOS = DOCE.map((_, i) => DOCE.slice(0, i + 1));

describe('the tiling that the tests use', () => {
  it('the 12 pieces fit with no overlap and cover the 60 cells', () => {
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
    for (const [pieza, rot] of [['F', 0], ['Z', 0], ['I', 1], ['X', 0]] as const) {
      const sola = colocar(pieza, rot, false, 4, 2);
      const seq = buildSequence([sola], REGIMEN.escala, GRID_DEFAULT);
      expect(seq.clicks).toEqual([]);
      expect(seq.steps).toEqual([{ pieceId: pieza, offset: 0, notes: notasDe(sola) }]);
      expect(seq.length).toBe(CELLS_PER_PIECE);
    }
  });

  it('AC-CIR-013 — the single piece repeats CONTIGUOUS with itself, with no overlap', () => {
    const seq = buildSequence([colocar('F', 0, false, 1, 1)], REGIMEN.escala, GRID_DEFAULT);
    const ultimaNota = seq.steps[0].offset + CELLS_PER_PIECE - 1;
    expect(seq.length - ultimaNota).toBe(1);
  });
});

describe('the gates of a piece', () => {
  it('with NO reflection the entry gate is the cell of degree 0 and the exit gate the cell of degree 4', () => {
    expect(degreeByCellIndex(SHAPES.F)).toEqual([0, 1, 2, 3, 4]);
    const f = colocar('F', 0, false, 1, 1);
    expect(f.cells).toEqual([[0, 1], [1, 0], [1, 1], [1, 2], [2, 2]]);
    expect(puertas(f).entrada).toEqual([0, 1]);
    expect(puertas(f).salida).toEqual([2, 2]);
    expect(gates(f)).toEqual({ entrada: [0, 1], salida: [2, 2] });

    const otra = colocar('P', 0, false, 7, 1);
    const seq = buildSequence([f, otra], REGIMEN.escala, GRID_DEFAULT);
    const primero = seq.steps[0].pieceId === 'F' ? f : otra;
    const segundo = primero === f ? otra : f;
    const tramo = rutaEntre(primero, segundo, [f, otra]);
    expect(seq.clicks.map((c) => c.cell).slice(0, tramo.steps - 1)).toEqual(tramo.path);
  });

  it('they come from the CANONICAL shape: computed on the transformed shape, 53 of the 96 orientations move', () => {
    let distintas = 0;
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[k], rot);
          const shape = mirror ? reflect(base) : base;
          const p = colocar(k, rot, mirror, 5, 3);
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

const notaPintadaEn = (p: PlacedPiece, c: Cell): number => {
  const grados = degreeByCellIndex(SHAPES[p.piece]);
  const asc = notesForRotation(BASE_MAP[p.piece], DEFAULT_OCTAVE, p.rotation, REGIMEN.escala);
  const k = p.cells.findIndex((q) => q[0] === c[0] && q[1] === c[1]);
  return asc[grados[k]];
};

describe('`cellsByPlayOrder`: the cell of each note', () => {
  it('`[j]` is the cell that the board shows with `notes[j]`, in the 96 orientations', () => {
    for (const k of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const p = colocar(k, rot, mirror, 5, 3);
          const orden = cellsByPlayOrder(p);
          expect(orden, `${k}/${rot}/${mirror}`).toHaveLength(CELLS_PER_PIECE);
          for (let j = 0; j < CELLS_PER_PIECE; j++) {
            expect(notaPintadaEn(p, orden[j]), `${k}/${rot}/${mirror} note ${j}`).toBe(notasDe(p)[j]);
          }
          expect(new Set(orden.map((c) => c.join(','))).size).toBe(CELLS_PER_PIECE);
          expect(new Set(orden.map((c) => c.join(',')))).toEqual(new Set(p.cells.map((c) => c.join(','))));
        }
      }
    }
  });

  it('the reflection is the only thing that separates it from the degree order', () => {
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
    const l = colocar('L', 0, true, 1, 1);
    const antes = JSON.stringify(l.cells);
    cellsByPlayOrder(l).reverse();
    expect(JSON.stringify(l.cells)).toBe(antes);
  });
});

describe('`noteAtCell`: which note is on a cell', () => {
  it('AC-MUS-016 — it is exactly the note that the board SHOWS, in the 96 orientations', () => {
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
    const f = colocar('F', 0, false, 1, 1);
    expect(noteAtCell(f, [9, 5], REGIMEN.escala)).toBeNull();
    expect(noteAtCell(f, [0, 0], REGIMEN.escala)).toBeNull();
    for (const c of f.cells) expect(noteAtCell(f, c, REGIMEN.escala)).not.toBeNull();
  });

  it('AC-MUS-025 — it comes from the ASCENDING arpeggio and not from the one with the retrograde applied', () => {
    const l = colocar('L', 0, true, 1, 1);
    const grados = degreeByCellIndex(SHAPES.L);
    const ascendente = notesForRotation(BASE_MAP.L, DEFAULT_OCTAVE, 0, REGIMEN.escala);
    const real = l.cells.map((c) => noteAtCell(l, c, REGIMEN.escala));
    expect(real).toEqual(l.cells.map((_, k) => ascendente[grados[k]]));
    const espejado = l.cells.map((_, k) => notasDe(l)[grados[k]]);
    expect(real.filter((n, k) => n !== espejado[k])).toHaveLength(4);
  });

  it('AC-MUS-016 — under `orden` it returns the note of the regime of the piece, not the note of `escala`', () => {
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
    // Of 480 cells. The 168 that agree: the 120 of rotation 0, and two degrees for each piece at rotation 3.
    expect(distintas).toBe(312);
  });
});

describe('the gates follow the melody, with reflection too', () => {
  it('AC-CIR-008 — the witness case `L`/0/reflected: entry gate [0,0] and exit gate [1,3]', () => {
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

const permutaciones = (a: number[]): number[][] => {
  if (a.length <= 1) return [a];
  const out: number[][] = [];
  for (let i = 0; i < a.length; i++) {
    const resto = [...a.slice(0, i), ...a.slice(i + 1)];
    for (const p of permutaciones(resto)) out.push([a[i], ...p]);
  }
  return out;
};

const circuitos = (n: number): number[][] =>
  permutaciones([...Array(n - 1).keys()].map((i) => i + 1)).map((p) => [0, ...p]);

const costoDelCircuito = (orden: number[], board: PlacedPiece[]): number =>
  orden.reduce((s, _, t) => s + costoEntre(board[orden[t]], board[orden[(t + 1) % orden.length]], board), 0);

const pasosDelCircuito = (orden: number[], board: PlacedPiece[]): number =>
  orden.reduce((s, _, t) => s + pasosEntre(board[orden[t]], board[orden[(t + 1) % orden.length]], board), 0);

const ordenDe = (board: PlacedPiece[]): number[] =>
  buildSequence(board, REGIMEN.escala, GRID_DEFAULT).steps.map((s) => board.findIndex((p) => p.id === s.pieceId));

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
    expect(costoDelCircuito([0, 1, 3, 2], CUATRO)).toBe(21);
    expect(pasosDelCircuito([0, 1, 3, 2], CUATRO)).toBe(17);
    expect(pasosDelCircuito([0, 3, 2, 1], CUATRO)).toBe(19);
    expect(buildSequence(CUATRO, REGIMEN.escala, GRID_DEFAULT).length).toBe(4 * (CELLS_PER_PIECE - 1) + 19);
  });

  it('AC-CIR-010 — no other circuit is shorter, verified by brute force up to 7 pieces', () => {
    for (const board of [CUATRO, ...PREFIJOS.slice(1, 7)]) {
      const optimo = Math.min(...circuitos(board.length).map((o) => costoDelCircuito(o, board)));
      const elegido = costoDelCircuito(ordenDe(board), board);
      expect(elegido, `${board.length} pieces`).toBe(optimo);
      expect(buildSequence(board, REGIMEN.escala, GRID_DEFAULT).length).toBe(board.length * (CELLS_PER_PIECE - 1) + pasosDelCircuito(ordenDe(board), board));
    }
  });
});

describe('two adjacent pieces are contiguous', () => {
  it('AC-CIR-011 — with a leg of 1 move there are no clicks and the next note falls one interval after the last', () => {
    const f = colocar('L', 0, false, 1, 1);
    const p = colocar('N', 1, false, 3, 2);
    expect(isValid(p.cells, [f], GRID_DEFAULT)).toBe(true);
    expect(pasosEntre(f, p, [f, p])).toBe(1);
    expect(pasosEntre(p, f, [f, p])).toBe(1);
    expect(costoEntre(f, p, [f, p])).toBe(0);
    expect(costoEntre(p, f, [f, p])).toBe(0);

    const seq = buildSequence([f, p], REGIMEN.escala, GRID_DEFAULT);
    expect(seq.clicks).toEqual([]);
    expect(seq.steps.map((s) => s.offset)).toEqual([0, CELLS_PER_PIECE]);
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
        const salto = pasosEntre(board[orden[t - 1]], board[orden[t]], board);
        expect(seq.steps[t].offset - seq.steps[t - 1].offset).toBe(CELLS_PER_PIECE - 1 + salto);
      }
    }
  });

  it('AC-CIR-012 — the cycle closes with the leg from the last piece to the first added too', () => {
    for (const board of PREFIJOS.slice(1)) {
      const seq = buildSequence(board, REGIMEN.escala, GRID_DEFAULT);
      const orden = ordenDe(board);
      const vuelta = pasosEntre(board[orden[board.length - 1]], board[orden[0]], board);
      expect(seq.length).toBe(seq.steps[board.length - 1].offset + CELLS_PER_PIECE - 1 + vuelta);
      expect(seq.length).toBe(board.length * (CELLS_PER_PIECE - 1) + pasosDelCircuito(orden, board));
    }
  });

  it('AC-CIR-014 — a leg of d moves leaves exactly d-1 clicks, and they are the cells of the route', () => {
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
    for (const board of PREFIJOS) {
      const seq = buildSequence(board, REGIMEN.escala, GRID_DEFAULT);
      const notas = new Set<number>();
      for (const s of seq.steps) for (let i = 0; i < CELLS_PER_PIECE; i++) notas.add(s.offset + i);

      const offsets = seq.clicks.map((c) => c.offset);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i], `${board.length} pieces, click ${i}`).toBeGreaterThan(offsets[i - 1]);
      }
      for (const o of offsets) expect(notas.has(o), `click at ${o}`).toBe(false);
      for (const o of [...offsets, ...seq.steps.map((s) => s.offset + CELLS_PER_PIECE - 1)]) {
        expect(o).toBeLessThan(seq.length);
      }
    }
  });
});

const CON_X = [colocar('X', 0, false, 1, 1), colocar('F', 0, false, 3, 2), colocar('N', 0, false, 2, 4)];

const manhattanEntre = (a: Cell, b: Cell): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

describe('the crossing carries the note of the cell it enters', () => {
  it('AC-CIR-016 — to go through the X sounds the notes of the X, cell by cell', () => {
    expect(CON_X.every((p, i) => isValid(p.cells, CON_X.slice(0, i), GRID_DEFAULT))).toBe(true);
    const equis = CON_X[0];
    expect(equis.cells).toEqual([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]);

    expect(gates(equis)).toEqual({ entrada: [2, 1], salida: [1, 0] });

    const seq = buildSequence(CON_X, REGIMEN.escala, GRID_DEFAULT);
    const cruce = seq.clicks.filter((c) => equis.cells.some((q) => misma(q, c.cell)));

    expect(cruce.map((c) => [c.cell, c.note])).toEqual([[[2, 1], 69], [[1, 2], 71], [[1, 1], 76]]);
    for (const c of cruce) expect(c.note).toBe(notaPintadaEn(equis, c.cell));
    expect(seq.clicks[seq.clicks.length - 1].cell).toEqual([1, 1]);
    expect(manhattanEntre([1, 1], gates(equis).entrada)).toBe(1);

    const vacia = seq.clicks.find((c) => misma(c.cell, [2, 0]));
    expect(vacia).toBeDefined();
    expect(vacia?.note).toBeUndefined();
  });

  it('AC-CIR-017 — in the 12 prefixes: there is a `note` if and only if the cell is occupied', () => {
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
    const seq = buildSequence(DOCE, REGIMEN.escala, GRID_DEFAULT);
    expect(seq.clicks).toHaveLength(13);
    expect(seq.clicks.every((c) => c.note !== undefined)).toBe(true);
  });
});

describe('the notes of each step', () => {
  it('AC-MUS-017 — they come from the piece with the retrograde applied', () => {
    const v = colocar('V', 0, true, 2, 2);
    const ascendente = notesForRotation(BASE_MAP.V, DEFAULT_OCTAVE, 0, REGIMEN.escala);
    expect(buildSequence([v], REGIMEN.escala, GRID_DEFAULT).steps[0].notes).toEqual([...ascendente].reverse());
  });

  it('each call returns its own arrays: to mutate one sequence does not touch the next', () => {
    const f = colocar('F', 0, false, 1, 1);
    const primera = buildSequence([f], REGIMEN.escala, GRID_DEFAULT);
    primera.steps[0].notes[0] = -1;
    expect(buildSequence([f], REGIMEN.escala, GRID_DEFAULT).steps[0].notes[0]).not.toBe(-1);
  });
});

describe('determinism', () => {
  it('AC-CIR-022 — the same board always gives the same sequence', () => {
    for (const board of PREFIJOS) {
      expect(buildSequence(board, REGIMEN.escala, GRID_DEFAULT)).toEqual(buildSequence(board, REGIMEN.escala, GRID_DEFAULT));
      expect(buildSequence([...board], REGIMEN.escala, GRID_DEFAULT)).toEqual(buildSequence(board, REGIMEN.escala, GRID_DEFAULT));
    }
  });

  it('AC-CIR-021 — between two circuits of equal cost the one with the smaller indices wins', () => {
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
    const suyos = new Set(normal.steps.filter((s) => s.pieceId === CUATRO[0].id)
      .flatMap((s) => Array.from({ length: CELLS_PER_PIECE }, (_, j) => s.offset + j)));
    const delRecorrido = muteada.clicks.filter((c) => !suyos.has(c.offset));
    expect(delRecorrido.map(({ offset, cell }) => ({ offset, cell })))
      .toEqual(normal.clicks.map(({ offset, cell }) => ({ offset, cell })));
    expect(muteada.clicks).toHaveLength(normal.clicks.length + CELLS_PER_PIECE);
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

    expect(muteada.steps.some((s) => s.pieceId === CUATRO[0].id)).toBe(false);

    for (let j = 0; j < CELLS_PER_PIECE; j++) {
      const c = muteada.clicks.find((k) => k.offset === paso.offset + j);
      expect(c, `note ${j}`).toBeDefined();
      expect(c!.cell, `note ${j}`).toEqual(celdas[j]);
      expect('note' in c!, `note ${j}`).toBe(false);
    }
  });
});

describe('a single muted piece goes through the early return and does not sound either', () => {
  it('AC-PLY-025 — five silent clicks, zero steps and the cycle of the arpeggio', () => {
    const s = buildSequence([colocar('F', 0, false, 2, 2, true)], REGIMEN.escala, GRID_DEFAULT);
    expect(s.steps).toEqual([]);
    expect(s.clicks).toHaveLength(CELLS_PER_PIECE);
    expect(s.clicks.every((c) => !('note' in c))).toBe(true);
    expect(s.clicks.map((c) => c.offset)).toEqual([0, 1, 2, 3, 4]);
    expect(s.length).toBe(CELLS_PER_PIECE);
    expect(s.order).toEqual([{ pieceId: 'F', offset: 0 }]);
  });
});

describe('a crossing on a muted piece does not sound', () => {
  it('AC-PLY-026 — the crossings on the X lose their note when it is muted', () => {
    const normal = buildSequence(CON_X, REGIMEN.escala, GRID_DEFAULT);
    const conNota = normal.clicks.filter((c) => c.note !== undefined);
    expect(conNota.length).toBeGreaterThan(0);
    const celdasX = new Set(CON_X[0].cells.map((c) => `${c[0]},${c[1]}`));
    expect(conNota.every((c) => celdasX.has(`${c.cell[0]},${c.cell[1]}`))).toBe(true);

    const muteada = buildSequence(mutando(CON_X, 0), REGIMEN.escala, GRID_DEFAULT);
    for (const c of conNota) {
      const k = muteada.clicks.find((q) => q.offset === c.offset)!;
      expect(k.cell).toEqual(c.cell);
      expect('note' in k, `crossing at ${c.offset}`).toBe(false);
    }
    expect(muteada.order).toEqual(normal.order);
    expect(muteada.length).toBe(normal.length);
  });
});

describe('two events never fall on the same interval, with mute too', () => {
  it('AC-CIR-015 — no offset repeats between clicks or collides with a note', () => {
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
        expect(ocupados.size).toBe(s.length);
      }
    }
  });
});
