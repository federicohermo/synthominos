import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { occupantAt, occupantCellIndex } from './placement.ts';
import type { Cell } from '../pieces/transform.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { PlacedPiece, Dims } from './placement.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';
import { cellTextFor } from '../musical-model/cell-text.ts';
import { cellNameFor } from '../accessibility/cell-name.ts';
import type { CeldaOcupada } from '../accessibility/cell-name.ts';
import type { CellText } from '../musical-model/cell-text.ts';
import {
  NOTA_RAZON,
  PASO_RAZON,
  AIRE_RAZON,
  RADIO_RAZON,
  RESERVA_RAZON,
  PASO_ABAJO_RAZON,
  PASO_DERECHA_RAZON,
  ANILLO_FOCO_CLARO_RAZON,
  ANILLO_FOCO_OSCURO_RAZON,
} from '../board-fit/grid-fit.ts';

/**
 * The size of `n` cells, in CSS. It is the only way in which this file talks about sizes.
 *
 * The number lives in the custom property `--cell`, which `use-grid.ts` writes on the root
 * container and which this component inherits.
 *
 * It goes by inline style and never by class, and that is not a preference: Tailwind scans
 * the source, so an interpolated `w-[calc(var(--cell)*1)]` would not be generated.
 */
const celdas = (n: number) => `calc(var(--cell) * ${n})`;
import { PIECE_COLOR } from '../pieces/palette.ts';
import Playhead from '../playback/Playhead.tsx';

/**
 * The central panel: the grid of the board, with the ghost of the next placement.
 *
 * Presentational: no state and no effects, and one imperative line, the `.focus()` with
 * which the arrows move the pointed cell. That line does not contradict it: a change of
 * `tabIndex` does not move the DOM focus, so without that call the `0` and the real focus
 * separate on the first arrow. It is React asking focus of a node that React renders, not
 * hidden state. The shell still decides WHERE the pointed cell is, and it arrives as
 * `hover`, as it does with the mouse.
 *
 * The ghost arrives computed, as `previewCells` and `previewValid`, because the domain
 * knows whether the placement is legal and the view does not.
 *
 * `previewCells` arrives as an ARRAY and not as a `Set`: the index of each cell inside the
 * array is what connects it to its degree, and a `Set` of `"x,y"` keys loses it. It is the
 * same order invariant that the rest of the model lives on.
 *
 * It has no `children` slot and no title of its own: a separate preview and a heading
 * would spend height to repeat what the grid already says.
 *
 * ## What each occupied cell says, and each cell of the ghost
 *
 * The identity of the piece is the background COLOR, and the text of the cell is ITS note,
 * the one it gets from its place in the shape, with the STEP small in the corner (see
 * below: it is the order in which it sounds, not the degree). The letter of the piece is
 * not repeated 5 times.
 *
 * `cell-text.ts` derives the two things the cell says, the note and the `#N`. This file
 * implements no step of that chain: it indexes it.
 *
 * ```
 * occupantCellIndex → cellTextFor → { note, step }
 * ```
 *
 * The derivation lives OUTSIDE and not in a function of this file, because inside a `.tsx`
 * it cannot be tested: `react-refresh/only-export-components` forbids an export that is not
 * the component. Its two rules are written there, with their tests next to them: the step
 * decides the NUMBER and the degree decides the NOTE, and both are read on the CANONICAL
 * shape by index. To repeat them here would be the second copy.
 *
 * ## The number in the corner is the STEP, not the degree
 *
 * What is painted at the bottom right is the position of the cell in the PLAY ORDER
 * (`playOrderByCellIndex`). So **`#0` is always the cell where the circuit enters the
 * piece, and the numbers go up to `#4`, which is always where it leaves**, in the 12 pieces
 * and in the two reflections.
 *
 * The DEGREE is the same number only while there is no reflection: with `mirror` the first
 * note that sounds is the one of degree 4, so with the degree painted the playhead would
 * enter through `#4` and count backwards. Measured on `L`/0/reflected at (1,1): it entered
 * through [0,0], which said `#4`. With a playhead on top, the question the cell answers is
 * "when does this cell sound", not "which place does it have in the scale".
 *
 * The ghost says EXACTLY what the cell will say once placed: the same note, the same step,
 * the same call to `cellTextFor`. The only difference is where the piece, the rotation and
 * the reflection come from (`selected`/`rotation`/`mirror` and not `occ`). The reflection
 * must arrive here because of the step: without it the ghost would promise one numbering
 * and the placed piece would show the reverse.
 *
 * Its background is GRAY and not the color of the piece: the ghost is STATE, where the
 * piece in hand would land, and the color is identity. The pink of the illegal case stays,
 * because it is the only channel that marks an impossible placement besides the cursor.
 *
 * ## `Playhead` covers the cell that has not sounded yet, not this file
 *
 * A piece just placed does not enter the circuit until the cycle closes, and after that it
 * must still wait for its turn. That wait is drawn as a veil on the cell, but NOT from
 * here: the veil is nodes of its own that `Playhead.tsx` creates on top of the grid. The
 * veil lifts cell by cell, five changes at the rate of the interval, and a change at that
 * rate must not go through `useState`.
 *
 * This file renders the cells of the piece with `key={i}` and with no refs and no `data-*`,
 * and it must stay so: a handle for the loop would split the style of one cell between
 * React and the loop.
 *
 * ## The cell holds a tile: it is not a box of a table
 *
 * Each cell holds a rounded TILE with a gap around it. It is not a rectangle with a shared
 * border. It is the language of the reference sheet: the pieces read as tiles laid on the
 * grid and not as cells of a table. The padding of the container makes the separation, and
 * not a `gap`, so the width of the board is exactly `dims.w` × `--cell` and there is no
 * second number to maintain.
 */

interface Props {
  // readonly at the entry, as in board-editing/placement.ts: never mutate what React
  // already received.
  placed: readonly PlacedPiece[];
  previewCells: readonly Cell[];
  previewValid: boolean;
  hover: Cell | null;
  selected: PieceKey;
  rotation: number;
  /** The reflection of the ghost. It moves only the `#N`: the reflection does not change
      the note of a cell, it changes the order in which the cells sound. */
  mirror: boolean;
  /**
   * What the rotation does.
   *
   * It comes down as a prop because `cellTextFor` is called HERE and not in `App.tsx`, and
   * without it the cells would show the notes of the other regime. It holds for the two
   * calls, the placed piece and the ghost, and that makes the ghost promise what the piece
   * will say.
   */
  regimen: RegimenDeRotacion;
  /** `altKey` crosses because `Alt`+click MUTES and does not place or remove:
      the gesture cannot be decided without it. */
  onCellClick: (x: number, y: number, altKey: boolean) => void;
  onCellEnter: (cell: Cell) => void;
  onMouseLeave: () => void;
  /**
   * The DOM focus is inside the board.
   *
   * It is the one thing that `hover` cannot answer alone, because the mouse writes it too,
   * and it decides whether the focus ring is painted: without it, the focus ring would
   * appear under the mouse pointer, which has no focus.
   */
  focoEnTablero: boolean;
  /**
   * The focus entered a cell, or left the board (`null`).
   *
   * One prop for the two halves because they are the same fact told twice, and on the side
   * of the shell the same two lines handle both. `hover` takes the value that arrives: the
   * focused cell IS the pointed cell, and there is none when the focus leaves.
   * `focoEnTablero` is whether something arrived.
   */
  onFoco: (celda: Cell | null) => void;
  /**
   * The pointed cell is a cell of an own piece, so the click will EDIT that piece.
   *
   * It arrives computed by the same pure function that decides the click
   * (`esLaPiezaEnLaMano`), and is not derived here: two copies of that condition would be
   * two ways for the cursor to promise one thing and the click to do another.
   */
  hoverEdita: boolean;
  /** The secondary click on the board toggles the reflection. A handler and not logic:
      `App.tsx` decides whether the event counts, with `reflejaElContextMenu`. */
  onContextMenu: (e: MouseEvent<HTMLDivElement>) => void;
  /**
   * The dimensions of the board, in cells.
   *
   * They arrive as a prop and not from a constant because they come from the viewport, and
   * `useGrilla` measures it in the shell: this component draws `dims.h` rows of `dims.w`
   * cells and does not know where the number came from. The limits of the keyboard movement
   * read them too, and so do the `aria-*` of the grid, which would otherwise give the size
   * of another board.
   */
  dims: Dims;
  /**
   * The node on which `useRuedaRota` (`board-editing/use-input.ts`) hooks the wheel.
   *
   * This component HANGS it and does not read it: the `ref` is created in `App.tsx`, which
   * composes the two input hooks, so there is no state and no effect here.
   */
  boardRef: RefObject<HTMLDivElement | null>;
}

export default function Board({
  placed, previewCells, previewValid, hover, selected, rotation, mirror, regimen,
  onCellClick, onCellEnter, onMouseLeave, focoEnTablero, onFoco, hoverEdita, onContextMenu,
  dims, boardRef,
}: Props) {
  // Which cell of the ghost lands on (x,y), BY INDEX: that lets the cell ask the canonical
  // mapping for its text. It is built once for each render and not once for each cell.
  const ghostIndexAt = new Map(previewCells.map(([x, y], k) => [`${x},${y}`, k]));

  // The anchor of the roving tabindex: the board is ONE tab stop, so only one cell carries
  // `tabIndex={0}` and all the others `-1`. It is the pointed cell, which is `hover`, the
  // one state that the mouse and the focus both write. With no pointed cell it is (0,0), so
  // that `Tab` still has a way in. Without that second half the board would stay out of the
  // tab order until someone touched it with the mouse.
  const [cursorX, cursorY] = hover ?? [0, 0];

  // The keys of the focused cell. They go in the `onKeyDown` of the cell and not in the
  // global listener of `use-input.ts`, because they need to know WHICH cell has the focus,
  // and a `window` listener does not know that. The only part of the global hook is that it
  // does not answer the space bar when the focus is on a cell (`targetEsCelda`), so one
  // press does not edit AND toggle the transport.
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>, x: number, y: number) => {
    // `Enter` and the space bar call the SAME `onCellClick` as the `onClick`, with the same
    // three arguments: the rule of what each gesture does lives in `accionDeClick` and is
    // not written a second time here. So `Alt` is free: mute and place muted are what that
    // pure function already answers with `altKey`. And if `Alt` changes its meaning, the
    // keyboard inherits it and nobody has to remember to change it.
    //
    // On Windows the window menu of the SYSTEM intercepts `Alt` and the space bar, and the
    // event may never reach the page. `Alt`+`Enter` is the guaranteed way, and the one to
    // document. Both combinations stay written: a browser that delivers them runs them. The
    // check in a real window is manual. The `Ctrl`+click of macOS gets the same treatment:
    // it is documented, not ignored.
    //
    // No `preventDefault` for the space bar: `frenaElDefault` already blocks its default,
    // the page scroll, from the global listener, which on purpose is NOT vetoed by
    // `targetEsCelda` so that it covers this case. To repeat it here would be the second
    // copy of that decision.
    if (e.key === 'Enter' || e.key === ' ') { onCellClick(x, y, e.altKey); return; }

    let destinoX = x; let destinoY = y;
    switch (e.key) {
      case 'ArrowLeft': destinoX = x - 1; break;
      case 'ArrowRight': destinoX = x + 1; break;
      case 'ArrowUp': destinoY = y - 1; break;
      case 'ArrowDown': destinoY = y + 1; break;
      // `Home` and `End` do not touch `destinoY`: they go to the first and the last cell of
      // THEIR row, which is what the ARIA `grid` pattern reserves for the pair with no
      // modifier.
      case 'Home': destinoX = 0; break;
      case 'End': destinoX = dims.w - 1; break;
      default: return;
    }
    // It blocks the default ALWAYS, also at the edge where the destination is the same
    // cell: without this the arrow scrolls the page. The wheel gets the same treatment, for
    // the same reason. The board has no second scroll that the arrow could move.
    e.preventDefault();
    // It CLAMPS and does not return through an `if`: at the edge the arrow leaves the focus
    // where it was, which is what "without leaving the grid" asks for. It also adds no four
    // branches that only the four edges can exercise.
    const dx = Math.min(dims.w - 1, Math.max(0, destinoX));
    const dy = Math.min(dims.h - 1, Math.max(0, destinoY));
    // A change of `tabIndex` does NOT move the DOM focus: without this `.focus()` the `0`
    // and the real focus separate on the first arrow. It is React asking focus of a node
    // that React renders, not the loop touching a node that is not its own. The node is
    // reached from the event and not through a `ref`, because the cells have `key={i}` and
    // NO refs and no `data-*`, so that the loop of `Playhead` has no handle. The role is
    // the selector because it is what the cell promises to the screen reader: nobody
    // removes it in a style refactor.
    //
    // The `!` because the ancestor exists by construction: this handler hangs from a node
    // that this same file renders inside the `role="grid"`. The alternative, an `if` that
    // returns early, would be an unreachable branch, and so coverage that cannot be had.
    //
    // The `.focus()` is synchronous and the destination still has `tabIndex={-1}`, because
    // React renders again after the handler. It does not matter: `-1` can take focus from a
    // script, only not from `Tab`. The `onFocus` of the destination cell moves the pointed
    // cell, and then the `0` follows it in the next render.
    const grilla = e.currentTarget.closest('[role="grid"]')!;
    grilla.querySelectorAll<HTMLElement>('[role="gridcell"]')[dy * dims.w + dx].focus();
  };

  // The focus left the board, or it only jumped from one cell to another. `relatedTarget`
  // is the node that receives it, and `contains` tells the two cases apart. Without that
  // question each arrow would remove the pointed cell half way, because a move of the focus
  // is always a `blur` followed by a `focus`. React registers this handler as `focusout`,
  // which bubbles, so one handler on the container covers every cell: the 60 of the
  // reference board or the 390 of a desktop.
  const alSalirElFoco = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) onFoco(null);
  };

  // There is no card and no maximum width: the board IS the screen and the two panels float
  // on top.
  //
  // Two numbers from one place set the size: `board-fit/grid-fit.ts` looks at the viewport
  // and answers HOW MANY cells fit and HOW LARGE each one is. The grid is `dims.w x --cell`
  // by `dims.h x --cell`, and it fills the screen by growing in COUNT and not in size. A
  // tile that grows instead is 180 px at 1920 x 1080, with the note name at 46.8 px, and
  // the board stops reading as a dense instrument.
  return (
    <div className="w-full h-full flex items-center justify-center">
      {/* **No `overflow-x-auto`, no `max-h-full` and no `w-max`**: this component has no
          way to scroll. Those three serve the case "the grid does not fit", and there is no
          such case: `grid-fit.ts` chooses `cols` and `rows` against the real box, and
          `cols * cell <= vw` and `rows * cell <= vh` hold by the definition of `floor`. The
          `overflow-hidden` of the root container is the guarantee, not a safety net. */}
      {/* The playhead mounts HERE, inside the `relative` that wraps the grid: an absolute
          node is positioned against the padding box of its positioned container, so it is
          aligned with the cells by construction and not by arithmetic, and the container
          does not scroll. It is imported directly and does not arrive through a `children`
          slot: `Playhead` receives no props, so it asks nothing of `App`, and a generic
          slot would open again a door that a measurement closed. */}
      {/* The two gestures hook HERE: this div covers exactly the area of the board. This
          div and the `.grid` inside have the same size, so the choice between them changes
          nothing, and the gestures stay on the node of the `ref`.

          They come in differently, and the asymmetry is measured, not chosen: React
          registers its listeners on the root container, and it registers `touchstart`,
          `touchmove` and `wheel` as PASSIVE (react-dom 19.1.1). Inside a passive listener
          `preventDefault()` is a no-op that the browser reports in the console. So an
          `onWheel` in JSX would rotate and not block the scroll, which is the most
          expensive failure: it looks like it works. So the wheel goes through
          `addEventListener(..., { passive: false })` from `use-input.ts`, and only the
          `ref` of the node arrives here. `contextmenu` is not among those three names, so
          the secondary click can go by prop. */}
      <div ref={boardRef} className="relative" onContextMenu={onContextMenu}>
        <Playhead />
        {/* REAL ROWS and not `display: contents` on fake rows. `role="grid"` requires
            `role="row"`. The technique of a flat DOM with `display: contents` on the
            wrapper has a record of REMOVING the node from the accessible tree in several
            browsers: it would fail in silence, and only in some. So there are `dims.h` real
            rows of `dims.w` cells, with no `gap`, and the layout is identical to the pixel.

            So `gridTemplateColumns` is on the row and not on the container: the columns
            belong where the children are the cells, and the children of the container are
            the rows. On the container it would put `dims.h` rows inside a grid of `dims.w`
            columns. The container is a grid with its implicit column: one row on each
            line, with the width of the content. No `w-max`: `grid-fit.ts` guarantees that
            the grid cannot be wider than its box.

            `Playhead` does not notice: it is positioned with `transform` in pixels against
            the positioned container, not with grid placement. */}
        <div
          className="grid"
          role="grid"
          aria-label={`Tablero de ${dims.w} por ${dims.h}`}
          aria-rowcount={dims.h}
          aria-colcount={dims.w}
          onMouseLeave={onMouseLeave}
          onBlur={alSalirElFoco}
        >
          {Array.from({ length: dims.h }, (_, fila) => (
          <div
            key={fila}
            role="row"
            className="grid"
            style={{ gridTemplateColumns: `repeat(${dims.w}, var(--cell))` }}
          >
          {Array.from({ length: dims.w }, (_, columna) => {
            const i = fila * dims.w + columna;
            const x = columna; const y = fila;
            const occ = occupantAt(placed, x, y);
            const ghostIndex = ghostIndexAt.get(`${x},${y}`);
            const ghost = ghostIndex !== undefined;

            // From (x,y) to the note, by a chain of pure functions. The occupied cell asks
            // through `occupantCellIndex`: `occupantAt` already guarantees that the piece
            // covers it, so the index is never -1. The ghost cell carries its index, which
            // is why `previewCells` arrives ordered.
            //
            // `ocupada` is built in the SAME branch and not later, and that keeps the ghost
            // out of the accessible name with no `if` that someone must remember to write:
            // `piece` and `muted` exist only if there is an `occ`, so the cell with a ghost
            // reaches `cellNameFor` as `null`, like a free cell. The long argument is in
            // the docblock of `CeldaOcupada`. To build it in here also avoids a `!` on
            // `cell`: TypeScript knows that in this branch it is not null.
            let cell: CellText | null = null;
            let ocupada: CeldaOcupada | null = null;
            if (occ) {
              cell = cellTextFor(occ.piece, occ.rotation, occ.mirror, regimen)[occupantCellIndex(occ, x, y)];
              ocupada = { piece: occ.piece, muted: occ.muted, cell };
            } else if (ghostIndex !== undefined) {
              cell = cellTextFor(selected, rotation, mirror, regimen)[ghostIndex];
            }

            // The color of the piece is IDENTITY and loses against any STATE: the overlap,
            // the ghost and the hover. So the inline style, which wins over any class, is
            // built only on the occupied cell with no ghost. On the others the background
            // comes from a Tailwind class.
            let tone: string;
            const style: CSSProperties = {};
            if (occ && ghost) tone = 'bg-rose-500 text-white';   // overlap with a placed piece
            // The MUTED piece falls to the white of a free cell and keeps its note and its
            // `#N`. The channel is the ABSENCE of color and not one of the two obvious
            // ones, because both are taken: the color is the IDENTITY of the piece and its
            // contrast is measured against its own `fg`, and `Playhead` uses the opacity
            // for the veil of "this cell has not sounded yet". If the mute also dimmed, a
            // muted piece just placed would look the same as one that waits for its turn.
            //
            // No `style.color`: the text inherits the gray of the board.
            // `PIECE_COLOR[p].fg` is chosen against the `bg` of ITS piece, so on white
            // several cannot be read and some are white.
            //
            // It is not confused with a free cell because a free cell has no text: the same
            // distinction separates a free cell from a ghost cell.
            else if (occ && occ.muted) tone = 'bg-white shadow-sm';
            else if (occ) {
              tone = 'shadow-sm';
              // Inline and not `bg-[...]`: Tailwind scans the source, and a class
              // interpolated from PIECE_COLOR would not be generated.
              style.background = PIECE_COLOR[occ.piece].bg;
              style.color = PIECE_COLOR[occ.piece].fg;
            }
            // Gray and not green: the ghost is state, and the color already says which
            // piece it is. The pink of the illegal case stays: it is the only channel that
            // says "the piece does not fit here" besides the cursor.
            else if (ghost) tone = previewValid ? 'bg-slate-300' : 'bg-rose-300';
            else tone = 'bg-white hover:bg-slate-100';

            // The focus ring goes on the OUTER box, this one, the box of `--cell`, and not
            // on the rounded tile inside, because the tile has no free channel: the
            // background color is the identity of the piece, white is a muted piece, pink
            // is an illegal placement, `slate-300` is the ghost, the border width is the
            // playhead, and the opacity with the dashed border is the veil. The outer box
            // paints nothing, so the focus goes there. That was the last free channel: the
            // next state must take a channel from another.
            //
            // `transform: scale` is FORBIDDEN, although it is the obvious way to enlarge
            // the focused cell: `scale` counts for the SCROLLABLE overflow of the
            // container. The measurement is in the docblock of
            // `playback/playhead-loop.ts`, which made it for the playhead, on a container
            // that scrolled: with the playhead at (9,5) and `scale(1.10)` the
            // `scrollHeight` went from 378 to 381. `outline` and `box-shadow` are ink
            // overflow: they paint and do not enlarge.
            //
            // It goes by inline style and not by class because the two widths come from a
            // constant, and Tailwind scans the source: an interpolated `outline-[${N}px]`
            // would not be generated. The split of the two bands is in `grid-fit.ts`.
            //
            // The two are RATIOS of the cell and not two numbers of 2 px, and the reason is
            // the split itself: the bands are measured in gaps, one on the gap and the next
            // on the tile, and the gap is not fixed. With the two fixed at 2 px, at a cell
            // of 180 px the gap is 4.93 px and the two bands fall inside it: the ring has
            // only one tone, which is what these two numbers exist to avoid.
            const caja: CSSProperties = { width: celdas(1), height: celdas(1), padding: celdas(AIRE_RAZON), borderRadius: celdas(RADIO_RAZON) };
            if (focoEnTablero && x === cursorX && y === cursorY) {
              caja.boxShadow = `inset 0 0 0 ${celdas(ANILLO_FOCO_OSCURO_RAZON)} #0f172a`;
              caja.outline = `${celdas(ANILLO_FOCO_CLARO_RAZON)} solid #fff`;
              caja.outlineOffset = celdas(-(ANILLO_FOCO_OSCURO_RAZON + ANILLO_FOCO_CLARO_RAZON));
            }

            return (
              <div key={i}
                role="gridcell"
                /* Roving tabindex: the `0` travels with the pointed cell and ALL the others
                   stay at `-1`, so the board is ONE tab stop and not one for each cell. One
                   for each cell would make it an exit trap: everything after it would be
                   that many presses away, and the `Shift`+`Tab` back would cost the same.
                   That is 60 presses on the reference board and up to 390 on a desktop.

                   Some cell must ALWAYS carry the `0`, or the whole board falls out of the
                   tab order. So the `?? [0, 0]` above, for when there is no pointed cell.
                   And so the shell clamps `hover` to `dims` before it sends it, because a
                   cell that is not drawn cannot receive it (see `cursor` in `App.tsx`). */
                tabIndex={x === cursorX && y === cursorY ? 0 : -1}
                onClick={(e) => onCellClick(x, y, e.altKey)}
                onKeyDown={(e) => alTeclear(e, x, y)}
                /* The click does NOT focus the cell, and this `preventDefault` is the whole
                   reason: a `div` with `tabIndex` takes focus BY CLICK. Without it, the
                   first mouse click would set `focoEnTablero`, and from then on the
                   `onMouseEnter` below would stay vetoed. Measured in Chromium on the whole
                   shell: after a click on (2,1), a move of the mouse to (7,4) left five
                   cells with text, only the placed piece, against ten with the focus
                   outside. So the ghost froze on the clicked cell and did not follow the
                   mouse again until the focus left the board with `Tab`, and that is the
                   primary gesture of the product.
                   The board loses nothing: the `0` of the roving tabindex travels with
                   `hover`, which the mouse still writes, so the `Tab` after a click lands
                   on the cell that was under the pointer. It also keeps the other half
                   true: the focus enters the board ONLY by keyboard, with `Tab` or an
                   arrow, so the focus ring belongs to the keyboard and does not appear
                   under the mouse. */
                onMouseDown={(e) => e.preventDefault()}
                /* The focus writes the SAME pointed cell as the mouse, so the ghost, the
                   legality and `hoverEdita` work with the keyboard with no new line of
                   drawing. It goes on the cell and not on the container because the name of
                   the fact is "the focus is on THIS cell". */
                onFocus={() => onFoco([x, y])}
                /* With the board focused the mouse does NOT write the pointed cell: the
                   focus decides. It is the same rule that keeps the ghost when the mouse
                   leaves the grid, told from the other side: there is one pointed cell, and
                   while the keyboard has it the mouse is inert until the focus leaves with
                   `Tab`. And "while the keyboard has it" is exact because of the
                   `onMouseDown` above: the focus reaches a cell only by keyboard, so mouse
                   use alone never sets this guard.

                   The alternative was that the mouse DRAGGED the focus, with a `focus()` on
                   the cell it enters, so that the focus ring and the ghost never separated.
                   It failed a MEASUREMENT: a move of the mouse is not the only thing that
                   fires `mouseenter`. Any SCROLL fires it too, because the browser computes
                   again what is under the still pointer. With the focus inside, each
                   `.focus()` of an arrow that scrolled the board by one pixel gave the
                   focus back to the cell under the mouse: in the test of the arrows the
                   pointed cell jumped from (5,2) to (4,0) with nobody touching the mouse. A
                   silent jump of the focus is exactly what this repo hunts. And the ring
                   cannot separate from the ghost on this path, because the mouse moves
                   neither of the two. */
                onMouseEnter={() => { if (!focoEnTablero) onCellEnter([x, y]); }}
                style={caja}
                aria-label={cellNameFor(x, y, ocupada)}
                /* `hoverEdita` enters the cursor: on a cell of an own piece the PLACEMENT
                   is illegal, because the piece overlaps itself, but the click does not
                   place, it removes. Without this the cursor would say "the piece does not
                   fit here" exactly where the gesture is destructive, which is the opposite
                   of what happens. */
                /* The rounding of `caja` paints nothing, because this box has no background
                   and no border. It is there only for the focus ring: `outline` and
                   `box-shadow` follow the radius of the element, so without it the ring
                   would be square around a rounded tile. It repeats the radius of the tile
                   on purpose: the same shape said twice on the same object. With the focus
                   outside it changes no pixel. The two are `RADIO_RAZON` and not two loose
                   `rounded-lg`: a Tailwind class cannot interpolate `--cell`. */
                className={previewValid || !hover || hoverEdita ? 'cursor-pointer' : 'cursor-not-allowed'}
                /* The title says the three things of the cell, not only its coordinate:
                   the note fits in the tile but the step is abbreviated to `#3`, and on
                   the ghost the two decide the placement. It comes from the SAME `cell`
                   that is painted, so it cannot say one note and show another.
                   It IS accessibility, but it is not the only channel: the cell is a
                   `role="gridcell"` with `tabIndex` and with `aria-label`, so it takes
                   focus and has a name. The `title` is the ECHO of that name: the channel
                   of the mouse, shorter because the eye already sees the color and the
                   shape. The full name, with the coordinate in prose and the `de 4` of the
                   step, is what the screen reader announces when the focus enters.
                   The two step numbers are the SAME index of the domain, not renumbered,
                   so that the tooltip does not say `paso 1` on a cell that paints `#0`. */
                title={cell ? `(${x},${y}) · ${cell.note} · paso ${cell.step}` : `(${x},${y})`}
              >
                {/* The tile: the padding of the container makes the separation and the
                    rounding makes the shape. The occupied cell reads as a tile and not as
                    a box of a table, as on the reference sheet.
                    The border is BLACK and on ALL the tiles, occupied or not: on the white
                    panel a `slate-200` border disappears and the board cannot be seen. The
                    cell is reinforced and not the background. The board is not filled,
                    because a painted background takes the lead from the 12 colors, and
                    they are the ones that must speak. */}
                {/* The reserve at the bottom and the `leading-none` are not looks: they
                    let the note grow. What limits it is NOT the width: at 19 px the longest
                    name of the 48 (`D#5`) is 35.4 px wide in a tile of 57 px, so 10.8 px of
                    room on each side. The limit is the `#N`, which is anchored at the
                    bottom while the note is centered in the whole height: they compete for
                    the same space, and at 18 px centered they touched. With the note
                    centered in the height that the `#N` does not use, the 19 px fit with
                    2.3 px of separation, measured.

                    The four numbers of this tile are RATIOS, not only the two fonts: the
                    reserve, the gap, the rounding and the position of the `#N`. If only the
                    letters grew, at a cell of 180 px the note would be tight against a gap
                    of 2 px and a rounding of 8 px, and the tile would read as a box of a
                    table and not as a tile. These numbers exist to avoid that reading. At
                    `--cell = 73` the four give the reference pixels.

                    The `pb` does not move the `#N`: an absolute node is positioned against
                    the PADDING box of the container, so the padding does not push it. */}
                {/* The 1 px border is the ONLY fixed number that survives the variable
                    cell, and this must be said, or the next reader of the file will read
                    it as an oversight. Two reasons:
                    (a) a 1 px line is a DELIMITER and not a typographic element.
                    `DESIGN.md` argues it so: the board is defined by reinforcing the cell,
                    not by filling the background. A proportional line would grow to 2.5 px
                    at a cell of 180 px, where the outlined tiles stop reading as tiles and
                    read as a drawn grid;
                    (b) a border in `calc()` gives fractional pixels that the browser rounds
                    differently on each edge, and on ADJACENT cells that shows as an
                    irregular lattice: the most visible artifact possible on the element
                    that repeats most, up to 390 times.
                    The same argument covers by analogy the other lines that are not
                    converted either, so they are named: the `border-2 border-dashed` of
                    `VELO_TAPA` and the three width levels of the playhead (3/2, 2/1, 2/0)
                    that `DESIGN.md` fixes. They are LEVELS of the same line: if the base
                    border stays at 1 px, what thickens it stays too, or the level is
                    measured against nothing.
                    It does not touch the alignment: the border is drawn INSIDE the box. */}
                <div style={{ ...style, borderRadius: celdas(RADIO_RAZON), paddingBottom: celdas(RESERVA_RAZON), fontSize: celdas(NOTA_RAZON) }}
                  className={`relative w-full h-full border border-slate-900 flex items-center justify-center leading-none font-semibold tabular-nums ${tone}`}>
                  {/* The step goes as the index that the domain returns (0..4), not
                      renumbered: what the cell shows is exactly what the tests and the
                      `playOrder` of the MCP server answer. The `#` and the bottom right
                      corner come from the reference sheet. */}
                  {cell && <span
                    className="absolute font-normal leading-tight opacity-70"
                    style={{ bottom: celdas(PASO_ABAJO_RAZON), right: celdas(PASO_DERECHA_RAZON), fontSize: celdas(PASO_RAZON) }}
                  >#{cell.step}</span>}
                  {cell?.note ?? ''}
                </div>
              </div>
            );
          })}
          </div>
          ))}
        </div>
      </div>
    </div>
  );
}
