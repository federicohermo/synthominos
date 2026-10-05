import { describe, it, expect } from 'vitest';
import { ROTACION, ORIENTACION_INICIAL, ORIENTACIONES_INICIALES } from '../orientation.ts';
import { SHAPES } from '../pieces.ts';

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
    expect(Object.values(ROTACION)).toEqual([0, 1, 2, 3]);
  });
});
