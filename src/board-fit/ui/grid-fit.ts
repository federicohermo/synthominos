import { GRID_MIN } from '../../board-editing/domain/board.constants.ts';
import type { Dims } from '../../board-editing/domain/board.types.ts';
import { CELL_PX_OBJETIVO } from './layout.constants.ts';

/**
 * Lo que hay que dibujar para llenar un viewport de `vw × vh` con celdas de unos 73 px:
 * cuántas entran y cuánto mide cada una.
 *
 * Reemplaza a `cellPxPara`, y el cambio es de qué se despeja. Aquel tenía el
 * tablero fijo en 10 × 6 y despejaba el TAMAÑO de la celda, que en un escritorio se iba a
 * 180 px; éste tiene la celda fija en 73 y despeja la CANTIDAD.
 *
 * ```
 * 1. cuántas entran al objetivo   c0 = max(GRID_MIN.w, round(vw / CELL_PX_OBJETIVO))
 *                                 r0 = max(GRID_MIN.h, round(vh / CELL_PX_OBJETIVO))
 * 2. el tamaño real               cell = min(vw / c0, vh / r0)
 * 3. y cuántas entran a ESE       cols = max(GRID_MIN.w, floor(vw / cell))
 *                                 rows = max(GRID_MIN.h, floor(vh / cell))
 * ```
 *
 * ## El paso 2 es el que garantiza que no haya scroll
 *
 * `min` de los dos ejes, igual que en el 021 y por el mismo motivo: la celda es cuadrada,
 * así que manda la dimensión más apretada. Tomar el máximo daría una grilla que desborda
 * por el otro eje, y desbordar es exactamente lo que este spec vino a sacar.
 *
 * ## El paso 3 parece redundante y no lo es
 *
 * Los dos primeros ya dan un tablero que entra, pero el eje que **no** manda puede quedar
 * con más de una celda libre cuando la ventana es muy desproporcionada: a 2000 × 300 el
 * mínimo de 5 filas fuerza una celda de 60 px y sobrarían 380 px de ancho, o sea seis
 * columnas sin usar. Recontar contra la celda real cierra eso, y sigue sin poder desbordar
 * porque `floor(vw / cell) · cell ≤ vw` por definición de `floor`. En los nueve viewports
 * reales de la tabla de `CELL_PX_OBJETIVO` este paso no cambia ningún número.
 *
 * El `+ EPS` del `floor` no es defensivo: cuando el eje que manda es el mismo que ya
 * contó —el caso normal—, `vw / cell` es exactamente `c0` en aritmética real pero puede
 * dar `25,999999996` en coma flotante, y ahí el `floor` **quita una columna de verdad**.
 *
 * ## Los mínimos son un piso duro
 *
 * `GRID_MIN` sale de `domain/`: 5 × 5 es la caja más chica donde entra cualquier pentominó
 * en cualquier orientación. Abajo de eso hay piezas de la paleta que no se podrían colocar
 * en ningún lado, así que en un viewport que no dé para 5 celdas de 73 px lo que cede es el
 * tamaño de la celda (320 × 568 → 64 px) y nunca la cantidad.
 *
 * Es una pura y vive acá y no en `use-grid.ts` por el motivo de siempre: así se testea en
 * `environment: 'node'`, sin navegador y sin fabricar un `resize`. Lo que queda del otro
 * lado es cableado —leer la caja, escribir la custom property y guardar las dimensiones—
 * y eso lo cubre el proyecto `browser`.
 */
export function grillaPara(vw: number, vh: number): { dims: Dims; cell: number } {
  const c0 = Math.max(GRID_MIN.w, Math.round(vw / CELL_PX_OBJETIVO));
  const r0 = Math.max(GRID_MIN.h, Math.round(vh / CELL_PX_OBJETIVO));
  const cell = Math.min(vw / c0, vh / r0);
  // Una caja de lado cero —el contenedor todavía sin medir, o la app dentro de un
  // `display: none`— daría una división por cero y un `NaN` que viajaría hasta el
  // `gridTemplateColumns`. Se contesta el tablero mínimo con celdas de cero: es lo que
  // corresponde dibujar en una caja sin tamaño, y en cuanto la caja mida algo el `resize`
  // vuelve a pasar por acá.
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
