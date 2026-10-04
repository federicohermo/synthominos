import { describe, it, expect } from 'vitest';
import { cabeEn, cellsAt, isValid, occupantAt, occupantCellIndex, routeBetween, rutador, costuraDe } from '../board.ts';
import { rotateN, reflect } from '../transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../constants/pieces.constants.ts';
import { GRID_DEFAULT, CROSS_COST } from '../constants/board.constants.ts';
import type { Cell } from '../types/transform.types.ts';
import type { PieceKey } from '../types/pieces.types.ts';
import type { PlacedPiece } from '../types/board.types.ts';

/**
 * Todo este archivo mide el tablero de REFERENCIA, que es el de 10 x 6 de siempre.
 *
 * El tablero sale del viewport, asi que las funciones lo reciben por
 * parametro y un test tiene que elegir uno. Se elige `GRID_DEFAULT` y no un tamano nuevo
 * porque los numeros que este archivo verifica —los 496 pares que acorta la costura, la
 * distancia maxima de 12, la tabla de PASOS— estan medidos sobre ese tablero: cambiarlo
 * invalidaria las mediciones sin agregar cobertura. Lo que SI tiene test propio con otras
 * dimensiones es lo que depende de ellas, y es `costuraDe`.
 */
const { w: GRID_W, h: GRID_H } = GRID_DEFAULT;
const SEAM = costuraDe(GRID_DEFAULT);

const PIECES = Object.keys(SHAPES) as PieceKey[];

/** Una pieza colocada con las celdas dadas. El resto de los campos no lo mira el tablero. */
const piezaEn = (id: string, cells: Cell[]): PlacedPiece =>
  ({ id, piece: 'I', rotation: 0, mirror: false, cells, muted: false });

describe('cellsAt', () => {
  it('AC-BRD-001 — la celda de agarre cae exactamente donde se clickeo', () => {
    // Es la propiedad que hace que colocar se sienta preciso, y la que sostiene la
    // fase por pieza: si el ancla se corriera, la columna leida
    // despues seria otra.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(base) : base;
          const idx = ANCHOR_INDEX[p];
          for (const [x, y] of [[0, 0], [3, 2], [9, 5]] as Cell[]) {
            expect(cellsAt(shape, idx, x, y)[idx]).toEqual([x, y]);
          }
        }
      }
    }
  });

  it('traslada la forma entera sin deformarla', () => {
    const shape: Cell[] = [[0,0],[1,0],[2,0],[3,0],[4,0]];
    expect(cellsAt(shape, 2, 5, 3)).toEqual([[3,3],[4,3],[5,3],[6,3],[7,3]]);
  });

  it('preserva el orden del array: la celda k sigue siendo la celda k', () => {
    const shape: Cell[] = [[2,2],[0,0],[1,1]];
    const got = cellsAt(shape, 0, 7, 7);
    // El ancla es la celda 0, que estaba en (2,2): el corrimiento es (+5,+5).
    expect(got).toEqual([[7,7],[5,5],[6,6]]);
  });

  it('no muta la forma que recibe', () => {
    const shape: Cell[] = [[0,0],[1,0]];
    const copia = shape.map(([x, y]): Cell => [x, y]);
    cellsAt(shape, 0, 4, 4);
    expect(shape).toEqual(copia);
  });
});

describe('isValid', () => {
  it('acepta una pieza que entra en un tablero vacio', () => {
    expect(isValid([[0,0],[1,0],[2,0]], [], GRID_DEFAULT)).toBe(true);
  });

  it('AC-BRD-003 — rechaza por cada uno de los cuatro bordes', () => {
    expect(isValid([[-1,0]], [], GRID_DEFAULT)).toBe(false);                 // izquierda
    expect(isValid([[0,-1]], [], GRID_DEFAULT)).toBe(false);                 // arriba
    expect(isValid([[GRID_W,0]], [], GRID_DEFAULT)).toBe(false);             // derecha
    expect(isValid([[0,GRID_H]], [], GRID_DEFAULT)).toBe(false);             // abajo
  });

  it('las esquinas del tablero son validas y sus vecinas de afuera no', () => {
    expect(isValid([[0,0],[GRID_W-1,GRID_H-1]], [], GRID_DEFAULT)).toBe(true);
    expect(isValid([[GRID_W-1,GRID_H]], [], GRID_DEFAULT)).toBe(false);
  });

  it('rechaza el choque contra una pieza ya colocada', () => {
    const placed = [piezaEn('1', [[2,2],[3,2],[4,2]])];
    expect(isValid([[4,2]], placed, GRID_DEFAULT)).toBe(false);              // se pisan en una celda
    expect(isValid([[2,2],[3,2],[4,2]], placed, GRID_DEFAULT)).toBe(false);  // se pisan enteras
    expect(isValid([[2,3],[3,3],[4,3]], placed, GRID_DEFAULT)).toBe(true);   // justo debajo, libre
  });

  it('AC-BRD-003 — mira TODAS las piezas colocadas, no solo la primera', () => {
    const placed = [piezaEn('1', [[0,0]]), piezaEn('2', [[5,5]])];
    expect(isValid([[5,5]], placed, GRID_DEFAULT)).toBe(false);
  });

  it('una jugada fuera del tablero es invalida aunque no choque con nada', () => {
    expect(isValid([[8,0],[9,0],[10,0]], [], GRID_DEFAULT)).toBe(false);
  });

  it('las 12 piezas entran en el tablero en su rotacion 0', () => {
    for (const p of PIECES) {
      const shape = rotateN(SHAPES[p], 0);
      expect(isValid(cellsAt(shape, ANCHOR_INDEX[p], 4, 2), [], GRID_DEFAULT)).toBe(true);
    }
  });
});

describe('031 — `cabeEn`: si la pieza entra ENTERA en el tablero de ahora', () => {
  it('AC-FIT-019 — la que entra entera si, y no le importa lo que haya colocado', () => {
    // No mira solapamiento a proposito: es la pregunta «se dibuja o no», y dos piezas
    // solapadas no pueden existir —`isValid` no las deja entrar—.
    const p = piezaEn('a', [[0,0],[1,0],[2,0],[3,0],[4,0]]);
    expect(cabeEn(p, GRID_DEFAULT)).toBe(true);
    expect(cabeEn(p, { w: 5, h: 5 })).toBe(true);
  });

  it('AC-FIT-019 — la que se pasa por UNA celda no entra, y por cualquiera de los cuatro bordes', () => {
    // Es la mitad que decide que se dibuja: «tres celdas adentro y dos
    // afuera» tiene que dar false, o el tablero mostraria media pieza que el circuito no
    // visita.
    expect(cabeEn(piezaEn('a', [[3,0],[4,0],[5,0]]), { w: 5, h: 5 })).toBe(false);   // derecha
    expect(cabeEn(piezaEn('a', [[0,3],[0,4],[0,5]]), { w: 5, h: 5 })).toBe(false);   // abajo
    expect(cabeEn(piezaEn('a', [[-1,0],[0,0]]), GRID_DEFAULT)).toBe(false);          // izquierda
    expect(cabeEn(piezaEn('a', [[0,-1],[0,0]]), GRID_DEFAULT)).toBe(false);          // arriba
  });

  it('AC-FIT-020 — la misma pieza entra o no segun el tablero, que es para lo que existe', () => {
    // El caso central: la ventana se achica y la pieza deja de entrar sin
    // que la pieza cambie. Achicar y volver a agrandar la devuelve.
    const alBorde = piezaEn('a', [[7,1],[8,1],[9,1]]);
    expect(cabeEn(alBorde, GRID_DEFAULT)).toBe(true);
    expect(cabeEn(alBorde, { w: 6, h: 6 })).toBe(false);
    expect(cabeEn(alBorde, GRID_DEFAULT)).toBe(true);
  });
});

describe('occupantAt', () => {
  it('devuelve la pieza que ocupa la celda', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[5,3]]);
    expect(occupantAt([a, b], 2, 1)).toBe(a);
    expect(occupantAt([a, b], 5, 3)).toBe(b);
  });

  it('devuelve null en una celda libre y en un tablero vacio', () => {
    expect(occupantAt([piezaEn('a', [[1,1]])], 0, 0)).toBeNull();
    expect(occupantAt([], 0, 0)).toBeNull();
  });

  it('no confunde (x,y) con (y,x)', () => {
    const a = piezaEn('a', [[1,4]]);
    expect(occupantAt([a], 1, 4)).toBe(a);
    expect(occupantAt([a], 4, 1)).toBeNull();
  });
});

describe('occupantCellIndex', () => {
  it('sobre una celda ocupada devuelve el indice de esa celda dentro de la pieza', () => {
    const a = piezaEn('a', [[1,1],[2,1],[3,1]]);
    expect(occupantCellIndex(a, 1, 1)).toBe(0);
    expect(occupantCellIndex(a, 2, 1)).toBe(1);
    expect(occupantCellIndex(a, 3, 1)).toBe(2);
  });

  it('sobre una celda que la pieza no ocupa devuelve -1', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    expect(occupantCellIndex(a, 0, 0)).toBe(-1);      // libre y lejos
    expect(occupantCellIndex(a, 3, 1)).toBe(-1);      // libre y pegada
    expect(occupantCellIndex(a, 1, 2)).toBe(-1);      // no confunde (x,y) con (y,x)
  });

  it('con dos piezas adyacentes el indice sale de la pieza consultada', () => {
    // Es el caso que rompe una implementacion que buscara la celda en el tablero
    // entero: (3,1) y (4,1) son de `b` y su indice adentro de `b` no es el que
    // tendrian contando desde `a`.
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[3,1],[4,1]]);
    expect(occupantCellIndex(a, 3, 1)).toBe(-1);
    expect(occupantCellIndex(b, 3, 1)).toBe(0);
    expect(occupantCellIndex(b, 4, 1)).toBe(1);
    expect(occupantCellIndex(a, 2, 1)).toBe(1);
    expect(occupantCellIndex(b, 2, 1)).toBe(-1);
  });

  it('compuesto con occupantAt: primero que pieza, despues que celda de esa pieza', () => {
    const a = piezaEn('a', [[1,1],[2,1]]);
    const b = piezaEn('b', [[3,1],[4,1]]);
    const ocupante = occupantAt([a, b], 4, 1) ?? a;   // el ?? no se ejerce: si diera null, el indice seria -1 y el test caeria igual
    expect(ocupante).toBe(b);
    expect(occupantCellIndex(ocupante, 4, 1)).toBe(1);
  });

  it('el indice sirve contra la forma canonica en las 96 orientaciones', () => {
    // Es de lo que depende la derivacion celda→nota: la celda k del
    // tablero tiene que seguir siendo la celda k de SHAPES despues de rotar, reflejar
    // y trasladar. `cellsAt` es un `map`, asi que el indice sobrevive los tres pasos.
    for (const p of PIECES) {
      for (let rot = 0; rot < 4; rot++) {
        for (const mirror of [false, true]) {
          const base = rotateN(SHAPES[p], rot);
          const shape = mirror ? reflect(base) : base;
          const cells = cellsAt(shape, ANCHOR_INDEX[p], 5, 3);
          const pieza = piezaEn(`${p}-${rot}-${mirror}`, cells);
          for (let k = 0; k < cells.length; k++) {
            expect(occupantCellIndex(pieza, cells[k][0], cells[k][1])).toBe(k);
          }
        }
      }
    }
  });
});

/** Las 60 celdas del tablero. Recorrerlas de a pares da las 3.600 combinaciones. */
const TODAS: Cell[] = [];
for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) TODAS.push([x, y]);

const [COSTURA_INICIO, COSTURA_FIN] = SEAM;
const misma = (p: Cell, q: Cell): boolean => p[0] === q[0] && p[1] === q[1];
const manhattan = (p: Cell, q: Cell): number => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

/** Vecinas en el grafo real: pegadas en la grilla, o las dos puntas de la costura. */
const adyacentes = (p: Cell, q: Cell): boolean =>
  manhattan(p, q) === 1
  || (misma(p, COSTURA_INICIO) && misma(q, COSTURA_FIN))
  || (misma(p, COSTURA_FIN) && misma(q, COSTURA_INICIO));

/** Las vecinas de cada celda, una sola vez: la referencia de mas abajo las recorre miles de veces. */
const VECINAS = new Map<string, Cell[]>(
  TODAS.map((c) => [c.join(','), TODAS.filter((v) => adyacentes(c, v))]),
);

/**
 * Los pasos entre cada par de celdas SOBRE EL TABLERO VACIO, medidos una sola vez.
 *
 * Se cachea porque el modelo nuevo no tiene formula cerrada: donde el 009 hacia tres
 * restas, `routeBetween` corre un Dijkstra. La desigualdad triangular mira 216.000
 * ternas, y a llamada por terna el test tardaba segundos.
 */
const PASOS: number[][] = TODAS.map((a) => TODAS.map((b) => routeBetween(a, b, [], GRID_DEFAULT).steps));

/**
 * La distancia en forma cerrada: Manhattan, o el mejor de los dos cruces
 * de la costura.
 *
 * Es el oraculo de lo que `routeBetween` tiene que seguir dando sobre el tablero vacio.
 * Con todas las celdas pesando 1 el modelo nuevo no puede mover ni un paso respecto del
 * viejo, y eso es lo que hace falsable "el peso cambia POR DONDE se pasa, no cuanto se
 * tarda".
 */
const distancia009 = (a: Cell, b: Cell): number => Math.min(
  manhattan(a, b),
  manhattan(a, COSTURA_FIN) + 1 + manhattan(COSTURA_INICIO, b),
  manhattan(a, COSTURA_INICIO) + 1 + manhattan(COSTURA_FIN, b),
);

/** La cadena de colocacion completa, igual a la de la app: rotar, reflejar, bajar el ancla. */
const colocar = (id: string, piece: PieceKey, rot: number, mirror: boolean, x: number, y: number): PlacedPiece => {
  const base = rotateN(SHAPES[piece], rot);
  const shape = mirror ? reflect(base) : base;
  return { id, piece, rotation: rot, mirror, cells: cellsAt(shape, ANCHOR_INDEX[piece], x, y), muted: false };
};

/**
 * El costo de una ruta, derivado de sus dos largos: las intermedias vacias pagan 1 y las
 * ocupadas `CROSS_COST`.
 *
 * `routeBetween` no lo devuelve a proposito —D3 pide camino, pasos y cruces—, y esta es
 * la misma cuenta que hace `buildSequence` para armar su matriz. Escrita aca a mano para
 * no tomarla prestada del codigo que se esta midiendo.
 */
/**
 * Todos los caminos de exactamente `largo` pasos entre `a` y `b`, devueltos como sus
 * celdas INTERMEDIAS. Fuerza bruta sobre la adyacencia real, costura incluida.
 *
 * Escrito aparte de `routeBetween` a proposito: sirve para afirmar propiedades sobre el
 * CONJUNTO de caminos —"ninguno de los minimos esta libre"— que una funcion que devuelve
 * uno solo no puede contestar.
 */
function caminosDeLargo(a: Cell, b: Cell, largo: number): Cell[][] {
  const out: Cell[][] = [];
  const paso = (cur: Cell, resto: number, acc: Cell[]): void => {
    if (resto === 0) { if (misma(cur, b)) out.push(acc.slice(0, -1)); return; }
    for (const v of VECINAS.get(cur.join(",")) ?? []) paso(v, resto - 1, [...acc, v]);
  };
  paso(a, largo, []);
  return out;
}

const costoDe = (r: { path: Cell[]; crossed: Cell[] }): number =>
  r.path.length + r.crossed.length * (CROSS_COST - 1);

const ocupadasDe = (board: readonly PlacedPiece[]): Set<string> =>
  new Set(board.flatMap((p) => p.cells.map((c) => c.join(','))));

/** Compara dos secuencias de celdas posicion por posicion, cada celda como el par `(x, y)` (D7). */
const menorLex = (p: readonly Cell[], q: readonly Cell[]): boolean => {
  for (let i = 0; i < Math.min(p.length, q.length); i++) {
    if (p[i][0] !== q[i][0]) return p[i][0] < q[i][0];
    if (p[i][1] !== q[i][1]) return p[i][1] < q[i][1];
  }
  return p.length < q.length;
};

/**
 * La implementacion de REFERENCIA, escrita distinto a proposito.
 *
 * Relaja hasta que nada cambie guardando el CAMINO ENTERO en cada nodo, y desempata
 * comparando esos caminos posicion por posicion.
 *
 * `routeBetween` hace lo contrario —Dijkstra por costo desde el destino y reconstruccion
 * hacia adelante leyendo `dist[]`—, asi que si las dos coinciden sobre miles de pares no
 * puede ser una casualidad de como esta escrita ninguna. Esta es cuadratica y por eso
 * vive en el test y no en el dominio.
 *
 * Corre HACIA ADELANTE desde `a`, asi que el camino que guarda incluye a `b` y su costo
 * incluye el peso de `b`. Las dos cosas se corrigen al leerla, y el peso de `b` no cambia
 * cual camino gana porque lo pagan todos los que llegan a `b`.
 */
const referenciaDesde = (a: Cell, board: readonly PlacedPiece[]): Map<string, { costo: number; camino: Cell[] }> => {
  const ocupadas = ocupadasDe(board);
  const peso = (c: Cell): number => ocupadas.has(c.join(',')) ? CROSS_COST : 1;
  const mejor = new Map<string, { costo: number; camino: Cell[] }>([[a.join(','), { costo: 0, camino: [] }]]);
  for (let ronda = 0; ronda < TODAS.length; ronda++) {
    let cambio = false;
    for (const u of TODAS) {
      const desde = mejor.get(u.join(','));
      if (desde === undefined) continue;
      for (const v of VECINAS.get(u.join(','))!) {
        const costo = desde.costo + peso(v);
        const camino = [...desde.camino, v];
        const actual = mejor.get(v.join(','));
        if (actual !== undefined && (costo > actual.costo || (costo === actual.costo && !menorLex(camino, actual.camino)))) continue;
        mejor.set(v.join(','), { costo, camino });
        cambio = true;
      }
    }
    if (!cambio) break;
  }
  return mejor;
};

/** LCG minimo: tableros al azar REPRODUCIBLES, sin dependencias y sin `Math.random`. */
const azar = (semilla: number): (() => number) => {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

/** Un tablero valido de hasta `cuantas` piezas, tirando colocaciones y descartando las que no entran. */
const tableroAlAzar = (rng: () => number, cuantas: number): PlacedPiece[] => {
  const board: PlacedPiece[] = [];
  for (let intento = 0; intento < 500 && board.length < cuantas; intento++) {
    const piece = PIECES[Math.floor(rng() * PIECES.length)];
    const pieza = colocar(
      `${piece}${board.length}`, piece,
      Math.floor(rng() * 4), rng() < 0.5,
      Math.floor(rng() * GRID_W), Math.floor(rng() * GRID_H),
    );
    if (isValid(pieza.cells, board, GRID_DEFAULT)) board.push(pieza);
  }
  return board;
};

/**
 * TODOS los caminos de costo minimo entre dos celdas, por fuerza bruta.
 *
 * Enumera en vez de contar: es lo que permite preguntar si el que `routeBetween` eligio
 * es el menor de TODOS, y no solo si empata con alguno. La poda sale de la referencia
 * —solo se baja por una vecina desde la que todavia queda un camino optimo—, asi que no
 * recorre el tablero entero.
 */
const todosLosMinimos = (a: Cell, b: Cell, board: readonly PlacedPiece[]): Cell[][] => {
  const ocupadas = ocupadasDe(board);
  const peso = (c: Cell): number => misma(c, b) ? 0 : ocupadas.has(c.join(',')) ? CROSS_COST : 1;
  const desdeB = referenciaDesde(b, board);
  const restante = (c: Cell): number => misma(c, b) ? 0 : desdeB.get(c.join(','))!.costo - peso(c);

  const salida: Cell[][] = [];
  const bajar = (cur: Cell, intermedias: Cell[]): void => {
    if (misma(cur, b)) { salida.push(intermedias); return; }
    for (const v of VECINAS.get(cur.join(','))!) {
      if (peso(v) + restante(v) !== restante(cur)) continue;
      bajar(v, misma(v, b) ? intermedias : [...intermedias, v]);
    }
  };
  bajar(a, []);
  return salida;
};

describe('routeBetween — el tablero vacio', () => {
  it('AC-CIR-001 — las dos esquinas de la costura estan a un paso', () => {
    // Es la definicion del repliegue: (0,0) y (9,5) son las mas lejanas de la grilla y
    // la costura las vuelve vecinas. Un paso son cero celdas en el medio.
    expect(routeBetween([0, 0], [GRID_W - 1, GRID_H - 1], [], GRID_DEFAULT)).toEqual({ path: [], steps: 1, cost: 0, crossed: [] });
    expect(routeBetween([GRID_W - 1, GRID_H - 1], [0, 0], [], GRID_DEFAULT)).toEqual({ path: [], steps: 1, cost: 0, crossed: [] });
  });

  it('AC-CIR-001 — la distancia maxima del tablero es 12, no 14', () => {
    // 14 es el diametro Manhattan de una grilla 10x6 sin costura. Con la arista extra
    // ningun par supera 12: el que era el par mas lejano ahora mide 1.
    //
    // Migrado con el tablero vacio ESCRITO: con piezas colocadas el maximo es otro,
    // porque el recorrido rodea. Lo que mide este test es la geometria del tablero, no
    // la de un tablero en particular.
    expect(Math.max(...PASOS.flat())).toBe(12);
  });

  it('sin piezas los pasos son EXACTAMENTE la distancia del 009, en los 3.540 pares', () => {
    // El test del 009 comparaba tres casos sueltos contra Manhattan; este compara los
    // 3.540 pares contra la formula cerrada entera, que es la que el 009 tenia adentro.
    // Con todas las celdas pesando 1 el modelo nuevo no puede dar otra cosa.
    //
    // Los 60 pares de una celda consigo misma quedan afuera: `a === b` esta fuera del
    // dominio de `routeBetween` —devuelve `steps: 1`, que cumple el invariante del largo
    // pero no es una distancia— por la misma razon que en el 009, que es que el tramo va
    // de la salida de una pieza a la entrada de OTRA.
    const fallas: string[] = [];
    let aseverados = 0;
    for (let i = 0; i < TODAS.length; i++) for (let j = 0; j < TODAS.length; j++) {
      if (i === j) continue;
      aseverados++;
      if (PASOS[i][j] !== distancia009(TODAS[i], TODAS[j])) fallas.push(`${TODAS[i]} / ${TODAS[j]}`);
    }
    expect(fallas).toEqual([]);
    expect(aseverados).toBe(3540);
  });

  it('es simetrica en las 3.600 combinaciones', () => {
    // Migrado al tablero vacio: con piezas la que sigue siendo simetrica es el COSTO
    // —el conjunto de intermedias es el mismo al reves—, pero no los pasos, porque entre
    // dos caminos del mismo costo el desempate puede quedarse con uno de otro largo. La
    // simetria del costo se mide abajo, con piezas.
    const fallas: string[] = [];
    for (let i = 0; i < TODAS.length; i++) for (let j = 0; j < TODAS.length; j++) {
      if (PASOS[i][j] !== PASOS[j][i]) fallas.push(`${TODAS[i]} / ${TODAS[j]}`);
    }
    expect(fallas).toEqual([]);
  });

  it('cumple la desigualdad triangular en las 3.600 combinaciones', () => {
    // Es lo que distingue una distancia de grafo de una formula que se parece a una: si
    // un atajo por la costura estuviera mal contado, existiria un rodeo mas barato que
    // el camino directo. Cada par se mide contra las 60 celdas como escala intermedia.
    //
    // Acotado al tablero vacio, y no por prudencia: con pesos la desigualdad se cae a
    // proposito. Pasar POR `c` obliga a pagar el peso de `c`, que como punta de un tramo
    // no se cobra (D3), asi que `d(a,b)` puede superar a `d(a,c) + d(c,b)` justo por lo
    // que vale pisar `c`. Es la consecuencia de cobrarle solo a las intermedias, no un
    // error de cuenta.
    const fallas: string[] = [];
    for (let i = 0; i < TODAS.length; i++) for (let j = 0; j < TODAS.length; j++) {
      for (let k = 0; k < TODAS.length; k++) {
        if (PASOS[i][j] > PASOS[i][k] + PASOS[k][j]) fallas.push(`${TODAS[i]} -> ${TODAS[k]} -> ${TODAS[j]}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('AC-CIR-003 — el camino tiene exactamente una celda menos que los pasos', () => {
    // El invariante del largo del 009, ahora sobre la respuesta unica de D3: los tres
    // valores salen de la misma llamada, asi que no hay dos cuentas que atar.
    let aseverados = 0;
    for (const a of TODAS) for (const b of TODAS) {
      if (misma(a, b)) continue;
      aseverados++;
      const r = routeBetween(a, b, [], GRID_DEFAULT);
      expect(r.path.length, `${a} -> ${b}`).toBe(r.steps - 1);
    }
    expect(aseverados).toBe(3540);
  });

  it('AC-CIR-003 — es un camino de verdad: celdas adyacentes de a pares y ninguna repetida', () => {
    // El largo solo no alcanza: un array del tamano correcto con celdas salteadas lo
    // cumpliria igual. Se mide sobre el recorrido COMPLETO —con a y b en las puntas—
    // porque la costura puede caer entre dos celdas intermedias.
    const fallas: string[] = [];
    for (const a of TODAS) for (const b of TODAS) {
      if (misma(a, b)) continue;
      const completo = [a, ...routeBetween(a, b, [], GRID_DEFAULT).path, b];
      for (let i = 1; i < completo.length; i++) {
        if (!adyacentes(completo[i - 1], completo[i])) fallas.push(`salto ${a} -> ${b} en ${i}`);
      }
      const vistas = new Set(completo.map(([x, y]) => `${x},${y}`));
      if (vistas.size !== completo.length) fallas.push(`repetida ${a} -> ${b}`);
    }
    expect(fallas).toEqual([]);
  });

  it('AC-CIR-003 — no incluye ni el origen ni el destino', () => {
    expect(routeBetween([0, 0], [3, 0], [], GRID_DEFAULT).path).toEqual([[1, 0], [2, 0]]);
  });

  it('el trazo cambio: gana el lexicograficamente menor y no "primero en X"', () => {
    // Aca el 009 cambia, y va con el numero puesto. Antes el camino se trazaba primero
    // en X y despues en Y, y entre (0,0) y (3,2) daba [[1,0],[2,0],[3,0],[3,1]]. El
    // desempate de D7 compara las celdas como pares `(x, y)`, asi que prefiere la de X
    // mas chica: baja en Y primero y recien despues avanza. Los 10 caminos minimos
    // siguen siendo 10 y todos miden lo mismo — lo que cambio es cual se elige.
    expect(routeBetween([0, 0], [3, 2], [], GRID_DEFAULT).path).toEqual([[0, 1], [0, 2], [1, 2], [2, 2]]);
  });

  it('el borde de la costura: el origen ya ES la esquina', () => {
    // Es donde fallaba la version del 009 que excluia los extremos tramo por tramo: el
    // primer tramo se queda sin celdas propias y la esquina de llegada, que en el camino
    // completo es intermedia, se perdia.
    const r = routeBetween([0, 0], [GRID_W - 1, GRID_H - 2], [], GRID_DEFAULT);
    expect(r.steps).toBe(2);
    expect(r.path).toEqual([[GRID_W - 1, GRID_H - 1]]);
  });

  it('el borde de la costura: el destino ya ES la esquina', () => {
    const r = routeBetween([GRID_W - 1, GRID_H - 2], [0, 0], [], GRID_DEFAULT);
    expect(r.steps).toBe(2);
    expect(r.path).toEqual([[GRID_W - 1, GRID_H - 1]]);
  });

  it('el borde de la costura: origen y destino son las dos esquinas', () => {
    expect(routeBetween([0, 0], [GRID_W - 1, GRID_H - 1], [], GRID_DEFAULT).path).toEqual([]);
    expect(routeBetween([GRID_W - 1, GRID_H - 1], [0, 0], [], GRID_DEFAULT).path).toEqual([]);
  });

  it('cruza la costura solo cuando acorta', () => {
    // (8,5) -> (1,0): 12 derecho contra 1+1+1=3 por la costura, asi que la usa y el
    // camino pasa por sus dos puntas.
    const porLaCostura = routeBetween([8, 5], [1, 0], [], GRID_DEFAULT);
    expect(porLaCostura.steps).toBe(3);
    expect(porLaCostura.path).toEqual([[GRID_W - 1, GRID_H - 1], [0, 0]]);
    // (9,0) -> (0,4): 13 derecho contra 5+1+4=10 por la costura. Tambien acorta.
    expect(routeBetween([GRID_W - 1, 0], [0, 4], [], GRID_DEFAULT).steps).toBe(10);
    // En el centro no acorta nada y la costura queda afuera del camino.
    const central = routeBetween([4, 2], [6, 3], [], GRID_DEFAULT);
    expect(central.steps).toBe(3);
    expect(central.path.some((c) => misma(c, COSTURA_FIN) || misma(c, COSTURA_INICIO))).toBe(false);
  });
});

/**
 * El caso testigo: la `P` rotada 1 en (3,2) y la `Y` rotada 1 en (7,2).
 *
 * Es el tablero con el que el spec mostro el problema del 009: el tramo entre las dos
 * pisaba [7,1], que es la puerta por la que la `Y` estaba a punto de ENTRAR, o sea que
 * el click sonaba encima de la celda de la nota que venia enseguida.
 */
const TESTIGO_P = colocar('P', 'P', 1, false, 3, 2);
const TESTIGO_Y = colocar('Y', 'Y', 1, false, 7, 2);
const TESTIGO = [TESTIGO_P, TESTIGO_Y];

describe('el caso testigo: el recorrido deja de pisar la puerta de la pieza que sigue', () => {
  it('las dos piezas caen donde el spec las midio', () => {
    // Si esto se mueve, todo lo de abajo mide otro tablero.
    expect(TESTIGO_P.cells).toEqual([[3, 3], [4, 3], [3, 2], [4, 2], [3, 1]]);
    expect(TESTIGO_Y.cells).toEqual([[7, 4], [7, 3], [7, 2], [7, 1], [8, 2]]);
    expect(isValid(TESTIGO_Y.cells, [TESTIGO_P], GRID_DEFAULT)).toBe(true);
  });

  it('AC-CIR-004 — el tramo de la P a la Y no pisa [7,1]', () => {
    // Las puertas van escritas a mano y no derivadas con `gates`: la salida de la `P` es
    // [3,1] y la entrada de la `Y` es [8,2] (medido con `simulate_board`). Derivarlas aca
    // ataria este test al modulo de la secuencia, que es el que las usa.
    const r = routeBetween([3, 1], [8, 2], TESTIGO, GRID_DEFAULT);
    // El rodeo por la fila 0, que es exactamente el que `research.md` §1 describio como
    // la unica forma de llegar sin pisar: "cualquier camino libre tiene que subir a la
    // fila 0 y rodear: mide 8".
    expect(r.path).toEqual([[3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [8, 1]]);
    expect(r.steps).toBe(8);
    expect(r.cost).toBe(7);
    expect(r.crossed).toEqual([]);
    expect(r.path.some((c) => misma(c, [7, 1]))).toBe(false);
  });

  it('AC-CIR-004 — ...y esquivarla CUESTA dos intervalos, que es el precio que fija CROSS_COST', () => {
    // Sin obstaculos el tramo mide 6; esquivando mide 8. Los dos intervalos de mas son
    // dos silencios agregados al ciclo para no pisar una celda que suena.
    expect(routeBetween([3, 1], [8, 2], [], GRID_DEFAULT).steps).toBe(6);
    expect(routeBetween([3, 1], [8, 2], TESTIGO, GRID_DEFAULT).steps).toBe(8);

    // Y aca esta el numero que decide, que es lo que hace revisable el valor de la
    // constante. NINGUN camino de 6 pasos esta libre: `research.md` §1 lo probo a mano
    // —para bajar de la fila 1 a la 2 hay que pasar por la columna 7 u 8, y (7,1) y (7,2)
    // estan ocupadas las dos— y aca se verifica enumerando los 6-pasos de verdad.
    const minimos = caminosDeLargo([3, 1], [8, 2], 6);
    expect(minimos.length).toBeGreaterThan(0);
    const librePorCamino = minimos.map((c) => c.filter((k) => occupantAt(TESTIGO, k[0], k[1]) !== null).length);
    expect(Math.min(...librePorCamino)).toBeGreaterThan(0);

    // El mas barato de los cortos paga 5 vacias + una ocupada = 4 + CROSS_COST = 9; el
    // rodeo paga sus 7 vacias = 7. Con CROSS_COST = 5 gana rodear. Con 2 el corto valdria
    // 6 y ganaria PISAR — que es lo que este tablero hacia antes de subir el peso, y lo
    // que se veia con la cabeza lectora del 010.
    const barato = Math.min(...minimos.map((c, i) => (c.length - librePorCamino[i]) + librePorCamino[i] * CROSS_COST));
    expect(barato).toBe(4 + CROSS_COST);
    expect(routeBetween([3, 1], [8, 2], TESTIGO, GRID_DEFAULT).cost).toBeLessThan(barato);
  });

  it('la vuelta de la Y a la P no pisa nada', () => {
    const r = routeBetween([7, 1], [4, 2], TESTIGO, GRID_DEFAULT);
    expect(r.path).toEqual([[6, 1], [5, 1], [4, 1]]);
    expect(r.steps).toBe(4);
    expect(costoDe(r)).toBe(3);
    expect(r.crossed).toEqual([]);
  });
});

/** Los tableros de la muestra: el vacio, el testigo y seis al azar con semilla. */
const TABLEROS: { nombre: string; board: PlacedPiece[] }[] = [
  { nombre: 'vacio', board: [] },
  { nombre: 'testigo', board: TESTIGO },
  ...[1, 2, 3, 4, 5, 6].map((s) => ({ nombre: `azar-${s}`, board: tableroAlAzar(azar(s), 8) })),
];

describe('ningun cruce evitable, contrastado contra una implementacion de referencia', () => {
  it('los tableros de la muestra tienen piezas de verdad', () => {
    // El contraste de abajo seria vacuo sobre tableros vacios: sin celdas ocupadas los
    // pesos no existen y la referencia estaria midiendo la grilla pelada.
    for (const { nombre, board } of TABLEROS.slice(1)) {
      expect(board.length, nombre).toBeGreaterThanOrEqual(2);
      expect(board.every((p, i) => isValid(p.cells, board.slice(0, i), GRID_DEFAULT)), nombre).toBe(true);
    }
  });

  it('AC-CIR-005 — el costo, los pasos y el camino coinciden con la referencia', () => {
    // AC2 en su forma falsable: si existiera un camino mas barato —o uno del mismo costo
    // que pisara menos y ganara el desempate— la referencia lo encontraria. El corolario
    // es que la desigualdad de AC2 es ESTRICTA: con exactamente `CROSS_COST - 1` pasos de
    // mas los dos caminos EMPATAN, y ahi decide el desempate lexicografico, no este AC.
    const fallas: string[] = [];
    for (const { nombre, board } of TABLEROS) {
      const ocupadas = ocupadasDe(board);
      for (const a of [[0, 0], [4, 2], [9, 5], [2, 4]] as Cell[]) {
        const ref = referenciaDesde(a, board);
        for (const b of TODAS) {
          if (misma(a, b)) continue;
          const llegada = ref.get(b.join(','))!;
          const esperado = {
            costo: llegada.costo - (ocupadas.has(b.join(',')) ? CROSS_COST : 1),
            pasos: llegada.camino.length,
            camino: llegada.camino.slice(0, -1),
          };
          const real = routeBetween(a, b, board, GRID_DEFAULT);
          const donde = `${nombre} ${a} -> ${b}`;
          if (costoDe(real) !== esperado.costo) fallas.push(`costo ${donde}: ${costoDe(real)} vs ${esperado.costo}`);
          if (real.steps !== esperado.pasos) fallas.push(`pasos ${donde}: ${real.steps} vs ${esperado.pasos}`);
          if (JSON.stringify(real.path) !== JSON.stringify(esperado.camino)) fallas.push(`camino ${donde}`);
        }
      }
    }
    expect(fallas).toEqual([]);
  });

  it('`crossed` es exactamente el subconjunto ocupado de `path`, en el orden del camino', () => {
    // No es una lista aparte que haya que mantener sincronizada: el peso lo pagan las
    // intermedias, y las dos puntas —que son puertas, o sea celdas SIEMPRE ocupadas—
    // quedan afuera de las dos listas.
    const fallas: string[] = [];
    for (const { nombre, board } of TABLEROS) {
      const ocupadas = ocupadasDe(board);
      for (const a of [[1, 1], [8, 3]] as Cell[]) for (const b of TODAS) {
        if (misma(a, b)) continue;
        const r = routeBetween(a, b, board, GRID_DEFAULT);
        const esperado = r.path.filter((c) => ocupadas.has(c.join(',')));
        if (JSON.stringify(r.crossed) !== JSON.stringify(esperado)) fallas.push(`${nombre} ${a} -> ${b}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('AC-CIR-006 — el COSTO es simetrico aunque el camino no tenga por que serlo', () => {
    // Lo que sostiene la simetria es que el peso lo paguen solo las intermedias: `a -> b`
    // y `b -> a` suman sobre el MISMO conjunto de celdas. Los pasos si pueden diferir,
    // porque entre dos caminos del mismo costo el desempate puede quedarse con uno de
    // otro largo, y eso es correcto y no una asimetria del modelo.
    const fallas: string[] = [];
    for (const { nombre, board } of TABLEROS) {
      for (const a of TODAS) for (const b of TODAS) {
        if (misma(a, b)) continue;
        if (costoDe(routeBetween(a, b, board, GRID_DEFAULT)) !== costoDe(routeBetween(b, a, board, GRID_DEFAULT))) fallas.push(`${nombre} ${a} / ${b}`);
      }
    }
    expect(fallas).toEqual([]);
  });
});

describe('determinismo y desempate', () => {
  it('AC-CIR-022 — el mismo tablero y el mismo par dan siempre la misma ruta', () => {
    // No hay `Math.random` ni fechas: la igualdad `peso + resto === restante` del
    // desempate es exacta, y el orden de las piezas en `placed` no puede cambiarla porque
    // lo unico que se lee de ellas es que celdas ocupan.
    for (const { board } of TABLEROS) {
      for (const [a, b] of [[[0, 0], [7, 4]], [[3, 1], [8, 2]], [[9, 5], [2, 2]]] as [Cell, Cell][]) {
        expect(routeBetween(a, b, board, GRID_DEFAULT)).toEqual(routeBetween(a, b, board, GRID_DEFAULT));
        expect(routeBetween(a, b, [...board], GRID_DEFAULT)).toEqual(routeBetween(a, b, board, GRID_DEFAULT));
      }
    }
  });

  it('AC-CIR-007 — con el empate EJERCIDO gana el lexicograficamente menor de todos, no de los que se probaron', () => {
    // Los pares van elegidos para que el empate exista de verdad: se enumeran TODOS los
    // caminos de costo minimo y el test se cae si hay uno solo, que es la forma en que un
    // test de desempate pasa por verde sin desempatar nada.
    const pares: [Cell, Cell, PlacedPiece[]][] = [
      [[0, 0], [3, 2], []],
      [[4, 2], [7, 4], []],
      [[3, 1], [8, 2], TESTIGO],
      [[1, 1], [8, 4], TESTIGO],
    ];
    for (const [a, b, board] of pares) {
      const todos = todosLosMinimos(a, b, board);
      const donde = `${a} -> ${b}`;
      expect(todos.length, `${donde} tiene que empatar`).toBeGreaterThan(1);
      const menor = todos.reduce((mejor, c) => menorLex(c, mejor) ? c : mejor);
      expect(routeBetween(a, b, board, GRID_DEFAULT).path, donde).toEqual(menor);
    }
  });

  it('AC-CIR-007 — el desempate compara el PREFIJO entero y no solo la primera celda', () => {
    // La trampa que el spec deja escrita: fijar el orden de exploracion, o desempatar
    // mirando la vecina que relaja, alcanza para la PRIMERA celda y no para el resto.
    // Estos pares tienen mas de un camino minimo que arranca por la misma celda, asi que
    // el desempate tiene que seguir decidiendo despues del primer paso.
    for (const [a, b] of [[[0, 0], [3, 2]], [[4, 2], [7, 4]]] as [Cell, Cell][]) {
      const elegido = routeBetween(a, b, [], GRID_DEFAULT).path;
      const mismoArranque = todosLosMinimos(a, b, []).filter((c) => misma(c[0], elegido[0]));
      expect(mismoArranque.length, `${a} -> ${b}`).toBeGreaterThan(1);
      const menor = mismoArranque.reduce((mejor, c) => menorLex(c, mejor) ? c : mejor);
      expect(elegido, `${a} -> ${b}`).toEqual(menor);
    }
  });
});

describe('031 — la costura sale de las dimensiones', () => {
  it('AC-CIR-002 — son siempre las dos esquinas opuestas del tablero que haya', () => {
    // AC11. El tablero de 10 x 6 dejo de ser el unico, asi que `(0,0)`-`(9,5)` dejo de
    // poder ser una constante: la costura es «las dos esquinas», y eso se lee en cualquier
    // tamano.
    for (const dims of [GRID_DEFAULT, { w: 5, h: 5 }, { w: 26, h: 15 }, { w: 64, h: 7 }]) {
      expect(costuraDe(dims), `${dims.w}x${dims.h}`).toEqual([[0, 0], [dims.w - 1, dims.h - 1]]);
    }
  });

  it('AC-CIR-002 — la celda de la costura es vecina de la otra punta, y solo ella', () => {
    // La costura como propiedad OBSERVABLE y no como par de coordenadas: en un tablero de
    // 26 x 15 la esquina `(25,14)` esta a 39 pasos de `(0,0)` por la grilla y a UNO por la
    // costura. Y su vecina de al lado no: la costura es una arista, no un toroide.
    const dims = { w: 26, h: 15 };
    const [inicio, fin] = costuraDe(dims);
    expect(routeBetween(inicio, fin, [], dims).steps).toBe(1);
    expect(routeBetween(inicio, [dims.w - 2, dims.h - 1], [], dims).steps).toBe(2);
  });
});

describe('la cache de distancias no cambia una sola ruta', () => {
  it('un rutador compartido contesta lo mismo que uno nuevo por consulta', () => {
    // El unico riesgo de la cache es que una `dist[]` guardada para un destino se lea desde
    // un origen para el que no valia. Se contrasta contra la version sin cache, que es
    // exactamente `routeBetween`: cada llamada arma su propio rutador y lo tira.
    //
    // Doce tableros con semilla —reproducibles, sin `Math.random`— por las 3.600 rutas del
    // tablero de referencia serian 43.200 comparaciones; se toma una muestra de pares
    // repartida por el tablero, que es lo que hace que el test corra en milisegundos.
    const pares: [Cell, Cell][] = [];
    for (let i = 0; i < TODAS.length; i += 7) for (let j = 3; j < TODAS.length; j += 11) {
      pares.push([TODAS[i], TODAS[j]]);
    }
    for (const semilla of [11, 22, 33, 44, 55, 66]) {
      const board = tableroAlAzar(azar(semilla), 8);
      const compartido = rutador(board, GRID_DEFAULT);
      for (const [a, b] of pares) {
        expect(compartido(a, b), `${semilla} ${a} -> ${b}`).toEqual(routeBetween(a, b, board, GRID_DEFAULT));
      }
    }
  });

  it('y tampoco en un tablero grande, que es donde la cache existe', () => {
    // El mismo contraste sobre 26 x 15: es el tamano donde las 144 corridas pasan a ser 12,
    // o sea donde la cache hace la diferencia que el spec mide (10,9 ms -> 3,1 ms).
    const dims = { w: 26, h: 15 };
    const board = [
      colocar('a', 'F', 0, false, 3, 2),
      colocar('b', 'I', 1, false, 12, 7),
      colocar('c', 'Z', 2, true, 20, 11),
    ];
    const compartido = rutador(board, dims);
    for (let x = 0; x < dims.w; x += 5) for (let y = 0; y < dims.h; y += 4) {
      const a: Cell = [x, y];
      const b: Cell = [dims.w - 1 - x, dims.h - 1 - y];
      expect(compartido(a, b), `${a} -> ${b}`).toEqual(routeBetween(a, b, board, dims));
    }
  });
});
