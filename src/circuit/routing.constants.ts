/**
 * What it costs to ENTER an occupied cell when the route between two pieces is traced,
 * against 1 for an empty cell.
 *
 * It is a property of the GRAPH of the board, like the seam: the seam says which cells are
 * neighbors, and this says what it costs to step on each one. The seam is the function
 * `costuraDe(dims)` of `routing.ts` because it depends on the dimensions; this number does
 * not, so it is a value.
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
