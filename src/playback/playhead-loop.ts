import { playheadOffset } from './engine.ts';
import { rutaActiva, velo, MARCA } from './route-source.ts';
import { AIRE_RAZON, RADIO_RAZON } from '../board-fit/grid-fit.ts';
import type { CeldaPorEstrenar } from './route-source.ts';

/**
 * The draw loop of the playhead and of the veil: all that `Playhead.tsx` runs from its
 * `useEffect`.
 *
 * **It lives in a `.ts` and not in the `.tsx` for a rule of the repo, not for taste.**
 * `react-refresh/only-export-components` forbids a `.tsx` to export anything but the
 * component. Inside `Playhead.tsx` this could not be exported, and so could not be
 * tested. It is the same argument that puts the projection to the engine in
 * `engine-bridge.ts`.
 *
 * The component keeps the only thing that is its own: to mount the two containers and
 * pass their nodes.
 */

/**
 * The fixed values of the playhead and of the veil.
 *
 * `BORDE_POR_KIND` pairs the three thicknesses with the three `MarcaKind`, so the table
 * and the thicknesses stay in one file: apart, they are a pair of numbers that must
 * match and that nothing keeps in sync.
 */

/**
 * The highlight: the cell that sounds THICKENS its border, inward and outward.
 * Nothing more: no fill, no change of color and no `scale`.
 *
 * ## Why the border and not a fill
 *
 * On a sequencer with a dark background the standard is to LIGHT the active step,
 * because the metaphor is an LED. This board has a light theme, a white panel and white
 * empty cells, and there more luminance makes the cell disappear: the yellow of `V`
 * goes to white. A dark fill works (measured: at 30 % the worst case of the 12 pieces,
 * the `W`, gives a delta of L* of 8.8 over a threshold of ~3) but it covers the note
 * that the cell shows, which must stay readable. The border marks the limit and does
 * not cover the content.
 *
 * ## Why it thickens to the TWO sides
 *
 * Inward alone is not enough: ALL the cells already have `border-slate-900`, occupied
 * or not, so to thicken it is a change of degree against a field full of black borders.
 * The outer ring adds the jump in size: the cell reads larger and its box does not
 * grow.
 *
 * ## And why NOT `transform: scale`, which is the obvious way
 *
 * Because `scale` ENLARGES the box for overflow, and `box-shadow` is *ink overflow*: it
 * paints outside and enlarges nothing. The measurement that found it is of an older
 * layout: with the cell at 63 px, a grid of 630 x 378, the playhead at (9,5) and
 * `scale(1.10)`, the `scrollHeight` of the `overflow-x-auto` container that `Board` had
 * went from 378 to 381 and the two scroll bars appeared. The container of today does
 * not scroll: the `overflow-hidden` of the root clips the overflow, so the symptom
 * would be a cell cut at the edge and not a bar. The MECHANISM is the same, and it
 * decides.
 *
 * Slate gray and not a color: color is IDENTITY, which piece it is, and state is never
 * told with hue. It is the same rule that makes the ghost gray and not green.
 */
export const BORDE_COLOR = '#0f172a';

/** The thickness inward and outward, in px. */
export const NOTA = { dentro: 3, fuera: 2 };

/**
 * The crossing: the playhead passes over an OCCUPIED cell when it is not its turn, and
 * the cell sounds a note anyway (`Click.note`).
 *
 * It is neither the own note of a piece nor the click, so its border is the middle step
 * between the other two. DESIGN.md fixes the three numbers: 3/2, 2/1, 2/0.
 */
export const CRUCE = { dentro: 2, fuera: 1 };

/**
 * A strong note, a middle crossing, a faint click.
 *
 * If two of the three looked the same, the playhead would lie about which of the three
 * things happened. The click thickens only inward, and by less: it reads as a light
 * touch.
 */
export const CLICK = { dentro: 2, fuera: 0 };

/** The border step of each `MarcaKind`: the table of the three borders, as data. */
export const BORDE_POR_KIND = { [MARCA.nota]: NOTA, [MARCA.cruce]: CRUCE, [MARCA.click]: CLICK } as const;

/**
 * The classes of the veil are whole literals and not built by concatenation: Tailwind
 * scans the source, so it generates only what is written complete.
 *
 * **The geometry is NOT here**, and that must hold when these two classes change: the
 * gap and the radius are ratios of `--cell`, and a Tailwind class cannot interpolate a
 * custom property. Written here with fixed values, at a cell of 180 px the veil would
 * cover a tile with 4.93 px of gap with a margin of 2 and leave a halo. `rearmar`
 * writes them, next to the four coordinates: the only place that already speaks in
 * pixels.
 *
 * What stays in the class does NOT depend on the size: the positioning, the fill, the
 * color and the border line. The `border-2 border-dashed` stays fixed for the same
 * argument as the 1 px border of the tile, written in `Board.tsx`: it is a delimiter
 * and not a typographic element, and its thickness is a STEP measured against that
 * base line.
 */
export const VELO_CAJA = 'absolute';
export const VELO_TAPA = 'w-full h-full border-2 border-dashed border-slate-900/50 bg-white/60';

/**
 * The size of `n` cells, in CSS. The same function as in `Board.tsx`, written twice on
 * purpose.
 *
 * They are two files that do not import each other and the string is one line: to share
 * it would need one more module to save twenty characters.
 *
 * The number lives in the custom property `--cell`, which `use-grid.ts` writes on the
 * root container. Because this is a `calc()` and not the product in pixels, a resize of
 * the window moves the playhead and the veil and this loop writes nothing.
 */
const celdas = (n: number) => `calc(var(--cell) * ${n})`;

/** What `iniciarCabeza` returns when there are no nodes: a cleanup that cleans nothing. */
const SIN_CABEZA = (): void => {};

/**
 * The `box-shadow` of one thickness: the inner ring always, the outer one only if the
 * step asks for it.
 */
export const borde = ({ dentro, fuera }: { dentro: number; fuera: number }): string =>
  `inset 0 0 0 ${dentro}px ${BORDE_COLOR}` + (fuera > 0 ? `, 0 0 0 ${fuera}px ${BORDE_COLOR}` : '');

/** Which cell of which piece. By piece and not only by cell: see `CeldaPorEstrenar`. */
const claveDe = (e: CeldaPorEstrenar): string => `${e.id}:${e.cell[0]},${e.cell[1]}`;

/**
 * Starts the loop and returns its cleanup.
 *
 * The three nodes are parameters and can be `null`: that is the signature of a
 * `ref.current` just mounted, and the guard below is its translation. Inside a
 * component nobody can exercise that guard, because React assigns the refs before it
 * runs the effects, so the three are always there. Here it is one call.
 */
export function iniciarCabeza(
  capa: HTMLElement | null,
  el: HTMLElement | null,
  resalte: HTMLElement | null,
): () => void {
  if (!capa || !el || !resalte) return SIN_CABEZA;

  // The key of the LAST thing written, not the mark itself: to compare strings avoids
  // a comparison of tuples, and "hidden" is the empty string. It takes the writes from
  // 60 a second down to between 4 and 11, and while paused the loop does not touch the
  // DOM once.
  let dibujado = '';
  let raf = 0;

  let veloVisto: readonly CeldaPorEstrenar[] | null = null;
  let tapas: { entrada: CeldaPorEstrenar; nodo: HTMLElement }[] = [];
  // The loss of the veil is remembered HERE and not in `route-source`: the loop is what
  // sees the playhead pass. Without this, a second placed piece would build the veil
  // again and cover cells that already lost it.
  const estrenadas = new Set<string>();

  const rearmar = (v: readonly CeldaPorEstrenar[]) => {
    capa.replaceChildren();
    tapas = v.map((entrada) => {
      const nodo = document.createElement('div');
      nodo.className = VELO_CAJA;
      nodo.style.left = celdas(entrada.cell[0]);
      nodo.style.top = celdas(entrada.cell[1]);
      nodo.style.width = celdas(1);
      nodo.style.height = celdas(1);
      // The gap and the radius of the tile. They are here and not in the classes
      // `VELO_CAJA`/`VELO_TAPA` because they depend on `--cell`, and a Tailwind class
      // cannot interpolate it. They are the SAME box as the tile of `Board.tsx`: out of
      // line, the veil covers half a pixel outside.
      nodo.style.padding = celdas(AIRE_RAZON);
      if (estrenadas.has(claveDe(entrada))) nodo.style.display = 'none';
      const tapa = document.createElement('div');
      tapa.className = VELO_TAPA;
      tapa.style.borderRadius = celdas(RADIO_RAZON);
      nodo.appendChild(tapa);
      capa.appendChild(nodo);
      return { entrada, nodo };
    });
  };

  const draw = () => {
    // `rutaActiva()` FIRST and `playheadOffset()` after, in that order. `rutaActiva`
    // makes the swap when it sees that the engine ended the cycle. With the offset read
    // first, there would be one frame where an offset of the NEW cycle is drawn on the
    // table of the OLD one, and if the new cycle is shorter that lights a wrong cell.
    // This order leaves no such frame. `velo()` goes in the middle for the same reason:
    // the swap is what changes it.
    const marcas = rutaActiva();
    const v = velo();
    if (v !== veloVisto) {
      veloVisto = v;
      rearmar(v);
    }
    const offset = playheadOffset();

    // A cell loses its veil when the playhead REACHES it, not when the cycle starts: it
    // is the only thing that shows that the play order is not the placement order, and
    // that the turn of the piece comes at one exact instant. Those with offset `null`
    // belong to a piece that has not entered the cycle, so there is no instant to wait
    // for: they are all uncovered at the swap, when `velo()` changes.
    //
    // `>=` and not `===`: if a frame is lost (a hidden tab suspends rAF) the offset has
    // already advanced, and with equality the cell would stay covered until the next
    // cycle.
    //
    // The `>=` also ties this loop to the guard `now < origin` of `playheadOffset`: the
    // swap is decided INSIDE the lookahead, and if in that frame the playhead answered
    // the tail of the new cycle, the MAXIMUM offset, this `for` would uncover the five
    // cells at once, in the same frame where they were created. If `playheadOffset`
    // ever stops returning `null` before the origin, this comes back in silence.
    if (offset !== null) {
      for (const { entrada, nodo } of tapas) {
        if (entrada.offset === null || nodo.style.display === 'none') continue;
        if (offset < entrada.offset) continue;
        nodo.style.display = 'none';
        estrenadas.add(claveDe(entrada));
      }
    }

    const marca = offset === null ? null : marcas[offset] ?? null;
    // `marca.kind` and not a boolean in the key: with three cases, two marks on the
    // same cell with a different kind (a note and a crossing, for example if the
    // sequence passed there again at another offset) cannot be deduplicated as one.
    const clave = marca ? `${marca.cell[0]},${marca.cell[1]},${marca.kind}` : '';
    if (clave !== dibujado) {
      dibujado = clave;
      if (!marca) {
        el.style.display = 'none';
      } else {
        // Inline and not Tailwind classes: the coordinates come from `var(--cell)` and
        // not from a constant, and the browser resolves that custom property on each
        // element. The base reason is the same, Tailwind scans the source and does not
        // generate an interpolated class, and there is one more: with the position
        // written in `calc()`, a resize of the window moves the playhead and this loop
        // writes nothing again. That keeps it aligned while the edge of the window is
        // dragged with the transport running.
        el.style.display = 'block';
        el.style.transform = `translate(${celdas(marca.cell[0])}, ${celdas(marca.cell[1])})`;
        resalte.style.boxShadow = borde(BORDE_POR_KIND[marca.kind]);
      }
    }

    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(raf);
    capa.replaceChildren();
  };
}
