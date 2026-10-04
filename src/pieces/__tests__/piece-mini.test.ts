import { describe, it, expect } from 'vitest';
import { miniCells } from '../piece-mini.ts';
import { rotateN, reflect, normalize } from '../transform.ts';
import { SHAPES, CELLS_PER_PIECE } from '../pieces.constants.ts';
import { MINI_BOX } from '../../board-fit/layout.constants.ts';
import type { PieceKey } from '../pieces.types.ts';

/**
 * `miniCells` es la única aritmética nueva, y es de la clase que **compila igual cuando
 * está mal**.
 *
 * Un `round` en lugar de un `floor`, o el ancho leído antes de
 * normalizar, dejan la pieza pegada a un borde en algunas orientaciones y en otras no.
 * Por eso el recorrido es el espacio entero —12 piezas × 4 rotaciones × 2 reflexiones—
 * y no una muestra: es el mismo espacio que `check_invariants` recorre para lo suyo.
 */
const PIEZAS = Object.keys(SHAPES) as PieceKey[];

/** Las 96 combinaciones, para que ningún test las vuelva a escribir. */
const COMBINACIONES: [PieceKey, number, boolean][] = PIEZAS.flatMap((p) =>
  [0, 1, 2, 3].flatMap((r): [PieceKey, number, boolean][] => [[p, r, false], [p, r, true]]),
);

const nombre = (p: PieceKey, r: number, m: boolean) => `${p} rot${r}${m ? ' reflejada' : ''}`;

describe('el espacio que recorren estos tests', () => {
  it('son las 96 combinaciones y las doce piezas', () => {
    // Guarda del propio archivo: si alguien toca el `flatMap` y deja la mitad, los
    // `for` de abajo pasarían igual con menos casos.
    expect(PIEZAS).toHaveLength(12);
    expect(COMBINACIONES).toHaveLength(96);
  });
});

describe('la forma entra en la caja y queda centrada', () => {
  it('las cinco celdas caen dentro de 0..4 en los dos ejes', () => {
    for (const [p, r, m] of COMBINACIONES) {
      const celdas = miniCells(p, r, m);
      expect(celdas, nombre(p, r, m)).toHaveLength(CELLS_PER_PIECE);
      for (const [x, y] of celdas) {
        expect(x >= 0 && x < MINI_BOX, `${nombre(p, r, m)} x=${x}`).toBe(true);
        expect(y >= 0 && y < MINI_BOX, `${nombre(p, r, m)} y=${y}`).toBe(true);
      }
    }
  });

  it('el margen es simétrico salvo por la casilla impar, que siempre cae del mismo lado', () => {
    // Es el test que atrapa el `round`: con él, una forma de ancho par en una caja
    // impar se corre un lugar de más y el margen izquierdo supera al derecho. Con
    // `floor` el sobrante queda SIEMPRE a la derecha y abajo, así que la diferencia
    // vale 0 o 1 y nunca -1.
    for (const [p, r, m] of COMBINACIONES) {
      const celdas = miniCells(p, r, m);
      const xs = celdas.map((c) => c[0]);
      const ys = celdas.map((c) => c[1]);
      const izq = Math.min(...xs);
      const der = MINI_BOX - 1 - Math.max(...xs);
      const arriba = Math.min(...ys);
      const abajo = MINI_BOX - 1 - Math.max(...ys);
      expect(der - izq, `${nombre(p, r, m)} horizontal`).toBeGreaterThanOrEqual(0);
      expect(der - izq, `${nombre(p, r, m)} horizontal`).toBeLessThanOrEqual(1);
      expect(abajo - arriba, `${nombre(p, r, m)} vertical`).toBeGreaterThanOrEqual(0);
      expect(abajo - arriba, `${nombre(p, r, m)} vertical`).toBeLessThanOrEqual(1);
    }
  });

  it('la `I` es el caso que fija la caja: llena un eje entero sin margen', () => {
    // Si esto dejara de valer, `MINI_BOX` podría bajar a 4 — y si empezara a fallar,
    // es que la caja se quedó chica.
    const acostada = miniCells('I', 0, false);
    const parada = miniCells('I', 1, false);
    expect(new Set(acostada.map((c) => c[0])).size).toBe(MINI_BOX);
    expect(new Set(parada.map((c) => c[1])).size).toBe(MINI_BOX);
  });
});

describe('la caja no depende de la orientación', () => {
  it('ninguna orientación de ninguna pieza se sale de la caja', () => {
    // La caja se dibuja con cinco pistas fijas, así que el reflow que D1 evita no
    // depende de esta pura. Lo que esta pura sí garantiza es que la forma no la
    // desborde por abajo, que es lo que devolvería el reflow por otra puerta.
    const fuera = COMBINACIONES.filter(([p, r, m]) =>
      miniCells(p, r, m).some(([x, y]) => x < 0 || y < 0 || x >= MINI_BOX || y >= MINI_BOX));
    expect(fuera.map(([p, r, m]) => nombre(p, r, m))).toEqual([]);
  });
});

describe('compone `rotateN` y `reflect`, no los reimplementa', () => {
  it('normalizado, el resultado es la misma forma que la cadena hecha a mano', () => {
    // Se compara contra `normalize` del resultado y no contra "el resultado sin
    // centrar": la firma no expone ese paso intermedio y no hace falta que lo exponga.
    // El centrado es una traslación, así que normalizar lo deshace exactamente.
    for (const [p, r, m] of COMBINACIONES) {
      const rotada = rotateN(SHAPES[p], r);
      const esperado = m ? reflect(rotada) : rotada;
      expect(normalize(miniCells(p, r, m)), nombre(p, r, m)).toEqual(esperado);
    }
  });

  it('AC-PCS-014 — el orden de la cadena es rotar y DESPUÉS reflejar', () => {
    // Invertirlo compila y da la orientación equivocada en 48 de las 96. Este test
    // busca una pieza donde las dos cadenas difieren, para que la afirmación no sea
    // vacía, y verifica que `miniCells` sigue la que usan `App.tsx`, `invariants.ts`
    // y `describePiece.ts`.
    const difieren = COMBINACIONES.filter(([p, r, m]) =>
      m && JSON.stringify(reflect(rotateN(SHAPES[p], r))) !== JSON.stringify(rotateN(reflect(SHAPES[p]), r)));
    expect(difieren.length).toBeGreaterThan(0);
    for (const [p, r, m] of difieren) {
      expect(normalize(miniCells(p, r, m)), nombre(p, r, m)).toEqual(reflect(rotateN(SHAPES[p], r)));
    }
  });
});

describe('determinismo', () => {
  it('misma entrada, mismo resultado', () => {
    for (const [p, r, m] of COMBINACIONES) {
      expect(miniCells(p, r, m), nombre(p, r, m)).toEqual(miniCells(p, r, m));
    }
  });

  it('no muta `SHAPES`', () => {
    // `rotateN` y `reflect` devuelven arrays nuevos, pero el `map` del centrado corre
    // sobre lo que ellos devuelven: si alguna de las dos empezara a mutar su entrada,
    // la paleta iría corrompiendo la tabla de formas del dominio a cada rotación.
    const antes = JSON.stringify(SHAPES);
    for (const [p, r, m] of COMBINACIONES) miniCells(p, r, m);
    expect(JSON.stringify(SHAPES)).toBe(antes);
  });
});
