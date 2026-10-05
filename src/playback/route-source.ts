import type { Sequence } from '../circuit/sequence.ts';
import type { PlacedPiece } from '../board-editing/placement.ts';
import type { Cell } from '../pieces/transform.ts';
import { cellsByPlayOrder } from '../circuit/sequence.ts';
import { cycleGeneration } from './engine.ts';

export type MarcaKind = (typeof MARCA)[keyof typeof MARCA];

export interface Marca {
  cell: Cell;
  kind: MarcaKind;
}

export interface CeldaPorEstrenar {
  /** With the id, a new piece on the cell of a removed one starts veiled. */
  id: string;
  cell: Cell;
  /** `null`: the piece is queued, and it waits for the cycle boundary. */
  offset: number | null;
}

export const MARCA = { nota: 'nota', cruce: 'cruce', click: 'click' } as const;

interface CeldaDePieza {
  cell: Cell;
  offset: number;
}

interface Ruta {
  marcas: (Marca | null)[];
  ids: string[];
  porPieza: Map<string, CeldaDePieza[]>;
}

const RUTA_VACIA: Ruta = { marcas: [], ids: [], porPieza: new Map() };

let activa: Ruta = RUTA_VACIA;
let pendiente: Ruta | null = null;

let generacion = 0;

let estrenando: string[] = [];

let veloActual: CeldaPorEstrenar[] = [];

export function encolar(s: Sequence, placed: readonly PlacedPiece[]): void {
  pendiente = construir(s, placed);
  recomputarVelo();
}

/** `generacion` does not return to zero: the next frame would swap outside the cycle boundary. */
export function reiniciar(): void {
  activa = RUTA_VACIA;
  pendiente = null;
  estrenando = [];
  generacion = cycleGeneration();
  recomputarVelo();
}

export function rutaActiva(): readonly (Marca | null)[] {
  const g = cycleGeneration();
  if (g === generacion) return activa.marcas;

  // The generation syncs with nothing queued too: if it stays behind, the next `encolar`
  // swaps in the next frame and not at its boundary.
  generacion = g;
  if (pendiente === null) return activa.marcas;

  const sonaban = new Set(activa.ids);
  estrenando = pendiente.ids.filter((id) => !sonaban.has(id));

  activa = pendiente;
  pendiente = null;
  recomputarVelo();
  return activa.marcas;
}

/** The identity of the array is the change signal for the draw loop. */
export function velo(): readonly CeldaPorEstrenar[] {
  return veloActual;
}

function recomputarVelo(): void {
  const out: CeldaPorEstrenar[] = [];

  for (const id of estrenando) {
    for (const c of activa.porPieza.get(id) ?? []) out.push({ id, cell: c.cell, offset: c.offset });
  }

  if (pendiente !== null) {
    const sonando = new Set(activa.ids);
    for (const id of pendiente.ids) {
      if (sonando.has(id)) continue;
      for (const c of pendiente.porPieza.get(id) ?? []) out.push({ id, cell: c.cell, offset: null });
    }
  }

  veloActual = out;
}

/** The table is frozen here: `placed` is the current board, not the one that sounds. */
function construir(s: Sequence, placed: readonly PlacedPiece[]): Ruta {
  const marcas: (Marca | null)[] = new Array<Marca | null>(Math.max(0, s.length)).fill(null);
  const porPieza = new Map<string, CeldaDePieza[]>();
  const porId = new Map(placed.map((p) => [p.id, p]));

  for (const step of s.steps) {
    const pieza = porId.get(step.pieceId);
    if (!pieza) continue;
    const celdas = cellsByPlayOrder(pieza);
    const deLaPieza: CeldaDePieza[] = [];
    for (let j = 0; j < celdas.length; j++) {
      marcas[step.offset + j] = { cell: celdas[j], kind: MARCA.nota };
      deLaPieza.push({ cell: celdas[j], offset: step.offset + j });
    }
    porPieza.set(step.pieceId, deLaPieza);
  }

  for (const c of s.clicks) {
    marcas[c.offset] = { cell: c.cell, kind: c.note !== undefined ? MARCA.cruce : MARCA.click };
  }

  // `s.steps` and not `s.order`: a muted piece never sounds, so it gets no veil.
  return { marcas, ids: s.steps.map((st) => st.pieceId), porPieza };
}
