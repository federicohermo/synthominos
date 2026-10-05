
/**
 * Geometria de las piezas: rotacion, reflexion y normalizacion.
 *
 * INVARIANTE que no hay que romper: las tres son `map`, asi que **la celda del
 * indice `k` sigue siendo la misma celda logica despues de transformar**.
 * `ANCHOR_INDEX` depende de esto —guarda la celda de agarre como indice, no como
 * coordenada—, y todo lo que resuelva un indice contra `PlacedPiece.cells` tambien.
 * Filtrar, ordenar o reagrupar celdas
 * dentro de estas funciones rompe la colocacion de piezas **sin ningun error
 * visible**.
 *
 * `y` crece hacia ABAJO: son coordenadas de grilla, no cartesianas, asi que el
 * recorrido angular va en sentido horario en pantalla.
 */

/** Celda de la grilla, `[x, y]`. `y` crece hacia ABAJO: son coordenadas de grilla, no cartesianas. */
export type Cell = [number, number];

/** Rotacion de 90°. Produce `-0` cuando `x = 0`; ver `sameCell` en invariants.ts. */
export function rotate90(cells: Cell[]): Cell[] { return cells.map(([x,y]): Cell => [y, -x]); }

/** Traslada la forma para que su esquina superior izquierda quede en (0,0). */
export function normalize(cells: Cell[]): Cell[]{
  const minx = Math.min(...cells.map(c=>c[0]));
  const miny = Math.min(...cells.map(c=>c[1]));
  return cells.map(([x,y]) => [x-minx, y-miny]);
}

/** `n` rotaciones de 90°, normalizando en cada paso. */
export function rotateN(cells: Cell[], n: number): Cell[]{ let r = normalize(cells); for(let i=0;i<n;i++) r = normalize(rotate90(r)); return r; }

/** Espejo vertical: `x -> -x`, renormalizado. */
export function reflect(cells: Cell[]): Cell[]{
  const refl: Cell[] = cells.map(([x,y]): Cell => [-x, y]);
  return normalize(refl);
}

/**
 * Centro de masa de una forma: el promedio de las coordenadas.
 *
 * Promedio y no centro de la bounding box: es lo que hace que el recorrido
 * angular quede repartido alrededor de la MASA de la pieza y no de su caja.
 * En una `L` las dos cosas caen en lugares distintos.
 *
 * Casi nunca da enteros —es un promedio de quintos—, asi que comparar contra
 * el resultado pide epsilon y no `===`.
 */
export function centroid(cells: readonly Cell[]): [number, number] {
  let sx = 0, sy = 0;
  for (const [x, y] of cells) { sx += x; sy += y; }
  return [sx / cells.length, sy / cells.length];
}

/**
 * Angulo de una celda vista desde el centroide, normalizado a `[0, 2π)`.
 *
 * `y` crece hacia ABAJO: son coordenadas de grilla, no cartesianas, asi que el
 * angulo crece en sentido HORARIO en pantalla y la celda al SUR del centroide
 * da `π/2` y no `-π/2`. No esta mal — es exactamente la clase de detalle que
 * alguien "arregla" por error, y por eso tiene un test propio.
 *
 * La normalizacion a `[0, 2π)` no es cosmetica: `atan2` devuelve `(-π, π]`, que
 * corta el anillo justo al oeste, y ordenar con eso pondria las celdas del
 * noroeste antes que las del norte.
 */
export function angleFromCentroid(cell: Cell, cent: readonly [number, number]): number {
  const twoPi = 2 * Math.PI;
  const a = Math.atan2(cell[1] - cent[1], cell[0] - cent[0]);
  if (a >= 0) return a;

  // El intervalo es SEMIABIERTO y la suma sola no lo garantiza: con `a` negativo
  // mas chico que el ulp de 2π (~8,9e-16) —una celda apenas al norte del este—,
  // `a + 2π` redondea a exactamente 2π y el resultado se sale del rango.
  //
  // No cambia ningun orden: 2π y 2π-ulp caen los dos al final del anillo, que es
  // donde va esa celda. Se acota igual porque el rango es el contrato que lee
  // `degreeByCellIndex`, y esta funcion recibe formas arbitrarias a proposito —
  // con las 12 de `SHAPES` no puede pasar, porque las coordenadas son enteras y
  // el centroide es una suma sobre 5, asi que `dy` o es cero exacto o es O(0,1).
  const norm = a + twoPi;
  return norm < twoPi ? norm : twoPi * (1 - Number.EPSILON);
}

/**
 * Distancia Manhattan entre dos celdas: cuantos pasos ortogonales hay de una a la
 * otra. Vale 1 cuando son vecinas por arriba, abajo, izquierda o derecha.
 *
 * Es la distancia con la que `pathThroughCells` MIDE, no con la que decide si dos
 * celdas se tocan — eso lo dice `seTocan`. La diferencia es lo que hace que la
 * diagonal se tolere pero no se prefiera: vale 2, o sea el doble que un paso recto.
 */
function manhattan(a: Cell, b: Cell): number { return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]); }

/**
 * Si dos celdas SE TOCAN: comparten un lado o una esquina.
 *
 * Es la relacion que `pathThroughCells` intenta encadenar, y **es mas laxa que la
 * regla del instrumento a proposito**. El recorrido entre piezas se mueve solo en
 * cruz —`routeBetween` no conoce la diagonal y este spec no la toca—; adentro de la
 * pieza la diagonal se tolera porque cuatro de las doce no admiten recorrido en cruz
 * y la alternativa es peor: la `T` pasaba POR ENCIMA de una celda propia que todavia
 * no habia sonado, para volver a ella dos pasos despues. Un paso en diagonal al menos
 * llega a una celda que se toca con la anterior.
 *
 * Con esta relacion las 12 piezas se recorren enteras. Con la ortogonal pura eran 8,
 * y las 4 que faltaban no era por el algoritmo sino por la forma: su grafo de celdas
 * es un arbol con un nodo de 3 o 4 vecinos.
 */
function seTocan(a: Cell, b: Cell): boolean {
  return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1])) === 1;
}

/** Compara dos secuencias posicion por posicion. Negativo si `a` va antes. */
function lex(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * El recorrido que visita todas las celdas de una forma moviendose lo mas posible a una
 * celda VECINA.
 *
 * Devuelve el ORDEN DE VISITA POR POSICION: el elemento `g` es el indice de la celda que
 * el camino pisa en el paso `g`.
 *
 * Ojo con la direccion de lectura, porque es la inversa de la que devuelve
 * `degreeByCellIndex` —que es "el grado de la celda `k`"— y las dos son permutaciones
 * de `0..n-1`, asi que confundirlas compila y da otra musica. La asimetria es
 * deliberada: un camino es una SECUENCIA de celdas, un mapeo de grados es una TABLA
 * por celda. La vuelta la da `music.ts` en una linea.
 *
 * `tiebreak[k]` es el rango de la celda `k` para desempatar, menor gana. Entra por
 * parametro y no se calcula aca porque el criterio es musical —hoy es el orden
 * angular— y `music.ts` esta aguas abajo: este modulo no lo importa
 * y no tiene por que saber que existe un grado.
 *
 * ## Los cuatro criterios, en orden
 *
 * 1. **La mayor cantidad de pasos a una celda que SE TOCA con la anterior**
 *    (`seTocan`: lado o esquina). Es el pedido: el arpegio recorre la pieza en vez de
 *    saltar por adentro de su propia forma. Con las 12 piezas se cumple entero.
 * 2. **A igualdad, la menor suma de distancias MANHATTAN.** Las dos metricas juntas
 *    son lo que hace que la diagonal se **tolere sin preferirse**: para el criterio 1
 *    un paso en diagonal es tan bueno como uno recto, pero para el 2 cuesta el doble,
 *    asi que solo se usa donde la forma no da para un paso recto.
 * 3. **A igualdad, los pasos largos LO MAS AL PRINCIPIO posible** (secuencia de
 *    distancias lexicograficamente mayor). Con la diagonal aceptada este criterio ya
 *    no separa "continuo" de "cortado" —todos los pasos llegan a una celda que se
 *    toca— pero **se queda**, y no por inercia: es lo unico que separa las dos
 *    versiones de la `Y`, y la referencia del pedido eligio a mano la que pone el
 *    paso diagonal primero.
 * 4. **A igualdad, el `tiebreak` lexicograficamente menor.** Se ejerce SIEMPRE, y no
 *    es un detalle: un camino y su inverso son igual de buenos en los tres criterios
 *    anteriores, asi que sin este el orden de las notas dependeria de por donde el
 *    `for` empezo a mirar.
 *
 * Los criterios 1 y 2 se empaquetan en un entero —`(se tocan ? 0 : BASE) + distancia
 * manhattan`— y los resuelve la programacion dinamica, que suma y compara sumas.
 * `BASE` sale de la forma y no es un numero fijo: con `1 + n * maxDistancia` es mayor
 * que cualquier camino posible, asi que el campo de la distancia no puede acarrear al
 * de los saltos. Es la misma tecnica que `claveDeTramo` en `sequence.ts`, con la misma
 * trampa: achicar `BASE` no falla en rojo, reordena las notas en silencio.
 *
 * Los criterios 3 y 4 no son aditivos —dependen de la POSICION del paso, no solo del
 * paso— asi que se resuelven despues, recorriendo unicamente las ramas que alcanzan
 * el optimo.
 *
 * ## Costo
 *
 * Held-Karp de camino abierto, `O(n^2 * 2^n)`: con `n = 5` son 160 estados y 4 µs por
 * llamada, contra 0,57 del orden angular que reemplaza. El recorrido posterior visita
 * solo caminos optimos —72 en el peor caso de las 12 piezas, que es la `X`—. El
 * argumento es el mismo con el que `shortestCircuit` justifica el TSP exacto: `n` esta
 * acotado por las reglas del juego, y aca mas fuerte todavia, porque `CELLS_PER_PIECE`
 * es la definicion de la familia de piezas y no un parametro. Con una forma de 12
 * celdas serian 590 mil operaciones; con 20, no termina.
 */
export function pathThroughCells(cells: readonly Cell[], tiebreak: readonly number[]): number[] {
  const n = cells.length;
  // Con 0, 1 o 2 celdas no hay nada que optimizar y decide el desempate solo. Sale
  // aparte porque el bucle de abajo asume que hay al menos un paso que elegir.
  if (n <= 2) return cells.map((_, k) => k).sort((a, b) => tiebreak[a] - tiebreak[b]);

  const dist = cells.map(a => cells.map(b => manhattan(a, b)));
  let maxDist = 0;
  for (const fila of dist) for (const d of fila) if (d > maxDist) maxDist = d;
  const BASE = 1 + n * maxDist;
  const costo = cells.map((a, i) => cells.map((b, j) => (seTocan(a, b) ? 0 : BASE) + dist[i][j]));

  // g[j][mask] = costo minimo de arrancar en `j` y visitar todo `mask`, con `j` fuera
  // de `mask`. Va HACIA ATRAS por el mismo motivo que `shortestCircuit`: asi el camino
  // se reconstruye hacia ADELANTE y el desempate se puede aplicar en el orden en que
  // las decisiones se toman, que es lo que los criterios 3 y 4 necesitan.
  const size = 1 << n;
  const g = new Array<number>(n * size).fill(0);
  for (let mask = 1; mask < size; mask++) {
    for (let j = 0; j < n; j++) {
      if ((mask >> j) & 1) continue;
      let best = Infinity;
      for (let k = 0; k < n; k++) {
        const bit = 1 << k;
        if (!(mask & bit)) continue;
        // `mask ^ bit` es menor que `mask`, asi que ya esta calculado. No hace falta
        // centinela de inalcanzable: el grafo es completo, todo estado tiene camino.
        const c = costo[j][k] + g[k * size + (mask ^ bit)];
        if (c < best) best = c;
      }
      g[j * size + mask] = best;
    }
  }

  const full = size - 1;
  let optimo = Infinity;
  for (let j = 0; j < n; j++) {
    const c = g[j * size + (full ^ (1 << j))];
    if (c < optimo) optimo = c;
  }

  // Entre los caminos que alcanzan el optimo gana el de distancias lexicograficamente
  // MAYORES (criterio 3, los saltos primero) y a igualdad el de `tiebreak` menores
  // (criterio 4). Solo se baja por las ramas que todavia alcanzan el optimo, asi que
  // el recorrido no es una fuerza bruta sobre las n! permutaciones.
  let mejor: number[] = [], mejorDist: number[] = [], mejorRango: number[] = [];
  const camino: number[] = [], dists: number[] = [];

  function bajar(cur: number, mask: number): void {
    if (mask === 0) {
      const rango = camino.map(k => tiebreak[k]);
      const porDist = mejor.length === 0 ? 1 : lex(dists, mejorDist);
      if (porDist > 0 || (porDist === 0 && lex(rango, mejorRango) < 0)) {
        mejor = [...camino]; mejorDist = [...dists]; mejorRango = rango;
      }
      return;
    }
    const objetivo = g[cur * size + mask];
    for (let k = 0; k < n; k++) {
      const bit = 1 << k;
      if (!(mask & bit)) continue;
      if (costo[cur][k] + g[k * size + (mask ^ bit)] !== objetivo) continue;
      camino.push(k); dists.push(dist[cur][k]);
      bajar(k, mask ^ bit);
      camino.pop(); dists.pop();
    }
  }

  for (let j = 0; j < n; j++) {
    if (g[j * size + (full ^ (1 << j))] !== optimo) continue;
    camino.push(j);
    bajar(j, full ^ (1 << j));
    camino.pop();
  }
  return mejor;
}
