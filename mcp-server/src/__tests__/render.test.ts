import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderAscii, renderCellNumbers, sizeOf } from '../render.ts';
import { rotateN, reflect } from '../../../src/pieces/transform.ts';
import { degreeByCellIndex } from '../../../src/musical-model/music.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from '../../../src/pieces/pieces.constants.ts';
import { PIECE_KEYS } from '../pieces.ts';
import type { Cell } from '../../../src/pieces/transform.types.ts';

describe('renderAscii', () => {
  test('marca la celda de agarre y deja los huecos del bounding box', () => {
    // La Z rotada 270° y reflejada: es el caso del AC4.
    const cells = reflect(rotateN(SHAPES.Z, 3));
    assert.equal(renderAscii(cells, ANCHOR_INDEX.Z), '#..\n#@#\n..#');
  });

  test('la fila 0 es la de arriba: `y` crece hacia abajo', () => {
    // Si el render invirtiera el eje, esta forma saldria al reves y el dibujo no
    // coincidiria con lo que se ve en pantalla.
    assert.equal(renderAscii([[0, 0], [0, 1], [1, 1]], 0), '@.\n##');
  });

  test('el ancla es el INDICE, no la coordenada', () => {
    const cells: Cell[] = [[0, 0], [1, 0], [2, 0]];
    assert.equal(renderAscii(cells, 0), '@##');
    assert.equal(renderAscii(cells, 2), '##@');
  });

  test('traslada por el minimo: sirve con celdas en coordenadas de tablero', () => {
    assert.equal(renderAscii([[5, 3], [6, 3]], 1), '#@');
  });

  test('un anchorIndex fuera de rango dibuja la forma sin ancla', () => {
    assert.equal(renderAscii([[0, 0], [1, 0]], -1), '##');
  });

  test('sin celdas devuelve el string vacio', () => {
    assert.equal(renderAscii([], 0), '');
    assert.deepEqual(sizeOf([]), { width: 0, height: 0 });
  });

  test('las 96 combinaciones dibujan 5 celdas y exactamente un ancla', () => {
    for (const p of PIECE_KEYS) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[p], rot);
          const cells = mirror ? reflect(base) : base;
          const ascii = renderAscii(cells, ANCHOR_INDEX[p]);
          const marcadas = [...ascii].filter(c => c === '#' || c === '@').length;
          const anclas = [...ascii].filter(c => c === '@').length;

          assert.equal(marcadas, CELLS_PER_PIECE, `${p} rot${rot}${mirror ? ' mirror' : ''}`);
          assert.equal(anclas, 1, `${p} rot${rot}${mirror ? ' mirror' : ''}`);
          // El bounding box del dibujo tiene que ser el de la forma.
          const { width, height } = sizeOf(cells);
          const filas = ascii.split('\n');
          assert.equal(filas.length, height);
          assert.ok(filas.every(f => f.length === width));
        }
      }
    }
  });
});

describe('renderCellNumbers', () => {
  test('pone el grado de cada celda, en el mismo bounding box que renderAscii', () => {
    // La X: desde el spec 012 el arpegio la RECORRE, y es la unica pieza que no puede
    // recorrerse con menos de dos saltos, porque su centro tiene cuatro vecinos. Se entra
    // por el brazo derecho (grado 0), se salta al de abajo, se salta al izquierdo, y
    // recien ahi se camina centro → arriba. Es la forma donde el mapeo se lee de un
    // vistazo, y el dibujo lo muestra sin que haya que cruzar `cellMap` a mano.
    const grados = degreeByCellIndex(SHAPES.X);
    assert.equal(renderCellNumbers(SHAPES.X, grados), '.4.\n230\n.1.');
    // Mismo dibujo, distinto contenido: las dos vistas tienen que alinear.
    const conAncla = renderAscii(SHAPES.X, ANCHOR_INDEX.X);
    assert.deepEqual(
      renderCellNumbers(SHAPES.X, grados).split('\n').map(f => f.length),
      conAncla.split('\n').map(f => f.length),
    );
  });

  test('las 96 combinaciones dibujan los cinco grados, sin repetir ninguno', () => {
    // El grado viaja por INDICE sobre la forma canonica: rotar y reflejar son `map`,
    // asi que la celda k sigue siendo la celda k. Si alguna vez dejara de serlo, este
    // test veria un grado repetido o faltante.
    for (const p of PIECE_KEYS) {
      const grados = degreeByCellIndex(SHAPES[p]);
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[p], rot);
          const cells = mirror ? reflect(base) : base;
          const dibujo = renderCellNumbers(cells, grados);
          const digitos = [...dibujo].filter(c => c >= '0' && c <= '9').sort().join('');
          assert.equal(digitos, '01234', `${p} rot${rot}${mirror ? ' mirror' : ''}`);
        }
      }
    }
  });

  test('sin celdas devuelve el string vacio', () => {
    assert.equal(renderCellNumbers([], []), '');
  });

  test('lo que no es un digito solo cae a `#` y la grilla no se desalinea', () => {
    // La regla que el docblock declara —un numero de dos digitos desalinearia la
    // grilla— tiene tres formas de incumplirse, y las tres caen al mismo lado. El
    // ancho de la fila es lo que se afirma: es lo que la regla existe para sostener.
    const fila: Cell[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    assert.equal(renderCellNumbers(fila, [10, -1, 2.5, 7]), '###7');
    // Y una celda sin valor tampoco inventa nada.
    assert.equal(renderCellNumbers(fila, [0]), '0###');
  });
});
