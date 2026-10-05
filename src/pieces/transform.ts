
/**
 * The geometry of the pieces: rotation, reflection and normalization.
 *
 * A RULE that must not break: the three are a `map`, so **the cell at index `k` is the
 * same logical cell after a transformation**. `ANCHOR_INDEX` depends on it, because it
 * stores the grip cell as an index and not as a coordinate. So does everything that
 * resolves an index against `PlacedPiece.cells`. To filter, sort or regroup cells inside
 * these functions breaks the placement of pieces **with no visible error**.
 *
 * `y` grows DOWN: these are grid coordinates, not Cartesian ones, so the angular order
 * goes clockwise on screen.
 */

/** A cell of the grid, `[x, y]`. `y` grows DOWN: grid coordinates, not Cartesian ones. */
export type Cell = [number, number];

/** A rotation of 90°. It gives `-0` when `x = 0`: see `sameCell` in invariants.ts. */
export function rotate90(cells: Cell[]): Cell[] { return cells.map(([x,y]): Cell => [y, -x]); }

/** Moves the shape so that its top left corner is at (0,0). */
export function normalize(cells: Cell[]): Cell[]{
  const minx = Math.min(...cells.map(c=>c[0]));
  const miny = Math.min(...cells.map(c=>c[1]));
  return cells.map(([x,y]) => [x-minx, y-miny]);
}

/** `n` rotations of 90°, with a normalization at each one. */
export function rotateN(cells: Cell[], n: number): Cell[]{ let r = normalize(cells); for(let i=0;i<n;i++) r = normalize(rotate90(r)); return r; }

/** The left-right mirror: `x -> -x`, normalized again. */
export function reflect(cells: Cell[]): Cell[]{
  const refl: Cell[] = cells.map(([x,y]): Cell => [-x, y]);
  return normalize(refl);
}

/**
 * The center of mass of a shape: the mean of its coordinates.
 *
 * It is the mean and not the center of the bounding box. That spreads the angular order
 * around the MASS of the piece and not around its box. In an `L` the two are in different
 * places.
 *
 * The result is almost never an integer, because it is a mean of fifths. So a comparison
 * with it needs an epsilon and not `===`.
 */
export function centroid(cells: readonly Cell[]): [number, number] {
  let sx = 0, sy = 0;
  for (const [x, y] of cells) { sx += x; sy += y; }
  return [sx / cells.length, sy / cells.length];
}

/**
 * The angle of a cell as seen from the centroid, normalized to `[0, 2π)`.
 *
 * `y` grows DOWN: these are grid coordinates, not Cartesian ones. So the angle grows
 * CLOCKWISE on screen, and the cell SOUTH of the centroid gives `π/2` and not `-π/2`.
 * This is not wrong. It is exactly the kind of detail that someone "fixes" by mistake,
 * and so it has its own test.
 *
 * The normalization to `[0, 2π)` is not cosmetic: `atan2` returns `(-π, π]`, which cuts
 * the ring exactly at the west. A sort on that would put the cells of the northwest
 * before those of the north.
 */
export function angleFromCentroid(cell: Cell, cent: readonly [number, number]): number {
  const twoPi = 2 * Math.PI;
  const a = Math.atan2(cell[1] - cent[1], cell[0] - cent[0]);
  if (a >= 0) return a;

  // The interval is HALF-OPEN, and the sum alone does not guarantee it. With a negative
  // `a` smaller than the ulp of 2π (~8.9e-16), a cell just north of east, `a + 2π` rounds
  // to exactly 2π and the result leaves the range.
  //
  // It changes no order: 2π and 2π-ulp are both at the end of the ring, where that cell
  // belongs. The bound is there because the range is the contract that
  // `degreeByCellIndex` reads, and this function takes arbitrary shapes on purpose. With
  // the 12 of `SHAPES` it cannot occur: the coordinates are integers and the centroid is
  // a sum over 5, so `dy` is exactly zero or it is O(0.1).
  const norm = a + twoPi;
  return norm < twoPi ? norm : twoPi * (1 - Number.EPSILON);
}

/**
 * The Manhattan distance between two cells: the count of orthogonal moves from one to
 * the other. It is 1 when the two share a side.
 *
 * `pathThroughCells` MEASURES with this distance. It does not use it to decide whether
 * two cells touch: `seTocan` says that. The difference is what makes the diagonal
 * tolerated but not preferred: it is 2, twice a straight move.
 */
function manhattan(a: Cell, b: Cell): number { return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]); }

/**
 * Whether two cells TOUCH: they share a side or a corner.
 *
 * It is the relation that `pathThroughCells` tries to chain, and **it is looser than the
 * rule of the instrument on purpose**. The circuit between pieces moves only up, down,
 * left and right: `routeBetween` knows no diagonal. Inside the piece the diagonal is
 * tolerated, because four of the twelve pieces admit no orthogonal walk and the
 * alternative is worse: the `T` would pass OVER one of its own cells that has not sounded
 * yet, and come back to it two moves later. A diagonal move at least reaches a cell that
 * touches the one before.
 *
 * With this relation the walk covers each of the 12 pieces whole. With the pure
 * orthogonal relation it covers 8. The other 4 fail because of their shape and not
 * because of the algorithm: their graph of cells is a tree with a node of 3 or 4 links.
 */
function seTocan(a: Cell, b: Cell): boolean {
  return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1])) === 1;
}

/** Compares two sequences position by position. Negative if `a` comes first. */
function lex(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The walk that visits every cell of a shape and moves to a TOUCHING cell as often as
 * possible.
 *
 * It returns the ORDER OF VISIT BY POSITION: element `g` is the index of the cell that
 * the walk visits at position `g`.
 *
 * Take care with the direction of reading. It is the inverse of what `degreeByCellIndex`
 * returns, which is "the degree of cell `k`". The two are permutations of `0..n-1`, so to
 * confuse them compiles and gives other music. The asymmetry is deliberate: a walk is a
 * SEQUENCE of cells, and a map of degrees is a TABLE by cell. `music.ts` inverts it in
 * one line.
 *
 * `tiebreak[k]` is the rank of cell `k` for the tie-break, and the smaller wins. It comes
 * as a parameter and is not computed here because the criterion is musical (today it is
 * the angular order) and `music.ts` is downstream: this module cannot import it and has
 * no reason to know that a degree exists.
 *
 * ## The four criteria, in order
 *
 * 1. **The most moves to a cell that TOUCHES the one before** (`seTocan`: a side or a
 *    corner). This is the request: the arpeggio walks the piece and does not jump across
 *    its own shape. The 12 pieces meet it in full.
 * 2. **On a tie, the smallest sum of MANHATTAN distances.** The two metrics together make
 *    the diagonal **tolerated but not preferred**: for criterion 1 a diagonal move is as
 *    good as a straight one, but for criterion 2 it costs twice as much. So it occurs
 *    only where the shape gives no straight move.
 * 3. **On a tie, the long moves AS EARLY as possible** (the lexicographically largest
 *    sequence of distances). With the diagonal accepted, this criterion does not separate
 *    "continuous" from "cut", because every move reaches a touching cell. **It stays**,
 *    and not by inertia: it is the only thing that separates the two versions of the `Y`,
 *    and the reference of the request chose by hand the one that puts the diagonal move
 *    first.
 * 4. **On a tie, the lexicographically smallest `tiebreak`.** It ALWAYS applies, and it
 *    is not a detail: a walk and its reverse are equally good in the three criteria
 *    before, so without this one the order of the notes would depend on where the `for`
 *    started to look.
 *
 * Criteria 1 and 2 are packed into one integer, `(touch ? 0 : BASE) + Manhattan
 * distance`, and the dynamic programming resolves them: it adds, and compares sums.
 * `BASE` comes from the shape and is not a fixed number: `1 + n * maxDistance` is larger
 * than any possible walk, so the field of the distance cannot carry into the field of
 * the jumps. It is the same technique as `claveDeTramo` in `sequence.ts`, with the same
 * trap: a smaller `BASE` turns no test red. It reorders the notes in silence.
 *
 * Criteria 3 and 4 are not additive: they depend on the POSITION of the move and not only
 * on the move. So they are resolved after, on the branches that reach the optimum and on
 * no other.
 *
 * ## Cost
 *
 * Held-Karp for an open path, `O(n^2 * 2^n)`: with `n = 5` it is 160 states and 4 µs for
 * each call, against 0.57 µs for the angular order alone. The pass after it visits only
 * optimal walks: 72 in the worst case of the 12 pieces, which is the `X`. The argument is
 * the same one that justifies the exact TSP in `shortestCircuit`: the rules of the
 * instrument bound `n`. Here it is stronger still, because `CELLS_PER_PIECE` is the
 * definition of the family of pieces and not a parameter. A shape of 12 cells would take
 * 590 thousand operations. With 20, it does not end.
 */
export function pathThroughCells(cells: readonly Cell[], tiebreak: readonly number[]): number[] {
  const n = cells.length;
  // With 0, 1 or 2 cells there is nothing to optimize and the tie-break alone decides. It
  // is a separate exit because the loop below assumes at least one move to choose.
  if (n <= 2) return cells.map((_, k) => k).sort((a, b) => tiebreak[a] - tiebreak[b]);

  const dist = cells.map(a => cells.map(b => manhattan(a, b)));
  let maxDist = 0;
  for (const fila of dist) for (const d of fila) if (d > maxDist) maxDist = d;
  const BASE = 1 + n * maxDist;
  const costo = cells.map((a, i) => cells.map((b, j) => (seTocan(a, b) ? 0 : BASE) + dist[i][j]));

  // g[j][mask] = the minimum cost to start at `j` and visit all of `mask`, with `j` not
  // in `mask`. It runs BACKWARD for the same reason as `shortestCircuit`: the walk is
  // then rebuilt FORWARD, and the tie-break applies in the order in which the decisions
  // are made, which criteria 3 and 4 need.
  const size = 1 << n;
  const g = new Array<number>(n * size).fill(0);
  for (let mask = 1; mask < size; mask++) {
    for (let j = 0; j < n; j++) {
      if ((mask >> j) & 1) continue;
      let best = Infinity;
      for (let k = 0; k < n; k++) {
        const bit = 1 << k;
        if (!(mask & bit)) continue;
        // `mask ^ bit` is smaller than `mask`, so it is already computed. No sentinel for
        // "unreachable" is necessary: the graph is complete, so every state has a walk.
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

  // Among the walks that reach the optimum, the one with the lexicographically LARGEST
  // distances wins (criterion 3, the jumps first), and on a tie the one with the smallest
  // `tiebreak` (criterion 4). The descent takes only the branches that still reach the
  // optimum, so it is not a brute force over the n! permutations.
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
