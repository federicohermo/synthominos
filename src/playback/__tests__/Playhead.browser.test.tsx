import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { CELL_PX_OBJETIVO } from '../../board-fit/grid-fit.ts';
import { MARCA } from '../route-source.ts';
import type { Marca, CeldaPorEstrenar } from '../route-source.ts';

/**
 * The playhead and the veil, drawn by hand over the grid.
 *
 * The two sources are mocked (the route and the veil of `route-source.ts`, and the offset
 * of the engine) because the module under test TRANSLATES those three values to pixels:
 * it computes no paths and no distances. With the real engine, a test would have to start
 * a clock and wait for the playhead to reach the cell to assert. That measures the
 * scheduler again, and not what this module decides.
 *
 * The loop lives in `playhead-loop.ts`, and that matters to this test: inside the
 * `useEffect` of a `.tsx` it cannot be exported (`react-refresh/only-export-components`),
 * so a test cannot call it.
 *
 * ## The positions are read COMPUTED, not as the written string
 *
 * The loop writes `calc(var(--cell) * n)` and not a product in pixels, so a comparison
 * against the literal string would tie the test to the SYNTAX and not to the position.
 * The assertion is where the playhead is, which is what the module decides.
 *
 * And the test must set `--cell`: `Playhead` is mounted alone, without the root container
 * that sets it in the app. Without it, a `calc()` with an undefined custom property is an
 * invalid declaration and the computed value is empty.
 */

/** Sets `--cell` on the container of the render, as the shell does on its root. */
const conCelda = (container: HTMLElement, px = CELL_PX_OBJETIVO) => {
  container.style.setProperty('--cell', `${px}px`);
  return container;
};
const fuente = vi.hoisted(() => ({
  marcas: [] as (Marca | null)[],
  velo: [] as CeldaPorEstrenar[],
  offset: null as number | null,
}));

vi.mock('../route-source.ts', async (importActual) => ({
  ...await importActual<typeof import('../route-source.ts')>(),
  rutaActiva: () => fuente.marcas,
  velo: () => fuente.velo,
}));
vi.mock('../engine.ts', () => ({
  playheadOffset: () => fuente.offset,
  cycleGeneration: () => 0,
}));

const Playhead = (await import('../Playhead.tsx')).default;
const { iniciarCabeza, borde } = await import('../playhead-loop.ts');
const { NOTA } = await import('../playhead-loop.ts');

/** Two frames: the loop reads, draws and schedules itself again in the same `draw`. */
const cuadro = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const nota = (x: number, y: number): Marca => ({ cell: [x, y], kind: MARCA.nota });

beforeEach(() => {
  fuente.marcas = [];
  fuente.velo = [];
  fuente.offset = null;
});

/** The two containers that React mounts: the one of the veil first, the playhead after. */
const capas = (container: HTMLElement) =>
  [...container.querySelectorAll(':scope > div')] as HTMLElement[];

describe('Playhead — the mount', () => {
  it('it mounts two layers, both at z-10, and neither takes the click', async () => {
    const { container } = await render(<Playhead />);
    const [capa, cabeza] = capas(container);

    // `z-10` makes the layer paint OVER the cells: the tiles of `Board` are `relative`,
    // so they are positioned, and the grid comes AFTER in the DOM. Without a z-index the
    // layer is under all of them, and because even the empty cell has an opaque
    // background, the layer is invisible. It is read computed and not from the
    // `className` on purpose: without the stylesheet loaded this would be `auto`.
    expect(getComputedStyle(capa).zIndex).toBe('10');
    expect(getComputedStyle(cabeza).zIndex).toBe('10');

    // They go OVER the cells, so they must not take the click that places a piece.
    expect(getComputedStyle(capa).pointerEvents).toBe('none');
    expect(getComputedStyle(cabeza).pointerEvents).toBe('none');

    // And the veil goes BEFORE the playhead: so a cell that still has its veil is
    // highlighted when its turn comes, which is the same frame where it loses the veil.
    expect(capa.compareDocumentPosition(cabeza) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC-PLY-029 — it starts hidden: with no clock there is nothing to mark', async () => {
    const { container } = await render(<Playhead />);
    const [, cabeza] = capas(container);
    // A visible mount at (0,0) would point at a cell that does not sound, until the first
    // frame.
    expect(cabeza.style.display).toBe('none');
  });
});

describe('Playhead — the playhead', () => {
  it('AC-FIT-018 AC-PLY-030 — it jumps to the cell of the offset, in cells of `--cell`', async () => {
    fuente.marcas = [nota(3, 2)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    conCelda(container);
    await cuadro();

    const [, cabeza] = capas(container);
    expect(cabeza.style.display).toBe('block');
    // It jumps and does not slide: the instrument is quantized to the grid of intervals.
    const en = (px: number) => {
      conCelda(container, px);
      return getComputedStyle(cabeza).transform;
    };
    expect(en(CELL_PX_OBJETIVO)).toBe(`matrix(1, 0, 0, 1, ${3 * CELL_PX_OBJETIVO}, ${2 * CELL_PX_OBJETIVO})`);
    // And it follows `--cell` with no new write from the loop. That keeps the playhead
    // aligned while the user drags the edge of the window.
    expect(en(180)).toBe(`matrix(1, 0, 0, 1, ${3 * 180}, ${2 * 180})`);
  });

  it('AC-PLY-032 — the three kinds have three different borders, and the click does not paint outside', async () => {
    // Strong for the note, middle for the crossing, light for the click: if two of the
    // three looked the same, the playhead would lie about which of the three events
    // occurred.
    const sombraDe = async (kind: Marca['kind']) => {
      fuente.marcas = [{ cell: [1, 1], kind }];
      fuente.offset = 0;
      const { container, unmount } = await render(<Playhead />);
      await cuadro();
      const resalte = capas(container)[1].firstElementChild as HTMLElement;
      const s = resalte.style.boxShadow;
      await unmount();
      return s;
    };

    const deNota = await sombraDe(MARCA.nota);
    const deCruce = await sombraDe(MARCA.cruce);
    const deClick = await sombraDe(MARCA.click);

    expect(new Set([deNota, deCruce, deClick]).size).toBe(3);

    // The click grows only inward: it reads as a light touch, and its border has no
    // second shadow. The SHADOWS are counted and not the commas: the browser serializes
    // the color as `rgb(15, 23, 42)`, which has two commas of its own.
    const sombras = (s: string) => s.split(/,(?![^(]*\))/).length;
    expect(sombras(deClick)).toBe(1);
    expect(sombras(deNota)).toBe(2);
    expect(sombras(deCruce)).toBe(2);
  });

  it('it hides when there is no offset, and when the offset falls outside the table', async () => {
    fuente.marcas = [nota(0, 0)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();
    const [, cabeza] = capas(container);
    expect(cabeza.style.display).toBe('block');

    // Paused: the engine answers null and the playhead disappears.
    fuente.offset = null;
    await cuadro();
    expect(cabeza.style.display).toBe('none');

    // And an offset with no mark, a silence of the sequence, draws nothing either.
    fuente.offset = 7;
    await cuadro();
    expect(cabeza.style.display).toBe('none');
  });

  it('AC-PLY-030 — it does not write the DOM again when the cell did not change', async () => {
    // The key of the LAST write lowers 60 writes each second to between 4 and 11. With
    // it, the loop does not touch the DOM once while the transport is paused.
    fuente.marcas = [nota(2, 2), nota(2, 2)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const [, cabeza] = capas(container);
    const escrituras = vi.spyOn(cabeza.style, 'setProperty');
    fuente.offset = 1;   // another mark, the SAME cell and the same kind
    await cuadro();
    await cuadro();
    expect(escrituras).not.toHaveBeenCalled();
    escrituras.mockRestore();
  });
});

describe('Playhead — the veil', () => {
  const tapada = (id: string, x: number, y: number, offset: number | null): CeldaPorEstrenar =>
    ({ id, cell: [x, y], offset });

  it('it creates one cover for each cell, positioned over its cell', async () => {
    fuente.velo = [tapada('F', 1, 0, 3), tapada('F', 2, 0, 4)];
    const { container } = await render(<Playhead />);
    await cuadro();

    conCelda(container);
    const [capa] = capas(container);
    const tapas = [...capa.children] as HTMLElement[];
    expect(tapas.length).toBe(2);
    const cs = () => getComputedStyle(tapas[0]);
    expect(cs().left).toBe(`${1 * CELL_PX_OBJETIVO}px`);
    expect(cs().top).toBe('0px');
    expect(cs().width).toBe(`${CELL_PX_OBJETIVO}px`);
    // The inset of the veil is the SAME ratio as the inset of the tile: if they went out
    // of line, the veil would not cover the exact cell, which is all that those measures
    // guarantee.
    conCelda(container, 180);
    expect(cs().left).toBe(`${1 * 180}px`);
    expect(cs().width).toBe('180px');
    expect(parseFloat(cs().paddingTop) / 180).toBeCloseTo(2 / CELL_PX_OBJETIVO, 3);
  });

  it('AC-PLY-034 — a cell is uncovered when the playhead REACHES it, not when the cycle starts', async () => {
    // It is the only thing that makes visible that the play order is not the placement
    // order.
    fuente.velo = [tapada('F', 1, 0, 3)];
    fuente.marcas = [nota(0, 0), nota(1, 0), nota(2, 0), nota(1, 0)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const tapa = capas(container)[0].firstElementChild as HTMLElement;
    expect(tapa.style.display).not.toBe('none');

    fuente.offset = 2;   // not there yet
    await cuadro();
    expect(tapa.style.display).not.toBe('none');

    fuente.offset = 3;   // its turn
    await cuadro();
    expect(tapa.style.display).toBe('none');
  });

  it('AC-PLY-034 — the `>=` covers the lost frame: a hidden tab does not leave the cell covered', async () => {
    fuente.velo = [tapada('F', 1, 0, 2)];
    fuente.marcas = [nota(0, 0), nota(1, 0), nota(2, 0), nota(3, 0), nota(4, 0)];
    fuente.offset = 4;   // offset 2 was skipped whole
    const { container } = await render(<Playhead />);
    await cuadro();

    const tapa = capas(container)[0].firstElementChild as HTMLElement;
    // With strict equality it would stay covered until the next cycle.
    expect(tapa.style.display).toBe('none');
  });

  it('AC-PLY-034 — a queued piece, with no offset, is uncovered whole at the swap', async () => {
    // There is no instant to wait for: it has not entered the cycle yet.
    fuente.velo = [tapada('L', 5, 5, null)];
    fuente.marcas = [nota(5, 5)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const capa = capas(container)[0];
    expect((capa.firstElementChild as HTMLElement).style.display).not.toBe('none');

    // The swap: `velo()` returns another array and the cover goes away with it.
    fuente.velo = [];
    await cuadro();
    expect(capa.children.length).toBe(0);
  });

  it('a rebuild of the veil does NOT cover again what already sounded', async () => {
    // Without this, the placement of a second piece would rebuild the veil and cover
    // again cells that had already lost it. That is why the loop, and not
    // `route-source`, remembers which cells sounded.
    fuente.velo = [tapada('F', 1, 0, 0)];
    fuente.marcas = [nota(1, 0)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const capa = capas(container)[0];
    expect((capa.firstElementChild as HTMLElement).style.display).toBe('none');

    // The playhead moves away BEFORE the rebuild, and that step is necessary: with the
    // playhead still on the cell, the loop uncovers it again in the same frame, and the
    // test would pass even if the rebuild remembered nothing. A mutation pass confirmed
    // it: without this step, the deletion of the `estrenadas` line survived.
    fuente.offset = null;
    await cuadro();

    // Another piece enters: the veil is rebuilt with the two.
    fuente.velo = [tapada('F', 1, 0, 0), tapada('L', 8, 4, 6)];
    await cuadro();
    const tapas = [...capa.children] as HTMLElement[];
    expect(tapas.length).toBe(2);
    expect(tapas[0].style.display).toBe('none');      // the one that already sounded stays uncovered
    expect(tapas[1].style.display).not.toBe('none');  // the new one, covered
  });

  it('on unmount it empties the layer and stops the loop', async () => {
    fuente.velo = [tapada('F', 1, 0, 3)];
    const { container, unmount } = await render(<Playhead />);
    await cuadro();
    const capa = capas(container)[0];
    expect(capa.children.length).toBe(1);

    await unmount();
    expect(capa.children.length).toBe(0);
  });
});

describe('iniciarCabeza — the guard of the nodes', () => {
  it('with no nodes it starts nothing, and its cleanup does not throw', () => {
    // The signature accepts `null` because a `ref.current` holds that before the mount.
    // The component cannot exercise this path: React assigns the refs BEFORE it runs the
    // effects, so the three are always there.
    for (const nodos of [
      [null, null, null],
      [document.createElement('div'), null, null],
      [document.createElement('div'), document.createElement('div'), null],
    ] as [HTMLElement | null, HTMLElement | null, HTMLElement | null][]) {
      const limpiar = iniciarCabeza(...nodos);
      expect(() => limpiar()).not.toThrow();
    }
  });

  it('`borde` builds the shadow from the two numbers of the border', () => {
    expect(borde(NOTA)).toContain(`inset 0 0 0 ${NOTA.dentro}px`);
    expect(borde({ dentro: 2, fuera: 0 })).not.toContain(',');
  });
});
