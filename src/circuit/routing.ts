import type { Cell } from '../pieces/transform.ts';
import type { PlacedPiece, Dims } from '../board-editing/placement.ts';

// At 5, one leg in ten crosses a piece it could go around, and a detour is at most 4 moves
// for each cell avoided. A prohibition gives detours of up to 20 intervals.
export const CROSS_COST = 5;

/** `cost` chooses the route and `steps` gives its time: a crossing costs `CROSS_COST` and lasts one interval. */
export interface Ruta {
  path: Cell[];
  steps: number;
  cost: number;
  crossed: Cell[];
}

export function costuraDe(dims: Dims): readonly [Cell, Cell] {
  return [[0, 0], [dims.w - 1, dims.h - 1]];
}

/** `x * h + y`: the id sorts as the pair `(x, y)`, and the tie-break of the route compares ids. */
function nodeOf(x: number, y: number, h: number): number {
  return x * h + y;
}

function cellOf(n: number, h: number): Cell {
  return [Math.floor(n / h), n % h];
}

function neighborsOf(n: number, out: number[], w: number, h: number): number {
  const x = Math.floor(n / h);
  const y = n % h;
  let k = 0;
  if (x > 0) out[k++] = n - h;
  if (x < w - 1) out[k++] = n + h;
  if (y > 0) out[k++] = n - 1;
  if (y < h - 1) out[k++] = n + 1;
  // The two cells of `costuraDe`, as node ids. No call: this runs once for each cell of each Dijkstra.
  const ultimo = w * h - 1;
  if (n === 0) out[k++] = ultimo;
  else if (n === ultimo) out[k++] = 0;
  return k;
}

export function routeBetween(a: Cell, b: Cell, placed: readonly PlacedPiece[], dims: Dims): Ruta {
  return rutador(placed, dims)(a, b);
}

export function rutador(placed: readonly PlacedPiece[], dims: Dims): (a: Cell, b: Cell) => Ruta {
  const { w, h } = dims;
  const N = w * h;

  const ocupada = new Uint8Array(N);
  for (const p of placed) for (const [x, y] of p.cells) ocupada[nodeOf(x, y, h)] = 1;

  // Above the most expensive route and far from the edge of Int32: a sum does not overflow.
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
      // No early exit at the origin: the cache serves this `dist` to every origin.
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
      cur = siguiente;
      if (cur !== destino) {
        const celda = cellOf(cur, h);
        path.push(celda);
        if (ocupada[cur]) crossed.push(celda);
      }
    }

    return { path, steps: path.length + 1, cost: dist[origen], crossed };
  };
}
