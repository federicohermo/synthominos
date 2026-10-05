import { describe, it, expect } from 'vitest';
import { cellsAt, isValid, occupantAt, GRID_DEFAULT } from '../../board-editing/placement.ts';
import { routeBetween, rutador, costuraDe, CROSS_COST } from '../routing.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.ts';
import type { Cell } from '../../pieces/transform.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../../board-editing/placement.ts';

/**
 * This whole file measures the REFERENCE board, the one of 10 x 6.
 *
 * The board comes from the viewport, so the functions receive it as a parameter and a test
 * must choose one. It is `GRID_DEFAULT` and not a new size because the numbers that this
 * file verifies are measured on that board: the 496 pairs that the seam shortens, the
 * longest distance of 12, the table `PASOS`. Another board would invalidate the
 * measurements and add no coverage. What DOES have its own test with other dimensions is
 * what depends on them, and that is `costuraDe`.
 */
const { w: GRID_W, h: GRID_H } = GRID_DEFAULT;
const SEAM = costuraDe(GRID_DEFAULT);

const PIECES = Object.keys(SHAPES) as PieceKey[];

/** The 60 cells of the board. Taken in pairs they give the 3600 combinations. */
const TODAS: Cell[] = [];
for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) TODAS.push([x, y]);

const [COSTURA_INICIO, COSTURA_FIN] = SEAM;
const misma = (p: Cell, q: Cell): boolean => p[0] === q[0] && p[1] === q[1];
const manhattan = (p: Cell, q: Cell): number => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

/** Neighbours in the real graph: side by side on the grid, or the two ends of the seam. */
const adyacentes = (p: Cell, q: Cell): boolean =>
  manhattan(p, q) === 1
  || (misma(p, COSTURA_INICIO) && misma(q, COSTURA_FIN))
  || (misma(p, COSTURA_FIN) && misma(q, COSTURA_INICIO));

/** The neighbours of each cell, computed once: the reference below walks them thousands of times. */
const VECINAS = new Map<string, Cell[]>(
  TODAS.map((c) => [c.join(','), TODAS.filter((v) => adyacentes(c, v))]),
);

/**
 * The moves between each pair of cells ON THE EMPTY BOARD, measured once.
 *
 * It is cached because the route has no closed formula: `routeBetween` runs a Dijkstra.
 * The triangle inequality looks at 216,000 triples, and with one call for each triple the
 * test takes seconds.
 */
const PASOS: number[][] = TODAS.map((a) => TODAS.map((b) => routeBetween(a, b, [], GRID_DEFAULT).steps));

/**
 * The distance in closed form: Manhattan, or the better of the two ways through the seam.
 *
 * It is the oracle of what `routeBetween` must give on the empty board. With every cell at
 * cost 1 the route cannot differ from this formula by one move, and that makes falsifiable
 * "the crossing cost changes WHERE the route goes, not how long it takes".
 */
const distancia009 = (a: Cell, b: Cell): number => Math.min(
  manhattan(a, b),
  manhattan(a, COSTURA_FIN) + 1 + manhattan(COSTURA_INICIO, b),
  manhattan(a, COSTURA_INICIO) + 1 + manhattan(COSTURA_FIN, b),
);

/** The full placement chain, the same as the app: rotate, reflect, bring the grip cell to `(x, y)`. */
const colocar = (id: string, piece: PieceKey, rot: number, mirror: boolean, x: number, y: number): PlacedPiece => {
  const base = rotateN(SHAPES[piece], rot);
  const shape = mirror ? reflect(base) : base;
  return { id, piece, rotation: rot, mirror, cells: cellsAt(shape, ANCHOR_INDEX[piece], x, y), muted: false };
};

/**
 * All the routes of exactly `largo` moves between `a` and `b`, returned as their
 * INTERMEDIATE cells. Brute force over the real adjacency, the seam included.
 *
 * It is written apart from `routeBetween` on purpose: it lets a test state a property of
 * the SET of routes, "none of the shortest is free", which a function that returns one
 * route cannot answer.
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

/**
 * The cost of a route, derived from its two lengths: an empty intermediate cell pays 1 and
 * an occupied one pays `CROSS_COST`.
 *
 * It is the number that `routeBetween` gives as `cost`. It is written here by hand so that
 * the tests do not borrow it from the code they measure.
 */
const costoDe = (r: { path: Cell[]; crossed: Cell[] }): number =>
  r.path.length + r.crossed.length * (CROSS_COST - 1);

const ocupadasDe = (board: readonly PlacedPiece[]): Set<string> =>
  new Set(board.flatMap((p) => p.cells.map((c) => c.join(','))));

/** Compares two sequences of cells position by position, each cell as the pair `(x, y)`. */
const menorLex = (p: readonly Cell[], q: readonly Cell[]): boolean => {
  for (let i = 0; i < Math.min(p.length, q.length); i++) {
    if (p[i][0] !== q[i][0]) return p[i][0] < q[i][0];
    if (p[i][1] !== q[i][1]) return p[i][1] < q[i][1];
  }
  return p.length < q.length;
};

/**
 * The REFERENCE implementation, written differently on purpose.
 *
 * It relaxes until nothing changes, keeps the WHOLE ROUTE in each node, and breaks a tie
 * by a comparison of those routes position by position.
 *
 * `routeBetween` does the opposite: Dijkstra by cost from the destination, and a forward
 * rebuild that reads `dist[]`. So if the two agree over thousands of pairs, it cannot be
 * an accident of how either is written. This one is quadratic, so it lives in the test and
 * not in the domain.
 *
 * It runs FORWARD from `a`, so the route it keeps includes `b` and its cost includes the
 * cost of `b`. The reader corrects both. The cost of `b` does not change which route wins,
 * because every route that reaches `b` pays it.
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

/** A minimal LCG: random boards that are REPRODUCIBLE, with no dependency and no `Math.random`. */
const azar = (semilla: number): (() => number) => {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

/** A valid board of up to `cuantas` pieces: it throws placements and drops the ones that do not fit. */
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
 * ALL the routes of least cost between two cells, by brute force.
 *
 * It enumerates and does not count: that lets a test ask if the route that `routeBetween`
 * chose is the smallest of ALL, and not only if it ties with one. The pruning comes from
 * the reference: it goes down only through a neighbour from which an optimal route still
 * exists, so it does not walk the whole board.
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

describe('routeBetween: the empty board', () => {
  it('AC-CIR-001 — the two corners of the seam are one move apart', () => {
    // It is the definition of the fold: (0,0) and (9,5) are the farthest cells of the grid
    // and the seam makes them neighbours. One move is zero cells in between.
    expect(routeBetween([0, 0], [GRID_W - 1, GRID_H - 1], [], GRID_DEFAULT)).toEqual({ path: [], steps: 1, cost: 0, crossed: [] });
    expect(routeBetween([GRID_W - 1, GRID_H - 1], [0, 0], [], GRID_DEFAULT)).toEqual({ path: [], steps: 1, cost: 0, crossed: [] });
  });

  it('AC-CIR-001 — the longest distance of the board is 12, not 14', () => {
    // 14 is the Manhattan diameter of a grid of 10x6 with no seam. With the extra edge no
    // pair goes over 12: the pair that was the farthest has 1 move.
    //
    // The empty board is WRITTEN in the test: with placed pieces the maximum is another,
    // because the routes go around. What this test measures is the geometry of the board,
    // not that of one board in particular.
    expect(Math.max(...PASOS.flat())).toBe(12);
  });

  it('with no pieces the moves are EXACTLY the distance in closed form, on the 3540 pairs', () => {
    // It compares the 3540 pairs against the whole closed formula. With every cell at
    // cost 1 the route cannot give another number.
    //
    // The 60 pairs of a cell with itself stay out: `a === b` is outside the domain of
    // `routeBetween`. It returns `steps: 1`, which meets the length invariant but is not a
    // distance, because a leg goes from the exit gate of one piece to the entry gate of
    // ANOTHER.
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

  it('it is symmetric on the 3600 combinations', () => {
    // On the empty board only: with pieces, what stays symmetric is the COST, because the
    // set of intermediate cells is the same in reverse. The moves do not, because between
    // two routes of the same cost the tie-break can keep one of another length. The
    // symmetry of the cost is measured below, with pieces.
    const fallas: string[] = [];
    for (let i = 0; i < TODAS.length; i++) for (let j = 0; j < TODAS.length; j++) {
      if (PASOS[i][j] !== PASOS[j][i]) fallas.push(`${TODAS[i]} / ${TODAS[j]}`);
    }
    expect(fallas).toEqual([]);
  });

  it('it meets the triangle inequality on the 3600 combinations', () => {
    // It is what tells a graph distance from a formula that looks like one: if a shortcut
    // through the seam were counted wrong, a detour cheaper than the direct route would
    // exist. Each pair is measured against the 60 cells as the stop in between.
    //
    // Bound to the empty board, and not out of caution: with costs the inequality fails on
    // purpose. To go THROUGH `c` pays the cost of `c`, which as the end of a leg is not
    // charged, so `d(a,b)` can exceed `d(a,c) + d(c,b)` by what it costs to enter `c`. It
    // is the consequence of charging only the intermediate cells, not a counting error.
    const fallas: string[] = [];
    for (let i = 0; i < TODAS.length; i++) for (let j = 0; j < TODAS.length; j++) {
      for (let k = 0; k < TODAS.length; k++) {
        if (PASOS[i][j] > PASOS[i][k] + PASOS[k][j]) fallas.push(`${TODAS[i]} -> ${TODAS[k]} -> ${TODAS[j]}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('AC-CIR-003 — the route has exactly one intermediate cell fewer than its moves', () => {
    // The length invariant, on the single answer of one call: the three values come from
    // the same call, so there are no two counts to tie together.
    let aseverados = 0;
    for (const a of TODAS) for (const b of TODAS) {
      if (misma(a, b)) continue;
      aseverados++;
      const r = routeBetween(a, b, [], GRID_DEFAULT);
      expect(r.path.length, `${a} -> ${b}`).toBe(r.steps - 1);
    }
    expect(aseverados).toBe(3540);
  });

  it('AC-CIR-003 — it is a real path: consecutive cells are neighbours and none repeats', () => {
    // The length alone is not enough: an array of the right size with skipped cells would
    // meet it too. It is measured on the COMPLETE route, with a and b at the ends, because
    // the seam can fall between two intermediate cells.
    const fallas: string[] = [];
    for (const a of TODAS) for (const b of TODAS) {
      if (misma(a, b)) continue;
      const completo = [a, ...routeBetween(a, b, [], GRID_DEFAULT).path, b];
      for (let i = 1; i < completo.length; i++) {
        if (!adyacentes(completo[i - 1], completo[i])) fallas.push(`gap ${a} -> ${b} at ${i}`);
      }
      const vistas = new Set(completo.map(([x, y]) => `${x},${y}`));
      if (vistas.size !== completo.length) fallas.push(`repeated ${a} -> ${b}`);
    }
    expect(fallas).toEqual([]);
  });

  it('AC-CIR-003 — it includes neither the origin nor the destination', () => {
    expect(routeBetween([0, 0], [3, 0], [], GRID_DEFAULT).path).toEqual([[1, 0], [2, 0]]);
  });

  it('the lexicographically smallest route wins, and not "X first"', () => {
    // A route traced first in X and then in Y gives [[1,0],[2,0],[3,0],[3,1]] between
    // (0,0) and (3,2). The tie-break compares the cells as pairs `(x, y)`, so it prefers
    // the smallest X: it goes down in Y first and only then moves forward. The 10 shortest
    // routes all have the same moves. The tie-break decides which one is chosen.
    expect(routeBetween([0, 0], [3, 2], [], GRID_DEFAULT).path).toEqual([[0, 1], [0, 2], [1, 2], [2, 2]]);
  });

  it('the edge of the seam: the origin IS the corner', () => {
    // A version that excludes the ends leg by leg fails here: the first leg has no cells
    // of its own, and the arrival corner, which is intermediate in the complete route,
    // gets lost.
    const r = routeBetween([0, 0], [GRID_W - 1, GRID_H - 2], [], GRID_DEFAULT);
    expect(r.steps).toBe(2);
    expect(r.path).toEqual([[GRID_W - 1, GRID_H - 1]]);
  });

  it('the edge of the seam: the destination IS the corner', () => {
    const r = routeBetween([GRID_W - 1, GRID_H - 2], [0, 0], [], GRID_DEFAULT);
    expect(r.steps).toBe(2);
    expect(r.path).toEqual([[GRID_W - 1, GRID_H - 1]]);
  });

  it('the edge of the seam: origin and destination are the two corners', () => {
    expect(routeBetween([0, 0], [GRID_W - 1, GRID_H - 1], [], GRID_DEFAULT).path).toEqual([]);
    expect(routeBetween([GRID_W - 1, GRID_H - 1], [0, 0], [], GRID_DEFAULT).path).toEqual([]);
  });

  it('it goes through the seam only when that is shorter', () => {
    // (8,5) -> (1,0): 12 straight against 1+1+1=3 through the seam, so it uses the seam
    // and the route goes through its two ends.
    const porLaCostura = routeBetween([8, 5], [1, 0], [], GRID_DEFAULT);
    expect(porLaCostura.steps).toBe(3);
    expect(porLaCostura.path).toEqual([[GRID_W - 1, GRID_H - 1], [0, 0]]);
    // (9,0) -> (0,4): 13 straight against 5+1+4=10 through the seam. It is shorter too.
    expect(routeBetween([GRID_W - 1, 0], [0, 4], [], GRID_DEFAULT).steps).toBe(10);
    // In the centre the seam shortens nothing and stays out of the route.
    const central = routeBetween([4, 2], [6, 3], [], GRID_DEFAULT);
    expect(central.steps).toBe(3);
    expect(central.path.some((c) => misma(c, COSTURA_FIN) || misma(c, COSTURA_INICIO))).toBe(false);
  });
});

/**
 * The witness case: the `P` at rotation 1 on (3,2) and the `Y` at rotation 1 on (7,2).
 *
 * On this board a route that ignores the pieces goes through [7,1], a cell of the `Y`, on
 * the leg between the two. So a click sounds on top of a cell of the piece that sounds
 * next.
 */
const TESTIGO_P = colocar('P', 'P', 1, false, 3, 2);
const TESTIGO_Y = colocar('Y', 'Y', 1, false, 7, 2);
const TESTIGO = [TESTIGO_P, TESTIGO_Y];

describe('the witness case: the leg goes around the piece that sounds next', () => {
  it('the two pieces fall on the cells that the contract gives', () => {
    // If this moves, everything below measures another board.
    expect(TESTIGO_P.cells).toEqual([[3, 3], [4, 3], [3, 2], [4, 2], [3, 1]]);
    expect(TESTIGO_Y.cells).toEqual([[7, 4], [7, 3], [7, 2], [7, 1], [8, 2]]);
    expect(isValid(TESTIGO_Y.cells, [TESTIGO_P], GRID_DEFAULT)).toBe(true);
  });

  it('AC-CIR-004 — the leg from the P to the Y does not enter [7,1]', () => {
    // The gates are written by hand and not derived with `gates`: the exit gate of the `P`
    // is [3,1] and the entry gate of the `Y` is [8,2] (measured with `simulate_board`). To
    // derive them here would tie this test to the module of the sequence, which is the
    // one that uses them.
    const r = routeBetween([3, 1], [8, 2], TESTIGO, GRID_DEFAULT);
    // The detour along row 0 is the only way to arrive with no crossing: any free route
    // must go up to row 0 and around, and it has 8 moves.
    expect(r.path).toEqual([[3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [8, 1]]);
    expect(r.steps).toBe(8);
    expect(r.cost).toBe(7);
    expect(r.crossed).toEqual([]);
    expect(r.path.some((c) => misma(c, [7, 1]))).toBe(false);
  });

  it('AC-CIR-004 — ...and to avoid it COSTS two intervals, the price that CROSS_COST sets', () => {
    // With no obstacle the leg has 6 moves; around the piece it has 8. The two extra
    // intervals are two silences added to the cycle so that no click falls on a cell that
    // sounds.
    expect(routeBetween([3, 1], [8, 2], [], GRID_DEFAULT).steps).toBe(6);
    expect(routeBetween([3, 1], [8, 2], TESTIGO, GRID_DEFAULT).steps).toBe(8);

    // And here is the number that decides, which makes the value of the constant
    // reviewable. NO route of 6 moves is free. The proof by hand: to go down from row 1 to
    // row 2 the route must go through column 7 or 8, and (7,1) and (7,2) are both
    // occupied. Here it is verified by enumeration of the real routes of 6 moves.
    const minimos = caminosDeLargo([3, 1], [8, 2], 6);
    expect(minimos.length).toBeGreaterThan(0);
    const librePorCamino = minimos.map((c) => c.filter((k) => occupantAt(TESTIGO, k[0], k[1]) !== null).length);
    expect(Math.min(...librePorCamino)).toBeGreaterThan(0);

    // The cheapest of the short routes pays 4 empty cells + one occupied = 4 + CROSS_COST
    // = 9; the detour pays its 7 empty cells = 7. With CROSS_COST = 5 the detour wins.
    // With 2 the short route would cost 6 and the CROSSING would win, and the playhead
    // would show it.
    const barato = Math.min(...minimos.map((c, i) => (c.length - librePorCamino[i]) + librePorCamino[i] * CROSS_COST));
    expect(barato).toBe(4 + CROSS_COST);
    expect(routeBetween([3, 1], [8, 2], TESTIGO, GRID_DEFAULT).cost).toBeLessThan(barato);
  });

  it('the route from the Y back to the P enters no piece', () => {
    const r = routeBetween([7, 1], [4, 2], TESTIGO, GRID_DEFAULT);
    expect(r.path).toEqual([[6, 1], [5, 1], [4, 1]]);
    expect(r.steps).toBe(4);
    expect(costoDe(r)).toBe(3);
    expect(r.crossed).toEqual([]);
  });
});

/** The sample boards: the empty one, the witness and six random ones from a seed. */
const TABLEROS: { nombre: string; board: PlacedPiece[] }[] = [
  { nombre: 'empty', board: [] },
  { nombre: 'witness', board: TESTIGO },
  ...[1, 2, 3, 4, 5, 6].map((s) => ({ nombre: `random-${s}`, board: tableroAlAzar(azar(s), 8) })),
];

describe('no avoidable crossing, checked against a reference implementation', () => {
  it('the sample boards have real pieces', () => {
    // The check below would be vacuous on empty boards: with no occupied cell the crossing
    // cost does not exist and the reference would measure the bare grid.
    for (const { nombre, board } of TABLEROS.slice(1)) {
      expect(board.length, nombre).toBeGreaterThanOrEqual(2);
      expect(board.every((p, i) => isValid(p.cells, board.slice(0, i), GRID_DEFAULT)), nombre).toBe(true);
    }
  });

  it('AC-CIR-005 — the cost, the moves and the route equal those of the reference', () => {
    // The least cost in its falsifiable form: if a cheaper route existed, or one of the
    // same cost that entered fewer cells and won the tie-break, the reference would find
    // it. The corollary is that the inequality is STRICT: with exactly `CROSS_COST - 1`
    // extra moves the two routes TIE, and there the lexicographic tie-break decides, not
    // this criterion.
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
          if (costoDe(real) !== esperado.costo) fallas.push(`cost ${donde}: ${costoDe(real)} vs ${esperado.costo}`);
          if (real.steps !== esperado.pasos) fallas.push(`moves ${donde}: ${real.steps} vs ${esperado.pasos}`);
          if (JSON.stringify(real.path) !== JSON.stringify(esperado.camino)) fallas.push(`route ${donde}`);
        }
      }
    }
    expect(fallas).toEqual([]);
  });

  it('`crossed` is exactly the occupied subset of `path`, in route order', () => {
    // It is not a separate list to keep in sync: the intermediate cells pay the cost, and
    // the two ends, which are gates and so cells that are ALWAYS occupied, stay out of
    // both lists.
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

  it('AC-CIR-006 — the COST is symmetric, although the route need not be', () => {
    // What holds the symmetry is that only the intermediate cells pay the cost: `a -> b`
    // and `b -> a` add over the SAME set of cells. The moves can differ, because between
    // two routes of the same cost the tie-break can keep one of another length. That is
    // correct, and not an asymmetry of the model.
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

describe('determinism and tie-break', () => {
  it('AC-CIR-022 — the same board and the same pair always give the same route', () => {
    // There is no `Math.random` and no date: the equality `cost + rest === remaining` of
    // the tie-break is exact, and the order of the pieces in `placed` cannot change it,
    // because the only thing read from them is which cells they occupy.
    for (const { board } of TABLEROS) {
      for (const [a, b] of [[[0, 0], [7, 4]], [[3, 1], [8, 2]], [[9, 5], [2, 2]]] as [Cell, Cell][]) {
        expect(routeBetween(a, b, board, GRID_DEFAULT)).toEqual(routeBetween(a, b, board, GRID_DEFAULT));
        expect(routeBetween(a, b, [...board], GRID_DEFAULT)).toEqual(routeBetween(a, b, board, GRID_DEFAULT));
      }
    }
  });

  it('AC-CIR-007 — with the tie EXERCISED, the lexicographically smallest of all routes wins, not of the ones tried', () => {
    // The pairs are chosen so that the tie really exists: ALL the routes of least cost are
    // enumerated and the test fails if there is only one. With one route, a test of the
    // tie-break goes green and breaks no tie.
    const pares: [Cell, Cell, PlacedPiece[]][] = [
      [[0, 0], [3, 2], []],
      [[4, 2], [7, 4], []],
      [[3, 1], [8, 2], TESTIGO],
      [[1, 1], [8, 4], TESTIGO],
    ];
    for (const [a, b, board] of pares) {
      const todos = todosLosMinimos(a, b, board);
      const donde = `${a} -> ${b}`;
      expect(todos.length, `${donde} must tie`).toBeGreaterThan(1);
      const menor = todos.reduce((mejor, c) => menorLex(c, mejor) ? c : mejor);
      expect(routeBetween(a, b, board, GRID_DEFAULT).path, donde).toEqual(menor);
    }
  });

  it('AC-CIR-007 — the tie-break compares the whole PREFIX and not only the first cell', () => {
    // The trap: to fix the exploration order, or to break the tie on the neighbour that
    // relaxes, is enough for the FIRST cell and not for the rest. These pairs have more
    // than one route of least cost that starts with the same cell, so the tie-break must
    // still decide after the first move.
    for (const [a, b] of [[[0, 0], [3, 2]], [[4, 2], [7, 4]]] as [Cell, Cell][]) {
      const elegido = routeBetween(a, b, [], GRID_DEFAULT).path;
      const mismoArranque = todosLosMinimos(a, b, []).filter((c) => misma(c[0], elegido[0]));
      expect(mismoArranque.length, `${a} -> ${b}`).toBeGreaterThan(1);
      const menor = mismoArranque.reduce((mejor, c) => menorLex(c, mejor) ? c : mejor);
      expect(elegido, `${a} -> ${b}`).toEqual(menor);
    }
  });
});

describe('the seam comes from the dimensions', () => {
  it('AC-CIR-002 — it is always the two opposite corners of the board that exists', () => {
    // The board of 10 x 6 is not the only one, so `(0,0)`-`(9,5)` cannot be a constant:
    // the seam is "the two corners", and that reads on any size.
    for (const dims of [GRID_DEFAULT, { w: 5, h: 5 }, { w: 26, h: 15 }, { w: 64, h: 7 }]) {
      expect(costuraDe(dims), `${dims.w}x${dims.h}`).toEqual([[0, 0], [dims.w - 1, dims.h - 1]]);
    }
  });

  it('AC-CIR-002 — the cell of the seam is a neighbour of the other end, and only that cell', () => {
    // The seam as an OBSERVABLE property and not as a pair of coordinates: on a board of
    // 26 x 15 the corner `(25,14)` is 39 moves from `(0,0)` on the grid and ONE through
    // the seam. The cell next to it is not: the seam is an edge, not a torus.
    const dims = { w: 26, h: 15 };
    const [inicio, fin] = costuraDe(dims);
    expect(routeBetween(inicio, fin, [], dims).steps).toBe(1);
    expect(routeBetween(inicio, [dims.w - 2, dims.h - 1], [], dims).steps).toBe(2);
  });
});

describe('the cache of distances changes no route', () => {
  it('a shared route finder answers the same as a new one for each query', () => {
    // The only risk of the cache is that a `dist[]` kept for one destination is read from
    // an origin for which it does not hold. It is checked against the version with no
    // cache, which is exactly `routeBetween`: each call builds its own route finder and
    // drops it.
    //
    // Six boards from a seed, reproducible and with no `Math.random`, times the 3600
    // routes of the reference board would be 21,600 comparisons. The test takes a sample
    // of pairs spread over the board, so it runs in milliseconds.
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

  it('and none on a large board either, which is where the cache matters', () => {
    // The same check on 26 x 15: it is the size where the 144 runs become 12, so where the
    // cache makes the measured difference (10.9 ms -> 3.1 ms).
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
