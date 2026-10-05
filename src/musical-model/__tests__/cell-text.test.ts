import { describe, it, expect } from 'vitest';
import { cellTextFor } from '../cell-text.ts';
import {
  arpeggioFor,
  degreeByCellIndex,
  midiName,
  notesForRotation,
  playOrderByCellIndex,
  BASE_MAP,
  DEFAULT_OCTAVE,
  REGIMEN,
} from '../music.ts';
import { SHAPES, CELLS_PER_PIECE } from '../../pieces/pieces.ts';
import type { PieceKey } from '../../pieces/pieces.ts';

const PIECES = Object.keys(SHAPES) as PieceKey[];

describe('cellTextFor: the text of a cell, in the 96 orientations', () => {
  it('AC-MUS-026 — the number is the STEP and not the degree', () => {
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

  it('AC-MUS-025 — the NOTE comes from the degree against the ascending arpeggio, and the reflection does not move it', () => {
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        const asc = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, REGIMEN.escala);
        const esperadas = degreeByCellIndex(SHAPES[p]).map(g => midiName(asc[g]));
        expect(cellTextFor(p, rot, false, REGIMEN.escala).map(c => c.note), `${p}/${rot}`).toEqual(esperadas);
        expect(cellTextFor(p, rot, true, REGIMEN.escala).map(c => c.note), `${p}/${rot} mirror`).toEqual(esperadas);
      }
    }
  });

  it('AC-MUS-026 — the cell of `#0` carries the first note that sounds, and the cell of `#4` the last', () => {
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const texto = cellTextFor(p, rot, mirror, REGIMEN.escala);
          const enOrden = arpeggioFor(p, rot, mirror, REGIMEN.escala).map(midiName);
          for (let paso = 0; paso < CELLS_PER_PIECE; paso++) {
            const celda = texto.find(c => c.step === paso);
            expect(celda?.note, `${p}/${rot}/${mirror} step ${paso}`).toBe(enOrden[paso]);
          }
        }
      }
    }
  });

  it('the memo does not cross orientations: the reflection is in the key', () => {
    // The `L` is not symmetric under reflection in any rotation.
    expect(cellTextFor('L', 0, false, REGIMEN.escala).map(c => c.step))
      .not.toEqual(cellTextFor('L', 0, true, REGIMEN.escala).map(c => c.step));
    expect(cellTextFor('L', 0, false, REGIMEN.escala)).toBe(cellTextFor('L', 0, false, REGIMEN.escala));
  });

  it('AC-MUS-014 — the memo does not cross REGIMES either: the regime is in the key', () => {
    // Rotation 1 and not 0: at 0 the two regimes are identical, and a broken key would pass.
    expect(cellTextFor('L', 1, false, REGIMEN.escala).map(c => c.note))
      .not.toEqual(cellTextFor('L', 1, false, REGIMEN.orden).map(c => c.note));

    expect(cellTextFor('L', 1, false, REGIMEN.escala).map(c => c.step))
      .toEqual(cellTextFor('L', 1, false, REGIMEN.orden).map(c => c.step));

    expect(cellTextFor('L', 1, false, REGIMEN.orden)).toBe(cellTextFor('L', 1, false, REGIMEN.orden));
  });

  it('AC-MUS-027 — the reported case: the reflected `L` enters at `#0` on B4', () => {
    expect(cellTextFor('L', 0, true, REGIMEN.escala)).toEqual([
      { step: 1, note: 'A4' },
      { step: 2, note: 'F#4' },
      { step: 3, note: 'E4' },
      { step: 4, note: 'D4' },
      { step: 0, note: 'B4' },
    ]);
  });
});
