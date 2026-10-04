import { describe, it, expect } from 'vitest';
import { cabeEn, cellsAt, isValid, occupantAt, occupantCellIndex } from '../placement.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.constants.ts';
import { GRID_DEFAULT } from '../board.constants.ts';
import type { Cell } from '../../pieces/transform.types.ts';
import type { PieceKey } from '../../pieces/pieces.types.ts';
import type { PlacedPiece } from '../board.types.ts';

/**
 * Todo este archivo mide el tablero de REFERENCIA, que es el de 10 x 6 de siempre.
 *
 * El tablero sale del viewport, asi que las funciones lo reciben por
 * parametro y un test tiene que elegir uno. Se elige `GRID_DEFAULT` y no un tamano nuevo
 * porque los numeros que este archivo verifica —los 496 pares que acorta la costura, la
 * distancia maxima de 12, la tabla de PASOS— estan medidos sobre ese tablero: cambiarlo
 * invalidaria las mediciones sin agregar cobertura. Lo que SI tiene test propio con otras
 * dimensiones es lo que depende de ellas, y es `costuraDe`.
 */
const { w: GRID_W, h: GRID_H } = GRID_DEFAULT;

const PIECES = Object.keys(SHAPES) as PieceKey[];

/** Una pieza colocada con las celdas dadas. El resto de los campos no lo mira el tablero. */
const piezaEn = (id: string, cells: Cell[]): PlacedPiece =>
  ({ id, piece: 'I', rotation: 0, mirror: false, cells, muted: false });

describe('cellsAt', () => {
  it('AC-BRD-001 — la celda de agarre cae exactamente donde se clickeo', () => {
    // Es la propiedad que hace que colocar se sienta preciso, y la que sostiene la
    // fase por pieza: si el ancla se corriera, la columna leida
    // despues seria otra.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(base) : base;
          const idx = ANCHOR_INDEX[p];
          for (const [x, y] of [[0, 0], [3, 2], [9, 5]] as Cell[]) {
            expect(cellsAt(shape, idx, x, y)[idx]).toEqual([x, y]);
          }
        }
      }
    }
  });

  it('traslada la forma entera sin deformarla', () => {
    const shape: Cell[] = [[0,0],[1,0],[2,0],[3,0],[4,0]];
    expect(cellsAt(shape, 2, 5, 3)).toEqual([[3,3],[4,3],[5,3],[6,3],[7,3]]);
  });

  it('preserva el orden del array: la celda k sigue siendo la celda k', () => {
    const shape: Cell[] = [[2,2],[0,0],[1,1]];
    const got = cellsAt(shape, 0, 7, 7);
    // El ancla es la celda 0, que estaba en (2,2): el corrimiento es (+5,+5).
    expect(got).toEqual([[7,7],[5,5],[6,6]]);
  });

  it('no muta la forma que recibe', () => {
    const shape: Cell[] = [[0,0],[1,0]];
    const copia = shape.map(([x, y]): Cell => [x, y]);
    cellsAt(shape, 0, 4, 4);
    expect(shape).toEqual(copia);
  });
});

describe('isValid', () => {
  it('acepta una pieza que entra en un tablero vacio', () => {
    expect(isValid([[0,0],[1,0],[2,0]], [], GRID_DEFAULT)).toBe(true);
  });

  it('AC-BRD-003 — rechaza por cada uno de los cuatro bordes', () => {
    expect(isValid([[-1,0]], [], GRID_DEFAULT)).toBe(false);                 // izquierda
    expect(isValid([[0,-1]], [], GRID_DEFAULT)).toBe(false);                 // arriba
    expect(isValid([[GRID_W,0]], [], GRID_DEFAULT)).toBe(false);             // derecha
    expect(isValid([[0,GRID_H]], [], GRID_DEFAULT)).toBe(false);             // abajo
  });

  it('las esquinas del tablero son validas y sus vecinas de afuera no', () => {
    expect(isValid([[0,0],[GRID_W-1,GRID_H-1]], [], GRID_DEFAULT)).toBe(true);
    expect(isValid([[GRID_W-1,GRID_H]], [], GRID_DEFAULT)).toBe(false);
  });

  it('rechaza el choque contra una pieza ya colocada', () => {
    const placed = [piezaEn('1', [[2,2],[3,2],[4,2]])];
    expect(isValid([[4,2]], placed, GRID_DEFAULT)).toBe(false);              // se pisan en una celda
    expect(isValid([[2,2],[3,2],[4,2]], placed, GRID_DEFAULT)).toBe(false);  // se pisan enteras
    expect(isValid([[2,3],[3,3],[4,3]], placed, GRID_DEFAULT)).toBe(true);   // justo debajo, libre
  });

  it('AC-BRD-003 — mira TODAS las piezas colocadas, no solo la primera', () => {
    const placed = [piezaEn('1', [[0,0]]), piezaEn('2', [[5,5]])];
    expect(isValid([[5,5]], placed, GRID_DEFAULT)).toBe(false);
  });

  it('una jugada fuera del tablero es invalida aunque no choque con nada', () => {
    expect(isValid([[8,0],[9,0],[10,0]], [], GRID_DEFAULT)).toBe(false);
  });

  it('las 12 piezas entran en el tablero en su rotacion 0', () => {
    for (const p of PIECES) {
      const shape = rotateN(SHAPES[p], 0);
      expect(isValid(cellsAt(shape, ANCHOR_INDEX[p], 4, 2), [], GRID_DEFAULT)).toBe(true);
    }
  });
});

describe('031 — `cabeEn`: si la pieza entra ENTERA en el tablero de ahora', () => {
  it('AC-FIT-019 — la que entra entera si, y no le importa lo que haya colocado', () => {
    // No mira solapamiento a proposito: es la pregunta «se dibuja o no», y dos piezas
    // solapadas no pueden existir —`isValid` no las deja entrar—.
    const p = piezaEn('a', [[0,0],[1,0],[2,0],[3,0],[4,0]]);
    expect(cabeEn(p, GRID_DEFAULT)).toBe(true);
    expect(cabeEn(p, { w: 5, h: 5 })).toBe(true);
  });

  it('AC-FIT-019 — la que se pasa por UNA celda no entra, y por cualquiera de los cuatro bordes', () => {
    // Es la mitad que decide que se dibuja: «tres celdas adentro y dos
    // afuera» tiene que dar false, o el tablero mostraria media pieza que el circuito no
    // visita.
    expect(cabeEn(piezaEn('a', [[3,0],[4,0],[5,0]]), { w: 5, h: 5 })).toBe(false);   // derecha
    expect(cabeEn(piezaEn('a', [[0,3],[0,4],[0,5]]), { w: 5, h: 5 })).toBe(false);   // abajo
    expect(cabeEn(piezaEn('a', [[-1,0],[0,0]]), GRID_DEFAULT)).toBe(false);          // izquierda
    expect(cabeEn(piezaEn('a', [[0,-1],[0,0]]), GRID_DEFAULT)).toBe(false);          // arriba
  });

  it('AC-FIT-020 — la misma pieza entra o no segun el tablero, que es para lo que existe', () => {
    // El caso central: la ventana se achica y la pieza deja de entrar sin
    // que la pieza cambie. Achicar y volver a agrandar la devuelve.
    const alBorde = piezaEn('a', [[7,1],[8,1],[9,1]]);
    expect(cabeEn(alBorde, GRID_DEFAULT)).toBe(true);
    expect(cabeEn(alBorde, { w: 6, h: 6 })).toBe(false);
    expect(cabeEn(alBorde, GRID_DEFAULT)).toBe(true);
  });
});

describe('occupantAt', () => {
  it('devuelve la pieza que ocupa la celda', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[5,3]]);
    expect(occupantAt([a, b], 2, 1)).toBe(a);
    expect(occupantAt([a, b], 5, 3)).toBe(b);
  });

  it('devuelve null en una celda libre y en un tablero vacio', () => {
    expect(occupantAt([piezaEn('a', [[1,1]])], 0, 0)).toBeNull();
    expect(occupantAt([], 0, 0)).toBeNull();
  });

  it('no confunde (x,y) con (y,x)', () => {
    const a = piezaEn('a', [[1,4]]);
    expect(occupantAt([a], 1, 4)).toBe(a);
    expect(occupantAt([a], 4, 1)).toBeNull();
  });
});

describe('occupantCellIndex', () => {
  it('sobre una celda ocupada devuelve el indice de esa celda dentro de la pieza', () => {
    const a = piezaEn('a', [[1,1],[2,1],[3,1]]);
    expect(occupantCellIndex(a, 1, 1)).toBe(0);
    expect(occupantCellIndex(a, 2, 1)).toBe(1);
    expect(occupantCellIndex(a, 3, 1)).toBe(2);
  });

  it('sobre una celda que la pieza no ocupa devuelve -1', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    expect(occupantCellIndex(a, 0, 0)).toBe(-1);      // libre y lejos
    expect(occupantCellIndex(a, 3, 1)).toBe(-1);      // libre y pegada
    expect(occupantCellIndex(a, 1, 2)).toBe(-1);      // no confunde (x,y) con (y,x)
  });

  it('con dos piezas adyacentes el indice sale de la pieza consultada', () => {
    // Es el caso que rompe una implementacion que buscara la celda en el tablero
    // entero: (3,1) y (4,1) son de `b` y su indice adentro de `b` no es el que
    // tendrian contando desde `a`.
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[3,1],[4,1]]);
    expect(occupantCellIndex(a, 3, 1)).toBe(-1);
    expect(occupantCellIndex(b, 3, 1)).toBe(0);
    expect(occupantCellIndex(b, 4, 1)).toBe(1);
    expect(occupantCellIndex(a, 2, 1)).toBe(1);
    expect(occupantCellIndex(b, 2, 1)).toBe(-1);
  });

  it('compuesto con occupantAt: primero que pieza, despues que celda de esa pieza', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[3,1],[4,1]]);
    const ocupante = occupantAt([a, b], 4, 1) ?? a;   // el ?? no se ejerce: si diera null, el indice seria -1 y el test caeria igual
    expect(ocupante).toBe(b);
    expect(occupantCellIndex(ocupante, 4, 1)).toBe(1);
  });

  it('el indice sirve contra la forma canonica en las 96 orientaciones', () => {
    // Es de lo que depende la derivacion celda→nota: la celda k del
    // tablero tiene que seguir siendo la celda k de SHAPES despues de rotar, reflejar
    // y trasladar. `cellsAt` es un `map`, asi que el indice sobrevive los tres pasos.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(base) : base;
          const cells = cellsAt(shape, ANCHOR_INDEX[p], 5, 3);
          const pieza = piezaEn(`${p}-${rot}-${mirror}`, cells);
          for (let k = 0; k < cells.length; k++) {
            expect(occupantCellIndex(pieza, cells[k][0], cells[k][1])).toBe(k);
          }
        }
      }
    }
  });
});