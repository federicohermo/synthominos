import { describe, it, expect } from 'vitest';
import { rotate90, normalize, rotateN, reflect, centroid, angleFromCentroid, pathThroughCells } from '../transform.ts';
import { SHAPES } from '../pieces.constants.ts';
// El mismo numero que usa `degreeByCellIndex` para decidir "esta celda cae sobre el
// centroide", y no una copia local: es la misma pregunta, y dos epsilon que tienen
// que coincidir sin que nada los sincronice es el patron que las constantes evitan.
import { DEGREE_EPSILON } from '../../musical-model/music.constants.ts';
import type { Cell } from '../transform.types.ts';
import type { PieceKey } from '../pieces.types.ts';

const PIECES = Object.keys(SHAPES) as PieceKey[];

/** Comparacion de celdas que no distingue `-0` de `0`. Ver el test de AC7. */
const sameCell = (a: Cell, b: Cell) => a[0] + 0 === b[0] + 0 && a[1] + 0 === b[1] + 0;
const sameCells = (a: Cell[], b: Cell[]) => a.length === b.length && a.every((c, i) => sameCell(c, b[i]));

describe('rotate90', () => {
  it('AC-PCS-010 — mapea [x,y] a [y,-x] preservando el orden del array', () => {
    const cells: Cell[] = [[0,0],[1,0],[2,3]];
    expect(sameCells(rotate90(cells), [[0,0],[0,-1],[3,-2]])).toBe(true);
  });

  it('AC-PCS-009 — cuatro rotaciones normalizadas vuelven a la forma original', () => {
    for (const p of PIECES) {
      expect(sameCells(rotateN(SHAPES[p], 4), normalize(SHAPES[p]))).toBe(true);
    }
  });
});

describe('normalize', () => {
  it('lleva la esquina superior izquierda a (0,0)', () => {
    expect(sameCells(normalize([[3,5],[4,5],[3,7]]), [[0,0],[1,0],[0,2]])).toBe(true);
  });

  it('es idempotente', () => {
    for (const p of PIECES) {
      const once = normalize(SHAPES[p]);
      expect(sameCells(normalize(once), once)).toBe(true);
    }
  });
});

describe('rotateN', () => {
  it('preserva la cantidad de celdas en las cuatro rotaciones', () => {
    for (const p of PIECES) {
      for (let r = 0; r < 4; r++) expect(rotateN(SHAPES[p], r)).toHaveLength(5);
    }
  });

  it('rotar dos veces intercambia ancho por alto dos veces: vuelve al bounding box original', () => {
    const box = (cells: Cell[]) => [
      Math.max(...cells.map(c => c[0])),
      Math.max(...cells.map(c => c[1])),
    ];
    for (const p of PIECES) {
      expect(box(rotateN(SHAPES[p], 2))).toEqual(box(normalize(SHAPES[p])));
    }
  });

  it('rotar 90° intercambia ancho por alto', () => {
    for (const p of PIECES) {
      const base = normalize(SHAPES[p]);
      const girada = rotateN(SHAPES[p], 1);
      expect(Math.max(...girada.map(c => c[0]))).toBe(Math.max(...base.map(c => c[1])));
      expect(Math.max(...girada.map(c => c[1]))).toBe(Math.max(...base.map(c => c[0])));
    }
  });
});

describe('reflect', () => {
  it('AC-PCS-013 — espeja en x y renormaliza', () => {
    expect(sameCells(reflect([[0,0],[1,0],[2,1]]), [[2,0],[1,0],[0,1]])).toBe(true);
  });

  it('AC-PCS-013 — es involutiva sobre una forma normalizada', () => {
    for (const p of PIECES) {
      const base = normalize(SHAPES[p]);
      expect(sameCells(reflect(reflect(base)), base)).toBe(true);
    }
  });
});

/**
 * El cero con signo (AC7).
 *
 * Medido, no supuesto: de las cuatro funciones **solo `rotate90` cruda produce
 * `-0`** —la niega al mapear `[x,y] -> [y,-x]`—, y las 12 piezas lo disparan
 * porque todas tienen alguna celda con `x = 0`. `normalize` lo limpia (`-0 - -0`
 * da `+0`), asi que `rotateN` y `reflect`, que normalizan al final, nunca lo
 * dejan salir.
 *
 * Importa igual porque `toEqual` y `deepStrictEqual` SI distinguen `-0` de `0`:
 * cualquier test que compare la salida cruda de `rotate90` contra literales tiene
 * que pasar por `sameCell`.
 */
describe('el cero con signo', () => {
  it('rotate90 cruda produce -0, y toEqual lo distingue de 0', () => {
    const [c] = rotate90([[0, 0]]);
    expect(Object.is(c[1], -0)).toBe(true);
    expect(c[1] === 0).toBe(true);            // el === no lo ve
    expect(() => expect([c]).toEqual([[0, 0]])).toThrow();   // toEqual si
    expect(sameCell(c, [0, 0])).toBe(true);   // sameCell lo normaliza
  });

  it('las 12 piezas disparan el caso al rotar sin normalizar', () => {
    for (const p of PIECES) {
      expect(rotate90(SHAPES[p]).some(([x, y]) => Object.is(x, -0) || Object.is(y, -0))).toBe(true);
    }
  });

  it('normalize lo limpia, asi que rotateN y reflect nunca lo dejan salir', () => {
    const negZero = (cells: Cell[]) => cells.some(([x, y]) => Object.is(x, -0) || Object.is(y, -0));
    for (const p of PIECES) {
      for (let r = 0; r < 4; r++) expect(negZero(rotateN(SHAPES[p], r))).toBe(false);
      expect(negZero(reflect(SHAPES[p]))).toBe(false);
    }
  });
});

const distancia = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('centroid', () => {
  /**
   * El centroide de las 12 piezas canonicas, congelado.
   *
   * Son todos promedios de quintos, asi que la comparacion va con epsilon y no con
   * `===`: por eso `toBeCloseTo`.
   */
  const CENTROIDES: Record<PieceKey, [number, number]> = {
    F: [1, 1.2],
    I: [2, 0],
    L: [0.2, 1.2],
    N: [1.4, 0.6],
    P: [0.8, 0.4],
    T: [1, 0.6],
    U: [1, 0.4],
    V: [0.6, 0.6],
    W: [1.2, 0.8],
    X: [1, 1],
    Y: [1.6, 0.2],
    Z: [1, 1],
  };

  it('es el promedio de las coordenadas de las 12 piezas', () => {
    for (const p of PIECES) {
      const [cx, cy] = centroid(SHAPES[p]);
      expect(cx).toBeCloseTo(CENTROIDES[p][0], 12);
      expect(cy).toBeCloseTo(CENTROIDES[p][1], 12);
    }
  });

  it('es el centro de MASA y no el de la bounding box: en L caen en lugares distintos', () => {
    // La `L` es el contraejemplo barato: cuatro celdas en la columna 0 y una sola en
    // la 1, asi que el promedio se corre hacia la columna llena mientras que el
    // centro de la caja se queda en el medio geometrico.
    const cent = centroid(SHAPES.L);
    const caja: [number, number] = [
      (Math.min(...SHAPES.L.map(c => c[0])) + Math.max(...SHAPES.L.map(c => c[0]))) / 2,
      (Math.min(...SHAPES.L.map(c => c[1])) + Math.max(...SHAPES.L.map(c => c[1]))) / 2,
    ];
    expect(cent).not.toEqual(caja);
    expect(distancia(cent, caja)).toBeGreaterThan(0.4);
  });

  it('solo I, X y Z tienen una celda parada sobre el centroide, y es la del indice 2', () => {
    // Medido, no supuesto: es la regla que saca esa celda del anillo angular y le da el
    // primer lugar del anillo —`angularRank` 0—, que NO es el grado 0: el grado 0 es la
    // punta por donde se empieza a caminar la forma, y lo decide `pathThroughCells`. Las
    // otras 9 piezas no tienen ninguna.
    //
    // La `Z` entro a esta lista con el spec 036, y es una consecuencia AUDIBLE del
    // arreglo: mientras fue la `N` reflejada su centroide caia en (1.4, 0.4), o sea en
    // el aire, y sus cinco celdas repartian el anillo por angulo. Con la forma de verdad
    // el centroide es (1, 1) y ahi hay celda, asi que sale del anillo y con ella se da
    // vuelta la direccion del recorrido — medido: `degreeByCellIndex(SHAPES.Z)` pasa de
    // `[0,1,2,3,4]` a `[4,3,2,1,0]`, que es lo que movio `TONICA_EN.Z` de 0 a 4 en
    // `music.test.ts`. Es tambien lo que hace que `ANCHOR_INDEX.Z` sea 2.
    const CON_CELDA_AL_CENTRO: PieceKey[] = ['I', 'X', 'Z'];
    const sobreElCentro = (p: PieceKey) => {
      const cent = centroid(SHAPES[p]);
      return SHAPES[p].flatMap((c, k) => (distancia(c, cent) < DEGREE_EPSILON ? [k] : []));
    };
    for (const p of PIECES) {
      expect(sobreElCentro(p), p).toEqual(CON_CELDA_AL_CENTRO.includes(p) ? [2] : []);
    }
  });
});

describe('angleFromCentroid', () => {
  it('la celda al SUR del centroide da π/2, no -π/2: el eje Y crece hacia abajo', () => {
    // Coordenadas de grilla, no cartesianas. Es exactamente la clase de detalle que
    // alguien "arregla" por error, y por eso tiene un test propio.
    expect(angleFromCentroid([1, 2], [1, 1])).toBeCloseTo(Math.PI / 2, 12);
  });

  it('recorre el circulo en sentido horario en pantalla: este 0, sur π/2, oeste π, norte 3π/2', () => {
    const cent: [number, number] = [1, 1];
    expect(angleFromCentroid([2, 1], cent)).toBeCloseTo(0, 12);
    expect(angleFromCentroid([1, 2], cent)).toBeCloseTo(Math.PI / 2, 12);
    expect(angleFromCentroid([0, 1], cent)).toBeCloseTo(Math.PI, 12);
    expect(angleFromCentroid([1, 0], cent)).toBeCloseTo(3 * Math.PI / 2, 12);
  });

  it('no depende de la distancia: dos celdas en la misma direccion dan el mismo angulo', () => {
    // De aca salen los empates que despues desempata `degreeByCellIndex`.
    expect(angleFromCentroid([1, 2], [1, 1])).toBe(angleFromCentroid([1, 9], [1, 1]));
  });

  it('normaliza a [0, 2π): ningun angulo de las 12 piezas sale negativo', () => {
    // `atan2` devuelve `(-π, π]`, que corta el anillo justo al oeste: sin normalizar,
    // ordenar por angulo pondria las celdas del noroeste antes que las del norte.
    for (const p of PIECES) {
      const cent = centroid(SHAPES[p]);
      for (const celda of SHAPES[p]) {
        const a = angleFromCentroid(celda, cent);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(2 * Math.PI);
      }
    }
  });

  it('el intervalo sigue semiabierto con un angulo negativo mas chico que el ulp de 2π', () => {
    // El caso que las 12 piezas no pueden producir —sus coordenadas son enteras—
    // pero que esta funcion acepta, porque `degreeByCellIndex` recibe formas
    // arbitrarias a proposito. `atan2(-1e-17, 1)` da -1e-17, y sumarle 2π redondea
    // a exactamente 2π: el rango documentado se rompia por un ulp.
    const a = angleFromCentroid([1, 0], [0, 1e-17]);
    expect(a).toBeLessThan(2 * Math.PI);

    // Y sigue yendo al final del anillo, que es lo correcto: la celda esta apenas
    // al norte del este, o sea justo ANTES de cerrar la vuelta.
    expect(a).toBeGreaterThan(Math.PI);
  });
});

/**
 * Spec 012 — el camino que recorre una pieza.
 *
 * La referencia es una FUERZA BRUTA escrita aca y no la implementacion: enumera las
 * `n!` permutaciones y aplica los cuatro criterios en orden. Contrastar Held-Karp
 * contra si mismo no diria nada; contra esto si, porque son dos algoritmos distintos
 * que tienen que coincidir en el mismo optimo.
 */
const manhattan = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/** Se tocan: comparten un lado o una esquina. Es con lo que se decide, no con lo que se mide. */
const seTocan = (a: Cell, b: Cell) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1;

/** Las distancias de un recorrido, paso por paso. Su largo es `orden.length - 1`. */
const distancias = (cells: readonly Cell[], orden: readonly number[]) =>
  orden.slice(1).map((k, i) => manhattan(cells[orden[i]], cells[k]));

const lexTest = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

function permutaciones(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs];
  const out: number[][] = [];
  for (let i = 0; i < xs.length; i++) {
    const resto = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const q of permutaciones(resto)) out.push([xs[i], ...q]);
  }
  return out;
}

/** El mismo contrato que `pathThroughCells`, resuelto por fuerza bruta. */
function caminoPorFuerzaBruta(cells: readonly Cell[], tiebreak: readonly number[]): number[] {
  const todos = permutaciones(cells.map((_, k) => k)).map(orden => {
    const d = distancias(cells, orden);
    // Los vecinos se cuentan con `seTocan` y la suma con Manhattan, a proposito: es lo
    // que hace que la diagonal se tolere (cuenta como paso) sin preferirse (cuesta 2).
    const vecinos = orden.slice(1).filter((k, i) => seTocan(cells[orden[i]], cells[k])).length;
    return { orden, d, vecinos, suma: d.reduce((a, b) => a + b, 0) };
  });
  const maxVecinos = Math.max(...todos.map(t => t.vecinos));
  const c1 = todos.filter(t => t.vecinos === maxVecinos);
  const minSuma = Math.min(...c1.map(t => t.suma));
  const c2 = c1.filter(t => t.suma === minSuma);
  const dTop = [...c2].sort((x, y) => lexTest(y.d, x.d))[0].d;
  const c3 = c2.filter(t => lexTest(t.d, dTop) === 0);
  return [...c3].sort((x, y) => lexTest(x.orden.map(k => tiebreak[k]), y.orden.map(k => tiebreak[k])))[0].orden;
}

/** PRNG con semilla (mulberry32): las formas aleatorias tienen que ser reproducibles. */
function conSemilla(seed: number) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Los desempates con los que se ejerce la funcion, sinteticos a proposito.
 *
 * El que usa la app es el orden angular, pero eso es una decision MUSICAL y esta capa no
 * la conoce —por eso `tiebreak` entra por parametro—. Con la identidad y su inversa se
 * cubren las dos direcciones posibles de cada camino, que es lo unico que el desempate
 * puede cambiar.
 */
const porIndice = (cells: readonly Cell[]) => cells.map((_, k) => k);
const alReves = (cells: readonly Cell[]) => cells.map((_, k) => cells.length - 1 - k);

describe('pathThroughCells', () => {
  it('AC-MUS-019 — coincide con la fuerza bruta sobre las 12 piezas', () => {
    for (const p of PIECES) {
      for (const desempate of [porIndice, alReves]) {
        const rank = desempate(SHAPES[p]);
        expect(pathThroughCells(SHAPES[p], rank)).toEqual(caminoPorFuerzaBruta(SHAPES[p], rank));
      }
    }
  });

  it('coincide con la fuerza bruta sobre 200 formas arbitrarias, incluidas las desconexas', () => {
    // Formas arbitrarias a proposito: la funcion las acepta, y las desconexas son las
    // que mas ejercen el criterio de "el salto mas corto" porque no hay vecinos.
    const rnd = conSemilla(20260819);
    for (let i = 0; i < 200; i++) {
      const n = 4 + Math.floor(rnd() * 3);
      const vistas = new Set<string>();
      const cells: Cell[] = [];
      while (cells.length < n) {
        const c: Cell = [Math.floor(rnd() * 4), Math.floor(rnd() * 4)];
        if (vistas.has(c.join())) continue;
        vistas.add(c.join());
        cells.push(c);
      }
      const rank = porIndice(cells);
      expect(pathThroughCells(cells, rank)).toEqual(caminoPorFuerzaBruta(cells, rank));
    }
  });

  it('devuelve una permutacion de 0..n-1', () => {
    for (const p of PIECES) {
      const orden = pathThroughCells(SHAPES[p], porIndice(SHAPES[p]));
      expect([...orden].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('las 12 piezas se recorren enteras: ningun paso pasa por encima de una celda', () => {
    // La propiedad que compra tolerar la diagonal. Antes eran 8 de 12 y las otras
    // cuatro pasaban POR ENCIMA de una celda propia que todavia no habia sonado.
    for (const p of PIECES) {
      const orden = pathThroughCells(SHAPES[p], porIndice(SHAPES[p]));
      for (let i = 1; i < orden.length; i++) {
        expect(seTocan(SHAPES[p][orden[i - 1]], SHAPES[p][orden[i]]), p).toBe(true);
      }
    }
  });

  it('AC-MUS-018 — la diagonal se tolera pero no se prefiere: solo cuatro piezas la usan', () => {
    // Un paso diagonal mide 2 en Manhattan, o sea el doble que uno recto, asi que el
    // segundo criterio lo evita donde la forma permite ir en cruz. Las cuatro que la
    // usan son las que no admiten recorrido ortogonal: tienen un nodo con 3 o 4 vecinos
    // y su grafo es un arbol, y un arbol solo se recorre entero si es un camino. Los
    // numeros no son una eleccion — los prueba la fuerza bruta de arriba.
    const diagonalesEsperadas: Record<string, number> = {
      F: 1, I: 0, L: 0, N: 0, P: 0, T: 1, U: 0, V: 0, W: 0, X: 2, Y: 1, Z: 0,
    };
    for (const p of PIECES) {
      const d = distancias(SHAPES[p], pathThroughCells(SHAPES[p], porIndice(SHAPES[p])));
      expect(d.filter(x => x > 1), p).toHaveLength(diagonalesEsperadas[p]);
    }
  });

  it('AC-MUS-019 — el criterio del paso largo al principio sigue decidiendo: la Y', () => {
    // Con la diagonal aceptada, el tercer criterio no separa "continuo" de
    // "cortado" — todos los pasos llegan a una celda que se toca. Se queda porque es lo
    // unico que separa las dos versiones de la `Y`, las dos con un solo paso diagonal y
    // la misma suma: la elegida lo pone PRIMERO. Es la que trajo el pedido, dibujada a
    // mano, y la unica evidencia que existe sobre ese criterio.
    const d = distancias(SHAPES.Y, pathThroughCells(SHAPES.Y, porIndice(SHAPES.Y)));
    expect(d).toEqual([2, 1, 1, 1]);
  });

  it('el desempate decide, y decide siempre lo mismo', () => {
    // `Y` y `X` son las que tienen empate de verdad: 8 y 24 recorridos igual de buenos
    // sobreviven a los tres primeros criterios. Un test sobre una pieza de camino unico
    // pasaria sin ejercer nada.
    for (const p of ['Y', 'X'] as PieceKey[]) {
      const rank = porIndice(SHAPES[p]);
      const primero = pathThroughCells(SHAPES[p], rank);
      for (let i = 0; i < 5; i++) expect(pathThroughCells(SHAPES[p], rank)).toEqual(primero);
    }

    // Y que el desempate REALMENTE decide: con el rango invertido, la `I` —cuyo camino
    // es unico salvo por la direccion— se recorre al reves.
    expect(pathThroughCells(SHAPES.I, porIndice(SHAPES.I))).toEqual([0, 1, 2, 3, 4]);
    expect(pathThroughCells(SHAPES.I, alReves(SHAPES.I))).toEqual([4, 3, 2, 1, 0]);
  });

  it('casos borde: 0, 1 y 2 celdas', () => {
    expect(pathThroughCells([], [])).toEqual([]);
    expect(pathThroughCells([[3, 4]], [0])).toEqual([0]);
    // Con dos celdas los dos ordenes son igual de buenos y decide el desempate solo.
    expect(pathThroughCells([[0, 0], [5, 5]], [0, 1])).toEqual([0, 1]);
    expect(pathThroughCells([[0, 0], [5, 5]], [1, 0])).toEqual([1, 0]);
  });
});
