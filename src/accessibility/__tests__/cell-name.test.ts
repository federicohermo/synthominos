import { describe, it, expect } from 'vitest';
import { cellNameFor, anuncioDeEdicion } from '../cell-name.ts';
import { cellTextFor } from '../../musical-model/cell-text.ts';
import { EDICION } from '../../board-editing/input.ts';
import { REGIMEN } from '../../musical-model/music.ts';

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
    const cell = cellTextFor('L', 1, true, REGIMEN.orden)[2];
    expect(cellNameFor(5, 3, { piece: 'L', muted: true, cell })).toBe(
      `fila 4, columna 6, pieza L muteada, nota ${cell.note}, paso ${cell.step} de 4`,
    );
  });

  it('the ghost does not enter: with no real occupant, the name is "libre" even when a ghost CellText exists for that cell', () => {
    const fantasma = cellTextFor('T', 2, false, REGIMEN.escala)[1];
    expect(fantasma).toBeDefined();
    expect(cellNameFor(7, 5, null)).toBe('fila 6, columna 8, libre');
  });
});

describe('AC-ACC-027 — anuncioDeEdicion: what the aria-live region says', () => {
  it('place and place muted differ by the state in which the piece ends', () => {
    expect(anuncioDeEdicion(EDICION.colocar, 'F', 3, 2, false))
      .toBe('pieza F colocada en fila 3, columna 4');
    expect(anuncioDeEdicion(EDICION.colocarMuteada, 'F', 3, 2, true))
      .toBe('pieza F colocada muteada en fila 3, columna 4');
  });

  it('remove says which piece left and from where, and not the mute', () => {
    expect(anuncioDeEdicion(EDICION.quitar, 'L', 0, 0, true))
      .toBe('pieza L quitada de fila 1, columna 1');
    expect(anuncioDeEdicion(EDICION.quitar, 'L', 0, 0, false))
      .toBe('pieza L quitada de fila 1, columna 1');
  });

  it('mute says the state in which the piece ends, not the button that was pressed', () => {
    expect(anuncioDeEdicion(EDICION.mutear, 'W', 9, 5, true))
      .toBe('pieza W muteada en fila 6, columna 10');
    expect(anuncioDeEdicion(EDICION.mutear, 'W', 9, 5, false))
      .toBe('pieza W con sonido en fila 6, columna 10');
  });

  it('the coordinate is THE SAME as the one of the cell name', () => {
    const nombre = cellNameFor(4, 1, null);
    expect(anuncioDeEdicion(EDICION.colocar, 'T', 4, 1, false))
      .toContain(nombre.replace(', libre', ''));
  });
});
