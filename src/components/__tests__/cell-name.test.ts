import { describe, it, expect } from 'vitest';
import { cellNameFor, anuncioDeEdicion } from '../cell-name.ts';
import { cellTextFor } from '../cell-text.ts';
import { EDICION } from '../constants/input.constants.ts';
import { REGIMEN } from '../../domain/constants/music.constants.ts';

/**
 * Los cuatro casos del AC8: celda libre, ocupada, ocupada y muteada, y el criterio de
 * que el fantasma no entra.
 *
 * Es el mismo tipo de test que
 * `cell-text.test.ts` -puro, sin DOM y sin React, en el `environment: 'node'` del
 * resto del repo- por la misma razon: lo que un lector de pantalla va a anunciar
 * tambien es una decision, y sin este archivo viviria sin test adentro de
 * `Board.tsx`.
 */
describe('AC-ACC-026 — cellNameFor — el nombre accesible de una celda', () => {
  it('celda libre: solo la coordenada y "libre", sin nota ni paso', () => {
    expect(cellNameFor(3, 2, null)).toBe('fila 3, columna 4, libre');
  });

  it('celda ocupada: coordenada, pieza, nota y paso, con el MISMO numero que la celda pinta', () => {
    const cell = cellTextFor('F', 0, false, REGIMEN.escala)[0];
    expect(cellNameFor(0, 0, { piece: 'F', muted: false, cell })).toBe(
      `fila 1, columna 1, pieza F, nota ${cell.note}, paso ${cell.step} de 4`,
    );
  });

  it('celda ocupada y muteada: el nombre dice "muteada" y conserva nota y paso', () => {
    // La pieza muteada "ocupa su lugar y su tiempo sin sonar" y NO es una
    // ausencia de contenido: el nombre tiene que seguir diciendo que nota y que paso
    // le tocarian, y ademas que esta muteada.
    const cell = cellTextFor('L', 1, true, REGIMEN.orden)[2];
    expect(cellNameFor(5, 3, { piece: 'L', muted: true, cell })).toBe(
      `fila 4, columna 6, pieza L muteada, nota ${cell.note}, paso ${cell.step} de 4`,
    );
  });

  it('el fantasma no entra: sin ocupante real, el nombre es "libre" aunque haya un CellText de fantasma para esa celda', () => {
    // Lo que `Board.tsx` calcularia para el HOVER de una `T` en esa celda -exactamente
    // el mismo `cellTextFor` que usa el fantasma en Board.tsx:213-. `cellNameFor` no
    // lo recibe: al no haber pieza colocada, el unico argumento posible es `null`, y
    // eso demuestra la garantia estructural del docblock -no hay forma de pasarle la
    // nota/paso del fantasma sin un ocupante real del que sacar `piece` y `muted`.
    const fantasma = cellTextFor('T', 2, false, REGIMEN.escala)[1];
    expect(fantasma).toBeDefined(); // el fantasma existe...
    expect(cellNameFor(7, 5, null)).toBe('fila 6, columna 8, libre'); // ...y no se usa.
  });
});

/**
 * Las cinco frases de la region `aria-live` (AC10): las cuatro ediciones de `EDICION`
 * mas el desmuteo, que es la otra mitad de `mutear`.
 */
describe('AC-ACC-027 — anuncioDeEdicion — lo que dice la region aria-live', () => {
  it('colocar y colocar muteada se distinguen por el estado en que queda la pieza', () => {
    expect(anuncioDeEdicion(EDICION.colocar, 'F', 3, 2, false))
      .toBe('pieza F colocada en fila 3, columna 4');
    // La muteada ocupa su lugar y su tiempo sin sonar: el anuncio lo dice,
    // porque sin ver la pantalla el blanco de la baldosa no se puede leer.
    expect(anuncioDeEdicion(EDICION.colocarMuteada, 'F', 3, 2, true))
      .toBe('pieza F colocada muteada en fila 3, columna 4');
  });

  it('quitar dice cual se fue y de donde, y no el muteo', () => {
    // Quitar es la operacion destructiva y no tiene deshacer, asi que la confirmacion es
    // lo unico que queda. El muteo no entra: la pieza sale del tablero.
    expect(anuncioDeEdicion(EDICION.quitar, 'L', 0, 0, true))
      .toBe('pieza L quitada de fila 1, columna 1');
    expect(anuncioDeEdicion(EDICION.quitar, 'L', 0, 0, false))
      .toBe('pieza L quitada de fila 1, columna 1');
  });

  it('mutear dice el estado que queda, no el boton que se apreto', () => {
    expect(anuncioDeEdicion(EDICION.mutear, 'W', 9, 5, true))
      .toBe('pieza W muteada en fila 6, columna 10');
    // "con sonido" y no "desmuteada": lo que hace falta saber es en que estado quedo.
    expect(anuncioDeEdicion(EDICION.mutear, 'W', 9, 5, false))
      .toBe('pieza W con sonido en fila 6, columna 10');
  });

  it('la coordenada es LA MISMA que la del nombre de la celda', () => {
    // Las dos salen de `coordenada`, en el mismo modulo: escritas dos veces serian dos
    // formas de que una cuente las filas desde 0 y la otra desde 1.
    const nombre = cellNameFor(4, 1, null);
    expect(anuncioDeEdicion(EDICION.colocar, 'T', 4, 1, false))
      .toContain(nombre.replace(', libre', ''));
  });
});
