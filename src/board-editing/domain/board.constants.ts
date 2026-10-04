import type { Dims } from './board.types.ts';

/**
 * El tablero mas chico que tiene sentido, en celdas.
 *
 * El tamano del tablero **no es una constante**: sale del viewport y
 * llega como parametro (`Dims`). Lo que queda fijo son estos dos bordes.
 *
 * 5 x 5 y no 4 x 4 porque 5 es el lado de la caja mas chica que contiene cualquier
 * pentomino en cualquiera de sus 8 orientaciones —el maximo en un eje lo pone sola la
 * `I`, 5x1 acostada y 1x5 parada—, o sea que abajo de 5 hay piezas que no entran en
 * ninguna posicion. Es el mismo argumento que `MINI_BOX` en `ui/`, sobre otro
 * dibujo: aquel es la caja donde se dibuja la miniatura y este es el tablero, y coinciden
 * porque los dos tienen que contener a la `I`.
 *
 * Es un piso duro: en un viewport donde 5 celdas de 73 px no entren, la que se achica es
 * la celda. El tablero nunca tiene menos de 5 x 5 — sin eso hay piezas de la paleta que no
 * se podrian colocar en ningun lado, que es peor que una celda chica.
 */
export const GRID_MIN: Dims = { w: 5, h: 5 };

/**
 * El tablero de siempre: 10 x 6.
 *
 * No es lo que la app dibuja —eso lo decide el viewport— pero sigue
 * siendo el tablero de REFERENCIA, y por eso vive acá y no como dos numeros sueltos en
 * cada llamador: lo usan el MCP server cuando la consulta no dice dimensiones y los tests
 * del dominio que no tienen ninguna razon para inventar un tamano. Que sea el mismo par
 * historico es lo que hace que una consulta a `simulate_board` escrita cuando el tablero
 * era fijo siga dando exactamente lo mismo.
 */
export const GRID_DEFAULT: Dims = { w: 10, h: 6 };

/**
 * Cuantas piezas acepta el tablero, sea del tamano que sea.
 *
 * **Es una regla y no una consecuencia del AREA.** En el tablero de referencia el area
 * alcanza para deducirlo —60 celdas y 5 por pentomino son 12— pero con el tablero saliendo
 * del viewport no alcanza: 1920 x 1080 dan 390 celdas, o sea 78 piezas. `shortestCircuit`
 * da 12 por sentadas en su docblock, asi que el limite tiene que estar escrito, y esta
 * escrito aca.
 *
 * Y 78 no es un tablero mas grande: es otro problema. El circuito se resuelve con
 * Held-Karp **exacto**, `O(n^2 * 2^n)`, y eso esta elegido a proposito —el greedy da
 * recorridos +20,1 % en promedio y +79 % en el peor caso, y ademas no es determinista
 * entre tableros iguales—. Medido sobre 26 x 14 = 364 celdas, con la cache de distancias
 * por destino puesta:
 *
 * ```
 * piezas   buildSequence
 *   12        3,1 ms
 *   13        3,7 ms
 *   14        5,6 ms
 *   15        9,7 ms
 *   16       18,6 ms
 * ```
 *
 * Duplica por pieza, que es lo que dice `2^n`. No hay optimizacion que compre 78: son 66
 * duplicaciones.
 *
 * Asi que el tope se escribe, y vale **exactamente lo que hoy es cierto**. No recorta
 * ningun tablero que se pueda armar hoy: lo que cambia es quien lo garantiza.
 */
export const MAX_PIEZAS = 12;
