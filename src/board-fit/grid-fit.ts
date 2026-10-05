import { GRID_MIN } from '../board-editing/placement.ts';
import type { Dims } from '../board-editing/placement.ts';

/** In px. At 73 the note name is the measured 19 px: measure again when the ratios below change. */
export const CELL_PX_OBJETIVO = 73;

/** Used as `calc(var(--cell) * RAZON)` in an inline style: Tailwind generates no interpolated class. */
export const NOTA_RAZON = 19 / CELL_PX_OBJETIVO;
export const PASO_RAZON = 13 / CELL_PX_OBJETIVO;
export const AIRE_RAZON = 2 / CELL_PX_OBJETIVO;
export const RADIO_RAZON = 8 / CELL_PX_OBJETIVO;
export const RESERVA_RAZON = 8 / CELL_PX_OBJETIVO;
export const PASO_ABAJO_RAZON = 2 / CELL_PX_OBJETIVO;
export const PASO_DERECHA_RAZON = 6 / CELL_PX_OBJETIVO;

/** One gap each, drawn inward: the dark band falls on the gap, the light band on the tile. */
export const ANILLO_FOCO_OSCURO_RAZON = AIRE_RAZON;
export const ANILLO_FOCO_CLARO_RAZON = AIRE_RAZON;

/** `EPS`: `vw / cell` can give `25.999999996` for an exact 26, and the `floor` removes a column. */
export function grillaPara(vw: number, vh: number): { dims: Dims; cell: number } {
  const c0 = Math.max(GRID_MIN.w, Math.round(vw / CELL_PX_OBJETIVO));
  const r0 = Math.max(GRID_MIN.h, Math.round(vh / CELL_PX_OBJETIVO));
  const cell = Math.min(vw / c0, vh / r0);
  // A box not measured yet has a side of zero: without this, a `NaN` reaches `gridTemplateColumns`.
  if (cell <= 0) return { dims: GRID_MIN, cell: 0 };
  const EPS = 1e-9;
  return {
    dims: {
      w: Math.max(GRID_MIN.w, Math.floor(vw / cell + EPS)),
      h: Math.max(GRID_MIN.h, Math.floor(vh / cell + EPS)),
    },
    cell,
  };
}
