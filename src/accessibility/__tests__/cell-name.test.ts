import { describe, it, expect } from 'vitest';
import { cellNameFor, anuncioDeEdicion } from '../cell-name.ts';
import { cellTextFor } from '../../musical-model/cell-text.ts';
import { EDICION } from '../../board-editing/input.ts';
import { REGIMEN } from '../../musical-model/music.ts';

/**
 * The four cases of the cell name: the free cell, the occupied cell, the occupied and
 * muted cell, and the criterion that the ghost does not enter.
 *
 * It is the same kind of test as `cell-text.test.ts`: pure, with no DOM and no React, in
 * the `environment: 'node'` of the rest of the repo. The reason is the same: what a
 * screen reader announces is also a decision, and without this file it would live with
 * no test inside `Board.tsx`.
 */
describe('AC-ACC-026 — cellNameFor: the accessible name of a cell', () => {
  it('free cell: only the coordinate and "libre", with no note and no step', () => {
    expect(cellNameFor(3, 2, null)).toBe('fila 3, columna 4, libre');
  });

  it('occupied cell: coordinate, piece, note and step, with the SAME number that the cell shows', () => {
    const cell = cellTextFor('F', 0, false, REGIMEN.escala)[0];
    expect(cellNameFor(0, 0, { piece: 'F', muted: false, cell })).toBe(
      `fila 1, columna 1, pieza F, nota ${cell.note}, paso ${cell.step} de 4`,
    );
  });

  it('occupied and muted cell: the name says "muteada" and keeps the note and the step', () => {
    // A muted piece keeps its cells and its time in the circuit, and does not sound. It is
    // NOT an absence of content: the name must still say which note and which step it
    // would have, and also that it is muted.
    const cell = cellTextFor('L', 1, true, REGIMEN.orden)[2];
    expect(cellNameFor(5, 3, { piece: 'L', muted: true, cell })).toBe(
      `fila 4, columna 6, pieza L muteada, nota ${cell.note}, paso ${cell.step} de 4`,
    );
  });

  it('the ghost does not enter: with no real occupant, the name is "libre" even when a ghost CellText exists for that cell', () => {
    // What `Board.tsx` calculates for the ghost of a `T` on that cell, with exactly the
    // same `cellTextFor` call. `cellNameFor` does not receive it: with no placed piece,
    // the only possible argument is `null`. That shows the structural guarantee of the
    // docblock: the note and the step of the ghost cannot be passed without a real
    // occupant that gives `piece` and `muted`.
    const fantasma = cellTextFor('T', 2, false, REGIMEN.escala)[1];
    expect(fantasma).toBeDefined(); // the ghost exists...
    expect(cellNameFor(7, 5, null)).toBe('fila 6, columna 8, libre'); // ...and it is not used.
  });
});

/**
 * The five phrases of the `aria-live` region: the four edits of `EDICION` plus the
 * unmute, which is the other half of `mutear`.
 */
describe('AC-ACC-027 — anuncioDeEdicion: what the aria-live region says', () => {
  it('place and place muted differ by the state in which the piece ends', () => {
    expect(anuncioDeEdicion(EDICION.colocar, 'F', 3, 2, false))
      .toBe('pieza F colocada en fila 3, columna 4');
    // A muted piece keeps its cells and its time, and does not sound. The announcement
    // says it, because a person who does not see the screen cannot read the white tile.
    expect(anuncioDeEdicion(EDICION.colocarMuteada, 'F', 3, 2, true))
      .toBe('pieza F colocada muteada en fila 3, columna 4');
  });

  it('remove says which piece left and from where, and not the mute', () => {
    // Remove is the destructive operation and it has no undo, so the confirmation is all
    // that stays. The mute does not enter: the piece leaves the board.
    expect(anuncioDeEdicion(EDICION.quitar, 'L', 0, 0, true))
      .toBe('pieza L quitada de fila 1, columna 1');
    expect(anuncioDeEdicion(EDICION.quitar, 'L', 0, 0, false))
      .toBe('pieza L quitada de fila 1, columna 1');
  });

  it('mute says the state in which the piece ends, not the button that was pressed', () => {
    expect(anuncioDeEdicion(EDICION.mutear, 'W', 9, 5, true))
      .toBe('pieza W muteada en fila 6, columna 10');
    // "con sonido" and not "desmuteada": what matters is the state in which the piece ends.
    expect(anuncioDeEdicion(EDICION.mutear, 'W', 9, 5, false))
      .toBe('pieza W con sonido en fila 6, columna 10');
  });

  it('the coordinate is THE SAME as the one of the cell name', () => {
    // The two come from `coordenada`, in the same module: written twice, one could count
    // the rows from 0 and the other from 1.
    const nombre = cellNameFor(4, 1, null);
    expect(anuncioDeEdicion(EDICION.colocar, 'T', 4, 1, false))
      .toContain(nombre.replace(', libre', ''));
  });
});
