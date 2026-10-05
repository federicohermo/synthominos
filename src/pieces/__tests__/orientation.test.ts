import { describe, it, expect } from 'vitest';
import { ROTACION, ORIENTACION_INICIAL, ORIENTACIONES_INICIALES } from '../orientation.ts';
import { SHAPES } from '../pieces.ts';

/**
 * The memory of orientation, in the `node` project: the module is pure and does not
 * touch the DOM.
 *
 * What there is to verify is the **derivation**. `ORIENTACIONES_INICIALES` comes from
 * `SHAPES` and not from a list of twelve letters written by hand. The difference shows
 * only when a piece is added to the model. Written by hand, the missing slot is an
 * `undefined` that the type promises does not exist, and nothing catches it until the
 * panel tries to draw the thumbnail. Derived, this test catches it.
 */
describe('the twelve pieces open at 0°, not reflected', () => {
  it('AC-PCS-018 — one slot for each piece of `SHAPES`, no more and no less', () => {
    expect(Object.keys(ORIENTACIONES_INICIALES).sort()).toEqual(Object.keys(SHAPES).sort());
    expect(Object.keys(ORIENTACIONES_INICIALES)).toHaveLength(12);
  });

  it('AC-PCS-018 — the twelve are at the initial orientation, which is 0° and not reflected', () => {
    expect(ORIENTACION_INICIAL).toEqual({ rotation: ROTACION.cero, mirror: false });
    for (const [pieza, o] of Object.entries(ORIENTACIONES_INICIALES)) {
      expect(o, pieza).toEqual(ORIENTACION_INICIAL);
    }
  });

  it('`ROTACION` holds the four indices that `rotateN` counts', () => {
    // The values are indices and not angles: `rotateN` counts quarter turns, and
    // `rotateN` sets the order. A change to 0/90/180/270, the natural mistake because the
    // keys have those names, would move all the geometry.
    expect(Object.values(ROTACION)).toEqual([0, 1, 2, 3]);
  });
});
