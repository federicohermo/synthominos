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

/**
 * What the eye sees, under test: the `#N` of the cell must not lie in the reflected half
 * of the placement space.
 *
 * The pure functions of the domain can be RIGHT with their tests green:
 * `playOrderByCellIndex` gives the right step, `gates` enters at step 0 and
 * `degreeByCellIndex` gives the right note. What they do not cover is WHICH of the two
 * the screen asks for. That choice lived inside `Board.tsx`, where no test could import
 * it, so the bug lived next to 238 green tests: there was none between the pure function
 * and the pixel.
 *
 * It is the same kind of test as `palette.test.ts` (pure, with no DOM and no React, in
 * the `environment: 'node'` of the rest of the repo), and for the same reason that
 * `route-source` has its own: what the UI decides is a decision too.
 */
describe('cellTextFor: the text of a cell, in the 96 orientations', () => {
  it('AC-MUS-026 — the number is the STEP and not the degree', () => {
    // The bug, exactly. With `mirror` the two numberings differ in 4 of the 5 cells
    // (`4 - g === g` only at g=2), so a request for the degree shows at once. Without
    // `mirror` they are the same number, which is why the error is slow to show.
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
    // The other half of the pair, and the reverse crossing: to number right but ask the
    // note with `ascending[step]` compiles and returns the mirrored note. That a
    // reflection leaves the 5 notes where they were says that the cell paints the
    // ascending arpeggio.
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
    // The promise that the screen makes: the playhead enters at `#0`. It crosses the two
    // derivations (the number on one side, the note on the other) with the real order of
    // sound, which neither of the two knows alone.
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
    // Without `mirror` in the key, the first orientation rendered would stick to the
    // other one, and the ghost would promise a numbering that the placed piece does not
    // keep. The test uses the `L`, which is not symmetric under reflection in any
    // rotation.
    expect(cellTextFor('L', 0, false, REGIMEN.escala).map(c => c.step))
      .not.toEqual(cellTextFor('L', 0, true, REGIMEN.escala).map(c => c.step));
    expect(cellTextFor('L', 0, false, REGIMEN.escala)).toBe(cellTextFor('L', 0, false, REGIMEN.escala));
  });

  it('AC-MUS-014 — the memo does not cross REGIMES either: the regime is in the key', () => {
    // The `Map` belongs to the module, survives the render, and no linter looks at it.
    // Without the regime in the key, a regime change would derive the audio again and
    // leave the cells with the notes of the regime before forever. It would be true in
    // the audio and false on the screen, and this is the only place that can catch it.
    //
    // The test uses rotation 1 and not 0: at 0 the two regimes are identical by design,
    // so the test would pass with a broken key.
    expect(cellTextFor('L', 1, false, REGIMEN.escala).map(c => c.note))
      .not.toEqual(cellTextFor('L', 1, false, REGIMEN.orden).map(c => c.note));

    // And the STEP does not change with the regime: the rotation moves the notes or their
    // order in the arpeggio, never the walk of the arpeggio through the shape.
    expect(cellTextFor('L', 1, false, REGIMEN.escala).map(c => c.step))
      .toEqual(cellTextFor('L', 1, false, REGIMEN.orden).map(c => c.step));

    // And each branch still memoizes on its own.
    expect(cellTextFor('L', 1, false, REGIMEN.orden)).toBe(cellTextFor('L', 1, false, REGIMEN.orden));
  });

  it('AC-MUS-027 — the reported case: the reflected `L` enters at `#0` on B4', () => {
    // The witness of the bug, as it shows on screen. `L`/0/reflected has its cells at
    // [1,0] [1,1] [1,2] [1,3] [0,0], and the last one, which the playhead steps on first,
    // said `#4`. It is the only test of the file that fixes numbers by hand: the other
    // tests are properties, and a property does not show how the error looked.
    expect(cellTextFor('L', 0, true, REGIMEN.escala)).toEqual([
      { step: 1, note: 'A4' },
      { step: 2, note: 'F#4' },
      { step: 3, note: 'E4' },
      { step: 4, note: 'D4' },
      { step: 0, note: 'B4' },
    ]);
  });
});
