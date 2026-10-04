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
 * ninguna posicion. Es el mismo argumento que `MINI_BOX` en `components/`, sobre otro
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

/**
 * Lo que cuesta ENTRAR a una celda ocupada al trazar el camino entre dos piezas,
 * contra 1 de una celda vacia.
 *
 * Es una propiedad del GRAFO del tablero, igual que la costura: aquella dice que celdas
 * son vecinas y esto dice cuanto cuesta pisar cada una. Vivian una al lado de la otra
 * hasta que la costura paso a ser la funcion `costuraDe(dims)` de `board.ts`
 * —dejo de poder ser un valor cuando el tablero dejo de tener un tamano fijo—; este
 * numero no depende de las dimensiones, asi que se queda.
 *
 * El 5 sale de barrer el peso sobre dos mediciones distintas, y la que decide **no**
 * es el caso testigo sino la segunda.
 *
 * Sobre el caso testigo del spec —la `P` rotada 1 en (3,2) y la `Y` rotada 1 en (7,2),
 * las dos piezas entre las que el 009 dejaba el recorrido pisando la que acababa de
 * sonar— alcanzaba con 2:
 *
 * | peso | celdas pisadas por ciclo | largo del ciclo |
 * |---|---|---|
 * | 1 (el 009, sin peso) | 3 | 18 |
 * | 2 | 1 | 18 |
 * | **5** | **0** | 20 |
 *
 * Pero el testigo es UN tramo, y sobre 200 tableros aleatorios por tamano —con las
 * puertas reales— la pregunta que importa es otra: **cada cuanto el recorrido pisa una
 * pieza TENIENDO un rodeo libre disponible.** O sea las veces que cruza pudiendo no
 * hacerlo, que es lo unico que se lee como error y no como necesidad:
 *
 * | peso | cruces/ciclo (3 pz) | (5 pz) | ciclo vs peso 2 | cruza teniendo rodeo libre |
 * |---|---|---|---|---|
 * | 2 | 2,12 | 5,24 | — | **20,4 %** |
 * | 3 | 1,57 | 4,45 | +2,8 % | 16,0 % |
 * | **5** | **1,10** | **3,69** | **+7,1 %** | **9,9 %** |
 * | 61 (prohibir de hecho) | 0,51 | 2,83 | +19,3 % | **0 %** |
 *
 * Con 2, **uno de cada cinco tramos cruza una pieza pudiendo rodearla** — y eso se ve:
 * la cabeza lectora lo hace evidente, que es como se encontro. Con 5 baja a uno
 * de cada diez y el ciclo crece 7 %.
 *
 * **No se eligio 61 —que es el unico valor que cumple "solo cruzar si no hay
 * alternativa"— por lo que cuesta el otro extremo:** casi 20 % de ciclo, y sobre todo
 * rodeos de hasta +20 intervalos en un solo salto (2,7 s a 110 bpm, `research.md` §3).
 * Ese rodeo no se escucha como rodeo sino como que el instrumento se colgo, que es
 * exactamente el sintoma que tener un peso —y no una prohibicion— existe para evitar.
 * 5 acota el rodeo a 4 pasos extra por celda evitada, que es un compas y no una pausa.
 *
 * Sigue siendo un PESO y no una regla: cuando no hay camino libre —la celda central de
 * la `X` esta rodeada por sus propios brazos y es siempre una de sus puertas— el
 * recorrido cruza igual y la celda suena su nota. Por eso no hay caso especial que
 * escribir, ni tope al rodeo, ni trato aparte para la `X`.
 *
 * Moverlo es cambiar este numero: la tabla de arriba dice que se gana y que se paga.
 */
export const CROSS_COST = 5;
