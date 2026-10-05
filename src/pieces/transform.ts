// Each transformation is a `map`: cell `k` stays cell `k`. `ANCHOR_INDEX` and every index
// into `PlacedPiece.cells` depend on it. Do not filter, sort or regroup cells here.

/** `[x, y]`. `y` grows down: grid coordinates, not Cartesian ones. */
export type Cell = [number, number];

/** It gives `-0` when `x = 0`. */
export function rotate90(cells: Cell[]): Cell[] { return cells.map(([x,y]): Cell => [y, -x]); }

export function normalize(cells: Cell[]): Cell[]{
  const minx = Math.min(...cells.map(c=>c[0]));
  const miny = Math.min(...cells.map(c=>c[1]));
  return cells.map(([x,y]) => [x-minx, y-miny]);
}

export function rotateN(cells: Cell[], n: number): Cell[]{ let r = normalize(cells); for(let i=0;i<n;i++) r = normalize(rotate90(r)); return r; }

export function reflect(cells: Cell[]): Cell[]{
  const refl: Cell[] = cells.map(([x,y]): Cell => [-x, y]);
  return normalize(refl);
}

export function centroid(cells: readonly Cell[]): [number, number] {
  let sx = 0, sy = 0;
  for (const [x, y] of cells) { sx += x; sy += y; }
  return [sx / cells.length, sy / cells.length];
}

/** In `[0, 2π)`. `y` grows down, so the angle grows clockwise on screen: south gives `π/2`. */
export function angleFromCentroid(cell: Cell, cent: readonly [number, number]): number {
  const twoPi = 2 * Math.PI;
  const a = Math.atan2(cell[1] - cent[1], cell[0] - cent[0]);
  if (a >= 0) return a;

  // With `-a` below the ulp of 2π, `a + 2π` rounds to exactly 2π. The bound keeps the
  // interval half-open.
  const norm = a + twoPi;
  return norm < twoPi ? norm : twoPi * (1 - Number.EPSILON);
}

function manhattan(a: Cell, b: Cell): number { return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]); }

/** A side or a corner: four of the twelve pieces admit no orthogonal walk. */
function seTocan(a: Cell, b: Cell): boolean {
  return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1])) === 1;
}

function lex(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Element `g` is the index of the cell at position `g`: the inverse of `degreeByCellIndex`. */
export function pathThroughCells(cells: readonly Cell[], tiebreak: readonly number[]): number[] {
  const n = cells.length;
  if (n <= 2) return cells.map((_, k) => k).sort((a, b) => tiebreak[a] - tiebreak[b]);

  const dist = cells.map(a => cells.map(b => manhattan(a, b)));
  let maxDist = 0;
  for (const fila of dist) for (const d of fila) if (d > maxDist) maxDist = d;
  const BASE = 1 + n * maxDist;
  const costo = cells.map((a, i) => cells.map((b, j) => (seTocan(a, b) ? 0 : BASE) + dist[i][j]));

  // g[j][mask]: the minimum cost to start at `j` and visit all of `mask`, with `j` not in `mask`.
  const size = 1 << n;
  const g = new Array<number>(n * size).fill(0);
  for (let mask = 1; mask < size; mask++) {
    for (let j = 0; j < n; j++) {
      if ((mask >> j) & 1) continue;
      let best = Infinity;
      for (let k = 0; k < n; k++) {
        const bit = 1 << k;
        if (!(mask & bit)) continue;
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
