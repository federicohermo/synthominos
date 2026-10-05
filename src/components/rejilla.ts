import { SHAPES } from '../domain/constants/pieces.constants.ts';
import { CASILLA_PX, REJILLA_ANCHO_TECHO_PX, REJILLA_GAP_PX } from './constants/layout.constants.ts';

/**
 * Cuántas columnas tiene una rejilla de `n` iconos para que **la última fila esté llena**.
 *
 * Es la función que `repeat(auto-fill, …)` no puede ser, y la diferencia es exactamente el
 * bug que este módulo cierra: `auto-fill` devuelve **la mayor cantidad que entre**, divida
 * o no. A un ancho que admita 5, `auto-fill` da 5 y deja 3 huecos; acá da 4.
 *
 * Rectángulo lleno = `c × f = n` exacto, o sea que `c` tiene que **dividir** a `n`. Con
 * doce iconos eso son `{1, 2, 3, 4, 6, 12}`, y la regla es la mayor que entre.
 *
 * ## Por qué 1 y 12 no son candidatas
 *
 * Porque son la misma degeneración vista por sus dos ejes, y una de las dos **es el bug de
 * hoy**: una columna por doce filas es la grilla que el dock pinta ahora mismo, 875 px de
 * alto adentro de una caja de 215. Doce columnas por una fila es su espejo — un dock de 620
 * px de ancho, o sea una barra que cruza el tablero—. Las dos son técnicamente rectángulos
 * llenos y ninguna de las dos es una tabla periódica, así que el conjunto de candidatas son
 * las divisoras **propias**: `{2, 3, 4, 6}` para doce, que es lo que AC1 pide.
 *
 * ## El piso, y por qué no puede no haberlo
 *
 * Si ninguna candidata entra —un techo más chico que las dos columnas de 100 px— se
 * devuelve **la menor**, no el 1. Devolver 1 sería contestar con el bug: la columna única
 * no aparece porque alguien la eligiera sino porque el ancho no alcanzaba, que es la misma
 * cadena que produjo el desborde de 1192 px. Con el chasis, el ancho del panel lo fija esta
 * cuenta y no al revés, así que un techo que no dé para dos columnas es un techo mal
 * elegido y no un caso que haya que degradar en silencio.
 *
 * El 1 se devuelve **sólo** cuando `n` no tiene ninguna divisora propia —un primo, o `n ≤
 * 3`—, que es el único caso donde no hay rectángulo no degenerado que dar. No es una rama
 * defensiva: `columnasRectangulares(7, …)` la ejercita, y con doce iconos no se alcanza.
 *
 * @param n     cuántos iconos hay que repartir
 * @param ancho el techo en px que la rejilla no puede pasar
 * @param pista el ancho de una columna en px
 * @param gap   la separación entre columnas en px
 */
export function columnasRectangulares(n: number, ancho: number, pista: number, gap: number): number {
  // Ascendente y en una sola pasada, guardando las dos respuestas que hacen falta: la menor
  // divisora propia (el piso) y la mayor que entra (la respuesta). Ordenar el conjunto de
  // divisoras para recorrerlo al revés sería una lista intermedia para leer dos elementos.
  let menor = 1;
  let mayorQueEntra = 0;
  for (let c = 2; c < n; c++) {
    if (n % c !== 0) continue;
    if (menor === 1) menor = c;
    // El `<=` y no `<` es a propósito: el ancho exacto entra, y es justo el caso del
    // default —4 columnas piden 204 contra un techo de 220—.
    if (anchoDeRejilla(c, pista, gap) <= ancho) mayorQueEntra = c;
  }
  return mayorQueEntra === 0 ? menor : mayorQueEntra;
}

/**
 * Lo que mide una rejilla de `columnas` pistas fijas: `columnas` pistas con `columnas - 1`
 * separaciones entre ellas.
 *
 * Es la cuenta que el navegador hace con `repeat(columnas, pista)` y `gap`, escrita una vez
 * porque la leen dos: la elección de columnas de arriba y el ancho del dock con el que
 * `drag.ts` lo apoya contra el borde derecho al cargar.
 */
export function anchoDeRejilla(columnas: number, pista: number, gap: number): number {
  return columnas * pista + (columnas - 1) * gap;
}

/**
 * Las columnas de la rejilla del dock, resueltas una vez al cargar el módulo.
 *
 * **Es un valor fijo y no una medición**, y ése es el cambio entero. Hasta acá lo contestaba
 * `repeat(auto-fill, minmax(…, 1fr))`, o sea el navegador contra la caja real, y
 * la caja real medía `calc(var(--cell) * 2)`: 108 px útiles después de la barra de scroll,
 * contra los 124 que piden dos pistas. Faltaban 16 px y el resultado era **1 columna × 12
 * filas**, 875 px de alto adentro de un scroller de 215.
 *
 * Con el chasis arrastrable la caja dejó de medirse en celdas, así que la pregunta se dio
 * vuelta: las columnas son la entrada y el ancho del panel es la salida. La palanca para
 * cambiar la forma del rectángulo es `REJILLA_ANCHO_TECHO_PX` y ningún otro lugar.
 *
 * Vive acá y no en `OrientationPanel.tsx` porque la leen dos: el panel, que dibuja la
 * rejilla, y la posición inicial del dock, que necesita su ancho. Una copia en cada lado
 * son dos formas de que el panel se dibuje de un ancho y se posicione contra otro.
 *
 * La cantidad de piezas sale de `SHAPES` y no del `12` escrito: el día que el modelo cambie
 * de pentominós, la rejilla lo sigue sola.
 */
export const COLUMNAS_DEL_DOCK = columnasRectangulares(
  Object.keys(SHAPES).length, REJILLA_ANCHO_TECHO_PX, CASILLA_PX, REJILLA_GAP_PX,
);
