import { useEffect, useRef } from 'react';
import { AIRE_RAZON, RADIO_RAZON } from '../board-fit/grid-fit.ts';
import { NOTA, iniciarCabeza, borde } from './playhead-loop.ts';

/** The size of `n` cells, in CSS. See `Board.tsx` and `playhead-loop.ts`. */
const celdas = (n: number) => `calc(var(--cell) * ${n})`;

/**
 * The layer drawn OVER the grid at the pace of the audio: the playhead and the veil of
 * the cells that have not sounded yet.
 *
 * No props and no state, like `Spectrum.tsx` and for the same measured reason: the
 * interval lasts between 0.25 s (60 bpm) and 0.094 s (160 bpm), so between 4 and 10.6
 * changes a second. In `useState` that would render again the whole board, every cell,
 * and the palette. React mounts the two containers and starts the loop; the rest is
 * imperative.
 *
 * ## Who owns which node
 *
 * React owns the TWO containers and nothing more. The loop owns all that hangs from
 * them, the nodes of the veil included, which it creates and destroys by hand. What
 * CANNOT be done is to split the style of one node between React and the loop. So the
 * veil does not dim the cell of `Board`, which React renders: it covers it with a node
 * of its own.
 *
 * The veil is not React state: its cells change one by one, five changes at the pace of
 * the interval, which is exactly the frequency that rules state out here. Nothing of it
 * is in the React tree.
 *
 * ## It goes ABOVE the cells, and that needs `z-10`
 *
 * The tiles of `Board.tsx` are `relative`, so they are POSITIONED elements and paint in
 * document order among themselves. The grid comes after this component in the DOM, so
 * without a `z-index` the layer is UNDER all the cells. And because the empty cell has
 * an opaque background too (`bg-white`), the layer is plainly invisible.
 *
 * The `style` attribute does not show it: `z-10` is a Tailwind class, so a test must
 * read the COMPUTED value, and without the stylesheet loaded that is `auto`.
 * `__tests__/Playhead.browser.test.tsx` checks it on the two layers, with
 * `pointer-events` and the order in the DOM. The other way is to ask `elementFromPoint`
 * what is on top, with hit-testing enabled for an instant because `pointer-events-none`
 * makes it return what is below. It is the only way that looks at the real pixels, and
 * it was not necessary.
 *
 * ## ONE element moves, the cells do not change
 *
 * The alternative is to compute the class of ALL the cells again on each frame: to
 * touch them all to change one. Here the cost of a frame is one arithmetic read and,
 * when the cell changed, one write of `transform`. Measured with sixty cells; a desktop
 * has up to 390, so the argument is stronger.
 *
 * The absolute box is positioned against the `relative` that wraps the grid
 * (`Board.tsx`), so it is aligned with the cells by construction. That container does
 * not scroll.
 *
 * ## What it draws and what it does NOT calculate
 *
 * No arithmetic of paths or of distances: the cell of each offset comes solved in the
 * table that `rutaActiva()` returns. The loop translates a number to a position in
 * pixels and nothing more.
 *
 * The playhead JUMPS and does not slide: the instrument is quantized to the grid of
 * intervals, and a continuous motion would suggest a continuity that does not exist.
 */
export default function Playhead() {
  const capaRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Two refs for the playhead and not one: the `transform` goes on the box of one cell,
  // the one that moves over the grid, and the border on the tile inside, one gap
  // smaller on each side (`AIRE_RAZON`, 2 px at the floor and 4.93 at the ceiling),
  // which has the shape and the rounding of the cell. Drawn on the outer box, it would
  // be a rectangle that covers the separation between cells.
  const resalteRef = useRef<HTMLDivElement>(null);

  // Empty dependencies on purpose: the loop mounts once and reads from the engine and
  // from the pair of sequences by itself, so there is nothing to subscribe again when
  // the app renders again. It is the same shape as `Spectrum.tsx`.
  //
  // The body lives in `playhead-loop.ts` and not here: inside this `.tsx` it could not
  // be exported (`react-refresh/only-export-components`) and so could not be tested.
  // What stays is the mount, the only thing that belongs to the component.
  useEffect(() => iniciarCabeza(capaRef.current, ref.current, resalteRef.current), []);


  // The veil goes BEFORE the playhead in the DOM and with the same `z-10`: so the
  // playhead paints on top, and a cell that has not sounded yet is still highlighted
  // when its turn comes, the same frame where it stops being covered.
  //
  // `display: none` at the start on the playhead: with no clock there is nothing to
  // mark, and mounted visible at (0,0) it would point at a cell that does not sound,
  // until the first frame. `pointer-events-none` on the two because they go OVER the
  // cells and must not take the click that places a piece.
  return (
    <>
      <div ref={capaRef} aria-hidden="true" className="absolute top-0 left-0 z-10 pointer-events-none" />
      <div
        ref={ref}
        aria-hidden="true"
        className="absolute top-0 left-0 z-10 pointer-events-none"
        style={{ width: celdas(1), height: celdas(1), padding: celdas(AIRE_RAZON), display: 'none' }}
      >
        {/* The same box as the tile of `Board.tsx`, the gap and the radius, the two as a
            ratio of `--cell`, so that the border covers the exact cell and not half a
            pixel outside. With a fixed `p-0.5` and `rounded-lg`, at a cell of 180 px the
            ring of the playhead would cover 2 px of gap over a tile that has 4.93. */}
        <div ref={resalteRef} className="w-full h-full" style={{ borderRadius: celdas(RADIO_RAZON), boxShadow: borde(NOTA) }} />
      </div>
    </>
  );
}
