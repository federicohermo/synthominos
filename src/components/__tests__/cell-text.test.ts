import { describe, it, expect } from 'vitest';
import { cellTextFor } from '../cell-text.ts';
import {
  arpeggioFor, degreeByCellIndex, midiName, notesForRotation, playOrderByCellIndex,
} from '../../domain/music.ts';
import { SHAPES, CELLS_PER_PIECE } from '../../domain/constants/pieces.constants.ts';
import { BASE_MAP, DEFAULT_OCTAVE, REGIMEN } from '../../domain/constants/music.constants.ts';
import type { PieceKey } from '../../domain/types/pieces.types.ts';

const PIECES = Object.keys(SHAPES) as PieceKey[];

/**
 * Lo que ve el ojo, bajo test — que es lo que faltaba cuando el `#N` de la celda
 * mentia en la mitad reflejada del espacio de colocacion.
 *
 * Las puras del dominio estaban BIEN y sus tests en verde: `playOrderByCellIndex` da
 * el paso correcto, `gates` entra por el paso 0 y `degreeByCellIndex` da la nota
 * correcta. Lo que nadie miraba es CUAL de las dos le pedia la pantalla, y esa
 * eleccion vivia adentro de `Board.tsx`, donde no se podia importar. Por eso el bug
 * convivio con 238 tests verdes: no habia ninguno entre la pura y el pixel.
 *
 * Es el mismo tipo de test que `palette.test.ts` —puro, sin DOM y sin React, en el
 * `environment: 'node'` del resto del repo—, y por la misma razon que `route-source`
 * tiene el suyo: lo que `components/` decide tambien es una decision.
 */
describe('cellTextFor — el texto de una celda, en las 96 orientaciones', () => {
  it('AC-MUS-026 — el numero es el PASO y no el grado', () => {
    // El bug, exactamente. Con `mirror` las dos numeraciones difieren en 4 de las 5
    // celdas —`4 - g === g` solo en g=2—, asi que pedir el grado se ve enseguida; sin
    // `mirror` son el mismo numero, que es por lo que el error tardo un spec en salir.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const pasos = cellTextFor(p, rot, mirror, REGIMEN.escala).map(c => c.step);
          expect(pasos, `${p}/${rot}/${mirror}`)
            .toEqual(playOrderByCellIndex(SHAPES[p], mirror));
        }
      }
    }
  });

  it('AC-MUS-025 — la NOTA sale del grado contra el ascendente, y la reflexion no la mueve', () => {
    // La otra mitad del par, y el cruce inverso: numerar bien pero pedir la nota con
    // `arpeggioFor(...)[paso]` compila y devuelve la nota espejada. Que reflejar deje
    // las 5 notas donde estaban es lo que dice que la celda pinta el ascendente.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const asc = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
        const esperadas = degreeByCellIndex(SHAPES[p]).map(g => midiName(asc[g]));
        expect(cellTextFor(p, rot, false, REGIMEN.escala).map(c => c.note), `${p}/${rot}`).toEqual(esperadas);
        expect(cellTextFor(p, rot, true, REGIMEN.escala).map(c => c.note), `${p}/${rot} mirror`).toEqual(esperadas);
      }
    }
  });

  it('AC-MUS-026 — la celda del `#0` lleva la primera nota que suena, y la del `#4` la ultima', () => {
    // La promesa que la pantalla hace: la cabeza lectora entra por el `#0`. Cruza las
    // dos derivaciones —el numero por un lado, la nota por el otro— contra el orden de
    // reproduccion real, que es lo unico que ninguna de las dos conoce sola.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const texto = cellTextFor(p, rot, mirror, REGIMEN.escala);
          const enOrden = arpeggioFor(p, rot, mirror, REGIMEN.escala).map(midiName);
          for (let paso = 0; paso < CELLS_PER_PIECE; paso++) {
            const celda = texto.find(c => c.step === paso);
            expect(celda?.note, `${p}/${rot}/${mirror} paso ${paso}`).toBe(enOrden[paso]);
          }
        }
      }
    }
  });

  it('el memo no cruza orientaciones: la reflexion esta en la clave', () => {
    // Sin `mirror` en la clave la primera orientacion renderizada le quedaria pegada a
    // la otra, y el fantasma prometeria una numeracion que la pieza colocada no cumple.
    // Se ejerce con la `L`, que no es simetrica bajo reflexion en ninguna rotacion.
    expect(cellTextFor('L', 0, false, REGIMEN.escala).map(c => c.step))
      .not.toEqual(cellTextFor('L', 0, true, REGIMEN.escala).map(c => c.step));
    expect(cellTextFor('L', 0, false, REGIMEN.escala)).toBe(cellTextFor('L', 0, false, REGIMEN.escala));
  });

  it('AC-MUS-014 — el memo tampoco cruza REGIMENES: el regimen esta en la clave', () => {
    // El `Map` es de modulo, sobrevive al render y no lo mira ningun linter: sin el
    // regimen en la clave, cambiarlo re-derivaria el audio y dejaria las celdas
    // mostrando las notas del regimen anterior para siempre. Es AC7 verde en el audio y
    // falso en la pantalla, y el unico lugar donde se puede atrapar es este.
    //
    // Se ejerce a rotacion 1 y no a 0: a 0 los dos regimenes son identicos por D2, asi
    // que el test pasaria con la clave rota.
    expect(cellTextFor('L', 1, false, REGIMEN.escala).map(c => c.note))
      .not.toEqual(cellTextFor('L', 1, false, REGIMEN.orden).map(c => c.note));

    // Y el PASO no cambia con el regimen: la rotacion mueve las notas o su orden dentro
    // del arpegio, nunca el camino que el arpegio hace por la forma (D1).
    expect(cellTextFor('L', 1, false, REGIMEN.escala).map(c => c.step))
      .toEqual(cellTextFor('L', 1, false, REGIMEN.orden).map(c => c.step));

    // Y cada rama se sigue memoizando por su lado.
    expect(cellTextFor('L', 1, false, REGIMEN.orden)).toBe(cellTextFor('L', 1, false, REGIMEN.orden));
  });

  it('AC-MUS-027 — el caso del reporte: la `L` reflejada entra por el `#0` en B4', () => {
    // El testigo del bug, tal como se ve en pantalla. `L`/0/reflejada tiene sus celdas
    // en [1,0] [1,1] [1,2] [1,3] [0,0], y la ultima —la que la cabeza pisa primero—
    // decia `#4`. Es el unico test del archivo que fija numeros a mano: los otros
    // cuatro son propiedades, y una propiedad no muestra como se veia el error.
    expect(cellTextFor('L', 0, true, REGIMEN.escala)).toEqual([
      { step: 1, note: 'A4' },
      { step: 2, note: 'F#4' },
      { step: 3, note: 'E4' },
      { step: 4, note: 'D4' },
      { step: 0, note: 'B4' },
    ]);
  });
});
