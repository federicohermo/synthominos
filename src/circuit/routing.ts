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
 * neighbours, and this says what it costs to step on each one. The seam is the function
 * `costuraDe(dims)` of `routing.ts` because it depends on the dimensions; this number does
 * not, so it is a value.
 *
 * The 5 comes from a sweep of the cost over two different measurements, and the one that
 * decides is **not** the witness case. It is the second one.
 *
 * On the witness case, the `P` at rotation 1 on (3,2) and the `Y` at rotation 1 on (7,2),
 * a cost of 2 was enough. With a cost of 1 the leg between the two goes through a piece:
 *
 * | cost | cells entered per cycle | cycle length |
 * |---|---|---|
 * | 1 (no crossing cost) | 3 | 18 |
 * | 2 | 1 | 18 |
 * | **5** | **0** | 20 |
 *
 * But the witness is ONE leg. Over 200 random boards for each size, with the real gates,
 * the question that matters is another: **how often does a route enter a piece WHEN a free
 * detour exists.** That is, the times it crosses when it could avoid it. Only that reads
 * as an error and not as a need:
 *
 * | cost | crossings/cycle (3 pieces) | (5 pieces) | cycle vs cost 2 | crosses with a free detour |
 * |---|---|---|---|---|
 * | 2 | 2.12 | 5.24 | — | **20.4 %** |
 * | 3 | 1.57 | 4.45 | +2.8 % | 16.0 % |
 * | **5** | **1.10** | **3.69** | **+7.1 %** | **9.9 %** |
 * | 61 (forbids in practice) | 0.51 | 2.83 | +19.3 % | **0 %** |
 *
 * With 2, **one leg in five crosses a piece that it could go around**, and that shows: the
 * playhead makes it evident, which is how it was found. With 5 it goes down to one in ten
 * and the cycle grows 7 %.
 *
 * **61 is the only value that meets "cross only when there is no alternative". It was not
 * chosen because of what the other extreme costs:** almost 20 % of cycle, and above all
 * detours of up to +20 intervals in one leg (2.7 s at 110 bpm). That detour does not sound
 * like a detour. It sounds like the instrument hung, and that is the symptom that a cost,
 * and not a prohibition, exists to avoid. 5 bounds the detour to 4 extra moves for each
 * cell avoided, which is a bar and not a pause.
 *
 * It is still a COST and not a rule: when no free route exists, as on a full board, the
 * route crosses and the cell sounds its note. So there is no special case to write and no
 * cap on the detour.
 *
 * To move it is to change this number: the table above says what is won and what is paid.
 */
export const CROSS_COST = 5;

/**
 * The answer to a route query: the intermediate cells between two cells, which of them
 * are occupied, how many intervals the route lasts and what it cost to choose it.
 *
 * **`cost` and `steps` are not the same number**, and so both travel: a crossing costs
 * `CROSS_COST` but lasts ONE interval. The cost orders: the circuit uses it to choose
 * between two routes. The moves measure time. To confuse them stretches the cycle where
 * there is nothing to wait for.
 *
 * `crossed` is exactly the occupied subset of `path`, and not a separate list to maintain.
 */
export interface Ruta {
  path: Cell[];
  steps: number;
  cost: number;
  crossed: Cell[];
}

/**
 * The two ends of the seam: the board folds onto itself and `(0,0)` is adjacent to
 * `(w-1, h-1)`.
 *
 * It is ONE extra edge, not a torus and not a wrap of the whole border: no other pair of
 * border cells becomes neighbours. Measured over the 3600 pairs of the board of 10 x 6: it
 * shortens 496 (13.8 %) and takes the longest distance of the board from 14 to 12.
 *
 * **The order of the pair means nothing.** `routeBetween` treats the seam as one more edge
 * of the graph and walks it in both directions with no name of its own, so the two ends
 * are interchangeable: all that matters is that they are these two cells.
 *
 * **It is a function and not a constant.** The dimensions are not constant, so the seam is
 * the two opposite corners of the board that exists, not two fixed coordinates. It lives
 * next to `neighborsOf`, which writes the same two cells as node ids.
 */
export function costuraDe(dims: Dims): readonly [Cell, Cell] {
  return [[0, 0], [dims.w - 1, dims.h - 1]];
}

/**
 * The node of the graph for `(x, y)`, and its inverse.
 *
 * `x * h + y` and not `y * w + x` on purpose: the id grows in the same order as the pairs
 * `(x, y)` sort, so the lexicographic tie-break of `routeBetween` is a comparison of
 * integers and not of tuples.
 */
function nodeOf(x: number, y: number, h: number): number {
  return x * h + y;
}

function cellOf(n: number, h: number): Cell {
  return [Math.floor(n / h), n % h];
}

/**
 * The neighbours of `n`: the ones next to it on the grid, plus the other end of the seam
 * if `n` is one of the two.
 *
 * It writes on `out` and returns how many it put, and builds no array. This is not a
 * free micro-optimization: a cost matrix of 12 pieces is 144 calls to `routeBetween`, and
 * each one calls this once for each cell of the board.
 *
 * The order in which it writes them does NOT matter: the tie-break goes by id (see
 * `routeBetween`), not by order of appearance.
 *
 * **The seam is the nodes `0` and `N - 1`, and that is not a coincidence to remember**:
 * `costuraDe` defines it as the two opposite corners and `nodeOf` numbers with `x * h + y`,
 * so `(0,0)` is node 0 and `(w-1, h-1)` is the last one. It is written so, and not with a
 * call to `costuraDe`, because this function runs once for each cell and for each
 * Dijkstra, millions of times on a large board, and the version with the call allocates
 * two tuples each time. The test of the seam compares the two forms, and that keeps them
 * together.
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
 * The route of least cost between `a` and `b`, with the cells it goes through.
 *
 * The graph has COSTS: to enter an empty cell costs 1 and to enter an occupied one costs
 * `CROSS_COST`. A route that ignores the placed pieces puts the clicks of a leg on top of
 * the piece that just sounded. The three answers come from ONE call: the number of clicks,
 * the interval of the next note and the cells that the leg enters cannot disagree, because
 * they are the same datum read three times.
 *
 * ## The cost orders, the moves measure time
 *
 * `steps` is `path.length + 1` and NOT the cost. A crossing costs `CROSS_COST` but lasts
 * ONE interval: the cost exists to choose between routes, not to count time. If it leaked
 * into the offsets, the cycle would stretch where there is nothing to wait for.
 *
 * ## The INTERMEDIATE cells pay the cost
 *
 * The cost is charged on ENTERING a cell, and to enter `a` or `b` is free. The two ends are
 * gates of a piece, so they are occupied by definition. To charge them would add the same
 * `2 * (CROSS_COST - 1)` to the 144 entries of the cost matrix and move no minimum. It
 * would also break the symmetry of the distance: with only the intermediate cells counted,
 * `a -> b` and `b -> a` add over the SAME set of cells. That is also why `crossed` is
 * exactly the occupied subset of `path`, and not a list to maintain apart.
 *
 * ## How a tie between routes is decided
 *
 * Dijkstra by cost from `b` gives `dist[]`. Then the route is rebuilt FORWARD from `a`:
 * each move takes the neighbour that minimizes `peso(v) + dist[v]`, and among the ones
 * that tie, the one with the smallest id. By the way the id is built, that is the
 * lexicographically smallest in `(x, y)`.
 *
 * That compares the WHOLE PREFIX with no need to write it: only the neighbours from which
 * a route of least cost still exists reach the tie-break, so the smallest choice at each
 * move gives the smallest sequence of all. To fix the exploration order of the Dijkstra is
 * not enough: the first neighbour that relaxes is not necessarily the one of the winning
 * route. To keep the whole route in each node and compare them is quadratic. The reference
 * implementation in `__tests__/routing.test.ts` does that, and this function is checked
 * against it.
 *
 * ## `a === b`
 *
 * It returns `path: []` and `steps: 1`. That meets the length invariant but is not a
 * distance. The case is outside the domain: a leg goes from the exit gate of one piece to
 * the entry gate of ANOTHER, and with one piece there is no leg.
 */
export function routeBetween(a: Cell, b: Cell, placed: readonly PlacedPiece[], dims: Dims): Ruta {
  return rutador(placed, dims)(a, b);
}

/**
 * A route finder over ONE board, which remembers what it has computed.
 *
 * It gives the same answer as `routeBetween`, and is in fact its implementation, but it is
 * bound to `(placed, dims)` from the start. That bond makes it cheap: **the cache of
 * distances by destination**. It is also the only reason it is a factory and not a fourth
 * optional parameter: the `Map` cannot survive a change of the board, and the only way to
 * guarantee that, with no invalidation to remember, is that it lives in the closure of
 * one board.
 *
 * ## Why the cache is by DESTINATION
 *
 * `buildSequence` asks for a matrix of `n x n` routes, from the exit gate of each piece to
 * the entry gate of each other one: 144 queries with 12 pieces. But the DESTINATIONS are
 * 12: the entry gates. And the Dijkstra below runs **from the destination** (it is written
 * so to rebuild the route forward, see the docblock of `routeBetween`), so one run gives
 * the distance from ALL the cells at once. The 144 runs become 12 runs and 132 route
 * rebuilds, which are linear in the length of the route.
 *
 * The price is the early exit: to reuse `dist[]` from any origin, the Dijkstra must close
 * every cell, and cannot stop when the origin is closed. It still wins, also on the board
 * of 60 cells: 12 full runs cost less than 144 partial ones. Measured with 12 pieces:
 *
 * ```
 * board            cells    no cache   with cache
 * 10 x  6             60      2.3 ms      1.9 ms
 * 26 x 14            364     10.9 ms      3.1 ms
 * 53 x 30 (4K)      1590         —       30.9 ms
 * ```
 *
 * The 4K board stays outside the budget of 5 ms. The way out is identified and not done:
 * the costs are only two (1 and `CROSS_COST`), so a bucket queue takes the `O(N^2)` of the
 * linear search for the minimum down to `O(N * C)`.
 *
 * **It changes no route**, and that is verified, not argued: a test in
 * `__tests__/routing.test.ts` compares this route finder against `routeBetween`, which
 * builds a new one for each query and so is the version with no cache. It does so on
 * boards from a deterministic PRNG, on the reference board and on one of 26 x 15. A
 * comparison script outside the repo also compared the whole SEQUENCE on 279 random
 * boards, with zero differences. The argument exists too: `dist[]` is a function of
 * `(destino, placed)`, and inside one route finder `placed` does not change.
 */
export function rutador(placed: readonly PlacedPiece[], dims: Dims): (a: Cell, b: Cell) => Ruta {
  const { w, h } = dims;
  const N = w * h;

  // Once for the whole board, and not once for each query: with 12 pieces and the full
  // matrix, a build for each query runs 144 times and always gives the same.
  const ocupada = new Uint8Array(N);
  for (const p of placed) for (const [x, y] of p.cells) ocupada[nodeOf(x, y, h)] = 1;

  // Sentinel for "not reached yet": more expensive than the most expensive route possible.
  // The 60 cells of the reference board, all occupied at `CROSS_COST`, are 300 with the 5
  // of today, and 3660 with the 61 that the docblock of the constant discusses and
  // rejects. On a board of 390 cells they are 1950. It is also far from the edge of Int32,
  // so adding a cost to it does not overflow. So it holds for any board and any reasonable
  // cost with no change.
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
      // The board is connected, so this happens only when every cell is closed.
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
      // No sentinel and no guard for "not found": the minimum over the neighbours IS
      // `dist[cur]`, which is the equation of Dijkstra. To enter any cell other than
      // `destino` costs at least 1, so `dist` goes down STRICTLY at each move. The walk
      // ends and cannot come back to a cell it already entered.
      cur = siguiente;
      if (cur !== destino) {
        const celda = cellOf(cur, h);
        path.push(celda);
        if (ocupada[cur]) crossed.push(celda);
      }
    }

    // `cost` comes from `dist[origen]` and not from a recount of `path` and `crossed`: it
    // is THE number that the Dijkstra minimized, not a formula that reproduces it. Today
    // `path.length + crossed.length * (CROSS_COST - 1)` gives the same, because `crossed`
    // is the occupied subset of `path`. But to compute it outside would write the cost
    // rule in a second place. With no closed formula, nothing forces two places that
    // compute the cost to agree.
    return { path, steps: path.length + 1, cost: dist[origen], crossed };
  };
}
