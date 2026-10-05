import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderAscii, renderCellNumbers, sizeOf } from '../render.ts';
import { rotateN, reflect } from '../../../src/pieces/transform.ts';
import { degreeByCellIndex } from '../../../src/musical-model/music.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from '../../../src/pieces/pieces.ts';
import { PIECE_KEYS } from '../pieces.ts';
import type { Cell } from '../../../src/pieces/transform.ts';

describe('renderAscii', () => {
  test('marks the grip cell and leaves the gaps of the bounding box', () => {
    // The Z rotated 270° and reflected.
    const cells = reflect(rotateN(SHAPES.Z, 3));
    assert.equal(renderAscii(cells, ANCHOR_INDEX.Z), '#..\n#@#\n..#');
  });

  test('row 0 is the top row: `y` grows down', () => {
    // If the render inverted the axis, this shape would come out upside down and the
    // drawing would not agree with the screen.
    assert.equal(renderAscii([[0, 0], [0, 1], [1, 1]], 0), '@.\n##');
  });

  test('the grip cell is the INDEX, not the coordinate', () => {
    const cells: Cell[] = [[0, 0], [1, 0], [2, 0]];
    assert.equal(renderAscii(cells, 0), '@##');
    assert.equal(renderAscii(cells, 2), '##@');
  });

  test('translates by the minimum: it works with cells in board coordinates', () => {
    assert.equal(renderAscii([[5, 3], [6, 3]], 1), '#@');
  });

  test('an anchorIndex out of range draws the shape with no grip cell', () => {
    assert.equal(renderAscii([[0, 0], [1, 0]], -1), '##');
  });

  test('with no cells it returns the empty string', () => {
    assert.equal(renderAscii([], 0), '');
    assert.deepEqual(sizeOf([]), { width: 0, height: 0 });
  });

  test('the 96 combinations draw 5 cells and exactly one grip cell', () => {
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
          // The bounding box of the drawing must be that of the shape.
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
  test('puts the degree of each cell, in the same bounding box as renderAscii', () => {
    // The X: the arpeggio WALKS the piece, and the X is the only piece that no walk
    // covers with less than two jumps, because its center has four neighbors. The walk
    // enters by the right arm (degree 0), jumps to the bottom arm, jumps to the left
    // arm, and only then goes center → top. It is the shape where the mapping reads at
    // a glance, and the drawing shows it with no need to match `cellMap` by hand.
    const grados = degreeByCellIndex(SHAPES.X);
    assert.equal(renderCellNumbers(SHAPES.X, grados), '.4.\n230\n.1.');
    // Same drawing, different content: the two views must align.
    const conAncla = renderAscii(SHAPES.X, ANCHOR_INDEX.X);
    assert.deepEqual(
      renderCellNumbers(SHAPES.X, grados).split('\n').map(f => f.length),
      conAncla.split('\n').map(f => f.length),
    );
  });

  test('the 96 combinations draw the five degrees, with none repeated', () => {
    // The degree travels by INDEX on the canonical shape: rotate and reflect are `map`,
    // so cell k stays cell k. If that stops being true, this test sees a repeated or
    // missing degree.
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

  test('with no cells it returns the empty string', () => {
    assert.equal(renderCellNumbers([], []), '');
  });

  test('what is not a single digit falls back to `#` and the grid does not misalign', () => {
    // The rule that the docblock declares, that a number of two digits would misalign
    // the grid, can be broken in three ways, and the three fall to the same side. The
    // assertion is on the width of the row: that is what the rule exists to hold.
    const fila: Cell[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    assert.equal(renderCellNumbers(fila, [10, -1, 2.5, 7]), '###7');
    // And a cell with no value invents nothing.
    assert.equal(renderCellNumbers(fila, [0]), '0###');
  });
});
