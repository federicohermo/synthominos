import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import Board from '../Board.tsx';
import {
  CELL_PX_OBJETIVO,
  ANILLO_FOCO_CLARO_RAZON,
  ANILLO_FOCO_OSCURO_RAZON,
} from '../../board-fit/grid-fit.ts';
import { GRID_DEFAULT, cellsAt } from '../placement.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.ts';
import { REGIMEN } from '../../musical-model/music.ts';
import { rotateN } from '../../pieces/transform.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../placement.ts';
import type { Cell } from '../../pieces/transform.ts';

/**
 * The board: 60 cells, five tones and one `title` per cell.
 *
 * The tests check the hierarchy of channels that `Board.tsx` argues, **the piece color is
 * IDENTITY and loses against any STATE**, and two layout measurements: that the board is
 * `GRID_W × --cell` wide, and that it scrolls neither the board nor the PAGE.
 *
 * The last two need a browser with a viewport: jsdom has no layout and no scroll, so the
 * claim "the page does not scroll" would be trivially true and would check nothing.
 *
 * ## The test writes `--cell`, and that is part of what it checks
 *
 * The cell size is not a constant: it travels in a custom property that `use-grid.ts`
 * puts on the ROOT container of the app. `Board` is mounted alone here, without that
 * container. So with no `--cell`, `repeat(10, var(--cell))` is invalid and the grid
 * collapses to one column. To write it on the node that the test mounts also checks the
 * INHERITANCE: if a measure of the tile stops reading `--cell`, it stops following this
 * value and the assertions below say so.
 */

/** Puts `--cell` on the render container, as the shell does on its root. */
const conCelda = (container: HTMLElement, px: number) => {
  container.style.setProperty('--cell', `${px}px`);
  return container;
};
// These tests draw the REFERENCE board: their numbers (the 60 cells, the width of the
// board, the cell (9,5)) describe that size. `grid-fit.test.ts` covers that the real
// board comes from the box. The test of AC-FIT-009 below, which renders three different
// sizes, covers that the component draws what it is told.
const { w: GRID_W, h: GRID_H } = GRID_DEFAULT;

const colocar = (piece: PieceKey, x: number, y: number, muted = false): PlacedPiece => ({
  id: piece,
  piece,
  rotation: 0,
  mirror: false,
  cells: cellsAt(rotateN(SHAPES[piece], 0), ANCHOR_INDEX[piece], x, y),
  muted,
});

type Props = Parameters<typeof Board>[0];

const props = (over: Partial<Props> = {}): Props => ({
  dims: GRID_DEFAULT,
  placed: [],
  previewCells: [],
  previewValid: true,
  hover: null,
  selected: 'F',
  rotation: 0,
  mirror: false,
  regimen: REGIMEN.escala,
  onCellClick: vi.fn(),
  onCellEnter: vi.fn(),
  onMouseLeave: vi.fn(),
  focoEnTablero: false,
  onFoco: vi.fn(),
  hoverEdita: false,
  onContextMenu: vi.fn(),
  boardRef: { current: null },
  ...over,
});

/**
 * The 60 cell boxes, in index order: `i = y * GRID_W + x`.
 *
 * By ROLE and not by structure: the grid is six `role="row"` of ten cells, so
 * `div.grid > div` returns the six rows. The role also survives a move of
 * `gridTemplateColumns` to another level, which is exactly the change that breaks a
 * structural selector.
 */
const celdas = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="gridcell"]')] as HTMLElement[];

const enIndice = (container: HTMLElement, x: number, y: number) => celdas(container)[y * GRID_W + x];
/** The tile inside, which carries the tone and the color. */
const baldosa = (celda: HTMLElement) => celda.firstElementChild as HTMLElement;

describe('Board', () => {
  it('AC-FIT-013 — there are GRID_W × GRID_H cells, and each one has the size that `--cell` says', async () => {
    const { container } = await render(<Board {...props()} />);
    expect(celdas(container).length).toBe(GRID_W * GRID_H);

    // At the target cell size and at 180 px: the cell follows the value, which is what
    // the custom property promises and what a constant cannot give.
    for (const px of [CELL_PX_OBJETIVO, 180]) {
      conCelda(container, px);
      const c = enIndice(container, 0, 0).getBoundingClientRect();
      expect(Math.round(c.width), `${px}`).toBe(px);
      expect(Math.round(c.height), `${px}`).toBe(px);
    }
  });

  it('AC-FIT-014 AC-FIT-015 — the measures of the tile are RATIOS: at 180 px they give the same as at the target', async () => {
    // Not only the two fonts. The space under the note name, the gap, the corner radius
    // and the position of the `#N` decide that the tile reads as a tile and not as a box
    // of a table: if only the letters grew, at a cell size of 180 px the note name would
    // be tight against a gap of 2 px.
    const { container } = await render(<Board {...props({ placed: [colocar('F', 3, 2)] })} />);
    const razones = (px: number) => {
      conCelda(container, px);
      const celda = enIndice(container, 3, 2);
      const tile = baldosa(celda);
      const paso = tile.querySelector('span')!;
      const cs = getComputedStyle(celda);
      const ct = getComputedStyle(tile);
      const cp = getComputedStyle(paso);
      return {
        aire: parseFloat(cs.paddingTop) / px,
        radio: parseFloat(ct.borderTopLeftRadius) / px,
        reserva: parseFloat(ct.paddingBottom) / px,
        nota: parseFloat(ct.fontSize) / px,
        pasoTamano: parseFloat(cp.fontSize) / px,
        pasoAbajo: parseFloat(cp.bottom) / px,
      };
    };

    const alPiso = razones(CELL_PX_OBJETIVO);
    const alTecho = razones(180);
    // That the layout exists: in jsdom all of this would be 0 and the two would be equal
    // because both are empty.
    expect(alPiso.nota).toBeGreaterThan(0);
    for (const clave of Object.keys(alPiso) as (keyof typeof alPiso)[]) {
      // The tolerance is ±0.5 px on the smaller cell, which is the rounding of the
      // browser and not a slack of the criterion.
      expect(alTecho[clave], clave).toBeCloseTo(alPiso[clave], 2);
    }
    // At the target the px are the measured ones: the note name at 19 and the `#N` at 13.
    expect(alPiso.nota * CELL_PX_OBJETIVO).toBeCloseTo(19, 0);
    expect(alPiso.pasoTamano * CELL_PX_OBJETIVO).toBeCloseTo(13, 0);
  });

  it('AC-FIT-016 — the border of 1 px does NOT scale, and it still separates at 180 px', async () => {
    // It is the only fixed number of the tile: a hairline is a delimiter and not a
    // typographic element, and in `calc()` it would give fractions that the browser
    // rounds differently on each edge. On 60 adjacent cells, that is an irregular lattice.
    const { container } = await render(<Board {...props({ placed: [colocar('F', 3, 2)] })} />);
    for (const px of [CELL_PX_OBJETIVO, 180]) {
      conCelda(container, px);
      const ancho = getComputedStyle(baldosa(enIndice(container, 3, 2))).borderTopWidth;
      expect(ancho, `${px}`).toBe('1px');
    }
  });

  it('AC-FIT-009 — the board has the size that `dims` and `--cell` say, and nothing scrolls', async () => {
    // The board always fits: `grillaPara` chooses `cols` and `rows` against the box, so
    // `cols * cell <= vw`. What the test must fix is that no way to scroll stays: not the
    // board, not the page, not with a small window.
    await page.viewport(375, 800);
    try {
      // Three very different boards, one of them wider than the window of 375 px at the
      // target cell size: the component draws what it is told.
      for (const dims of [GRID_DEFAULT, { w: 5, h: 9 }, { w: 26, h: 15 }]) {
        const { container, unmount } = await render(<Board {...props({ dims })} />);
        const cell = Math.min(375 / dims.w, 800 / dims.h);
        conCelda(container, cell);
        const grilla = container.querySelector('[role="grid"]')!;
        expect(Math.round(grilla.getBoundingClientRect().width), `${dims.w}x${dims.h}`)
          .toBe(Math.round(dims.w * cell));
        expect(container.querySelectorAll('[role="gridcell"]').length).toBe(dims.w * dims.h);

        // The board does not scroll, because no container can…
        const caja = container.querySelector('div.relative')!;
        expect(caja.scrollWidth, `${dims.w}x${dims.h}`).toBeLessThanOrEqual(caja.clientWidth + 1);
        // …and the page does not either.
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          document.documentElement.clientWidth + 1,
        );
        await unmount();
      }
    } finally {
      await page.viewport(800, 600);
    }
  });

  it('the occupied cell has the color of ITS piece, inline', async () => {
    const { container } = await render(<Board {...props({ placed: [colocar('F', 2, 2)] })} />);
    const ocupada = colocar('F', 2, 2).cells[0];
    const b = baldosa(enIndice(container, ocupada[0], ocupada[1]));

    // Inline and not a class: Tailwind scans the source, so it would not generate a
    // `bg-[...]` interpolated from `PIECE_COLOR`.
    expect(b.style.background).not.toBe('');
    expect(b.style.color).not.toBe('');
    expect(b.className).toContain('shadow-sm');
  });

  it('AC-BRD-012 — the MUTED piece turns white and keeps its note and its #N', async () => {
    // The channel is the ABSENCE of color, and not one of the two obvious ones: the color
    // is the identity of the piece, and `Playhead` uses the opacity for the veil.
    const [x, y] = colocar('F', 2, 2).cells[0];
    const { container } = await render(<Board {...props({ placed: [colocar('F', 2, 2, true)] })} />);
    const celda = enIndice(container, x, y);
    const b = baldosa(celda);

    expect(b.className).toContain('bg-white');
    expect(b.style.background).toBe('');
    // It is not confused with a free cell because a free cell has no text.
    expect(b.textContent).not.toBe('');
    expect(b.querySelector('span')!.textContent).toMatch(/^#\d$/);
    // The coordinate comes from `cells[0]` itself, which is NOT the grip cell: `cells[0]`
    // is the first cell of the array, a different thing.
    expect(celda.getAttribute('title')).toMatch(new RegExp(`^\\(${x},${y}\\) · .+ · paso \\d$`));
  });

  it('AC-BRD-013 — the overlap with a placed piece wins over the color', async () => {
    // The piece color is IDENTITY and loses against any STATE.
    const pieza = colocar('F', 2, 2);
    const [x, y] = pieza.cells[0];
    const { container } = await render(
      <Board {...props({ placed: [pieza], previewCells: [[x, y] as Cell], previewValid: false })} />,
    );
    const b = baldosa(enIndice(container, x, y));
    expect(b.className).toContain('bg-rose-500');
    expect(b.style.background).toBe('');
  });

  it('AC-BRD-013 — the ghost is gray when the placement is legal and pink when it is not', async () => {
    const gris = await render(<Board {...props({ previewCells: [[5, 5] as Cell], previewValid: true })} />);
    expect(baldosa(enIndice(gris.container, 5, 5)).className).toContain('bg-slate-300');
    await gris.unmount();

    const rosa = await render(<Board {...props({ previewCells: [[5, 5] as Cell], previewValid: false })} />);
    // The pink is the only channel that says "it does not fit here", apart from the cursor.
    expect(baldosa(enIndice(rosa.container, 5, 5)).className).toContain('bg-rose-300');
  });

  it('a free cell has no text, and its title says only the coordinate', async () => {
    const { container } = await render(<Board {...props()} />);
    const celda = enIndice(container, 7, 4);
    expect(baldosa(celda).textContent).toBe('');
    expect(celda.getAttribute('title')).toBe('(7,4)');
  });

  it('the ghost promises the note that the piece will say, with the regime it receives', async () => {
    // The same `regimen` governs the two calls to `cellTextFor`, the one of the placed
    // piece and the one of the ghost.
    const celdasF = colocar('F', 2, 2).cells;
    const escala = await render(
      <Board {...props({ previewCells: celdasF, regimen: REGIMEN.escala })} />,
    );
    const notaEscala = enIndice(escala.container, celdasF[0][0], celdasF[0][1]).getAttribute('title');
    await escala.unmount();

    const orden = await render(
      <Board {...props({ previewCells: celdasF, regimen: REGIMEN.orden, rotation: 1 })} />,
    );
    const notaOrden = enIndice(orden.container, celdasF[0][0], celdasF[0][1]).getAttribute('title');

    expect(notaEscala).toMatch(/paso \d$/);
    expect(notaOrden).not.toBe(notaEscala);
  });

  it('the click gives the cell and the altKey, which is what tells mute from place', async () => {
    const onCellClick = vi.fn();
    const { container } = await render(<Board {...props({ onCellClick })} />);

    enIndice(container, 3, 1).click();
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, false);

    enIndice(container, 3, 1).dispatchEvent(
      new MouseEvent('click', { bubbles: true, altKey: true }),
    );
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, true);
  });

  it('the pointer enters and leaves, and the secondary click reaches the handler', async () => {
    const onCellEnter = vi.fn();
    const onMouseLeave = vi.fn();
    const onContextMenu = vi.fn();
    const { container } = await render(
      <Board {...props({ onCellEnter, onMouseLeave, onContextMenu })} />,
    );

    enIndice(container, 4, 2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.waitFor(() => expect(onCellEnter).toHaveBeenCalledWith([4, 2]));

    container.querySelector('[role="grid"]')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await vi.waitFor(() => expect(onMouseLeave).toHaveBeenCalled());

    // `contextmenu` is NOT one of the three events that React registers as passive, so
    // the secondary click can go through a prop.
    container.querySelector('div.relative')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(onContextMenu).toHaveBeenCalled();
  });

  it('AC-BRD-015 — the cursor says "not allowed" except where the click EDITS', async () => {
    // On a cell of an own piece the placement is illegal, because the piece overlaps
    // itself, but the click does not place: it removes. Without `hoverEdita` the cursor
    // would say the opposite of what occurs, exactly where the gesture is destructive.
    const base = { previewValid: false, hover: [2, 2] as Cell };

    const prohibido = await render(<Board {...props({ ...base, hoverEdita: false })} />);
    expect(enIndice(prohibido.container, 0, 0).className).toContain('cursor-not-allowed');
    await prohibido.unmount();

    const edita = await render(<Board {...props({ ...base, hoverEdita: true })} />);
    expect(enIndice(edita.container, 0, 0).className).toContain('cursor-pointer');
    await edita.unmount();

    // With no pointed cell there is no placement to forbid.
    const sinHover = await render(<Board {...props({ previewValid: false, hover: null })} />);
    expect(enIndice(sinHover.container, 0, 0).className).toContain('cursor-pointer');
  });

  it('the board ref is on the node that wraps the board, where the wheel listener attaches', async () => {
    const boardRef: { current: HTMLDivElement | null } = { current: null };
    const { container } = await render(<Board {...props({ boardRef })} />);
    expect(boardRef.current).toBe(container.querySelector('div.relative'));
  });
});

/**
 * The keyboard: the board is ONE tab stop, the arrows move the focus inside it, and the
 * four edits come from the same pure function as the click.
 *
 * It needs a real browser and not jsdom, for the same reason as the measurements above:
 * the tests check WHERE the DOM focus is after a key, and that the focus ring does not
 * make the scroll area larger. Both are real layout and real focus.
 */
const tecla = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(evento);
  return evento;
};

describe('Board: the keyboard and the focus', () => {
  it('AC-ACC-012 — it is a `grid` of six rows by ten cells, with ONE tab stop', async () => {
    // Real rows and not `display: contents`: `role="grid"` requires `role="row"`, and the
    // technique of the transparent wrapper has a record of REMOVING the node from the
    // accessible tree in several browsers. That is a silent failure, exactly in what the
    // grid exists to give.
    const { container } = await render(<Board {...props()} />);
    const grilla = container.querySelector('[role="grid"]')!;
    const filas = [...grilla.querySelectorAll('[role="row"]')];
    expect(filas.length).toBe(GRID_H);
    for (const fila of filas) expect(fila.querySelectorAll('[role="gridcell"]').length).toBe(GRID_W);

    // Sixty tab stops would make the board an exit trap: what comes after the board would
    // be sixty key presses away, in each direction.
    expect(celdas(container).filter(c => c.tabIndex === 0).length).toBe(1);
  });

  it('AC-ACC-014 — the `0` starts on the first cell and travels with the pointed cell', async () => {
    // With no pointed cell the anchor cell is (0,0), so that `Tab` still has a way in.
    // With a pointed cell, the `0` is on it.
    const sinCursor = await render(<Board {...props()} />);
    expect(enIndice(sinCursor.container, 0, 0).tabIndex).toBe(0);
    await sinCursor.unmount();

    const conCursor = await render(<Board {...props({ hover: [4, 2] as Cell })} />);
    expect(enIndice(conCursor.container, 4, 2).tabIndex).toBe(0);
    expect(enIndice(conCursor.container, 0, 0).tabIndex).toBe(-1);
  });

  it('AC-ACC-015 — the arrows move the focus one cell and block the default, and stay inside the board', async () => {
    const { container } = await render(<Board {...props({ hover: [0, 0] as Cell })} />);
    const origen = enIndice(container, 0, 0);
    origen.focus();

    // Without `preventDefault` the arrow scrolls the page.
    expect(tecla(origen, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(enIndice(container, 1, 0));
    tecla(enIndice(container, 1, 0), 'ArrowDown');
    expect(document.activeElement).toBe(enIndice(container, 1, 1));
    tecla(enIndice(container, 1, 1), 'ArrowLeft');
    expect(document.activeElement).toBe(enIndice(container, 0, 1));
    tecla(enIndice(container, 0, 1), 'ArrowUp');
    expect(document.activeElement).toBe(origen);

    // At the edge the arrow does not leave: the focus stays on its cell, and the default
    // is still blocked, because the scroll to prevent is the same.
    expect(tecla(origen, 'ArrowUp').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(origen);
    tecla(origen, 'ArrowLeft');
    expect(document.activeElement).toBe(origen);

    const ultima = enIndice(container, GRID_W - 1, GRID_H - 1);
    ultima.focus();
    tecla(ultima, 'ArrowRight');
    expect(document.activeElement).toBe(ultima);
    tecla(ultima, 'ArrowDown');
    expect(document.activeElement).toBe(ultima);
  });

  it('`Home` and `End` go to the ends of THEIR row, not of the board', async () => {
    const { container } = await render(<Board {...props()} />);
    const media = enIndice(container, 5, 3);
    media.focus();

    tecla(media, 'End');
    expect(document.activeElement).toBe(enIndice(container, GRID_W - 1, 3));
    tecla(enIndice(container, GRID_W - 1, 3), 'Home');
    expect(document.activeElement).toBe(enIndice(container, 0, 3));
  });

  it('AC-ACC-018 — a key that the board does not use blocks nothing and does not move the focus', async () => {
    // `Shift` and `Ctrl` still rotate and reflect with a cell focused: the board keeps the
    // space bar, `Enter` and the arrows, and lets everything else pass.
    const { container } = await render(<Board {...props()} />);
    const celda = enIndice(container, 2, 2);
    celda.focus();
    expect(tecla(celda, 'Shift').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(celda);
  });

  it('AC-ACC-019 — `Enter` and `Space` do what the click does, and with `Alt` what `Alt`+click does', async () => {
    // The four come from `accionDeClick` because the four enter through the SAME
    // `onCellClick` as the `onClick`: the rule is not written a second time.
    const onCellClick = vi.fn();
    const { container } = await render(<Board {...props({ onCellClick })} />);
    const celda = enIndice(container, 3, 1);

    tecla(celda, 'Enter');
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, false);
    tecla(celda, ' ');
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, false);
    tecla(celda, 'Enter', { altKey: true });
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, true);
    tecla(celda, ' ', { altKey: true });
    expect(onCellClick).toHaveBeenLastCalledWith(3, 1, true);
  });

  it('AC-ACC-021 — the focus enters a cell and leaves the board, and a move between cells is NOT a departure', async () => {
    const onFoco = vi.fn();
    const { container } = await render(<Board {...props({ onFoco })} />);
    const celda = enIndice(container, 2, 4);
    celda.focus();
    await vi.waitFor(() => expect(onFoco).toHaveBeenLastCalledWith([2, 4]));

    // A move of the focus is always a `blur` followed by a `focus`: without the question
    // about `relatedTarget`, each arrow would clear the pointed cell on the way.
    onFoco.mockClear();
    tecla(celda, 'ArrowRight');
    await vi.waitFor(() => expect(onFoco).toHaveBeenLastCalledWith([3, 4]));
    expect(onFoco).not.toHaveBeenCalledWith(null);

    // To leave the board does clear it, as the `onMouseLeave` does.
    onFoco.mockClear();
    enIndice(container, 3, 4).blur();
    await vi.waitFor(() => expect(onFoco).toHaveBeenLastCalledWith(null));
  });

  it('AC-ACC-022 — with the focus in the board the mouse is INERT, and with no focus it sets the pointed cell', async () => {
    // While the focus is inside, the focus decides. With no focus the mouse sets the
    // pointed cell.
    const onCellEnter = vi.fn();
    const sinFoco = await render(<Board {...props({ onCellEnter })} />);
    enIndice(sinFoco.container, 4, 2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.waitFor(() => expect(onCellEnter).toHaveBeenCalledWith([4, 2]));
    await sinFoco.unmount();

    // A version where the mouse DRAGS the focus fails, and that was measured: not only a
    // move of the mouse fires `mouseenter`, any scroll also fires it, because the browser
    // recalculates what is under the still pointer. So each `.focus()` of an arrow that
    // scrolls returns the focus to the cell under the mouse. The test asserts the two
    // halves: that the pointed cell does not move AND that the focus goes nowhere.
    onCellEnter.mockClear();
    const conFoco = await render(<Board {...props({ onCellEnter, focoEnTablero: true, hover: [0, 0] as Cell })} />);
    const ancla = enIndice(conFoco.container, 0, 0);
    ancla.focus();
    enIndice(conFoco.container, 4, 2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    expect(onCellEnter).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(ancla);
  });

  it('AC-ACC-024 AC-FIT-017 — the focus ring is for the KEYBOARD: it shows with the focus inside and not under the mouse', async () => {
    // Two properties and not one: a CSS `outline` has one color only, and under it can be
    // the `#FFFF00` of the `V` or the `#0000FF` of the `W`.
    const conMouse = await render(<Board {...props({ hover: [4, 2] as Cell })} />);
    expect(enIndice(conMouse.container, 4, 2).style.outline).toBe('');
    expect(enIndice(conMouse.container, 4, 2).style.boxShadow).toBe('');
    await conMouse.unmount();

    const conFoco = await render(<Board {...props({ hover: [4, 2] as Cell, focoEnTablero: true })} />);
    const enfocada = enIndice(conFoco.container, 4, 2);
    expect(enfocada.style.outline).toContain('calc(');
    // The ring is a RATIO of the cell size, so the test reads the COMPUTED value and not
    // the written string: a comparison with the literal would tie the test to the syntax
    // of the `calc()` and not to the size of the ring. It is checked at 180 px, where the
    // bug lives: with the two widths fixed at 2 px, at a cell size of 180 px the gap is
    // 4.93 px and the two bands fall inside it. The light band does not reach the tile
    // and the ring has one tone only.
    conCelda(conFoco.container, 180);
    const cs = getComputedStyle(enfocada);
    // Chromium rounds `outline-width` and `outline-offset` to WHOLE pixels, so they are
    // compared against the floor/ceil pair and not with an equality: 4.93 computes to 4.
    // What matters is that they GROW with the cell (at 73 px they are 2 and -4), not the
    // decimal.
    const entre = (valor: number, exacto: number) => {
      expect(valor).toBeGreaterThanOrEqual(Math.floor(exacto));
      expect(valor).toBeLessThanOrEqual(Math.ceil(exacto));
    };
    entre(parseFloat(cs.outlineWidth), 180 * ANILLO_FOCO_CLARO_RAZON);
    entre(parseFloat(cs.outlineOffset), -180 * (ANILLO_FOCO_OSCURO_RAZON + ANILLO_FOCO_CLARO_RAZON));
    expect(parseFloat(cs.outlineWidth)).toBeGreaterThan(2);
    expect(cs.boxShadow).toContain('inset');
    // One cell only has the ring, as one only has `tabIndex={0}`.
    expect(celdas(conFoco.container).filter(c => c.style.outline !== '').length).toBe(1);
  });

  it('AC-ACC-025 — the focus ring does NOT make the scroll area larger, which is what `scale` would do', async () => {
    // The measurement that the repo already made for the playhead: `scale` counts for the
    // scrollable overflow and makes the two scroll bars appear. `outline` and
    // `box-shadow` are ink overflow, and drawn inward they do not even go outside the
    // cell box.
    // It runs at a cell size of 180 px, much larger than the real one, because that is
    // where the ring is largest: each of the two bands is 4.93 px wide and not 2. The app
    // draws no cell of 180 px, but the test still has sense: it checks that the ring does
    // not go outside the cell box at ANY size.
    const esquina = [GRID_W - 1, GRID_H - 1] as Cell;
    const sinFoco = await render(<Board {...props({ hover: esquina })} />);
    conCelda(sinFoco.container, 180);
    const antes = sinFoco.container.querySelector('div.relative')!;
    const medida = [antes.scrollWidth, antes.scrollHeight];
    await sinFoco.unmount();

    const conFoco = await render(<Board {...props({ hover: esquina, focoEnTablero: true })} />);
    conCelda(conFoco.container, 180);
    const despues = conFoco.container.querySelector('div.relative')!;
    expect([despues.scrollWidth, despues.scrollHeight]).toEqual(medida);
  });

  it('AC-ACC-026 — each cell has an accessible name, and the ghost does NOT change it', async () => {
    // The `title` is the echo of the name: the screen reader announces the `aria-label`,
    // with the coordinate in prose and the total of the steps, which the `title` does not
    // say.
    const pieza = colocar('F', 2, 2, true);
    const [x, y] = pieza.cells[0];
    const { container } = await render(
      <Board {...props({ placed: [pieza], previewCells: [[7, 4] as Cell] })} />,
    );
    const nombre = enIndice(container, x, y).getAttribute('aria-label')!;
    expect(nombre).toMatch(
      new RegExp(`^fila ${y + 1}, columna ${x + 1}, pieza F muteada, nota .+, paso \\d de 4$`),
    );
    // The `title` is the ECHO: the same note and the same step, with no renumbering, in
    // the mouse channel. If one of the two derived them by itself, this comparison breaks.
    const [, nota, paso] = enIndice(container, x, y).getAttribute('title')!.split(' · ');
    expect(nombre).toContain(`nota ${nota},`);
    expect(nombre).toContain(`${paso} de 4`);

    // The ghost cell shows a note and a step, and its name says "libre": the name cannot
    // change with the pointed cell, because the focus did not move.
    expect(baldosa(enIndice(container, 7, 4)).textContent).not.toBe('');
    expect(enIndice(container, 7, 4).getAttribute('aria-label')).toBe('fila 5, columna 8, libre');
  });
});
