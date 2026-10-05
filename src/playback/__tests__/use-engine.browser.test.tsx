import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { buildSequence } from '../../circuit/sequence.ts';
import { cellsAt, GRID_DEFAULT } from '../../board-editing/placement.ts';
import { rotateN } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.ts';
import { REGIMEN, DEFAULT_REGIMEN } from '../../musical-model/music.ts';
import { proyectarAlMotor } from '../engine-bridge.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../../board-editing/placement.ts';

const motor = vi.hoisted(() => ({
  setSequence: vi.fn(), setBpm: vi.fn(), setClicksAudible: vi.fn(),
  startClock: vi.fn(), stopClock: vi.fn(), clockRunning: vi.fn(() => false),
}));
// The hook re-exports `reiniciar` too: a partial mock leaves it `undefined`.
const colaDeDibujo = vi.hoisted(() => ({ encolar: vi.fn(), reiniciar: vi.fn() }));

vi.mock('../engine.ts', () => motor);
vi.mock('../route-source.ts', () => colaDeDibujo);

const { useMotorSincronizado, MOTOR, frenarTransporte, reiniciarRecorrido } = await import('../use-engine.ts');

const colocar = (piece: PieceKey, x: number, y: number): PlacedPiece => ({
  id: piece,
  piece,
  rotation: 0,
  mirror: false,
  cells: cellsAt(rotateN(SHAPES[piece], 0), ANCHOR_INDEX[piece], x, y),
  muted: false,
});

const UNA = [colocar('F', 2, 2)];
const DOS = [colocar('F', 2, 2), colocar('L', 7, 1)];

const props = (placed: readonly PlacedPiece[], tempo = 110, clicks = false) => ({
  secuencia: buildSequence(placed, REGIMEN.escala, GRID_DEFAULT),
  placed,
  tempo,
  clicks,
});

beforeEach(() => {
  for (const fn of Object.values(motor)) fn.mockClear();
  for (const fn of Object.values(colaDeDibujo)) fn.mockClear();
});

describe('useMotorSincronizado — the four effects', () => {
  it('on mount it sends the tempo and the clicks, and queues in the TWO queues', async () => {
    const p = props(UNA, 96, true);
    await renderHook(() => useMotorSincronizado(p));

    expect(motor.setBpm).toHaveBeenCalledWith(96);
    expect(motor.setClicksAudible).toHaveBeenCalledWith(true);

    // The same instance: two derivations could draw one circuit and play another.
    expect(colaDeDibujo.encolar).toHaveBeenCalledWith(p.secuencia, p.placed);
    expect(motor.setSequence).toHaveBeenCalledWith(proyectarAlMotor(p.secuencia));
    expect(colaDeDibujo.encolar.mock.calls[0][0]).toBe(p.secuencia);
  });

  it('AC-PLY-006 — a tempo change does NOT queue the sequence again', async () => {
    const p = props(UNA, 110);
    const { rerender } = await renderHook((q?: typeof p) => useMotorSincronizado(q ?? p), { initialProps: p });
    expect(colaDeDibujo.encolar).toHaveBeenCalledTimes(1);

    await rerender({ ...p, tempo: 132 });
    expect(motor.setBpm).toHaveBeenLastCalledWith(132);
    expect(colaDeDibujo.encolar).toHaveBeenCalledTimes(1);
    expect(motor.setSequence).toHaveBeenCalledTimes(1);
  });

  it('a change of the click switch does not queue it either, and does not touch the tempo', async () => {
    const p = props(UNA, 110, false);
    const { rerender } = await renderHook((q?: typeof p) => useMotorSincronizado(q ?? p), { initialProps: p });
    expect(motor.setBpm).toHaveBeenCalledTimes(1);

    await rerender({ ...p, clicks: true });
    expect(motor.setClicksAudible).toHaveBeenLastCalledWith(true);
    expect(motor.setBpm).toHaveBeenCalledTimes(1);
    expect(colaDeDibujo.encolar).toHaveBeenCalledTimes(1);
  });

  it('a board change queues again, and the transport is not part of it', async () => {
    const p = props(UNA);
    const { rerender } = await renderHook((q?: typeof p) => useMotorSincronizado(q ?? p), { initialProps: p });

    const q = props(DOS);
    await rerender(q);
    expect(colaDeDibujo.encolar).toHaveBeenCalledTimes(2);
    expect(colaDeDibujo.encolar).toHaveBeenLastCalledWith(q.secuencia, q.placed);
    expect(motor.startClock).not.toHaveBeenCalled();
    expect(motor.stopClock).not.toHaveBeenCalled();
  });

  it('on unmount it stops the clock and empties the sequence, in that order', async () => {
    const p = props(DOS);
    const { unmount } = await renderHook(() => useMotorSincronizado(p));
    motor.setSequence.mockClear();

    await unmount();

    expect(motor.stopClock).toHaveBeenCalledTimes(1);
    expect(motor.setSequence).toHaveBeenCalledWith(proyectarAlMotor(buildSequence([], DEFAULT_REGIMEN, GRID_DEFAULT)));
  });

  it('the cleanup effect runs ONLY on unmount, not on each change', async () => {
    const p = props(UNA);
    const { rerender } = await renderHook((q?: typeof p) => useMotorSincronizado(q ?? p), { initialProps: p });

    await rerender(props(DOS));
    await rerender(props(UNA, 132, true));
    expect(motor.stopClock).not.toHaveBeenCalled();
  });
});

describe('the wiring of the transport', () => {
  it('MOTOR exposes the three functions of the engine, with no wrapper', () => {
    MOTOR.arrancar();
    expect(motor.startClock).toHaveBeenCalledTimes(1);
    MOTOR.frenar();
    expect(motor.stopClock).toHaveBeenCalledTimes(1);
    expect(MOTOR.corriendo()).toBe(false);
    expect(motor.clockRunning).toHaveBeenCalled();
  });

  it('frenarTransporte is the explicit order of the reset, not a toggle', () => {
    frenarTransporte();
    expect(motor.stopClock).toHaveBeenCalledTimes(1);
    expect(motor.startClock).not.toHaveBeenCalled();
  });
});

describe('the reset speaks to the TWO queues from this module', () => {
  it('reiniciarRecorrido resets the drawing queue, and only that', () => {
    reiniciarRecorrido();
    expect(colaDeDibujo.reiniciar).toHaveBeenCalledTimes(1);

    expect(motor.stopClock).not.toHaveBeenCalled();
    expect(colaDeDibujo.encolar).not.toHaveBeenCalled();
  });
});
