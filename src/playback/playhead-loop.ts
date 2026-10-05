import { playheadOffset } from './engine.ts';
import { rutaActiva, velo, MARCA } from './route-source.ts';
import { AIRE_RAZON, RADIO_RAZON } from '../board-fit/grid-fit.ts';
import type { CeldaPorEstrenar } from './route-source.ts';

export const BORDE_COLOR = '#0f172a';

/** The thickness inward and outward, in px. DESIGN.md fixes the three steps. */
export const NOTA = { dentro: 3, fuera: 2 };

export const CRUCE = { dentro: 2, fuera: 1 };

export const CLICK = { dentro: 2, fuera: 0 };

export const BORDE_POR_KIND = { [MARCA.nota]: NOTA, [MARCA.cruce]: CRUCE, [MARCA.click]: CLICK } as const;

/** Whole literals: Tailwind scans the source and generates no concatenated class. */
export const VELO_CAJA = 'absolute';
export const VELO_TAPA = 'w-full h-full border-2 border-dashed border-slate-900/50 bg-white/60';

/** A `calc()` over `--cell`: a resize moves the playhead and the veil with no write. */
const celdas = (n: number) => `calc(var(--cell) * ${n})`;

const SIN_CABEZA = (): void => {};

export const borde = ({ dentro, fuera }: { dentro: number; fuera: number }): string =>
  `inset 0 0 0 ${dentro}px ${BORDE_COLOR}` + (fuera > 0 ? `, 0 0 0 ${fuera}px ${BORDE_COLOR}` : '');

const claveDe = (e: CeldaPorEstrenar): string => `${e.id}:${e.cell[0]},${e.cell[1]}`;

export function iniciarCabeza(
  capa: HTMLElement | null,
  el: HTMLElement | null,
  resalte: HTMLElement | null,
): () => void {
  if (!capa || !el || !resalte) return SIN_CABEZA;

  let dibujado = '';
  let raf = 0;

  let veloVisto: readonly CeldaPorEstrenar[] | null = null;
  let tapas: { entrada: CeldaPorEstrenar; nodo: HTMLElement }[] = [];
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
      // The gap and the radius must be those of the tile of `Board.tsx`.
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
    // `rutaActiva()` makes the swap, so it goes before `playheadOffset()`: the other order
    // draws one frame of an offset of the new cycle on the table of the old one.
    const marcas = rutaActiva();
    const v = velo();
    if (v !== veloVisto) {
      veloVisto = v;
      rearmar(v);
    }
    const offset = playheadOffset();

    // Not `===`: a hidden tab suspends rAF, and the offset jumps past the cell. This needs
    // the `null` of `playheadOffset` before the origin: the tail of the new cycle would
    // uncover all the cells at once.
    if (offset !== null) {
      for (const { entrada, nodo } of tapas) {
        if (entrada.offset === null || nodo.style.display === 'none') continue;
        if (offset < entrada.offset) continue;
        nodo.style.display = 'none';
        estrenadas.add(claveDe(entrada));
      }
    }

    const marca = offset === null ? null : marcas[offset] ?? null;
    const clave = marca ? `${marca.cell[0]},${marca.cell[1]},${marca.kind}` : '';
    if (clave !== dibujado) {
      dibujado = clave;
      if (!marca) {
        el.style.display = 'none';
      } else {
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
