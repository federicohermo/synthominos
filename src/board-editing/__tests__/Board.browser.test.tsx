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

/** `Board` is mounted with no root container: with no `--cell` the grid collapses to one column. */
const conCelda = (container: HTMLElement, px: number) => {
  container.style.setProperty('--cell', `${px}px`);
  return container;
};
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

const celdas = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="gridcell"]')] as HTMLElement[];

const enIndice = (container: HTMLElement, x: number, y: number) => celdas(container)[y * GRID_W + x];
const baldosa = (celda: HTMLElement) => celda.firstElementChild as HTMLElement;

describe('Board', () => {
  it('AC-FIT-013 — there are GRID_W × GRID_H cells, and each one has the size that `--cell` says', async () => {
    const { container } = await render(<Board {...props()} />);
    expect(celdas(container).length).toBe(GRID_W * GRID_H);

    for (const px of [CELL_PX_OBJETIVO, 180]) {
      conCelda(container, px);
      const c = enIndice(container, 0, 0).getBoundingClientRect();
      expect(Math.round(c.width), `${px}`).toBe(px);
      expect(Math.round(c.height), `${px}`).toBe(px);
    }
  });

  it('AC-FIT-014 AC-FIT-015 — the measures of the tile are RATIOS: at 180 px they give the same as at the target', async () => {
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
    expect(alPiso.nota).toBeGreaterThan(0);
    for (const clave of Object.keys(alPiso) as (keyof typeof alPiso)[]) {
      // ±0.5 px is the rounding of the browser.
      expect(alTecho[clave], clave).toBeCloseTo(alPiso[clave], 2);
    }
    expect(alPiso.nota * CELL_PX_OBJETIVO).toBeCloseTo(19, 0);
    expect(alPiso.pasoTamano * CELL_PX_OBJETIVO).toBeCloseTo(13, 0);
  });

  it('AC-FIT-016 — the border of 1 px does NOT scale, and it still separates at 180 px', async () => {
    const { container } = await render(<Board {...props({ placed: [colocar('F', 3, 2)] })} />);
    for (const px of [CELL_PX_OBJETIVO, 180]) {
      conCelda(container, px);
      const ancho = getComputedStyle(baldosa(enIndice(container, 3, 2))).borderTopWidth;
      expect(ancho, `${px}`).toBe('1px');
    }
  });

  it('AC-FIT-009 — the board has the size that `dims` and `--cell` say, and nothing scrolls', async () => {
    await page.viewport(375, 800);
    try {
      for (const dims of [GRID_DEFAULT, { w: 5, h: 9 }, { w: 26, h: 15 }]) {
        const { container, unmount } = await render(<Board {...props({ dims })} />);
        const cell = Math.min(375 / dims.w, 800 / dims.h);
        conCelda(container, cell);
        const grilla = container.querySelector('[role="grid"]')!;
        expect(Math.round(grilla.getBoundingClientRect().width), `${dims.w}x${dims.h}`)
          .toBe(Math.round(dims.w * cell));
        expect(container.querySelectorAll('[role="gridcell"]').length).toBe(dims.w * dims.h);

        const caja = container.querySelector('div.relative')!;
        expect(caja.scrollWidth, `${dims.w}x${dims.h}`).toBeLessThanOrEqual(caja.clientWidth + 1);
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

    expect(b.style.background).not.toBe('');
    expect(b.style.color).not.toBe('');
    expect(b.className).toContain('shadow-sm');
  });

  it('AC-BRD-012 — the MUTED piece turns white and keeps its note and its #N', async () => {
    const [x, y] = colocar('F', 2, 2).cells[0];
    const { container } = await render(<Board {...props({ placed: [colocar('F', 2, 2, true)] })} />);
    const celda = enIndice(container, x, y);
    const b = baldosa(celda);

    expect(b.className).toContain('bg-white');
    expect(b.style.background).toBe('');
    expect(b.textContent).not.toBe('');
    expect(b.querySelector('span')!.textContent).toMatch(/^#\d$/);
    expect(celda.getAttribute('title')).toMatch(new RegExp(`^\\(${x},${y}\\) · .+ · paso \\d$`));
  });

  it('AC-BRD-013 — the overlap with a placed piece wins over the color', async () => {
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
    expect(baldosa(enIndice(rosa.container, 5, 5)).className).toContain('bg-rose-300');
  });

  it('a free cell has no text, and its title says only the coordinate', async () => {
    const { container } = await render(<Board {...props()} />);
    const celda = enIndice(container, 7, 4);
    expect(baldosa(celda).textContent).toBe('');
    expect(celda.getAttribute('title')).toBe('(7,4)');
  });

  it('the ghost promises the note that the piece will say, with the regime it receives', async () => {
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

    container.querySelector('div.relative')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(onContextMenu).toHaveBeenCalled();
  });

  it('AC-BRD-015 — the cursor says "not allowed" except where the click EDITS', async () => {
    const base = { previewValid: false, hover: [2, 2] as Cell };

    const prohibido = await render(<Board {...props({ ...base, hoverEdita: false })} />);
    expect(enIndice(prohibido.container, 0, 0).className).toContain('cursor-not-allowed');
    await prohibido.unmount();

    const edita = await render(<Board {...props({ ...base, hoverEdita: true })} />);
    expect(enIndice(edita.container, 0, 0).className).toContain('cursor-pointer');
    await edita.unmount();

    const sinHover = await render(<Board {...props({ previewValid: false, hover: null })} />);
    expect(enIndice(sinHover.container, 0, 0).className).toContain('cursor-pointer');
  });

  it('the board ref is on the node that wraps the board, where the wheel listener attaches', async () => {
    const boardRef: { current: HTMLDivElement | null } = { current: null };
    const { container } = await render(<Board {...props({ boardRef })} />);
    expect(boardRef.current).toBe(container.querySelector('div.relative'));
  });
});

const tecla = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(evento);
  return evento;
};

describe('Board: the keyboard and the focus', () => {
  it('AC-ACC-012 — it is a `grid` of six rows by ten cells, with ONE tab stop', async () => {
    const { container } = await render(<Board {...props()} />);
    const grilla = container.querySelector('[role="grid"]')!;
    const filas = [...grilla.querySelectorAll('[role="row"]')];
    expect(filas.length).toBe(GRID_H);
    for (const fila of filas) expect(fila.querySelectorAll('[role="gridcell"]').length).toBe(GRID_W);

    expect(celdas(container).filter(c => c.tabIndex === 0).length).toBe(1);
  });

  it('AC-ACC-014 — the `0` starts on the first cell and travels with the pointed cell', async () => {
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

    expect(tecla(origen, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(enIndice(container, 1, 0));
    tecla(enIndice(container, 1, 0), 'ArrowDown');
    expect(document.activeElement).toBe(enIndice(container, 1, 1));
    tecla(enIndice(container, 1, 1), 'ArrowLeft');
    expect(document.activeElement).toBe(enIndice(container, 0, 1));
    tecla(enIndice(container, 0, 1), 'ArrowUp');
    expect(document.activeElement).toBe(origen);

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
    const { container } = await render(<Board {...props()} />);
    const celda = enIndice(container, 2, 2);
    celda.focus();
    expect(tecla(celda, 'Shift').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(celda);
  });

  it('AC-ACC-019 — `Enter` and `Space` do what the click does, and with `Alt` what `Alt`+click does', async () => {
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

    onFoco.mockClear();
    tecla(celda, 'ArrowRight');
    await vi.waitFor(() => expect(onFoco).toHaveBeenLastCalledWith([3, 4]));
    expect(onFoco).not.toHaveBeenCalledWith(null);

    onFoco.mockClear();
    enIndice(container, 3, 4).blur();
    await vi.waitFor(() => expect(onFoco).toHaveBeenLastCalledWith(null));
  });

  it('AC-ACC-022 — with the focus in the board the mouse is INERT, and with no focus it sets the pointed cell', async () => {
    const onCellEnter = vi.fn();
    const sinFoco = await render(<Board {...props({ onCellEnter })} />);
    enIndice(sinFoco.container, 4, 2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.waitFor(() => expect(onCellEnter).toHaveBeenCalledWith([4, 2]));
    await sinFoco.unmount();

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
    const conMouse = await render(<Board {...props({ hover: [4, 2] as Cell })} />);
    expect(enIndice(conMouse.container, 4, 2).style.outline).toBe('');
    expect(enIndice(conMouse.container, 4, 2).style.boxShadow).toBe('');
    await conMouse.unmount();

    const conFoco = await render(<Board {...props({ hover: [4, 2] as Cell, focoEnTablero: true })} />);
    const enfocada = enIndice(conFoco.container, 4, 2);
    expect(enfocada.style.outline).toContain('calc(');
    // 180 px: with the two widths fixed at 2 px, both bands fall inside the gap of 4.93 px.
    conCelda(conFoco.container, 180);
    const cs = getComputedStyle(enfocada);
    // Chromium rounds `outline-width` and `outline-offset` to whole pixels.
    const entre = (valor: number, exacto: number) => {
      expect(valor).toBeGreaterThanOrEqual(Math.floor(exacto));
      expect(valor).toBeLessThanOrEqual(Math.ceil(exacto));
    };
    entre(parseFloat(cs.outlineWidth), 180 * ANILLO_FOCO_CLARO_RAZON);
    entre(parseFloat(cs.outlineOffset), -180 * (ANILLO_FOCO_OSCURO_RAZON + ANILLO_FOCO_CLARO_RAZON));
    expect(parseFloat(cs.outlineWidth)).toBeGreaterThan(2);
    expect(cs.boxShadow).toContain('inset');
    expect(celdas(conFoco.container).filter(c => c.style.outline !== '').length).toBe(1);
  });

  it('AC-ACC-025 — the focus ring does NOT make the scroll area larger, which is what `scale` would do', async () => {
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
    const pieza = colocar('F', 2, 2, true);
    const [x, y] = pieza.cells[0];
    const { container } = await render(
      <Board {...props({ placed: [pieza], previewCells: [[7, 4] as Cell] })} />,
    );
    const nombre = enIndice(container, x, y).getAttribute('aria-label')!;
    expect(nombre).toMatch(
      new RegExp(`^fila ${y + 1}, columna ${x + 1}, pieza F muteada, nota .+, paso \\d de 4$`),
    );
    const [, nota, paso] = enIndice(container, x, y).getAttribute('title')!.split(' · ');
    expect(nombre).toContain(`nota ${nota},`);
    expect(nombre).toContain(`${paso} de 4`);

    expect(baldosa(enIndice(container, 7, 4)).textContent).not.toBe('');
    expect(enIndice(container, 7, 4).getAttribute('aria-label')).toBe('fila 5, columna 8, libre');
  });
});
