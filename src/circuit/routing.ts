import type { Cell } from '../pieces/transform.ts';
import type { PlacedPiece, Dims } from '../board-editing/placement.ts';

/**
 * The graph of the board, as the circuit walks it: the seam, and the cheapest route between
 * two cells.
 *
 * Every function receives the board as a parameter, like the rules of `placement.ts`: the
 * pieces placed and the dimensions, which come from the viewport.
 */

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

/**
 * Los dos extremos de la costura: el tablero se repliega sobre si mismo y `(0,0)`
 * queda adyacente a `(w-1, h-1)`.
 *
 * Es UNA arista extra, no un toroide ni envoltura de todo el borde: ningun otro
 * par de celdas del borde se toca de mas. Medido sobre los 3.600 pares del tablero de
 * 10 x 6: acorta 496 (13,8 %) y baja la distancia maxima del tablero de 14 a 12.
 *
 * **El orden del par no significa nada.** `routeBetween` trata la costura como una arista
 * mas del grafo y la recorre en los dos sentidos sin nombre propio, asi que los dos
 * extremos son intercambiables: lo unico que importa es que sean estas dos celdas. Por que
 * el orden llego a importar, en el issue del spec 011.
 *
 * **Es una funcion y no una constante.** Dejo de poder ser un
 * valor cuando las dimensiones dejaron de ser constantes: la costura son las dos esquinas
 * opuestas del tablero que haya, no dos coordenadas fijas.
 */
export function costuraDe(dims: Dims): readonly [Cell, Cell] {
  return [[0, 0], [dims.w - 1, dims.h - 1]];
}

/**
 * El nodo del grafo que le toca a `(x, y)`, y su vuelta.
 *
 * `x * h + y` y no `y * w + x` a proposito: asi el id crece en el mismo orden en que
 * ordenan los pares `(x, y)`, y el desempate lexicografico de `routeBetween` es una
 * comparacion de enteros en vez de una de tuplas.
 */
function nodeOf(x: number, y: number, h: number): number {
  return x * h + y;
}

function cellOf(n: number, h: number): Cell {
  return [Math.floor(n / h), n % h];
}

/**
 * Las vecinas de `n`: las pegadas en la grilla, mas la otra punta de la costura si
 * `n` es una de las dos.
 *
 * Escribe sobre `out` y devuelve cuantas puso, en vez de armar un array. No es
 * microoptimizacion gratuita: una matriz de costos de 12 piezas son 144 llamadas a
 * `routeBetween`, y cada una la llama una vez por celda del tablero.
 *
 * El orden en que las escribe NO importa: quien desempata lo hace por id (ver
 * `routeBetween`), no por orden de aparicion.
 *
 * **La costura son los nodos `0` y `N - 1`, y eso no es una coincidencia que haya que
 * recordar**: `costuraDe` la define como las dos esquinas opuestas y `nodeOf` numera con
 * `x * h + y`, asi que `(0,0)` es el nodo 0 y `(w-1, h-1)` el ultimo. Se escribe asi y no
 * llamando a `costuraDe` porque esta funcion corre una vez por celda y por Dijkstra
 * —millones de veces en un tablero grande— y la version con la llamada aloca dos tuplas
 * en cada una. El test de la costura contrasta las dos formas, que es lo que impide que
 * se separen.
 */
function neighborsOf(n: number, out: number[], w: number, h: number): number {
  const x = Math.floor(n / h);
  const y = n % h;
  let k = 0;
  if (x > 0) out[k++] = n - h;
  if (x < w - 1) out[k++] = n + h;
  if (y > 0) out[k++] = n - 1;
  if (y < h - 1) out[k++] = n + 1;
  const ultimo = w * h - 1;
  if (n === 0) out[k++] = ultimo;
  else if (n === ultimo) out[k++] = 0;
  return k;
}

/**
 * El camino de costo minimo entre `a` y `b`, con lo que pisa en el medio.
 *
 * Reemplaza a `cellDistance` y `pathBetween`, que eran dos lecturas de
 * la misma decision de ruta pero no miraban el tablero: el camino ignoraba las piezas
 * colocadas, asi que los clicks del recorrido caian encima de la que acababa de
 * sonar. Ahora el grafo tiene PESOS —una celda vacia cuesta 1 y una ocupada
 * `CROSS_COST`— y las tres respuestas salen de UNA sola llamada:
 * la cantidad de clicks, el instante de la nota siguiente y las celdas que se pisan
 * no pueden discrepar porque son el mismo dato leido tres veces.
 *
 * ## El costo ordena, los pasos miden el tiempo
 *
 * `steps` es `path.length + 1` y NO el costo. Un cruce cuesta `CROSS_COST` pero dura
 * UN intervalo: el costo existe para elegir entre caminos, no para contar tiempo. Si
 * se filtrara a los offsets, el ciclo se estiraria justo donde no hay nada que
 * esperar.
 *
 * ## El peso lo pagan las celdas INTERMEDIAS
 *
 * El peso se cobra al ENTRAR a una celda, y entrar a `a` o a `b` es gratis. Las dos
 * puntas son puertas de una pieza —estan ocupadas por definicion—, asi que cobrarlas
 * le sumaria el mismo `2 * (CROSS_COST - 1)` a las 144 entradas de la matriz de
 * costos sin mover ningun minimo, y de paso romperia la simetria de la distancia:
 * contando solo las intermedias, `a -> b` y `b -> a` suman sobre el MISMO conjunto de
 * celdas. De ahi tambien que `crossed` sea exactamente el subconjunto ocupado de
 * `path`, y no una lista que haya que mantener aparte.
 *
 * ## Como se elige entre los caminos que empatan (D7)
 *
 * Dijkstra por costo desde `b` para tener `dist[]`, y despues el camino se reconstruye
 * HACIA ADELANTE desde `a` tomando en cada paso la vecina que minimiza
 * `peso(v) + dist[v]`, y entre las que empatan la de id mas chico —que por como esta
 * armado el id es la lexicograficamente menor en `(x, y)`.
 *
 * Eso compara el PREFIJO ENTERO sin tener que escribirlo: al desempate solo llegan las
 * vecinas desde las que todavia queda un camino de costo minimo, asi que elegir la
 * menor en cada paso da la secuencia menor de todas. Fijar el orden de exploracion del
 * Dijkstra no alcanzaba —la primera vecina que relaja no tiene por que ser la del
 * camino que gana— y guardar el camino entero en cada nodo para compararlos, que es lo
 * que hace la implementacion de referencia contra la que se contrasta en
 * `__tests__/routing.test.ts`, es cuadratico.
 *
 * ## `a === b`
 *
 * Devuelve `path: []` y `steps: 1`. Cumple el invariante del largo pero no es una
 * distancia, y queda fuera del dominio por la misma razon que en el 009: el tramo va
 * de la salida de una pieza a la entrada de OTRA, y con una sola pieza no hay tramo.
 */
export function routeBetween(a: Cell, b: Cell, placed: readonly PlacedPiece[], dims: Dims): Ruta {
  return rutador(placed, dims)(a, b);
}

/**
 * Un buscador de rutas sobre UN tablero, que se acuerda de lo que ya calculo.
 *
 * Es la misma respuesta que `routeBetween` —de hecho es su implementacion— pero atada a
 * `(placed, dims)` de entrada, y esa atadura es lo que la hace barata: **la caché de
 * distancias por destino**. Y esa es la unica razon por la que existe como
 * factory en vez de un cuarto parametro opcional: el `Map` no puede sobrevivir a un cambio
 * del tablero, y la unica forma de garantizarlo sin acordarse de invalidarlo es que viva en
 * el closure de un tablero.
 *
 * ## Por que la cache es por DESTINO
 *
 * `buildSequence` pide una matriz de `n x n` rutas —de la salida de cada pieza a la entrada
 * de cada otra—, o sea 144 consultas con 12 piezas. Pero los DESTINOS son 12: las entradas.
 * Y el Dijkstra de abajo corre **desde el destino** (esta escrito asi para poder reconstruir
 * el camino hacia adelante, ver el docblock de `routeBetween`), asi que una corrida da la
 * distancia desde TODAS las celdas de una vez. Las 144 corridas son 12 corridas y 132
 * reconstrucciones de camino, que son lineales en el largo del camino.
 *
 * El precio es el corte temprano: para poder reusar `dist[]` desde cualquier origen hay que
 * dejar que el Dijkstra cierre entero, y no cortarlo cuando el origen ya quedo cerrado. Aun
 * asi gana, y ya ganaba en el tablero de 60 celdas — 12 corridas completas cuestan menos que
 * 144 parciales. Medido con 12 piezas:
 *
 * ```
 * tablero          celdas   sin cache   con cache
 * 10 x  6             60      2,3 ms      1,9 ms
 * 26 x 14            364     10,9 ms      3,1 ms
 * 53 x 30 (4K)     1.590         —       30,9 ms
 * ```
 *
 * El 4K sigue fuera del presupuesto de 5 ms, con la salida ya identificada y sin hacer:
 * los pesos son solo dos (1 y `CROSS_COST`), asi que una cola de
 * baldes baja el `O(N^2)` de la busqueda lineal del minimo a `O(N * C)`.
 *
 * **No cambia una sola ruta**, y eso esta verificado y no argumentado: el test de AC7 en
 * `__tests__/routing.test.ts` contrasta este rutador contra `routeBetween` —que arma uno
 * nuevo por consulta, o sea la version sin cache— sobre tableros con PRNG determinista, en
 * el tablero de referencia y en uno de 26 x 15. Fuera del repo, el script de comparacion
 * del research comparo ademas la SECUENCIA entera en 279 tableros al azar, con cero
 * diferencias. El argumento igual existe: `dist[]` es funcion de `(destino, placed)`, y
 * adentro de un rutador `placed` no cambia.
 */
export function rutador(placed: readonly PlacedPiece[], dims: Dims): (a: Cell, b: Cell) => Ruta {
  const { w, h } = dims;
  const N = w * h;

  // Una sola vez para todo el tablero, y no una por consulta: con 12 piezas y la matriz
  // completa, esto se armaba 144 veces para dar siempre lo mismo.
  const ocupada = new Uint8Array(N);
  for (const p of placed) for (const [x, y] of p.cells) ocupada[nodeOf(x, y, h)] = 1;

  // Centinela de "todavia sin alcanzar": mas caro que el camino mas caro posible —las 60
  // celdas del tablero viejo ocupadas a `CROSS_COST` son 300 con el 5 de hoy, y 3.660 con
  // el 61 que la constante discute y descarta; en un tablero de 390 celdas son 1.950— y
  // lejos del borde de Int32 para que sumarle un peso no desborde. O sea que aguanta
  // cualquier tablero y cualquier peso razonable sin tocarlo.
  const INF = 0x3fffffff;
  const vecinas = [0, 0, 0, 0, 0];
  const cache = new Map<number, Int32Array>();

  const distanciasHacia = (destino: number): Int32Array => {
    const guardada = cache.get(destino);
    if (guardada !== undefined) return guardada;

    const dist = new Int32Array(N).fill(INF);
    const listo = new Uint8Array(N);
    dist[destino] = 0;
    for (;;) {
      let u = -1;
      let mejor = INF;
      for (let v = 0; v < N; v++) if (!listo[v] && dist[v] < mejor) { mejor = dist[v]; u = v; }
      // El tablero es conexo, asi que esto solo pasa cuando ya se cerraron todas.
      if (u === -1) break;
      listo[u] = 1;
      const k = neighborsOf(u, vecinas, w, h);
      const entrar = mejor + (u === destino ? 0 : ocupada[u] ? CROSS_COST : 1);
      for (let i = 0; i < k; i++) if (entrar < dist[vecinas[i]]) dist[vecinas[i]] = entrar;
    }
    cache.set(destino, dist);
    return dist;
  };

  return (a: Cell, b: Cell): Ruta => {
    const origen = nodeOf(a[0], a[1], h);
    const destino = nodeOf(b[0], b[1], h);
    const dist = distanciasHacia(destino);
    const peso = (n: number): number => n === destino ? 0 : ocupada[n] ? CROSS_COST : 1;

    const path: Cell[] = [];
    const crossed: Cell[] = [];
    let cur = origen;
    while (cur !== destino) {
      const k = neighborsOf(cur, vecinas, w, h);
      let siguiente = vecinas[0];
      let costo = peso(vecinas[0]) + dist[vecinas[0]];
      for (let i = 1; i < k; i++) {
        const v = vecinas[i];
        const c = peso(v) + dist[v];
        if (c < costo || (c === costo && v < siguiente)) { costo = c; siguiente = v; }
      }
      // Sin centinela ni guarda de "no encontre": el minimo sobre las vecinas ES
      // `dist[cur]` —es la ecuacion de Dijkstra—, y como entrar a cualquier celda que no
      // sea `destino` cuesta al menos 1, `dist` baja ESTRICTAMENTE en cada paso. El
      // recorrido termina y no puede volver sobre una celda que ya piso.
      cur = siguiente;
      if (cur !== destino) {
        const celda = cellOf(cur, h);
        path.push(celda);
        if (ocupada[cur]) crossed.push(celda);
      }
    }

    // `cost` sale de `dist[origen]` y no de recontar `path` y `crossed`: es EL numero que
    // el Dijkstra minimizo, no una formula que lo reproduce. Recalcularlo afuera —aunque
    // hoy `path.length + crossed.length * (CROSS_COST - 1)` de lo mismo, porque `crossed`
    // es el subconjunto ocupado de `path`— seria escribir la regla de pesos en un segundo
    // lugar, y es exactamente lo que D3 existe para evitar: sin formula cerrada, dos
    // lugares que calculan el costo no tienen nada que los obligue a coincidir.
    return { path, steps: path.length + 1, cost: dist[origen], crossed };
  };
}
