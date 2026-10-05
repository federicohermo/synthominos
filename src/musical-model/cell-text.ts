import {
  degreeByCellIndex,
  playOrderByCellIndex,
  notesForRotation,
  midiName,
  BASE_MAP,
  DEFAULT_OCTAVE,
} from './music.ts';
import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { RegimenDeRotacion } from './music.ts';

/**
 * What a cell SHOWS: its note and its step.
 *
 * It crosses the boundary between this module, which derives it, and `Board.tsx`, which
 * paints it, like `Marca` for the playhead.
 */
export interface CellText {
  /**
   * The STEP: the position of the cell in the order in which the arpeggio sounds
   * (`0..4`). It is the `#N` of the corner, and the reflection moves it.
   */
  step: number;
  /**
   * The name of the note that sounds in the cell (`"C4"`, `"D#5"`, …). It comes from the
   * DEGREE against the ascending arpeggio, and the reflection does NOT move it.
   */
  note: string;
}

// The memo of `cellTextFor`, explained in its docblock: 192 entries at most (96
// orientations x 2 regimes), and one for each orientation, not one for each render. It is
// in the module and not in the component on purpose.
const memo = new Map<string, readonly CellText[]>();

/**
 * What each cell of an orientation says: its note and its step, BY INDEX on the
 * canonical shape.
 *
 * Element `k` belongs to `SHAPES[piece][k]`, and so to cell `k` of a piece that is
 * rotated, reflected and translated.
 *
 * ## Why it is a module and not a function inside `Board.tsx`
 *
 * Because the bug lived there. The `#N` of the cell came from the DEGREE, which is the
 * right answer to "which note does this cell have" and the wrong one to "when does this
 * cell sound": in the 48 reflected orientations the playhead entered at `#4` and counted
 * backward. Inside a `.tsx` that derivation has no test:
 * `react-refresh/only-export-components` forbids the file to export anything that is not
 * the component. So the only possible test was that of the pure functions of the domain,
 * which were right: `playOrderByCellIndex` can be perfect and the component can still ask
 * it for the other number. It is the same move that took the domain out of `App.tsx`, and
 * the same reason that `route-source.ts` is not inside `Playhead.tsx`.
 *
 * ## The two pairs, and why they are two calls to the domain and not one
 *
 * - The STEP decides the NUMBER: `playOrderByCellIndex(shape, mirror)`.
 * - The DEGREE decides the NOTE: `notesForRotation(...)[degree]`, the ASCENDING arpeggio.
 *
 * To cross them compiles and sounds mirrored. `arp` is the ascending arpeggio, so
 * `arp[step]` gives the reflected note in every piece with `mirror`. The other mix, to
 * number by degree, is exactly the bug that this module exists to keep under test.
 *
 * ## The memo
 *
 * `degreeByCellIndex` sorts, there is one call for each cell and each render (up to 390
 * cells on a desktop), and there is one render for each move of the pointer. The domain
 * is CLOSED and small: 12 pieces x 4 rotations x 2 reflections x 2 regimes are 192
 * entries. So the memo is in the module and not inside the component: it survives the
 * render and is not built again on each one. It is not state of the app: nobody can
 * observe it, and for the same input it always returns the same. It is the same argument
 * with which `palette.ts` stores `fg` and does not compute the luminance again.
 *
 * The REFLECTION is in the key. Without it, the first orientation rendered would stick to
 * the other one: the ghost would promise one numbering and the placed piece would show
 * the reverse.
 *
 * The REGIME is in the key too, for the same reason and with a worse consequence. This
 * `Map` belongs to the module, survives the render, and NO linter looks at it; the
 * dependency arrays of the `useMemo` calls of `App.tsx` at least have `exhaustive-deps`.
 * Without the regime in the key, a regime change would derive the audio again and leave
 * the cells with the notes of the regime before FOREVER: a regime change that is true in
 * the audio and false on the screen.
 */
export function cellTextFor(piece: PieceKey, rotation: number, mirror: boolean, regimen: RegimenDeRotacion): readonly CellText[] {
  const key = `${piece}${rotation}${mirror}${regimen}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const arp = notesForRotation(BASE_MAP[piece], DEFAULT_OCTAVE, rotation, regimen);
  const pasos = playOrderByCellIndex(SHAPES[piece], mirror);
  const fresh: readonly CellText[] = degreeByCellIndex(SHAPES[piece])
    .map((degree, k) => ({ step: pasos[k], note: midiName(arp[degree]) }));
  memo.set(key, fresh);
  return fresh;
}
