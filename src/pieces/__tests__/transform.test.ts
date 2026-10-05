import { describe, it, expect } from 'vitest';
import {
  rotate90,
  normalize,
  rotateN,
  reflect,
  centroid,
  angleFromCentroid,
  pathThroughCells,
} from '../transform.ts';
import { SHAPES } from '../pieces.ts';
import { DEGREE_EPSILON } from '../../musical-model/music.ts';
import type { Cell } from '../transform.ts';
import type { PieceKey } from '../pieces.ts';

const PIECES = Object.keys(SHAPES) as PieceKey[];

/** `toEqual` tells `-0` from `0`, and the raw `rotate90` gives `-0`. */
const sameCell = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
const sameCells = (a: Cell[], b: Cell[]) => a.length === b.length && a.every((c, i) => sameCell(c, b[i]));

describe('rotate90', () => {
  it('AC-PCS-010 — maps [x,y] to [y,-x] and keeps the order of the array', () => {
    const cells: Cell[] = [[0,0],[1,0],[2,3]];
    expect(sameCells(rotate90(cells), [[0,0],[0,-1],[3,-2]])).toBe(true);
  });

  it('AC-PCS-009 — four normalized rotations give the original shape back', () => {
    for (const p of PIECES) {
      expect(sameCells(rotateN(SHAPES[p], 4), normalize(SHAPES[p]))).toBe(true);
    }
  });
});

describe('normalize', () => {
  it('moves the top left corner to (0,0)', () => {
    expect(sameCells(normalize([[3,5],[4,5],[3,7]]), [[0,0],[1,0],[0,2]])).toBe(true);
  });

  it('is idempotent', () => {
    for (const p of PIECES) {
      const once = normalize(SHAPES[p]);
      expect(sameCells(normalize(once), once)).toBe(true);
    }
  });
});

describe('rotateN', () => {
  it('keeps the count of cells in the four rotations', () => {
    for (const p of PIECES) {
      for (let r = 0; r < 4; r++) expect(rotateN(SHAPES[p], r)).toHaveLength(5);
    }
  });

  it('two rotations swap width and height twice: the bounding box is the original one', () => {
    const box = (cells: Cell[]) => [
      Math.max(...cells.map(c => c[0])),
      Math.max(...cells.map(c => c[1])),
    ];
    for (const p of PIECES) {
      expect(box(rotateN(SHAPES[p], 2))).toEqual(box(normalize(SHAPES[p])));
    }
  });

  it('a rotation of 90° swaps width and height', () => {
    for (const p of PIECES) {
      const base = normalize(SHAPES[p]);
      const girada = rotateN(SHAPES[p], 1);
      expect(Math.max(...girada.map(c => c[0]))).toBe(Math.max(...base.map(c => c[1])));
      expect(Math.max(...girada.map(c => c[1]))).toBe(Math.max(...base.map(c => c[0])));
    }
  });
});

describe('reflect', () => {
  it('AC-PCS-013 — mirrors in x and normalizes again', () => {
    expect(sameCells(reflect([[0,0],[1,0],[2,1]]), [[2,0],[1,0],[0,1]])).toBe(true);
  });

  it('AC-PCS-013 — is an involution on a normalized shape', () => {
    for (const p of PIECES) {
      const base = normalize(SHAPES[p]);
      expect(sameCells(reflect(reflect(base)), base)).toBe(true);
    }
  });
});

describe('the signed zero', () => {
  it('the raw rotate90 gives -0, and toEqual tells it from 0', () => {
    const [c] = rotate90([[0, 0]]);
    expect(Object.is(c[1], -0)).toBe(true);
    expect(c[1] === 0).toBe(true);
    expect(() => expect([c]).toEqual([[0, 0]])).toThrow();
    expect(sameCell(c, [0, 0])).toBe(true);
  });

  it('the 12 pieces trigger the case on a rotation with no normalization', () => {
    for (const p of PIECES) {
      expect(rotate90(SHAPES[p]).some(([x, y]) => Object.is(x, -0) || Object.is(y, -0))).toBe(true);
    }
  });

  it('normalize cleans it, so rotateN and reflect never let it out', () => {
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

  it('is the mean of the coordinates of the 12 pieces', () => {
    for (const p of PIECES) {
      const [cx, cy] = centroid(SHAPES[p]);
      expect(cx).toBeCloseTo(CENTROIDES[p][0], 12);
      expect(cy).toBeCloseTo(CENTROIDES[p][1], 12);
    }
  });

  it('is the center of MASS and not that of the bounding box: in L they are in different places', () => {
    const cent = centroid(SHAPES.L);
    const caja: [number, number] = [
      (Math.min(...SHAPES.L.map(c => c[0])) + Math.max(...SHAPES.L.map(c => c[0]))) / 2,
      (Math.min(...SHAPES.L.map(c => c[1])) + Math.max(...SHAPES.L.map(c => c[1]))) / 2,
    ];
    expect(cent).not.toEqual(caja);
    expect(distancia(cent, caja)).toBeGreaterThan(0.4);
  });

  it('only I, X and Z have a cell on the centroid, and it is the one at index 2', () => {
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
  it('the cell SOUTH of the centroid gives π/2, not -π/2: the Y axis grows down', () => {
    expect(angleFromCentroid([1, 2], [1, 1])).toBeCloseTo(Math.PI / 2, 12);
  });

  it('goes around the circle clockwise on screen: east 0, south π/2, west π, north 3π/2', () => {
    const cent: [number, number] = [1, 1];
    expect(angleFromCentroid([2, 1], cent)).toBeCloseTo(0, 12);
    expect(angleFromCentroid([1, 2], cent)).toBeCloseTo(Math.PI / 2, 12);
    expect(angleFromCentroid([0, 1], cent)).toBeCloseTo(Math.PI, 12);
    expect(angleFromCentroid([1, 0], cent)).toBeCloseTo(3 * Math.PI / 2, 12);
  });

  it('does not depend on the distance: two cells in the same direction give the same angle', () => {
    expect(angleFromCentroid([1, 2], [1, 1])).toBe(angleFromCentroid([1, 9], [1, 1]));
  });

  it('normalizes to [0, 2π): no angle of the 12 pieces is negative', () => {
    for (const p of PIECES) {
      const cent = centroid(SHAPES[p]);
      for (const celda of SHAPES[p]) {
        const a = angleFromCentroid(celda, cent);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(2 * Math.PI);
      }
    }
  });

  it('the interval stays half-open with a negative angle smaller than the ulp of 2π', () => {
    const a = angleFromCentroid([1, 0], [0, 1e-17]);
    expect(a).toBeLessThan(2 * Math.PI);

    expect(a).toBeGreaterThan(Math.PI);
  });
});

const manhattan = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

const seTocan = (a: Cell, b: Cell) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1;

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

function caminoPorFuerzaBruta(cells: readonly Cell[], tiebreak: readonly number[]): number[] {
  const todos = permutaciones(cells.map((_, k) => k)).map(orden => {
    const d = distancias(cells, orden);
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

/** A seeded PRNG (mulberry32): the random shapes must be reproducible. */
function conSemilla(seed: number) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const porIndice = (cells: readonly Cell[]) => cells.map((_, k) => k);
const alReves = (cells: readonly Cell[]) => cells.map((_, k) => cells.length - 1 - k);

describe('pathThroughCells', () => {
  it('AC-MUS-019 — agrees with the brute force on the 12 pieces', () => {
    for (const p of PIECES) {
      for (const desempate of [porIndice, alReves]) {
        const rank = desempate(SHAPES[p]);
        expect(pathThroughCells(SHAPES[p], rank)).toEqual(caminoPorFuerzaBruta(SHAPES[p], rank));
      }
    }
  });

  it('agrees with the brute force on 200 arbitrary shapes, disconnected ones included', () => {
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

  it('returns a permutation of 0..n-1', () => {
    for (const p of PIECES) {
      const orden = pathThroughCells(SHAPES[p], porIndice(SHAPES[p]));
      expect([...orden].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('the walk covers the 12 pieces whole: no move passes over a cell', () => {
    for (const p of PIECES) {
      const orden = pathThroughCells(SHAPES[p], porIndice(SHAPES[p]));
      for (let i = 1; i < orden.length; i++) {
        expect(seTocan(SHAPES[p][orden[i - 1]], SHAPES[p][orden[i]]), p).toBe(true);
      }
    }
  });

  it('AC-MUS-018 — the diagonal is tolerated but not preferred: only four pieces use it', () => {
    const diagonalesEsperadas: Record<string, number> = {
      F: 1, I: 0, L: 0, N: 0, P: 0, T: 1, U: 0, V: 0, W: 0, X: 2, Y: 1, Z: 0,
    };
    for (const p of PIECES) {
      const d = distancias(SHAPES[p], pathThroughCells(SHAPES[p], porIndice(SHAPES[p])));
      expect(d.filter(x => x > 1), p).toHaveLength(diagonalesEsperadas[p]);
    }
  });

  it('AC-MUS-019 — the criterion of the long move first still decides: the Y', () => {
    const d = distancias(SHAPES.Y, pathThroughCells(SHAPES.Y, porIndice(SHAPES.Y)));
    expect(d).toEqual([2, 1, 1, 1]);
  });

  it('the tie-break decides, and always decides the same', () => {
    for (const p of ['Y', 'X'] as PieceKey[]) {
      const rank = porIndice(SHAPES[p]);
      const primero = pathThroughCells(SHAPES[p], rank);
      for (let i = 0; i < 5; i++) expect(pathThroughCells(SHAPES[p], rank)).toEqual(primero);
    }

    expect(pathThroughCells(SHAPES.I, porIndice(SHAPES.I))).toEqual([0, 1, 2, 3, 4]);
    expect(pathThroughCells(SHAPES.I, alReves(SHAPES.I))).toEqual([4, 3, 2, 1, 0]);
  });

  it('edge cases: 0, 1 and 2 cells', () => {
    expect(pathThroughCells([], [])).toEqual([]);
    expect(pathThroughCells([[3, 4]], [0])).toEqual([0]);
    expect(pathThroughCells([[0, 0], [5, 5]], [0, 1])).toEqual([0, 1]);
    expect(pathThroughCells([[0, 0], [5, 5]], [1, 0])).toEqual([1, 0]);
  });
});
