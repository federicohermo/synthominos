import { describe, it, expect } from 'vitest';
import { cellsAt, isValid, occupantAt, GRID_DEFAULT } from '../../board-editing/placement.ts';
import { routeBetween, rutador, costuraDe, CROSS_COST } from '../routing.ts';
import { rotateN, reflect } from '../../pieces/transform.ts';
import { SHAPES, ANCHOR_INDEX } from '../../pieces/pieces.ts';
import type { Cell } from '../../pieces/transform.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../../board-editing/placement.ts';

const { w: GRID_W, h: GRID_H } = GRID_DEFAULT;
const SEAM = costuraDe(GRID_DEFAULT);

const PIECES = Object.keys(SHAPES) as PieceKey[];

const TODAS: Cell[] = [];
for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) TODAS.push([x, y]);

const [COSTURA_INICIO, COSTURA_FIN] = SEAM;
const misma = (p: Cell, q: Cell): boolean => p[0] === q[0] && p[1] === q[1];
const manhattan = (p: Cell, q: Cell): number => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

const adyacentes = (p: Cell, q: Cell): boolean =>
  manhattan(p, q) === 1
  || (misma(p, COSTURA_INICIO) && misma(q, COSTURA_FIN))
  || (misma(p, COSTURA_FIN) && misma(q, COSTURA_INICIO));

const VECINAS = new Map<string, Cell[]>(
  TODAS.map((c) => [c.join(','), TODAS.filter((v) => adyacentes(c, v))]),
);

const PASOS: number[][] = TODAS.map((a) => TODAS.map((b) => routeBetween(a, b, [], GRID_DEFAULT).steps));

const distancia009 = (a: Cell, b: Cell): number => Math.min(
  manhattan(a, b),
  manhattan(a, COSTURA_FIN) + 1 + manhattan(COSTURA_INICIO, b),
  manhattan(a, COSTURA_INICIO) + 1 + manhattan(COSTURA_FIN, b),
);

const colocar = (id: string, piece: PieceKey, rot: number, mirror: boolean, x: number, y: number): PlacedPiece => {
  const base = rotateN(SHAPES[piece], rot);
  const shape = mirror ? reflect(base) : base;
  return { id, piece, rotation: rot, mirror, cells: cellsAt(shape, ANCHOR_INDEX[piece], x, y), muted: false };
};

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

const menorLex = (p: readonly Cell[], q: readonly Cell[]): boolean => {
  for (let i = 0; i < Math.min(p.length, q.length); i++) {
    if (p[i][0] !== q[i][0]) return p[i][0] < q[i][0];
    if (p[i][1] !== q[i][1]) return p[i][1] < q[i][1];
  }
  return p.length < q.length;
};

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

const azar = (semilla: number): (() => number) => {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

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
    expect(routeBetween([0, 0], [GRID_W - 1, GRID_H - 1], [], GRID_DEFAULT)).toEqual({ path: [], steps: 1, cost: 0, crossed: [] });
    expect(routeBetween([GRID_W - 1, GRID_H - 1], [0, 0], [], GRID_DEFAULT)).toEqual({ path: [], steps: 1, cost: 0, crossed: [] });
  });

  it('AC-CIR-001 — the longest distance of the board is 12, not 14', () => {
    expect(Math.max(...PASOS.flat())).toBe(12);
  });

  it('with no pieces the moves are EXACTLY the distance in closed form, on the 3540 pairs', () => {
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
    const fallas: string[] = [];
    for (let i = 0; i < TODAS.length; i++) for (let j = 0; j < TODAS.length; j++) {
      if (PASOS[i][j] !== PASOS[j][i]) fallas.push(`${TODAS[i]} / ${TODAS[j]}`);
    }
    expect(fallas).toEqual([]);
  });

  it('it meets the triangle inequality on the 3600 combinations', () => {
    const fallas: string[] = [];
    for (let i = 0; i < TODAS.length; i++) for (let j = 0; j < TODAS.length; j++) {
      for (let k = 0; k < TODAS.length; k++) {
        if (PASOS[i][j] > PASOS[i][k] + PASOS[k][j]) fallas.push(`${TODAS[i]} -> ${TODAS[k]} -> ${TODAS[j]}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('AC-CIR-003 — the route has exactly one intermediate cell fewer than its moves', () => {
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
    expect(routeBetween([0, 0], [3, 2], [], GRID_DEFAULT).path).toEqual([[0, 1], [0, 2], [1, 2], [2, 2]]);
  });

  it('the edge of the seam: the origin IS the corner', () => {
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
    const porLaCostura = routeBetween([8, 5], [1, 0], [], GRID_DEFAULT);
    expect(porLaCostura.steps).toBe(3);
    expect(porLaCostura.path).toEqual([[GRID_W - 1, GRID_H - 1], [0, 0]]);
    expect(routeBetween([GRID_W - 1, 0], [0, 4], [], GRID_DEFAULT).steps).toBe(10);
    const central = routeBetween([4, 2], [6, 3], [], GRID_DEFAULT);
    expect(central.steps).toBe(3);
    expect(central.path.some((c) => misma(c, COSTURA_FIN) || misma(c, COSTURA_INICIO))).toBe(false);
  });
});

const TESTIGO_P = colocar('P', 'P', 1, false, 3, 2);
const TESTIGO_Y = colocar('Y', 'Y', 1, false, 7, 2);
const TESTIGO = [TESTIGO_P, TESTIGO_Y];

describe('the witness case: the leg goes around the piece that sounds next', () => {
  it('the two pieces fall on the cells that the contract gives', () => {
    expect(TESTIGO_P.cells).toEqual([[3, 3], [4, 3], [3, 2], [4, 2], [3, 1]]);
    expect(TESTIGO_Y.cells).toEqual([[7, 4], [7, 3], [7, 2], [7, 1], [8, 2]]);
    expect(isValid(TESTIGO_Y.cells, [TESTIGO_P], GRID_DEFAULT)).toBe(true);
  });

  it('AC-CIR-004 — the leg from the P to the Y does not enter [7,1]', () => {
    // [3,1] is the exit gate of the `P` and [8,2] the entry gate of the `Y`.
    const r = routeBetween([3, 1], [8, 2], TESTIGO, GRID_DEFAULT);
    expect(r.path).toEqual([[3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [8, 1]]);
    expect(r.steps).toBe(8);
    expect(r.cost).toBe(7);
    expect(r.crossed).toEqual([]);
    expect(r.path.some((c) => misma(c, [7, 1]))).toBe(false);
  });

  it('AC-CIR-004 — ...and to avoid it COSTS two intervals, the price that CROSS_COST sets', () => {
    expect(routeBetween([3, 1], [8, 2], [], GRID_DEFAULT).steps).toBe(6);
    expect(routeBetween([3, 1], [8, 2], TESTIGO, GRID_DEFAULT).steps).toBe(8);

    const minimos = caminosDeLargo([3, 1], [8, 2], 6);
    expect(minimos.length).toBeGreaterThan(0);
    const librePorCamino = minimos.map((c) => c.filter((k) => occupantAt(TESTIGO, k[0], k[1]) !== null).length);
    expect(Math.min(...librePorCamino)).toBeGreaterThan(0);

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

const TABLEROS: { nombre: string; board: PlacedPiece[] }[] = [
  { nombre: 'empty', board: [] },
  { nombre: 'witness', board: TESTIGO },
  ...[1, 2, 3, 4, 5, 6].map((s) => ({ nombre: `random-${s}`, board: tableroAlAzar(azar(s), 8) })),
];

describe('no avoidable crossing, checked against a reference implementation', () => {
  it('the sample boards have real pieces', () => {
    for (const { nombre, board } of TABLEROS.slice(1)) {
      expect(board.length, nombre).toBeGreaterThanOrEqual(2);
      expect(board.every((p, i) => isValid(p.cells, board.slice(0, i), GRID_DEFAULT)), nombre).toBe(true);
    }
  });

  it('AC-CIR-005 — the cost, the moves and the route equal those of the reference', () => {
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
    for (const { board } of TABLEROS) {
      for (const [a, b] of [[[0, 0], [7, 4]], [[3, 1], [8, 2]], [[9, 5], [2, 2]]] as [Cell, Cell][]) {
        expect(routeBetween(a, b, board, GRID_DEFAULT)).toEqual(routeBetween(a, b, board, GRID_DEFAULT));
        expect(routeBetween(a, b, [...board], GRID_DEFAULT)).toEqual(routeBetween(a, b, board, GRID_DEFAULT));
      }
    }
  });

  it('AC-CIR-007 — with the tie EXERCISED, the lexicographically smallest of all routes wins, not of the ones tried', () => {
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
    for (const dims of [GRID_DEFAULT, { w: 5, h: 5 }, { w: 26, h: 15 }, { w: 64, h: 7 }]) {
      expect(costuraDe(dims), `${dims.w}x${dims.h}`).toEqual([[0, 0], [dims.w - 1, dims.h - 1]]);
    }
  });

  it('AC-CIR-002 — the cell of the seam is a neighbour of the other end, and only that cell', () => {
    const dims = { w: 26, h: 15 };
    const [inicio, fin] = costuraDe(dims);
    expect(routeBetween(inicio, fin, [], dims).steps).toBe(1);
    expect(routeBetween(inicio, [dims.w - 2, dims.h - 1], [], dims).steps).toBe(2);
  });
});

describe('the cache of distances changes no route', () => {
  it('a shared route finder answers the same as a new one for each query', () => {
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
