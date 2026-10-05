import { memo } from 'react';
import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import { MINI_BOX, MINI_CELL_PX, MINI_PISTA_PX } from '../pieces/piece-mini.ts';
import { PIECE_COLOR } from '../pieces/palette.ts';
import { miniCells } from '../pieces/piece-mini.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import type { Orientacion, MemoriaDeOrientacion } from '../pieces/orientation.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';

/**
 * The two props objects of the dock, in place of sixteen flat props on `PiecePalette`.
 *
 * The dock holds two different panels: the orientation of the piece in hand and the transport
 * of the instrument. A list of loose props does not say which prop goes with which panel.
 *
 * The three criteria of the split are not obvious:
 *
 * - `regimen` goes with the ORIENTATION although it is global like the tempo, because it
 *   decides WHAT the rotation DOES: with `escala` the rotation changes the scale formula and
 *   with `orden` it changes where the arpeggio starts. Without the regime, the orientation
 *   does not say what sounds.
 * - `noteSet` goes on the same side for the same reason: it is the arpeggio of the piece in
 *   hand IN THAT orientation, and its `useMemo` in the shell depends on the piece in hand,
 *   its orientation and the regime.
 * - `onReset` goes with the TRANSPORT and not with the orientation, because `resetBoard`
 *   empties the board and also stops the clock.
 */

/** The piece in hand: which one it is, how it is oriented, and what a rotation does. */
export interface PropsDeOrientacion {
  selected: PieceKey;
  /**
   * The TWELVE orientations, not only the one of the piece in hand.
   *
   * The whole memory comes down because the slot grid needs the twelve: each thumbnail draws
   * the remembered orientation of **its own** piece. The readers that need only the one of
   * the piece in hand (the orientation readout, the arpeggio) derive it with
   * `orientaciones[selected]` and do not get it as a pair of loose props: two props for one
   * truth are two ways to disagree.
   *
   * `Board` is the exception and gets the loose pair through its own prop: it is the only
   * consumer that does not need the twelve.
   */
  orientaciones: MemoriaDeOrientacion;
  /** What the rotation does. Its row in the dock is the regime selector. */
  regimen: RegimenDeRotacion;
  noteSet: readonly number[];
  onSelect: (piece: PieceKey) => void;
  onRegimen: (regimen: RegimenDeRotacion) => void;
  /**
   * The `0°` button: it returns the piece in hand, and only that one, to 0° without
   * reflection.
   *
   * It takes no piece as an argument: the shell knows which piece is in hand, and a piece
   * passed from the panel would let the component decide what it writes on. `PiecePalette`
   * is presentational (`.agents/rules/ui.md`): it gets callbacks and touches no state.
   */
  onResetOrientacion: () => void;
}

/**
 * The twelve thumbnails, each in the remembered orientation of its piece: they choose the
 * piece in hand.
 *
 * Presentational: no state, no effects. It gets ONE object, the one of the orientation.
 *
 * It returns the `div` of the slot grid with no wrapper: it is a direct child of the dock,
 * and one more node would change the vertical rhythm with the classes intact.
 *
 * It is wrapped in `memo`, and the reason is a number. `hover` lives in `App.tsx`, so each
 * cell that the cursor crosses renders the whole tree again, and these are 337 elements of
 * which none depends on the hover. Measured with `Profiler`, the commit for each crossed
 * cell goes from 4.9 ms to 1.9 ms: 61 % of the work was this subtree, reconciled to give
 * the same DOM.
 *
 * The other half of the barrier is the `useMemo` of the object `orientacion` in `App.tsx`:
 * without it the prop has a new identity on each render and the memo never holds. The full
 * argument is there.
 */
export default memo(function OrientationPanel({ orientacion }: { orientacion: PropsDeOrientacion }) {
  const { selected, orientaciones, onSelect } = orientacion;
  // The SAME derivation as the visible line of the dock, in the other format. The two texts
  // cannot be one: the visible format here would remove the noun "rotación" and add a
  // separator that the screen reader spells out. The CALCULATION can be one, and it is.
  //
  // It is composed TWELVE times and not once: each slot says the orientation of ITS piece,
  // not the one of the piece in hand. With one global orientation the twelve thumbnails
  // would draw the same pair (measured: 11 of 12 moved on each quarter turn) and the
  // `aria-label` would repeat that falsehood to the ear.
  const hablada = (o: Orientacion) => {
    const { grados, reflejada } = textoDeOrientacion(o.rotation, o.mirror);
    return `rotación ${grados}${reflejada === null ? '' : `, ${reflejada}`}`;
  };
  return (
    /* The box of the thumbnail decides the width. It is 5 × `MINI_CELL_PX` = 40 px and
       **depends neither on the piece nor on the orientation**: the worst case is the same
       for the twelve.

       The METRIC to watch is the **effective padding**, `(track - 42) / 2` with the 40 px
       of the box plus 2 px of border, and not the scroll. The `1fr` makes no scroll: the
       content leaves the PADDING of the slot, which has `overflow: visible`. So an overflow
       does not look like an overflow, it looks like space that disappears. It is the metric
       that caught the bug of a table of breakpoints.

       **The browser decides the column count, not a breakpoint.** A breakpoint follows the
       width of the VIEWPORT, and the width of the dock does not: the dock is
       `calc(var(--cell) * 2)` wide and the viewport can be at `xl` all the same. Measured:
       at 1366 x 768 a breakpoint asked for SIX columns inside a box of 256 px, and with the
       cell at its floor it asked for three inside 146 px. The cell is always near 73 px, so
       the box is always near 146 px.
       At 146 px only one column of thumbnails fits, and that is not solved.

       `repeat(auto-fill, minmax(MINI_PISTA_PX, 1fr))` counts against the real box.
       `MINI_PISTA_PX` comes from the box of the thumbnail plus the `px-2` of the slot plus
       its border: the same numbers that draw the thumbnail, not one typed next to them. The
       `1fr` shares out what is left, which keeps the effective padding symmetric with no
       calculation. The `minmax` is what guarantees the metric of the second paragraph. */
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${MINI_PISTA_PX}px, 1fr))` }}
    >
      {/* The background of the slot does NOT take the color of the piece: that background
          is the channel of "selected", and to paint it would leave the slot grid with no
          way to say which piece is in hand. The identity comes through the SHAPE, painted
          in the color of the piece.

          The cells of the thumbnail have a border: some of the 12 colors (the yellow of
          `V`, the lime of `F`) can hardly be seen against the light gray of the slot
          without it. It is also the language of the board, where every tile has a border
          for the same reason. The color of the border is INVERTED with the state, and the
          numbers are below, at the cell.

          The letter stays below, in a small size. It is not decoration: it is the
          vocabulary for the pieces in `describe_piece`, in the `title` of the board and in
          `DESIGN.md`. A shape drawn with `div`s has no accessible name, so the `aria-label`
          says the letter and also the orientation: the screen reader says what the eye
          sees. The thumbnail shows the REMEMBERED orientation, not the canonical one. */}
      {(Object.keys(SHAPES) as PieceKey[]).map(key=> {
        // The orientation of THIS piece, not the one of the piece in hand. The type of the
        // `Record`, derived from `SHAPES`, guarantees its twelve keys, so this access
        // cannot give `undefined`.
        const suya = orientaciones[key];
        const celdas = miniCells(key, suya.rotation, suya.mirror);
        const ocupada = new Set(celdas.map(([x, y]) => `${x},${y}`));
        // One copy of "it is the piece in hand": the background of the slot, the border of
        // the thumbnail and `aria-pressed` read it, and the three must change at the same
        // moment.
        const activo = selected === key;
        // `type="button"` and not the default, here and on every other `<button>` of the
        // app. There is no `<form>` today, so there is no bug. But the default of a
        // `<button>` INSIDE a form is `submit`, and in this app that reloads the page and
        // loses the whole board, with no undo. The rule has no exception: a button of this
        // app never submits anything.
        return (
          <button
            key={key}
            type="button"
            onClick={()=> onSelect(key)}
            aria-label={`${key}, ${hablada(suya)}`}
            aria-pressed={activo}
            className={`px-2 py-1 rounded-lg border text-sm flex flex-col items-center justify-center gap-1 ${activo? 'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
          >
            {/* FIVE fixed tracks and not `min-content` nor `auto`: so the size of the box
                does not depend on which cells are occupied, and a rotation does not move a
                pixel of the slot grid. With automatic tracks the `I` alone would make the
                whole row jump between 5 cells and 1 cell of width. The fixed box exists to
                prevent that reflow.
                It is an inline style and not a class because the number comes from a
                constant, and Tailwind scans the source: an interpolated
                `grid-cols-[repeat(5,8px)]` would not be generated. */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${MINI_BOX}, ${MINI_CELL_PX}px)`,
                gridTemplateRows: `repeat(${MINI_BOX}, ${MINI_CELL_PX}px)`,
              }}
            >
              {Array.from({ length: MINI_BOX * MINI_BOX }, (_, i) => {
                const x = i % MINI_BOX; const y = Math.floor(i / MINI_BOX);
                const llena = ocupada.has(`${x},${y}`);
                // Inline and not `bg-[...]`: Tailwind would not generate a class
                // interpolated from `PIECE_COLOR`. The empty cell stays transparent so
                // that the background of the slot shows, and that one says "selected".
                //
                // The BORDER is INVERTED with the state of the slot, and not for looks: in
                // each state a different set of pieces fails, and the two sets are
                // DISJOINT. The numbers are WCAG 2.1 contrast ratios, measured against the
                // two backgrounds. The criterion here is 1.4.11, a graphical object with a
                // floor of 3:1, and not the APCA with which `palette.ts` chooses the TEXT
                // color:
                //
                //   against `slate-100` (not selected): 7 of 12 below the floor, the worst
                //     is `V` with 1.02: the yellow on the light gray cannot be seen
                //   against `slate-900` (selected): 1 of 12, `W` with 2.08: the pure blue
                //     on the near black
                //
                // `slate-900` gives 16.30 on the light slot and saves the seven, but on the
                // selected slot it gives 1.00: it is the SAME color as the background, so
                // the border does not exist there and `W` has no support. Inverted to
                // `slate-400` it gives 6.96 on the dark slot. One color does not cover the
                // two states: fixed at `slate-400` it would give 2.34 on the light slot, so
                // the seven would lean on a border that is also below the floor.
                return (
                  <div key={i}
                    className={llena ? (activo ? 'border border-slate-400' : 'border border-slate-900') : ''}
                    style={llena ? { background: PIECE_COLOR[key].bg } : undefined}
                  />
                );
              })}
            </div>
            <span className="text-xs leading-none">{key}</span>
          </button>
        );
      })}
    </div>
  );
});
