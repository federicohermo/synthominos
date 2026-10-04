import type { Cell } from '../../src/pieces/transform.types.ts';

/**
 * Render ASCII de una forma, y lo unico geometrico que el server escribe por su
 * cuenta.
 *
 * Que sea lo unico es a proposito: **no es dominio**. Rotar, reflejar, colocar y
 * validar vienen de `src/<capability>/domain/`; esto solo dibuja lo que aquellas devolvieron.
 *
 * Existe porque una pieza descrita como cinco pares de coordenadas no se ve, y
 * ver la forma es la mitad de lo que la tool responde.
 */

/** Celda ocupada. */
const CELL = '#';
/** Celda de agarre: la que queda bajo el cursor al colocar. */
const ANCHOR = '@';
/** Hueco dentro del bounding box. */
const EMPTY = '.';

/**
 * Dibuja `cells` en su bounding box poniendo en cada una el caracter que `charAt`
 * elige por INDICE. Los huecos del bounding box quedan en `EMPTY`.
 *
 * Traslada por el minimo en vez de asumir que la forma esta normalizada: asi
 * sirve igual para una forma canonica y para celdas ya en coordenadas de tablero.
 *
 * `y` crece hacia ABAJO —son coordenadas de grilla—, asi que la fila 0 del string
 * es la de arriba y el dibujo coincide con lo que se ve en pantalla.
 *
 * El INDICE es lo unico que las dos vistas necesitan del dominio, y por eso alcanza
 * con parametrizar el caracter: el ancla sale por indice y el grado tambien, gracias
 * al invariante del orden del array.
 */
function draw(cells: readonly Cell[], charAt: (k: number) => string): string {
  if (cells.length === 0) return '';

  const minx = Math.min(...cells.map(c => c[0]));
  const miny = Math.min(...cells.map(c => c[1]));
  const width = Math.max(...cells.map(c => c[0])) - minx + 1;
  const height = Math.max(...cells.map(c => c[1])) - miny + 1;

  const grid: string[][] = Array.from({ length: height }, () => Array<string>(width).fill(EMPTY));
  cells.forEach(([x, y], k) => {
    grid[y - miny][x - minx] = charAt(k);
  });

  return grid.map(row => row.join('')).join('\n');
}

/** Dibuja `cells` en su bounding box, marcando la celda `anchorIndex`. */
export function renderAscii(cells: readonly Cell[], anchorIndex: number): string {
  return draw(cells, k => (k === anchorIndex ? ANCHOR : CELL));
}

/**
 * El mismo dibujo, pero con el GRADO de cada celda en vez de `#`.
 *
 * Existe porque el ASCII era la unica parte de la respuesta que no habia aprendido el
 * lenguaje del spec 007: desde que cada celda es duena de un grado, `#####` dice menos
 * que el `cellMap` que viaja al lado, y leer el mapeo obligaba a cruzar a mano cinco
 * pares de coordenadas contra el dibujo. Era el seguimiento que el 007 dejo anotado.
 *
 * Va en un campo APARTE y no reemplazando a `ascii`: los dos dibujos dicen cosas
 * distintas —uno la celda de agarre, el otro el orden en que suenan las celdas— y
 * pisar el primero cambiaria en silencio el contrato de la tool.
 *
 * `values` viene POR INDICE, igual que lo devuelven `degreeByCellIndex` y
 * `playOrderByCellIndex`: el elemento `k` es el numero de `cells[k]`. La firma es
 * generica —numeros por indice y no "grados"— justamente porque hay DOS numeraciones
 * por celda y la tool dibuja la del orden de reproduccion: un nombre que dijera
 * `grados` invitaria a alimentarla con la otra sin que nada se pusiera en rojo.
 *
 * Un numero de dos digitos desalinearia la grilla, asi que cae a `CELL`: con formas de
 * hasta 10 celdas no puede pasar, y si alguna vez pasa es mejor que se vea como un `#`
 * fuera de lugar que como un dibujo torcido.
 */
export function renderCellNumbers(cells: readonly Cell[], values: readonly number[]): string {
  return draw(cells, k => {
    const d = values[k];
    return Number.isInteger(d) && d >= 0 && d <= 9 ? String(d) : CELL;
  });
}

/** Ancho y alto del bounding box de una forma. */
export function sizeOf(cells: readonly Cell[]): { width: number; height: number } {
  if (cells.length === 0) return { width: 0, height: 0 };
  return {
    width: Math.max(...cells.map(c => c[0])) - Math.min(...cells.map(c => c[0])) + 1,
    height: Math.max(...cells.map(c => c[1])) - Math.min(...cells.map(c => c[1])) + 1,
  };
}
