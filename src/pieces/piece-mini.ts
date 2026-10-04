import { rotateN, reflect } from './transform.ts';
import { SHAPES } from './pieces.ts';
import type { Cell } from './transform.ts';
import type { PieceKey } from './pieces.ts';

/* `PREVIEW_CELL_PX` (20) se fue con el panel de previsualizacion aparte (`PiecePreview`),
   que dejo de existir cuando el fantasma del tablero paso a mostrar la nota de cada
   celda (spec 007, issue #69).

   La miniatura de la paleta **no deshace ese retiro**, y conviene que quede escrito
   porque se le parece. Aquel panel se fue por repetir las NOTAS —el fantasma las dice mejor,
   sobre la celda donde van a caer— y la miniatura de la paleta no dice ni una nota
   ni un `#N` (D7): dice la FORMA, que es lo que aquel retiro se llevo puesto de
   paso y lo unico que el fantasma no puede contestar, porque para verlo ya hay que
   haber elegido la pieza. Y aquel 20 era una miniatura sola en un panel de 252 px;
   aca son doce en el mismo lugar. */

/**
 * El lado de la caja de la miniatura de la paleta, en celdas.
 *
 * 5 es la caja mas chica que contiene cualquier pentomino en cualquiera de sus 8
 * orientaciones: el maximo en un eje lo pone sola la `I` —5×1 acostada, 1×5 parada— y
 * ninguna otra pieza pasa de 4×2 ni de 3×3. Con 4 la `I` no entra.
 *
 * **Con la orientacion por pieza la caja fija es MAS necesaria, no menos.** Si las doce
 * miniaturas compartieran una orientacion, una fila que se descuadra al rotar se descuadra
 * entera y de una vez. Como cada pieza recuerda la suya y las doce cambian por separado,
 * sin la caja fija rotar la `I` sola moveria a sus once vecinas de la grilla. El argumento
 * esta duplicado en `piece-mini.ts` y en `DESIGN.md`, y los tres tienen que decir lo mismo.
 *
 * **No se toma `CELLS_PER_PIECE` de `domain/`**, aunque valga 5 tambien. Son dos
 * numeros distintos que coinciden por casualidad: aquel dice cuantas celdas tiene una
 * pieza —una propiedad del modelo— y este cuantas casillas mide la caja donde se
 * dibuja, que es una decision de layout. Atarlos haria que cambiar el pentomino a
 * hexomino moviera el layout, y que agrandar la caja pareciera un cambio de modelo.
 */
export const MINI_BOX = 5;

/**
 * El lado de una celda de la miniatura, en px.
 *
 * **El argumento con el que este numero se eligio esta muerto**, y conviene decirlo antes
 * que nada porque era el argumento entero: salia del alto de la fila de tarjetas que la
 * paleta compartia con el tablero, y esa fila no existe. La cadena completa —seis columnas
 * de 8 px para no robarle alto al tablero— esta en el spec 021 (issue #83). Hoy no hay
 * fila, no hay tarjeta y el tamano de celda sale del viewport; la paleta es un dock `fixed`
 * que flota encima y no le quita un pixel a nadie.
 *
 * Lo que decide el numero ahora es la CAJA DEL DOCK, que mide `calc(var(--cell) * 2)` de
 * ancho — 146 px en el peor caso, que es el piso. Ahi adentro tienen que entrar las doce
 * miniaturas con su letra, y la tabla de columnas se resuelve contra el ancho real del
 * contenedor (`OrientationPanel.tsx`) y no contra el breakpoint del viewport, que no dice
 * nada sobre cuanto mide esta caja.
 *
 * 8 px se queda porque sigue siendo el mas chico que deja leer la FORMA: con `MINI_BOX = 5`
 * la caja mide 40 px de lado, y a menos que eso las piezas de tres celdas de ancho dejan de
 * distinguirse entre si. No se remidio con el dock puesto — si el dock cambia de ancho, este
 * es el numero a remedir.
 */
export const MINI_CELL_PX = 8;

/**
 * El ancho minimo de una columna de la grilla de miniaturas, en px.
 *
 * Derivado y no tipeado: es la caja del mini (`MINI_BOX x MINI_CELL_PX` = 40) mas el
 * `px-2` del boton que la contiene (8 por lado) mas su borde (1 por lado). Si alguno de
 * los dos numeros de arriba cambia, este lo sigue solo.
 *
 * Reemplaza a la tabla de breakpoints que `OrientationPanel` tenia: ahi las columnas salian
 * del ancho del VIEWPORT, que era una buena aproximacion del ancho de la tarjeta mientras la
 * tarjeta ocupaba una columna del grid.
 * Con el dock son dos variables distintas —el dock mide `calc(var(--cell) * 2)`, o sea
 * entre 146 y 360 px, mientras el viewport puede estar en `xl`— y la aproximacion se cae:
 * a 1366 x 768 el breakpoint pedia SEIS columnas adentro de una caja de 256 px. Con
 * `repeat(auto-fill, minmax(MINI_PISTA_PX, 1fr))` la cuenta la hace el navegador contra la
 * caja real, que es la misma decision de una sola fuente del numero que `--cell`.
 */
export const MINI_PISTA_PX = MINI_BOX * MINI_CELL_PX + 16 + 2;

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
