import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSequence, cellsByPlayOrder } from '../../circuit/sequence.ts';
import { cellsAt, GRID_DEFAULT } from '../../board-editing/placement.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from '../../pieces/pieces.ts';
import { REGIMEN } from '../../musical-model/music.ts';
import { MARCA } from '../route-source.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../../board-editing/placement.ts';

/**
 * `route-source.ts` holds BR-PLY-018: the playhead draws the sequence that SOUNDS, not
 * the queued one.
 *
 * It is a state machine with a sounding sequence and a queued one, a counter that belongs
 * to the engine, and a veil that is computed again at two moments: when a sequence is
 * queued and at the swap. `pnpm verify` sees none of that without these tests: no type
 * ties the module, and its only consumer is a `requestAnimationFrame` loop, which the
 * `node` tests do not run.
 *
 * The engine is mocked because this module uses one part of it: `cycleGeneration()`, a
 * number. An import of the real `engine.ts` would bring the singleton of the AudioContext
 * to read a counter.
 *
 * The state belongs to the MODULE, so each test imports it again with
 * `vi.resetModules()`: otherwise the order of the tests would be part of the oracle.
 */
const motor = vi.hoisted(() => ({ generacion: 0 }));
vi.mock('../engine.ts', () => ({ cycleGeneration: () => motor.generacion }));

type RouteSource = typeof import('../route-source.ts');
let rs: RouteSource;

beforeEach(async () => {
  motor.generacion = 0;
  vi.resetModules();
  rs = await import('../route-source.ts');
});

/** The full placement chain, the same as in `App.tsx` and in `sequence.test.ts`. */
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

/** Queues the board by the same path as `playback/use-engine.ts`: one `buildSequence`, two queues. */
const encolarTablero = (placed: readonly PlacedPiece[]): void => rs.encolar(buildSequence(placed, REGIMEN.escala, GRID_DEFAULT), placed);

/** What the engine does when a new sounding sequence starts: it raises the counter. */
const cerrarCiclo = (): void => { motor.generacion++; };

const clave = (c: readonly number[]): string => `${c[0]},${c[1]}`;
const claves = (cs: readonly (readonly number[])[]): Set<string> => new Set(cs.map(clave));

const UNA = [colocar('F', 0, false, 2, 2)];
const DOS = [colocar('F', 0, false, 2, 2), colocar('L', 0, true, 7, 1)];

/**
 * A board whose circuit enters OCCUPIED cells outside the turn of their piece: [2,1],
 * [1,2] and [1,1] of the `X`, where [1,1] is its center.
 *
 * Those crossings sound the note of the cell (`Click.note`: 69 = A4, 71 = B4 and
 * 76 = E5). Checked with a run of `buildSequence` on this board: they are three of its
 * four clicks, and the fourth falls on an empty cell.
 *
 * ## Why this board
 *
 * The arpeggio walks the piece, so the circuit enters the `X` by one arm and leaves by
 * the opposite arm: a board with an `X` is not sure to cross its center. The board
 * `X`(4,2) + `F`(3,4) + `I`(5,0) has ZERO crossings, and a test on it would pass on
 * nothing. The guard of this test exists against exactly that.
 *
 * This board depends on `CROSS_COST`: the way around the `X` is possible and costs more.
 * If someone changes the constant, the guard below ("exactly three clicks carry `note`")
 * fails. Otherwise the test would have nothing to iterate and would pass.
 */
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

    // A different board is queued (another piece, another circuit, another length), and
    // up to the boundary the playhead must still follow the old one.
    encolarTablero(DOS);
    expect(rs.rutaActiva()).toEqual(vieja);

    cerrarCiclo();
    const nueva = rs.rutaActiva();
    expect(nueva).not.toEqual(vieja);
    expect(nueva).toHaveLength(buildSequence(DOS, REGIMEN.escala, GRID_DEFAULT).length);
  });

  it('a removed piece does not go dark before it stops sounding', () => {
    // The join with `placed` is FROZEN together with the route: if the loop read the live
    // board, the removed piece would go dark in the middle of the cycle.
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
    // If a swap of the engine with no counterpart here left the counter behind, the next
    // queued sequence would take effect in the next frame and would not wait for its
    // boundary. BR-PLY-018 forbids exactly that.
    cerrarCiclo();
    expect(rs.rutaActiva()).toEqual([]);

    encolarTablero(UNA);
    expect(rs.rutaActiva()).toEqual([]);   // not yet: ITS boundary has not come

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

    // The notes: the cell of `notes[j]` comes from the pure function of the circuit, not
    // from this module.
    for (const step of s.steps) {
      const pieza = DOS.find((p) => p.id === step.pieceId);
      const celdas = cellsByPlayOrder(pieza!);
      for (let j = 0; j < celdas.length; j++) {
        expect(marcas[step.offset + j], `step ${step.pieceId} note ${j}`)
          .toEqual({ cell: celdas[j], kind: MARCA.nota });
      }
    }

    // The clicks: the sequence itself carries the cell, because the UI computes no paths.
    // No click of `DOS` enters an occupied cell, so the 8 are clicks with no note
    // (MARCA.click).
    expect(s.clicks.length).toBeGreaterThan(0);
    expect(s.clicks.every((c) => c.note === undefined)).toBe(true);
    for (const c of s.clicks) expect(marcas[c.offset]).toEqual({ cell: c.cell, kind: MARCA.click });

    // And there are no holes and no extras: the cycle of the sequence is covered whole.
    expect(marcas).toHaveLength(s.length);
    expect(marcas.filter((m) => m === null)).toEqual([]);
  });

  it('with one piece alone there are no clicks to draw', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    // The cycle is 5 intervals and the arpeggio takes 5: the cycle starts again with no
    // click between its end and its start.
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

    // A guard of the test itself: exactly THREE of the clicks carry `note` (two arms of
    // the `X` and its center) and the others do not. If that stopped being true, the two
    // `for` loops below could have nothing to iterate and the test would pass on nothing.
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
    // Queued, with no cycle that holds it: there is no instant to wait for, only the swap.
    expect(rs.velo().map((e) => e.offset)).toEqual([null, null, null, null, null]);
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(UNA[0].cells));

    cerrarCiclo();
    rs.rutaActiva();

    // It has entered the cycle: each cell now knows WHEN its turn comes. That makes
    // visible that the play order is not the placement order.
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

    // Only the `L` is new: the `F` already sounded, and to cover it again would read as
    // if the whole board started again at each swap.
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['L']));
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(DOS[1].cells));
  });

  it('the IDENTITY of the array is the change signal, and it changes only on a queue and at the swap', () => {
    // The draw loop compares by reference 60 times each second: if each read created the
    // array again, the loop would rebuild the nodes of the veil in each frame.
    encolarTablero(UNA);
    const alEncolar = rs.velo();
    expect(rs.velo()).toBe(alEncolar);
    rs.rutaActiva();                      // with no change of generation nothing happens
    expect(rs.velo()).toBe(alEncolar);

    cerrarCiclo();
    rs.rutaActiva();
    expect(rs.velo()).not.toBe(alEncolar);
  });
});

describe('the playhead walks the muted piece, with the border of the click', () => {
  const MUTEADA = [colocar('F', 0, false, 2, 2, true), colocar('L', 0, true, 7, 1)];

  it('AC-PLY-033 — its five cells keep their marks, but with MARCA.click and not MARCA.nota', () => {
    // It still takes that time: the playhead cannot skip it, or the cycle would read
    // shorter than it lasts. What changes is the border, and it changes because what
    // sounds there IS a click. That is not a side effect of the marks that come from
    // `s.clicks`: it is the reason that source is correct.
    encolarTablero(MUTEADA);
    cerrarCiclo();
    const marcas = rs.rutaActiva();
    const celdas = cellsByPlayOrder(MUTEADA[0]);
    const s = buildSequence(MUTEADA, REGIMEN.escala, GRID_DEFAULT);

    // No `Step` for the muted piece: its cells enter through the branch of the clicks.
    expect(s.steps.map((st) => st.pieceId)).toEqual(['L']);
    for (let j = 0; j < celdas.length; j++) {
      expect(marcas[j], `cell ${j}`).toEqual({ cell: celdas[j], kind: MARCA.click });
    }
    // And the cycle is still covered whole.
    expect(marcas).toHaveLength(s.length);
    expect(marcas.filter((m) => m === null)).toEqual([]);
  });

  it('AC-PLY-035 — the muted piece has no veil, and the other piece has one', () => {
    // The veil says "this has not sounded yet", and a muted piece will never sound. To
    // dim it until its "turn" would promise something that does not occur. Also, the
    // opacity is already taken to say that.
    encolarTablero(MUTEADA);
    cerrarCiclo();
    rs.rutaActiva();
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['L']));
  });
});

/**
 * The orphan veil, and the half of it that must NOT be fixed.
 *
 * This module moves forward only when `cycleGeneration()` goes up, and the clock moves
 * that counter. With the transport paused nothing moves forward, but `encolar` still
 * computes the veil from the frozen `activa` and `estrenando`: without the reset, the
 * five cells of a deleted piece would stay drawn on an empty board.
 *
 * The transport does not reach this module: it does not know whether the clock runs. So
 * the only difference between the tests below is whether there was an explicit ORDER to
 * return to zero. That it is the order, and not the state of the clock, is the decision:
 * the reset calls `reiniciar()` and nobody else does.
 */
describe('the reset is an order, not a consequence', () => {
  it('AC-PLY-036 — after the reset the veil is empty, also with the clock stopped', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    rs.rutaActiva();
    expect(rs.velo()).toHaveLength(CELLS_PER_PIECE);

    // The order is the one of the shell: `resetBoard` gives the order, and the
    // reconciliation effect queues the empty board in the next render. The reverse order
    // must give an empty veil too, but this is the order that occurs.
    rs.reiniciar();
    encolarTablero([]);

    expect(rs.rutaActiva()).toEqual([]);
    expect(rs.velo()).toEqual([]);
  });

  it('the reset does not bring the swap forward: the generation is synchronized, it does not return to zero', () => {
    // If `reiniciar()` set the generation to 0 with the engine at 1, the next frame would
    // see a difference that does not exist and would start the queued sequence OUTSIDE
    // the cycle boundary. `cycleGen` never resets, to prevent the same lie.
    encolarTablero(UNA);
    cerrarCiclo();
    rs.rutaActiva();

    rs.reiniciar();
    encolarTablero(UNA);
    expect(rs.rutaActiva()).toEqual([]);   // not yet: ITS boundary has not come

    cerrarCiclo();
    expect(rs.rutaActiva()).not.toEqual([]);
    // And the whole piece is veiled: after the reset nothing "already sounded".
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['F']));
  });

  it('AC-PLY-037 — removing the last piece does NOT reset anything: the sounding cycle ends', () => {
    encolarTablero(UNA);
    cerrarCiclo();
    const sonando = rs.rutaActiva();
    expect(sonando).toHaveLength(buildSequence(UNA, REGIMEN.escala, GRID_DEFAULT).length);

    // To remove a piece is an EDIT of the board: there is no order to return to zero. So
    // up to the boundary the playhead still follows what sounds, and the veil still says
    // that those cells have not had their turn. To clear here would turn off a piece that
    // still sounds.
    encolarTablero([]);
    expect(rs.rutaActiva()).toBe(sonando);
    expect(claves(rs.velo().map((e) => e.cell))).toEqual(claves(UNA[0].cells));

    // Only the cycle boundary turns it off, and then the veil empties by itself.
    cerrarCiclo();
    expect(rs.rutaActiva()).toEqual([]);
    expect(rs.velo()).toEqual([]);
  });
});

/**
 * The only path by which `construir` can get a step with no piece, and the only one by
 * which `porPieza` can lack an entry that `ids` has.
 *
 * The comment in the source says that this cannot occur, and with the shell of today
 * that is true: the `useMemo` derives the sequence from `placed`, and the hook gives the
 * two together in the same effect. But the guard has a CHOSEN behavior: silence is better
 * than a lie, because a wrong cell reads as a wrong model. So this test checks the
 * choice: it calls `encolar` with the two out of step, which is what a refactor of the
 * shell could cause with no warning.
 *
 * The three paths it opens are the same mismatch seen from three places: the `continue`
 * of `construir`, and the two `?? []` of `recomputarVelo`. One is on the queued side and
 * the other on the sounding side, because the veil is computed at the two moments.
 */
describe('a step whose piece is not on the board', () => {
  it('stays dark and draws no invented cell, and does not affect the other pieces', () => {
    // The sequence knows the two pieces. The board that is given knows only one.
    const seq = buildSequence(DOS, REGIMEN.escala, GRID_DEFAULT);
    const pasoF = seq.steps.find((st) => st.pieceId === 'F')!;
    const pasoL = seq.steps.find((st) => st.pieceId === 'L')!;
    rs.encolar(seq, [DOS[0]]);

    // Moment 1, on the queue: the veil of the QUEUED sequence invents no cells for the
    // missing piece.
    expect(rs.velo().some((e) => e.id === 'L')).toBe(false);
    expect(rs.velo().some((e) => e.id === 'F')).toBe(true);

    cerrarCiclo();
    const marcas = rs.rutaActiva();

    // The five offsets of the missing piece stay null: the playhead crosses them in the
    // dark. This is the silence that the docblock describes, and it can be observed.
    for (let j = 0; j < CELLS_PER_PIECE; j++) {
      expect(marcas[pasoL.offset + j], `offset ${pasoL.offset + j}`).toBeNull();
    }
    // And the piece that is on the board is drawn whole: the mismatch does not spread
    // to it.
    for (let j = 0; j < CELLS_PER_PIECE; j++) {
      expect(marcas[pasoF.offset + j]?.kind, `offset ${pasoF.offset + j}`).toBe(MARCA.nota);
    }

    // Moment 2, after the swap: the missing piece enters `estrenando` because `ids` lists
    // it, and still it gives no cell to the veil.
    expect(new Set(rs.velo().map((e) => e.id))).toEqual(new Set(['F']));
  });
});
