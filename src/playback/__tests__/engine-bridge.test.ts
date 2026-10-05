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
 * `engine-bridge.ts` es el único puente entre el `Sequence` del dominio y el del motor.
 *
 * Hasta ese cruce llego a estar escrito dos veces adentro de `App.tsx` —o sea en un
 * `.tsx`, donde no se puede exportar y por lo tanto no se puede testear—. Los tres
 * casos de la proyección son los que ningún test cubría, y el tercero es el que el tipo
 * existe para distinguir.
 *
 * Ningún caso necesita DOM ni mocks: la proyección es una pura y el transporte recibe su
 * motor por parámetro. Por eso este archivo corre en `environment: 'node'` como los
 * otros cinco tests de esta capa.
 *
 * Las secuencias se arman con `buildSequence` sobre un tablero real —igual que
 * `route-source.test.ts`— y no con literales: así el test verifica la proyección de la
 * forma que el dominio produce de verdad, y no de la que el test imagina.
 */

/** La cadena de colocacion completa, igual a la de `App.tsx` y a `route-source.test.ts`. */
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
 * El mismo tablero con cruces que usa `route-source.test.ts`: el recorrido no puede
 * esquivar a la `X`.
 *
 * Tres de sus clicks salen CON `note`, mientras el
 * resto cae en celdas vacías y sale sin ella. Es el único tablero que ejercita los dos
 * estados del click en una sola secuencia.
 */
const CON_CRUCE = [colocar('X', 0, false, 1, 1), colocar('F', 0, false, 3, 2), colocar('N', 0, false, 2, 4)];

const SECUENCIA = buildSequence(CON_CRUCE, REGIMEN.escala, GRID_DEFAULT);

describe('proyectarAlMotor deja caer lo que el motor no puede ver', () => {
  it('un `Step` conserva `offset` y `notes`, y NO lleva `pieceId`', () => {
    const proyectada = proyectarAlMotor(SECUENCIA);

    // Guarda del propio test: si el tablero dejara de producir pasos, los `expect` de
    // abajo pasarian sobre un array vacio.
    expect(SECUENCIA.steps.length).toBeGreaterThan(0);
    expect(proyectada.steps).toHaveLength(SECUENCIA.steps.length);
    expect(proyectada.length).toBe(SECUENCIA.length);

    for (let i = 0; i < SECUENCIA.steps.length; i++) {
      const origen = SECUENCIA.steps[i];
      const destino = proyectada.steps[i];
      expect(destino.offset).toBe(origen.offset);
      expect(destino.notes).toEqual(origen.notes);
      // `pieceId` se cae porque el motor no tiene a quien devolverselo. La AUSENCIA de
      // la clave y no `=== undefined`: es la misma distincion que el click cuida.
      expect('pieceId' in destino).toBe(false);
      expect(Object.keys(destino).sort()).toEqual(['notes', 'offset']);
    }
  });

  it('un `Click` con `note` conserva las dos claves y NO lleva `cell`', () => {
    const proyectada = proyectarAlMotor(SECUENCIA);
    const conNota = SECUENCIA.clicks
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.note !== undefined);

    // Tres, igual que en `route-source.test.ts`: si `CROSS_COST` se mueve y el recorrido
    // deja de cruzar, este test falla en rojo en vez de quedarse sin nada que recorrer.
    expect(conNota).toHaveLength(3);

    for (const { c, i } of conNota) {
      const destino = proyectada.clicks[i];
      // Campo por campo y no con un literal igual al de la proyeccion: el oraculo de AC1
      // es `grep` de ese literal sobre `src/`, y tiene que devolver UNA
      // linea. Un test que lo reprodujera textualmente lo volveria inutil.
      expect(destino.offset).toBe(c.offset);
      expect(destino.note).toBe(c.note);
      expect(Object.keys(destino).sort()).toEqual(['note', 'offset']);
      // `cell` se cae porque el motor habla MIDI y no conoce `Cell`:
      // si la proyeccion la dejara pasar, el tipo del motor tendria que nombrar algo
      // que su capa no puede ver. Es la mitad de D7/D8 del 009 que no tenia test.
      expect('cell' in destino).toBe(false);
    }
  });

  it('un `Click` sin `note` sale SIN la clave, no con la clave en `undefined`', () => {
    const proyectada = proyectarAlMotor(SECUENCIA);
    const sinNota = SECUENCIA.clicks
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.note === undefined);

    expect(sinNota.length).toBeGreaterThan(0);

    for (const { c, i } of sinNota) {
      const destino = proyectada.clicks[i];
      // El caso que hoy nadie cubria, y el motivo por el que la proyeccion usa un
      // ternario en vez de `({ offset, note })`. Se verifica con `'note' in destino` y
      // NO con `destino.note === undefined`, que es justamente la comparacion que no
      // distingue los dos estados — la que hace `collectHits`, y la razon de que el bug
      // hoy sea invisible.
      expect('note' in destino).toBe(false);
      expect(destino).toEqual({ offset: c.offset });
      expect(Object.keys(destino)).toEqual(['offset']);
    }
  });
});

/**
 * Un motor falso: tres funciones y un registro de lo que se le pidió. `corriendo` se
 * pasa aparte porque es justamente el valor que puede DISCREPAR de lo pedido.
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

describe('alternarTransporte devuelve lo que el motor dice, no lo que se le pidió', () => {
  it('AC-PLY-002 — en pausa pide arrancar, y si arrancó devuelve `true`', () => {
    const { motor, pedidos } = motorFalso(true);
    expect(alternarTransporte(false, motor)).toBe(true);
    expect(pedidos).toEqual(['arrancar']);
  });

  it('AC-PLY-002 — corriendo pide frenar, y si frenó devuelve `false`', () => {
    const { motor, pedidos } = motorFalso(false);
    expect(alternarTransporte(true, motor)).toBe(false);
    expect(pedidos).toEqual(['frenar']);
  });

  it('AC-PLY-003 — se pidió arrancar y el reloj NO arrancó: devuelve `false`', () => {
    // La rama que el ítem de deuda más viejo del repo esperaba, y la
    // que pedía «extraer el handler de `App.tsx` o agregar testing-library». Acá se
    // cierra por la primera vía: `arrancar` es un no-op silencioso cuando el motor no
    // tiene `AudioContext`, y sin este `return` el botón diría "Pausa" con el reloj
    // parado. Un `return !playing` pasaría los dos tests de arriba y fallaría éste.
    const { motor, pedidos } = motorFalso(false);
    expect(alternarTransporte(false, motor)).toBe(false);
    expect(pedidos).toEqual(['arrancar']);
  });
});
