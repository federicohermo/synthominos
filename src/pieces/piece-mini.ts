import { rotateN, reflect } from './transform.ts';
import { SHAPES } from './pieces.constants.ts';
import { MINI_BOX } from '../board-fit/layout.constants.ts';
import type { Cell } from './transform.types.ts';
import type { PieceKey } from './pieces.types.ts';

/**
 * La forma de una pieza en coordenadas de la miniatura de la paleta: sus cinco celdas
 * ya rotadas, reflejadas y **centradas** en una caja de `MINI_BOX` × `MINI_BOX`.
 *
 * Vive acá y no adentro de `PiecePalette.tsx` por el motivo de siempre:
 * `react-refresh/only-export-components` prohíbe que un `.tsx` exporte algo que no sea
 * el componente, y el centrado es aritmética que se equivoca en silencio. Es el mismo
 * movimiento con el que salió `cell-text.ts`.
 *
 * ## Por qué la caja es fija, y por qué mide 5
 *
 * La caja **no se ajusta al contenido**, y eso es lo que permite que la miniatura muestre
 * la orientación ACTUAL en vez de la canónica. La `I` pasa de 5×1 a 1×5 al rotar: con
 * cajas ajustadas, los doce botones reflowearían en cada rotación, que es exactamente el
 * bug que `PiecePalette.tsx` ya documenta para su línea de notas — un panel de control
 * que se acomoda solo cuando lo tocás mueve el botón justo cuando vas a apretarlo.
 *
 * Cada pieza recuerda **su** orientación, así que las doce cambian por
 * separado: rotar la `I` sola alcanzaría para descuadrar a sus once vecinas. La caja fija
 * es lo que hace que esa independencia no cueste layout.
 *
 * 5 es la caja más chica que contiene cualquier pentominó en cualquiera de sus 8
 * orientaciones: el máximo en un eje es 5 y lo pone sola la `I`; ninguna otra pieza pasa
 * de 4×2 ni de 3×3. Con 4×4 la `I` no entra.
 *
 * ## Acá el invariante de orden del array NO aplica
 *
 * Vale decirlo porque todo el resto del repo afirma lo contrario, y con razón: en
 * `domain/` la celda del índice `k` tiene que seguir siendo la misma celda lógica después
 * de transformar, porque de eso dependen `ANCHOR_INDEX`, el grado de cada celda y las
 * puertas del circuito. Acá no: la miniatura no numera celdas, no las conecta con grados
 * y no dice qué suena — sólo pinta cuáles están ocupadas. Reordenar su salida no rompería
 * nada, y por eso el centrado puede ser un `map` sin cuidados especiales.
 *
 * Lo que sí importa es el ORDEN DE LA CADENA: `rotateN` primero y el espejo después, que
 * es lo que hacen `App.tsx`, `invariants.ts` y `describePiece.ts`. Invertirlo compila y
 * da la orientación equivocada en 48 de las 96 combinaciones — o sea que la paleta
 * mostraría una pieza y el tablero colocaría otra.
 */
export function miniCells(piece: PieceKey, rotation: number, mirror: boolean): Cell[] {
  const rotada = rotateN(SHAPES[piece], rotation);
  // `rotateN` y `reflect` normalizan los dos, asi que la forma ya viene pegada a (0,0):
  // el minimo de cada eje es 0 y el maximo es el lado menos uno. Sin esa garantia el
  // ancho habria que medirlo como `max - min + 1`, y leerlo antes de normalizar es una
  // de las dos formas de que el centrado quede corrido y compile igual.
  const forma = mirror ? reflect(rotada) : rotada;
  const ancho = Math.max(...forma.map((c) => c[0])) + 1;
  const alto = Math.max(...forma.map((c) => c[1])) + 1;
  // `floor` y no `round`: es la otra forma de equivocarlo en silencio. Con `round`, una
  // pieza de ancho par en una caja impar se corre un lugar de mas y queda pegada al borde
  // derecho en la mitad de las orientaciones. Con `floor` el pixel impar sobrante queda
  // siempre del mismo lado, que es lo unico que hace falta para que no salte al rotar.
  const dx = Math.floor((MINI_BOX - ancho) / 2);
  const dy = Math.floor((MINI_BOX - alto) / 2);
  return forma.map(([x, y]): Cell => [x + dx, y + dy]);
}
