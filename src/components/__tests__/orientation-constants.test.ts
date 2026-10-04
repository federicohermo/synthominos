import { describe, it, expect } from 'vitest';
import { ROTACION, ORIENTACION_INICIAL, ORIENTACIONES_INICIALES } from '../constants/orientation.constants.ts';
import { SHAPES } from '../../domain/constants/pieces.constants.ts';

/**
 * La memoria de orientación, en el proyecto `node`: el módulo es puro y no
 * toca el DOM.
 *
 * Lo que hay para verificar es la **derivación**. `ORIENTACIONES_INICIALES` sale de
 * `SHAPES` y no de una lista de doce letras escrita a mano, y la diferencia sólo se nota
 * cuando alguien agrega una pieza al modelo: escrita a mano, la ranura que falta es un
 * `undefined` que el tipo promete que no existe y que nada atrapa hasta que el panel
 * intenta dibujar la miniatura. Derivada, la atrapa esto.
 */
describe('020 AC6 — las doce arrancan a 0° sin reflejar', () => {
  it('AC-PCS-018 — hay una ranura por pieza de `SHAPES`, ni una más ni una menos', () => {
    expect(Object.keys(ORIENTACIONES_INICIALES).sort()).toEqual(Object.keys(SHAPES).sort());
    expect(Object.keys(ORIENTACIONES_INICIALES)).toHaveLength(12);
  });

  it('AC-PCS-018 — las doce están en el arranque, y el arranque es 0° sin reflejar', () => {
    expect(ORIENTACION_INICIAL).toEqual({ rotation: ROTACION.cero, mirror: false });
    for (const [pieza, o] of Object.entries(ORIENTACIONES_INICIALES)) {
      expect(o, pieza).toEqual(ORIENTACION_INICIAL);
    }
  });

  it('`ROTACION` son los cuatro índices que `rotateN` cuenta', () => {
    // Los valores son índices y no grados: `rotateN` cuenta cuartos de vuelta, y el orden
    // lo fija `rotateN`. Si alguien los cambiara por 0/90/180/270 —que es el error
    // natural, porque así se llaman las claves— la geometría entera se movería.
    expect(Object.values(ROTACION)).toEqual([0, 1, 2, 3]);
  });
});
