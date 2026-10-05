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

/** The circuit crosses the `X` on this board: three of its clicks carry `note`. */
const CON_CRUCE = [colocar('X', 0, false, 1, 1), colocar('F', 0, false, 3, 2), colocar('N', 0, false, 2, 4)];

const SECUENCIA = buildSequence(CON_CRUCE, REGIMEN.escala, GRID_DEFAULT);

describe('proyectarAlMotor drops what the engine cannot see', () => {
  it('a `Step` keeps `offset` and `notes`, and does NOT carry `pieceId`', () => {
    const proyectada = proyectarAlMotor(SECUENCIA);

    expect(SECUENCIA.steps.length).toBeGreaterThan(0);
    expect(proyectada.steps).toHaveLength(SECUENCIA.steps.length);
    expect(proyectada.length).toBe(SECUENCIA.length);

    for (let i = 0; i < SECUENCIA.steps.length; i++) {
      const origen = SECUENCIA.steps[i];
      const destino = proyectada.steps[i];
      expect(destino.offset).toBe(origen.offset);
      expect(destino.notes).toEqual(origen.notes);
      expect('pieceId' in destino).toBe(false);
      expect(Object.keys(destino).sort()).toEqual(['notes', 'offset']);
    }
  });

  it('a `Click` with `note` keeps the two keys and does NOT carry `cell`', () => {
    const proyectada = proyectarAlMotor(SECUENCIA);
    const conNota = SECUENCIA.clicks
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.note !== undefined);

    expect(conNota).toHaveLength(3);

    for (const { c, i } of conNota) {
      const destino = proyectada.clicks[i];
      expect(destino.offset).toBe(c.offset);
      expect(destino.note).toBe(c.note);
      expect(Object.keys(destino).sort()).toEqual(['note', 'offset']);
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
      expect('note' in destino).toBe(false);
      expect(destino).toEqual({ offset: c.offset });
      expect(Object.keys(destino)).toEqual(['offset']);
    }
  });
});

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
    const { motor, pedidos } = motorFalso(false);
    expect(alternarTransporte(false, motor)).toBe(false);
    expect(pedidos).toEqual(['arrancar']);
  });
});
