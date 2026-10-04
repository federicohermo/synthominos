import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { buildSequence } from '../../circuit/sequence.ts';
import { cellsAt } from '../../board-editing/placement.ts';
import { rotateN } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.constants.ts';
import { REGIMEN, DEFAULT_REGIMEN } from '../../musical-model/music.constants.ts';
import { proyectarAlMotor } from '../engine-bridge.ts';
import type { PieceKey } from '../../pieces/pieces.types.ts';
import type { PlacedPiece } from '../../board-editing/board.types.ts';
import { GRID_DEFAULT } from '../../board-editing/board.constants.ts';

/**
 * Los cuatro efectos que salieron de `App.tsx`.
 *
 * Se los mide por lo que LE DICEN AL MOTOR, no por lo que suena: son reconciliacion
 * pura —tempo, clicks, secuencia y limpieza— y lo unico que hay para verificar es que
 * cada uno corra cuando le toca y, sobre todo, que **no corra cuando no le toca**. La
 * mitad de sus docblocks son argumentos sobre arrays de dependencias, y hasta ahora
 * ninguno lo miraba nadie.
 *
 * Por eso el motor y las dos colas van mockeados: son el borde que el hook cruza, y con
 * el motor real habria que inferir "se llamo a `setBpm`" desde el sonido, que es
 * exactamente el problema que se resolvio moviendo esto a una funcion.
 */
const motor = vi.hoisted(() => ({
  setSequence: vi.fn(), setBpm: vi.fn(), setClicksAudible: vi.fn(),
  startClock: vi.fn(), stopClock: vi.fn(), clockRunning: vi.fn(() => false),
}));
// El mock de la cola de dibujo lista sus DOS funciones: el hook
// tambien re-exporta el reinicio, y un mock parcial lo dejaria en `undefined` — que acá
// falla con un TypeError que no dice nada sobre lo que se rompio.
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

describe('useMotorSincronizado — los cuatro efectos', () => {
  it('al montar baja tempo y clicks, y encola en las DOS colas', async () => {
    const p = props(UNA, 96, true);
    await renderHook(() => useMotorSincronizado(p));

    expect(motor.setBpm).toHaveBeenCalledWith(96);
    expect(motor.setClicksAudible).toHaveBeenCalledWith(true);

    // Las dos colas, y con la MISMA instancia: si cada una derivara su propia
    // `buildSequence`, el dibujo y el sonido podrian quedar mirando circuitos distintos
    // sin que nada falle. Es D5 del 009 y es lo unico que lo sostiene.
    expect(colaDeDibujo.encolar).toHaveBeenCalledWith(p.secuencia, p.placed);
    expect(motor.setSequence).toHaveBeenCalledWith(proyectarAlMotor(p.secuencia));
    expect(colaDeDibujo.encolar.mock.calls[0][0]).toBe(p.secuencia);
  });

  it('AC-PLY-006 — cambiar el tempo NO vuelve a encolar la secuencia', async () => {
    // Cada efecto con su array, que es de lo que hablan la mitad de los docblocks del
    // archivo: una dependencia de mas aca significa reencolar el circuito entero cada
    // vez que alguien arrastra el slider de tempo.
    const p = props(UNA, 110);
    const { rerender } = await renderHook((q?: typeof p) => useMotorSincronizado(q ?? p), { initialProps: p });
    expect(colaDeDibujo.encolar).toHaveBeenCalledTimes(1);

    await rerender({ ...p, tempo: 132 });
    expect(motor.setBpm).toHaveBeenLastCalledWith(132);
    expect(colaDeDibujo.encolar).toHaveBeenCalledTimes(1);
    expect(motor.setSequence).toHaveBeenCalledTimes(1);
  });

  it('cambiar los clicks tampoco, y no toca el tempo', async () => {
    const p = props(UNA, 110, false);
    const { rerender } = await renderHook((q?: typeof p) => useMotorSincronizado(q ?? p), { initialProps: p });
    expect(motor.setBpm).toHaveBeenCalledTimes(1);

    await rerender({ ...p, clicks: true });
    expect(motor.setClicksAudible).toHaveBeenLastCalledWith(true);
    expect(motor.setBpm).toHaveBeenCalledTimes(1);
    expect(colaDeDibujo.encolar).toHaveBeenCalledTimes(1);
  });

  it('cambiar el tablero reencola, y el transporte no entra en la cuenta', async () => {
    const p = props(UNA);
    const { rerender } = await renderHook((q?: typeof p) => useMotorSincronizado(q ?? p), { initialProps: p });

    const q = props(DOS);
    await rerender(q);
    expect(colaDeDibujo.encolar).toHaveBeenCalledTimes(2);
    expect(colaDeDibujo.encolar).toHaveBeenLastCalledWith(q.secuencia, q.placed);
    // `playing` salio de las dependencias a proposito: la secuencia es funcion del
    // tablero y no del transporte. Colocar con el reloj parado igual deja la secuencia
    // lista para cuando arranque, y por eso el hook no recibe `playing` ni lo mira.
    expect(motor.startClock).not.toHaveBeenCalled();
    expect(motor.stopClock).not.toHaveBeenCalled();
  });

  it('al desmontar frena el reloj y vacia la secuencia, en ese orden', async () => {
    const p = props(DOS);
    const { unmount } = await renderHook(() => useMotorSincronizado(p));
    motor.setSequence.mockClear();

    await unmount();

    expect(motor.stopClock).toHaveBeenCalledTimes(1);
    // Se proyecta `buildSequence([], …, GRID_DEFAULT)` en vez de escribir el literal vacio a mano:
    // asi la forma de un dato de dominio no se filtra a la capa de la UI.
    expect(motor.setSequence).toHaveBeenCalledWith(proyectarAlMotor(buildSequence([], DEFAULT_REGIMEN, GRID_DEFAULT)));
  });

  it('el efecto de limpieza corre SOLO al desmontar, no en cada cambio', async () => {
    // Su array vacio es lo que lo sostiene, y el docblock lo argumenta: meter el
    // regimen ahi haria que la limpieza corriera en cada cambio de regimen, frenando el
    // reloj y vaciando la secuencia — que es justo lo que AC7 del 022 prohibe.
    const p = props(UNA);
    const { rerender } = await renderHook((q?: typeof p) => useMotorSincronizado(q ?? p), { initialProps: p });

    await rerender(props(DOS));
    await rerender(props(UNA, 132, true));
    expect(motor.stopClock).not.toHaveBeenCalled();
  });
});

describe('el cableado del transporte', () => {
  it('MOTOR expone las tres funciones del motor, sin envolverlas', () => {
    MOTOR.arrancar();
    expect(motor.startClock).toHaveBeenCalledTimes(1);
    MOTOR.frenar();
    expect(motor.stopClock).toHaveBeenCalledTimes(1);
    // `corriendo` devuelve lo que el motor dice, y no un estado propio: es lo que hace
    // que el boton refleje si el reloj arranco DE VERDAD y no si se lo apreto.
    expect(MOTOR.corriendo()).toBe(false);
    expect(motor.clockRunning).toHaveBeenCalled();
  });

  it('frenarTransporte es la orden explicita del Reset, no una alternancia', () => {
    frenarTransporte();
    expect(motor.stopClock).toHaveBeenCalledTimes(1);
    expect(motor.startClock).not.toHaveBeenCalled();
  });
});

describe('el Reset les habla a las DOS colas desde este modulo', () => {
  it('reiniciarRecorrido reinicia la cola de dibujo, y solo eso', () => {
    // Que salga de acá y no de un import directo de `route-source.ts` en `App.tsx` es el
    // hallazgo entero: las dos colas se reinician por el mismo camino, o vuelve la
    // asimetria que dejaba el velo dibujado sobre un tablero vacio.
    reiniciarRecorrido();
    expect(colaDeDibujo.reiniciar).toHaveBeenCalledTimes(1);

    // Frenar el reloj es la OTRA mitad y la da `frenarTransporte()`. Siguen siendo dos
    // funciones porque el shell las compone: envolverlas juntas ataria el reinicio de la
    // cola de dibujo a que el transporte se frene, que hoy es cierto y no tiene por qué.
    expect(motor.stopClock).not.toHaveBeenCalled();
    // Y no reencola: lo que reencola el tablero ya vacio es el efecto de reconciliacion,
    // en el render siguiente.
    expect(colaDeDibujo.encolar).not.toHaveBeenCalled();
  });
});
