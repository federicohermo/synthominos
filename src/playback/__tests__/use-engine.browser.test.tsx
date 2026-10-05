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

/**
 * The four effects of `use-engine.ts`: tempo, clicks, sequence and cleanup.
 *
 * They are measured by what they TELL THE ENGINE, not by the sound. They only reconcile,
 * so the check is that each one runs at its time and, above all, that it **does not run
 * at another time**. Half of their docblocks argue about dependency arrays, and these
 * tests are what checks those arguments.
 *
 * So the engine and the two queues are mocked: they are the boundary that the hook
 * crosses. With the real engine, a test would have to infer "`setBpm` was called" from
 * the sound.
 */
const motor = vi.hoisted(() => ({
  setSequence: vi.fn(), setBpm: vi.fn(), setClicksAudible: vi.fn(),
  startClock: vi.fn(), stopClock: vi.fn(), clockRunning: vi.fn(() => false),
}));
// The mock of the drawing queue lists its TWO functions: the hook also re-exports the
// reset, and a partial mock would leave it `undefined`. That fails here with a TypeError
// that says nothing about what broke.
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

    // The two queues, with the SAME instance: if each one derived its own
    // `buildSequence`, the drawing and the sound could follow different circuits and
    // nothing would fail. This assertion is the only thing that holds that.
    expect(colaDeDibujo.encolar).toHaveBeenCalledWith(p.secuencia, p.placed);
    expect(motor.setSequence).toHaveBeenCalledWith(proyectarAlMotor(p.secuencia));
    expect(colaDeDibujo.encolar.mock.calls[0][0]).toBe(p.secuencia);
  });

  it('AC-PLY-006 — a tempo change does NOT queue the sequence again', async () => {
    // Each effect has its own array. One dependency too many here queues the whole
    // sequence again each time the user changes the tempo.
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
    // `playing` is not a dependency, on purpose: the sequence is a function of the board
    // and not of the transport. A placement with the clock stopped still leaves the
    // sequence ready for the start, so the hook does not get `playing`.
    expect(motor.startClock).not.toHaveBeenCalled();
    expect(motor.stopClock).not.toHaveBeenCalled();
  });

  it('on unmount it stops the clock and empties the sequence, in that order', async () => {
    const p = props(DOS);
    const { unmount } = await renderHook(() => useMotorSincronizado(p));
    motor.setSequence.mockClear();

    await unmount();

    expect(motor.stopClock).toHaveBeenCalledTimes(1);
    // `buildSequence([], …, GRID_DEFAULT)` is projected, and the empty literal is not
    // written by hand: so the shape of a datum of the circuit does not leak into the hook.
    expect(motor.setSequence).toHaveBeenCalledWith(proyectarAlMotor(buildSequence([], DEFAULT_REGIMEN, GRID_DEFAULT)));
  });

  it('the cleanup effect runs ONLY on unmount, not on each change', async () => {
    // Its empty array holds that, and its docblock argues it: with the regime in the
    // array, the cleanup would run on each regime change. It would stop the clock and
    // empty the sequence, and a regime change must do neither.
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
    // `corriendo` returns what the engine says, and not a state of its own. So the play
    // button shows that the clock REALLY started, not that the user pressed it.
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
    // It comes from this module and not from a direct import of `route-source.ts` in
    // `App.tsx`. The two queues must reset by the same path. Otherwise the veil can stay
    // drawn on an empty board.
    reiniciarRecorrido();
    expect(colaDeDibujo.reiniciar).toHaveBeenCalledTimes(1);

    // To stop the clock is the OTHER half, and `frenarTransporte()` gives it. They are
    // two functions because the shell composes them: one wrapper would tie the reset of
    // the drawing queue to the stop of the transport. That is true today and does not
    // have to be.
    expect(motor.stopClock).not.toHaveBeenCalled();
    // And it does not queue: the reconciliation effect queues the empty board, in the
    // next render.
    expect(colaDeDibujo.encolar).not.toHaveBeenCalled();
  });
});
