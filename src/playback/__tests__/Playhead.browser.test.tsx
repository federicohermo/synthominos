import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { CELL_PX_OBJETIVO } from '../../board-fit/grid-fit.ts';
import { MARCA } from '../route-source.ts';
import type { Marca, CeldaPorEstrenar } from '../route-source.ts';

/** Without `--cell`, which the root of the app sets, each `calc()` of the loop is invalid. */
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

const capas = (container: HTMLElement) =>
  [...container.querySelectorAll(':scope > div')] as HTMLElement[];

describe('Playhead — the mount', () => {
  it('it mounts two layers, both at z-10, and neither takes the click', async () => {
    const { container } = await render(<Playhead />);
    const [capa, cabeza] = capas(container);

    expect(getComputedStyle(capa).zIndex).toBe('10');
    expect(getComputedStyle(cabeza).zIndex).toBe('10');

    expect(getComputedStyle(capa).pointerEvents).toBe('none');
    expect(getComputedStyle(cabeza).pointerEvents).toBe('none');

    expect(capa.compareDocumentPosition(cabeza) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC-PLY-029 — it starts hidden: with no clock there is nothing to mark', async () => {
    const { container } = await render(<Playhead />);
    const [, cabeza] = capas(container);
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
    const en = (px: number) => {
      conCelda(container, px);
      return getComputedStyle(cabeza).transform;
    };
    expect(en(CELL_PX_OBJETIVO)).toBe(`matrix(1, 0, 0, 1, ${3 * CELL_PX_OBJETIVO}, ${2 * CELL_PX_OBJETIVO})`);
    expect(en(180)).toBe(`matrix(1, 0, 0, 1, ${3 * 180}, ${2 * 180})`);
  });

  it('AC-PLY-032 — the three kinds have three different borders, and the click does not paint outside', async () => {
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

    // Splits between shadows: the serialized color `rgb(15, 23, 42)` has two commas of its own.
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

    fuente.offset = null;
    await cuadro();
    expect(cabeza.style.display).toBe('none');

    fuente.offset = 7;
    await cuadro();
    expect(cabeza.style.display).toBe('none');
  });

  it('AC-PLY-030 — it does not write the DOM again when the cell did not change', async () => {
    fuente.marcas = [nota(2, 2), nota(2, 2)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const [, cabeza] = capas(container);
    const escrituras = vi.spyOn(cabeza.style, 'setProperty');
    fuente.offset = 1;
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
    // The same ratio as the inset of the tile.
    conCelda(container, 180);
    expect(cs().left).toBe(`${1 * 180}px`);
    expect(cs().width).toBe('180px');
    expect(parseFloat(cs().paddingTop) / 180).toBeCloseTo(2 / CELL_PX_OBJETIVO, 3);
  });

  it('AC-PLY-034 — a cell is uncovered when the playhead REACHES it, not when the cycle starts', async () => {
    fuente.velo = [tapada('F', 1, 0, 3)];
    fuente.marcas = [nota(0, 0), nota(1, 0), nota(2, 0), nota(1, 0)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const tapa = capas(container)[0].firstElementChild as HTMLElement;
    expect(tapa.style.display).not.toBe('none');

    fuente.offset = 2;
    await cuadro();
    expect(tapa.style.display).not.toBe('none');

    fuente.offset = 3;
    await cuadro();
    expect(tapa.style.display).toBe('none');
  });

  it('AC-PLY-034 — the `>=` covers the lost frame: a hidden tab does not leave the cell covered', async () => {
    fuente.velo = [tapada('F', 1, 0, 2)];
    fuente.marcas = [nota(0, 0), nota(1, 0), nota(2, 0), nota(3, 0), nota(4, 0)];
    fuente.offset = 4;
    const { container } = await render(<Playhead />);
    await cuadro();

    const tapa = capas(container)[0].firstElementChild as HTMLElement;
    expect(tapa.style.display).toBe('none');
  });

  it('AC-PLY-034 — a queued piece, with no offset, is uncovered whole at the swap', async () => {
    fuente.velo = [tapada('L', 5, 5, null)];
    fuente.marcas = [nota(5, 5)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const capa = capas(container)[0];
    expect((capa.firstElementChild as HTMLElement).style.display).not.toBe('none');

    fuente.velo = [];
    await cuadro();
    expect(capa.children.length).toBe(0);
  });

  it('a rebuild of the veil does NOT cover again what already sounded', async () => {
    fuente.velo = [tapada('F', 1, 0, 0)];
    fuente.marcas = [nota(1, 0)];
    fuente.offset = 0;
    const { container } = await render(<Playhead />);
    await cuadro();

    const capa = capas(container)[0];
    expect((capa.firstElementChild as HTMLElement).style.display).toBe('none');

    // The playhead leaves the cell before the rebuild: on the cell, the loop uncovers it again
    // in the same frame, and the test passes with nothing remembered.
    fuente.offset = null;
    await cuadro();

    fuente.velo = [tapada('F', 1, 0, 0), tapada('L', 8, 4, 6)];
    await cuadro();
    const tapas = [...capa.children] as HTMLElement[];
    expect(tapas.length).toBe(2);
    expect(tapas[0].style.display).toBe('none');
    expect(tapas[1].style.display).not.toBe('none');
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
