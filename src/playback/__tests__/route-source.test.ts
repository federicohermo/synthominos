import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSequence, cellsByPlayOrder } from '../../circuit/sequence.ts';
import { cellsAt, GRID_DEFAULT } from '../../board-editing/placement.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from '../../pieces/pieces.ts';
import { REGIMEN } from '../../musical-model/music.ts';
import { MARCA } from '../route-source.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../../board-editing/placement.ts';

const motor = vi.hoisted(() => ({ generacion: 0 }));
vi.mock('../engine.ts', () => ({ cycleGeneration: () => motor.generacion }));

type RouteSource = typeof import('../route-source.ts');
let rs: RouteSource;

beforeEach(async () => {
  motor.generacion = 0;
  vi.resetModules();
  rs = await import('../route-source.ts');
});

const colocar = (piece: PieceKey, rot: number, mirror: boolean, x: number, y: number, muted = false): PlacedPiece => {
  const base = rotateN(SHAPES[piece], rot);
  const shape = mirror ? reflect(base) : base;
  return {
    id: piece,
    piece,
    rotation: rot,
    mirror,
    cells: cellsAt(shape, ANCHOR_INDEX[piece], x, y),
    muted,
  };
};

const encolarTablero = (placed: readonly PlacedPiece[]): void => rs.encolar(buildSequence(placed, REGIMEN.escala, GRID_DEFAULT), placed);

const cerrarCiclo = (): void => { motor.generacion++; };

const clave = (c: readonly number[]): string => `${c[0]},${c[1]}`;
const claves = (cs: readonly (readonly number[])[]): Set<string> => new Set(cs.map(clave));

const UNA = [colocar('F', 0, false, 2, 2)];
const DOS = [colocar('F', 0, false, 2, 2), colocar('L', 0, true, 7, 1)];

// The circuit enters three occupied cells of the `X`, because the way around costs more:
// this depends on `CROSS_COST`. A board with an `X` is not sure to cross it.
const CON_CRUCE = [colocar('X', 0, false, 1, 1), colocar('F', 0, false, 3, 2), colocar('N', 0, false, 2, 4)];

describe('the drawn sequence is the one that sounds, not the queued one', () => {
  it('AC-PLY-031 — to queue does not change what the playhead draws: the engine must report the swap', () => {
    encolarTablero(UNA);
    expect(rs.rutaActiva()).toEqual([]);

    cerrarCiclo();
    expect(rs.rutaActiva()).not.toEqual([]);
  });

  it('AC-PLY-031 — during the wait the OLD sequence stays, whole', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    const vieja = [...rs.rutaActiva()];

    encolarTablero(DOS);
    expect(rs.rutaActiva()).toEqual(vieja);

    cerrarCiclo();
    const nueva = rs.rutaActiva();
    expect(nueva).not.toEqual(vieja);
    expect(nueva).toHaveLength(buildSequence(DOS, REGIMEN.escala, GRID_DEFAULT).length);
  });

  it('a removed piece does not go dark before it stops sounding', () => {
    encolarTablero(DOS);
    cerrarCiclo();
    const conLas2 = rs.rutaActiva();
    const celdasL = claves(DOS[1].cells);
    const dibujadas = () => claves(conLas2.filter((m) => m !== null).map((m) => m.cell));
    expect([...celdasL].every((c) => dibujadas().has(c))).toBe(true);

    encolarTablero([DOS[0]]);
    expect(rs.rutaActiva()).toBe(conLas2);
    expect([...celdasL].every((c) => dibujadas().has(c))).toBe(true);
  });

  it('the generation is synchronized also when no sequence is queued', () => {
    cerrarCiclo();
    expect(rs.rutaActiva()).toEqual([]);

    encolarTablero(UNA);
    expect(rs.rutaActiva()).toEqual([]);

    cerrarCiclo();
    expect(rs.rutaActiva()).not.toEqual([]);
  });
});

describe('the table by offset', () => {
  it('each offset gives the cell that sounds at it, with the note apart from the click', () => {
    encolarTablero(DOS);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    const s = buildSequence(DOS, REGIMEN.escala, GRID_DEFAULT);

    for (const step of s.steps) {
      const pieza = DOS.find((p) => p.id === step.pieceId);
      const celdas = cellsByPlayOrder(pieza!);
      for (let j = 0; j < celdas.length; j++) {
        expect(marcas[step.offset + j], `step ${step.pieceId} note ${j}`)
          .toEqual({ cell: celdas[j], kind: MARCA.nota });
      }
    }

    expect(s.clicks.length).toBeGreaterThan(0);
    expect(s.clicks.every((c) => c.note === undefined)).toBe(true);
    for (const c of s.clicks) expect(marcas[c.offset]).toEqual({ cell: c.cell, kind: MARCA.click });

    expect(marcas).toHaveLength(s.length);
    expect(marcas.filter((m) => m === null)).toEqual([]);
  });

  it('with one piece alone there are no clicks to draw', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    expect(marcas.filter((m) => m?.kind === MARCA.click)).toEqual([]);
    expect(marcas.filter((m) => m?.kind === MARCA.nota)).toHaveLength(5);
  });

  it('an empty board leaves no marks', () => {
    encolarTablero([]);
    cerrarCiclo();
    expect(rs.rutaActiva()).toEqual([]);
    expect(rs.velo()).toEqual([]);
  });

  it('a click on an occupied cell sounds its note and is marked MARCA.cruce', () => {
    encolarTablero(CON_CRUCE);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    const s = buildSequence(CON_CRUCE, REGIMEN.escala, GRID_DEFAULT);

    const conNota = s.clicks.filter((c) => c.note !== undefined);
    const sinNota = s.clicks.filter((c) => c.note === undefined);
    expect(conNota).toHaveLength(3);
    expect(sinNota.length).toBeGreaterThan(0);

    for (const c of conNota) expect(marcas[c.offset]).toEqual({ cell: c.cell, kind: MARCA.cruce });
    for (const c of sinNota) expect(marcas[c.offset]).toEqual({ cell: c.cell, kind: MARCA.click });
  });
});

describe('the veil of what has not sounded yet', () => {
  it('AC-PLY-034 — the queued piece has no offset, and after the swap each cell has the interval where it first sounds', () => {
    encolarTablero(UNA);
    expect(rs.velo().map((e) => e.offset)).toEqual([null, null, null, null, null]);
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(UNA[0].cells));

    cerrarCiclo();
    rs.rutaActiva();

    const s = buildSequence(UNA, REGIMEN.escala, GRID_DEFAULT);
    const paso = s.steps[0];
    const celdas = cellsByPlayOrder(UNA[0]);
    expect(rs.velo()).toEqual(celdas.map((cell, j) => ({ id: 'F', cell, offset: paso.offset + j })));
  });

  it('AC-PLY-034 — the piece that already sounded does not return to the veil when another enters', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    rs.rutaActiva();

    encolarTablero(DOS);
    cerrarCiclo();
    rs.rutaActiva();

    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['L']));
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(DOS[1].cells));
  });

  it('the IDENTITY of the array is the change signal, and it changes only on a queue and at the swap', () => {
    encolarTablero(UNA);
    const alEncolar = rs.velo();
    expect(rs.velo()).toBe(alEncolar);
    rs.rutaActiva();
    expect(rs.velo()).toBe(alEncolar);

    cerrarCiclo();
    rs.rutaActiva();
    expect(rs.velo()).not.toBe(alEncolar);
  });
});

describe('the playhead walks the muted piece, with the border of the click', () => {
  const MUTEADA = [colocar('F', 0, false, 2, 2, true), colocar('L', 0, true, 7, 1)];

  it('AC-PLY-033 — its five cells keep their marks, but with MARCA.click and not MARCA.nota', () => {
    encolarTablero(MUTEADA);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    const celdas = cellsByPlayOrder(MUTEADA[0]);
    const s = buildSequence(MUTEADA, REGIMEN.escala, GRID_DEFAULT);

    expect(s.steps.map((st) => st.pieceId)).toEqual(['L']);
    for (let j = 0; j < celdas.length; j++) {
      expect(marcas[j], `cell ${j}`).toEqual({ cell: celdas[j], kind: MARCA.click });
    }
    expect(marcas).toHaveLength(s.length);
    expect(marcas.filter((m) => m === null)).toEqual([]);
  });

  it('AC-PLY-035 — the muted piece has no veil, and the other piece has one', () => {
    encolarTablero(MUTEADA);
    cerrarCiclo();
    rs.rutaActiva();
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['L']));
  });
});

describe('the reset is an order, not a consequence', () => {
  it('AC-PLY-036 — after the reset the veil is empty, also with the clock stopped', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    rs.rutaActiva();
    expect(rs.velo()).toHaveLength(CELLS_PER_PIECE);

    rs.reiniciar();
    encolarTablero([]);

    expect(rs.rutaActiva()).toEqual([]);
    expect(rs.velo()).toEqual([]);
  });

  it('the reset does not bring the swap forward: the generation is synchronized, it does not return to zero', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    rs.rutaActiva();

    rs.reiniciar();
    encolarTablero(UNA);
    expect(rs.rutaActiva()).toEqual([]);

    cerrarCiclo();
    expect(rs.rutaActiva()).not.toEqual([]);
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['F']));
  });

  it('AC-PLY-037 — removing the last piece does NOT reset anything: the sounding cycle ends', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    const sonando = rs.rutaActiva();
    expect(sonando).toHaveLength(buildSequence(UNA, REGIMEN.escala, GRID_DEFAULT).length);

    encolarTablero([]);
    expect(rs.rutaActiva()).toBe(sonando);
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(UNA[0].cells));

    cerrarCiclo();
    expect(rs.rutaActiva()).toEqual([]);
    expect(rs.velo()).toEqual([]);
  });
});

describe('a step whose piece is not on the board', () => {
  it('stays dark and draws no invented cell, and does not affect the other pieces', () => {
    const seq = buildSequence(DOS, REGIMEN.escala, GRID_DEFAULT);
    const pasoF = seq.steps.find((st) => st.pieceId === 'F')!;
    const pasoL = seq.steps.find((st) => st.pieceId === 'L')!;
    rs.encolar(seq, [DOS[0]]);

    expect(rs.velo().some((e) => e.id === 'L')).toBe(false);
    expect(rs.velo().some((e) => e.id === 'F')).toBe(true);

    cerrarCiclo();
    const marcas = rs.rutaActiva();

    for (let j = 0; j < CELLS_PER_PIECE; j++) {
      expect(marcas[pasoL.offset + j], `offset ${pasoL.offset + j}`).toBeNull();
    }
    for (let j = 0; j < CELLS_PER_PIECE; j++) {
      expect(marcas[pasoF.offset + j]?.kind, `offset ${pasoF.offset + j}`).toBe(MARCA.nota);
    }

    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['F']));
  });
});
