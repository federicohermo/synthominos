import { describe, it, expect } from 'vitest';
import { proyectarAlMotor, alternarTransporte } from '../engine-bridge.ts';
import { buildSequence } from '../../circuit/sequence.ts';
import { cellsAt, GRID_DEFAULT } from '../../board-editing/placement.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.ts';
import { REGIMEN } from '../../musical-model/music.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../../board-editing/placement.ts';
import type { MotorDeTransporte } from '../engine-bridge.ts';

/**
 * `engine-bridge.ts` is the only bridge between the `Sequence` of the circuit and the
 * `Sequence` of the engine.
 *
 * The bridge lives in a `.ts` because a `.tsx` exports only its component, so a
 * projection inside one cannot be tested. The three cases of the projection are here, and
 * the third is the case that the type exists to tell apart.
 *
 * No case needs the DOM or a mock: the projection is a pure function, and the transport
 * gets its engine by parameter. So this file runs in `environment: 'node'`, like the
 * other `node` tests of this folder.
 *
 * The sequences come from `buildSequence` on a real board, as in `route-source.test.ts`,
 * and not from literals. So the test checks the projection of the shape that the circuit
 * really gives, not of the shape that the test imagines.
 */

/** The full placement chain, the same as in `App.tsx` and in `route-source.test.ts`. */
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

/**
 * The same board with crossings that `route-source.test.ts` uses: the circuit crosses the
 * `X` because the way around it costs more.
 *
 * Three of its clicks come WITH `note`. The others fall on empty cells and come without
 * it. It is the only board that exercises the two states of the click in one sequence.
 */
const CON_CRUCE = [colocar('X', 0, false, 1, 1), colocar('F', 0, false, 3, 2), colocar('N', 0, false, 2, 4)];

const SECUENCIA = buildSequence(CON_CRUCE, REGIMEN.escala, GRID_DEFAULT);

describe('proyectarAlMotor drops what the engine cannot see', () => {
  it('a `Step` keeps `offset` and `notes`, and does NOT carry `pieceId`', () => {
    const proyectada = proyectarAlMotor(SECUENCIA);

    // A guard of the test itself: if the board gave no steps, the `expect` calls below
    // would pass on an empty array.
    expect(SECUENCIA.steps.length).toBeGreaterThan(0);
    expect(proyectada.steps).toHaveLength(SECUENCIA.steps.length);
    expect(proyectada.length).toBe(SECUENCIA.length);

    for (let i = 0; i < SECUENCIA.steps.length; i++) {
      const origen = SECUENCIA.steps[i];
      const destino = proyectada.steps[i];
      expect(destino.offset).toBe(origen.offset);
      expect(destino.notes).toEqual(origen.notes);
      // `pieceId` is dropped because the engine has nobody to give it back to. The check
      // is the ABSENCE of the key and not `=== undefined`: the click needs the same
      // distinction.
      expect('pieceId' in destino).toBe(false);
      expect(Object.keys(destino).sort()).toEqual(['notes', 'offset']);
    }
  });

  it('a `Click` with `note` keeps the two keys and does NOT carry `cell`', () => {
    const proyectada = proyectarAlMotor(SECUENCIA);
    const conNota = SECUENCIA.clicks
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.note !== undefined);

    // Three, as in `route-source.test.ts`: if `CROSS_COST` changes and the circuit stops
    // crossing, this test fails. Otherwise it would have nothing to iterate and would pass.
    expect(conNota).toHaveLength(3);

    for (const { c, i } of conNota) {
      const destino = proyectada.clicks[i];
      // Field by field, and not with a literal equal to the one of the projection. The
      // projection is written once in `src/`, and a `grep` for that literal must return
      // ONE line. A test that copied it would break that check.
      expect(destino.offset).toBe(c.offset);
      expect(destino.note).toBe(c.note);
      expect(Object.keys(destino).sort()).toEqual(['note', 'offset']);
      // `cell` is dropped because the engine speaks MIDI and does not know `Cell`. If the
      // projection let it through, the type of the engine would have to name `Cell`.
      expect('cell' in destino).toBe(false);
    }
  });

  it('a `Click` without `note` comes out WITHOUT the key, not with the key set to `undefined`', () => {
    const proyectada = proyectarAlMotor(SECUENCIA);
    const sinNota = SECUENCIA.clicks
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.note === undefined);

    expect(sinNota.length).toBeGreaterThan(0);

    for (const { c, i } of sinNota) {
      const destino = proyectada.clicks[i];
      // This case is the reason the projection uses a ternary and not
      // `({ offset, note })`. The check is `'note' in destino` and NOT
      // `destino.note === undefined`: that comparison does not tell the two states apart.
      // `collectHits` makes that comparison, so the engine would not show the bug.
      expect('note' in destino).toBe(false);
      expect(destino).toEqual({ offset: c.offset });
      expect(Object.keys(destino)).toEqual(['offset']);
    }
  });
});

/**
 * A fake engine: three functions and a record of what the caller asked. `corriendo` is
 * given apart because it is the value that can DISAGREE with the request.
 */
const motorFalso = (corriendo: boolean) => {
  const pedidos: string[] = [];
  const motor: MotorDeTransporte = {
    arrancar: () => { pedidos.push('arrancar'); },
    frenar: () => { pedidos.push('frenar'); },
    corriendo: () => corriendo,
  };
  return { motor, pedidos };
};

describe('alternarTransporte returns what the engine says, not what was asked', () => {
  it('AC-PLY-002 — while paused it asks for a start, and returns `true` if the engine started', () => {
    const { motor, pedidos } = motorFalso(true);
    expect(alternarTransporte(false, motor)).toBe(true);
    expect(pedidos).toEqual(['arrancar']);
  });

  it('AC-PLY-002 — while playing it asks for a stop, and returns `false` if the engine stopped', () => {
    const { motor, pedidos } = motorFalso(false);
    expect(alternarTransporte(true, motor)).toBe(false);
    expect(pedidos).toEqual(['frenar']);
  });

  it('AC-PLY-003 — a start was asked and the clock did NOT start: it returns `false`', () => {
    // `arrancar` is a silent no-op when the engine has no `AudioContext`. Without the
    // `return motor.corriendo()`, the play button would offer pause with the clock
    // stopped. A `return !playing` passes the two tests above and fails this one.
    const { motor, pedidos } = motorFalso(false);
    expect(alternarTransporte(false, motor)).toBe(false);
    expect(pedidos).toEqual(['arrancar']);
  });
});
