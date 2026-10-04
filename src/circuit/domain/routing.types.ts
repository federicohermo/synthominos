import type { Cell } from '../../pieces/domain/transform.types.ts';

/**
 * Lo que contesta una consulta de ruta: el camino entre dos celdas, lo que pisa en el
 * medio, cuántos intervalos dura y cuánto costó elegirlo.
 *
 * **`cost` y `steps` no son el mismo número**, y por eso viajan los dos:
 * un cruce cuesta `CROSS_COST` pero dura UN intervalo. El costo ordena —es con lo que el
 * circuito elige entre dos caminos— y los pasos miden el tiempo. Confundirlos estira el
 * ciclo justo donde no hay nada que esperar.
 *
 * `crossed` es exactamente el subconjunto ocupado de `path`, y no una lista aparte que
 * haya que mantener.
 */
export interface Ruta {
  path: Cell[];
  steps: number;
  cost: number;
  crossed: Cell[];
}
