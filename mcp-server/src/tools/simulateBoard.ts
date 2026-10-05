import { z } from 'zod';
import { defineTool, json } from './types.ts';
import { PIECE_KEYS } from '../pieces.ts';
import { rotateN, reflect } from '../../../src/pieces/transform.ts';
import {
  cellsAt,
  isValid,
  occupantAt,
  GRID_DEFAULT,
  GRID_MIN,
  MAX_PIEZAS,
} from '../../../src/board-editing/placement.ts';
import { midiName, REGIMEN, DEFAULT_REGIMEN } from '../../../src/musical-model/music.ts';
import { buildSequence, gates } from '../../../src/circuit/sequence.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from '../../../src/pieces/pieces.ts';
import type { Cell } from '../../../src/pieces/transform.ts';
import type { PlacedPiece, Dims } from '../../../src/board-editing/placement.ts';
import {
  collectHits,
  barDuration,
  intervalDuration,
  LOOKAHEAD,
  TICK_MS,
  HIT,
  CLOCK_START_DELAY,
  DEFAULT_BPM,
} from '../../../src/playback/scheduler.ts';
import { midiToHz } from '../../../src/playback/voice.ts';
import type { Sequence, ClockState, Hit } from '../../../src/playback/scheduler.ts';

const round4 = (t: number): number => Math.round(t * 1e4) / 1e4;

interface Gates {
  entry: Cell;
  exit: Cell;
}

interface Cruce {
  cell: Cell;
  note: string;
}

const placementSchema = z.object({
  piece: z.enum(PIECE_KEYS),
  rotation: z.number().int().min(0).max(3).default(0),
  mirror: z.boolean().default(false),
  muted: z.boolean().default(false),
  at: z.tuple([z.number().int(), z.number().int()])
    .describe(`Cell [x, y] where the GRIP CELL lands, not the corner. The board is ${GRID_DEFAULT.w}x${GRID_DEFAULT.h} unless \`dims\` is given, and y grows down.`),
});

const inputSchema = z.object({
  pieces: z.array(placementSchema).min(1).max(MAX_PIEZAS)
    .describe('The pieces, in the order of placement: each one collides with the valid ones before it.'),
  // The piece limit is `MAX_PIEZAS`, not the area ÷ 5: the circuit sets it, and its cost is
  // exponential in the piece count.
  dims: z.object({
    w: z.number().int().min(GRID_MIN.w).max(64),
    h: z.number().int().min(GRID_MIN.h).max(64),
  }).default(GRID_DEFAULT)
    .describe(`The size of the board, in cells. The default is ${GRID_DEFAULT.w}x${GRID_DEFAULT.h}, the reference board.`),
  bpm: z.number().min(40).max(240).default(DEFAULT_BPM),
  // Cycles, not bars: the board bounds the cost of the loop, at any tempo.
  cycles: z.number().int().min(1).max(4).default(2)
    .describe('How many laps of the circuit to simulate. The board sets the cycle, not the tempo.'),
  regimen: z.enum([REGIMEN.escala, REGIMEN.orden]).default(DEFAULT_REGIMEN)
    .describe(
      'What the rotation changes. `escala` (the scale regime): the rotation selects one of four formulas, so ' +
      'WHICH NOTES each piece sounds. `orden` (the order regime): always the major pentatonic, shifted `rotation` positions, ' +
      'so WHERE its arpeggio STARTS. It governs the notes of each piece and the pitch of the crossings, ' +
      'and it does not touch the circuit, the gates or the offsets: a change of regime does not reorder the board.',
    ),
});

/**
 * The lookup needs exact float equality: the key comes from the same `midiToHz`, on the same
 * input, as the scheduler.
 */
export function nombreDeHz(nameByHz: ReadonlyMap<number, string>, hz: number): string {
  return nameByHz.get(hz) ?? `${Math.round(hz)}Hz`;
}

interface Resolved {
  id: string;
  cells: Cell[];
  valid: boolean;
  gates: Gates | null;
  reason: string | null;
}

function gatesOf(p: PlacedPiece): Gates {
  const { entrada, salida } = gates(p);
  return { entry: entrada, exit: salida };
}

function crucesDe(tramo: readonly { cell: Cell; note?: number }[]): Cruce[] {
  return tramo.flatMap((c): Cruce[] => c.note === undefined ? [] : [{ cell: c.cell, note: midiName(c.note) }]);
}

function resolve(entries: z.output<typeof inputSchema>['pieces'], dims: Dims): { resolved: Resolved[]; placed: PlacedPiece[] } {
  const placed: PlacedPiece[] = [];
  const resolved: Resolved[] = [];

  entries.forEach((e, i) => {
    const rotated = rotateN(SHAPES[e.piece], e.rotation);
    const shape = e.mirror ? reflect(rotated) : rotated;
    const cells = cellsAt(shape, ANCHOR_INDEX[e.piece], e.at[0], e.at[1]);

    const id = String(i + 1);
    const valid = isValid(cells, placed, dims);
    let reason: string | null = null;
    if (!valid) {
      if (!isValid(cells, [], dims)) {
        reason = 'off-the-board';
      } else {
        const choque = cells.map(([x, y]) => occupantAt(placed, x, y)).find(p => p !== null);
        reason = `collides-with-${choque?.id}`;
      }
    }

    let gates: Gates | null = null;
    if (valid) {
      const p: PlacedPiece = { id, piece: e.piece, rotation: e.rotation, mirror: e.mirror, cells, muted: e.muted };
      placed.push(p);
      gates = gatesOf(p);
    }
    resolved.push({ id, cells, valid, gates, reason });
  });

  return { resolved, placed };
}

/**
 * `scheduledUntil` starts before the origin, or the event at offset 0 is lost. `collectHits`
 * emits the steps and then the clicks of each window, so the result needs the `sort`.
 */
function timeline(sequence: Sequence, bpm: number, cycles: number): Hit[] {
  const origin = CLOCK_START_DELAY;
  const end = origin + cycles * sequence.length * intervalDuration(bpm);

  const state: ClockState = { origin, scheduledUntil: 0 };
  const hits: Hit[] = [];

  for (let t = 0; t < end; t += TICK_MS / 1000) {
    for (const hit of collectHits(t, LOOKAHEAD, bpm, sequence, state)) {
      if (hit.at < end) hits.push(hit);
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

export const simulateBoard = defineTool({
  name: 'simulate_board',
  title: 'Simulate the board',
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    'What a given board sounds like, without hearing it. Use it in place of a read of the scheduler and a walk of the ' +
    'lookahead by hand: it validates each placement with the same functions as the app, builds the sequence ' +
    'with `buildSequence` and runs the real scheduler in windows of 25 ms.\n' +
    'The board is a CIRCUIT and not a bar: a closed circuit visits the pieces, in the order ' +
    'of the CHEAPEST route between their gates, NOT in the order of placement, and each cell it goes through from ' +
    'one piece to the next sounds as a click. The answer has that order, each leg (`hops`) with the cells ' +
    'it goes through, the cycle in intervals and in seconds, and the timeline with notes and clicks ' +
    'told apart: the route in the answer is what lets you check the circuit without hearing it.\n' +
    'Two measured traps: a move of one piece can reorder the whole music, because it changes the ' +
    'circuit; and the route PREFERS to go around what is in the way but cannot always do it. To cross an ' +
    'occupied cell costs more, and when the route crosses anyway the click falls on that ' +
    'cell with the SAME note that the cell shows. Each leg has those crossings apart (`crossed`), with cell and ' +
    'note, so that you can compare the cost of a crossing without hearing it. In the tiling of 12 pieces, with no ' +
    'empty cell, the cost can avoid nothing, and the 13 clicks all fall on cells with a piece.\n' +
    'The answer also has the `regimen`: the rotation changes the notes ' +
    '(`escala`) or the start of the arpeggio (`orden`), and without it the timeline is ambiguous in ' +
    '36 of the 48 combinations. The circuit does not change with the regime, only the pitches.',
  inputSchema,
  run: ({ pieces, bpm, cycles, regimen, dims }) => {
    const { resolved, placed } = resolve(pieces, dims);

    const seq = buildSequence(placed, regimen, dims);
    // The circuit, not the steps: a muted piece is a node and emits no `Step`.
    const n = seq.order.length;

    const engine: Sequence = {
      steps: seq.steps.map(({ offset, notes }) => ({ offset, notes })),
      // The ternary, not `({ offset, note })`: a silent click must not have the key `note` present
      // and `undefined`.
      clicks: seq.clicks.map((c) => c.note === undefined ? { offset: c.offset } : { offset: c.offset, note: c.note }),
      length: seq.length,
    };

    const nameByHz = new Map<number, string>();
    for (const s of seq.steps) for (const m of s.notes) nameByHz.set(midiToHz(m), midiName(m));

    // An object, not a `Map`: `Map.get` returns `| undefined` for a key that is always there.
    const puertas: Record<string, Gates> = {};
    for (const r of resolved) if (r.gates !== null) puertas[r.id] = r.gates;

    // One piece has no legs. Without the guard, the `map` makes a leg from the piece to itself
    // with `distance` 1.
    const hops = n === 1 ? [] : seq.order.map((step, t) => {
      const ultima = step.offset + CELLS_PER_PIECE - 1;
      const siguiente = t + 1 < n ? seq.order[t + 1].offset : seq.length;
      const to = seq.order[(t + 1) % n].pieceId;
      const tramo = seq.clicks.filter(c => c.offset > ultima && c.offset < siguiente);
      return {
        from: step.pieceId,
        to,
        exit: puertas[step.pieceId].exit,
        entry: puertas[to].entry,
        distance: tramo.length + 1,
        path: tramo.map(c => c.cell),
        crossed: crucesDe(tramo),
      };
    });

    const hits = timeline(engine, bpm, cycles);
    const instantes = new Set(hits.map(h => round4(h.at)));

    return json({
      bpm,
      regimen,
      barSeconds: round4(barDuration(bpm)),
      intervalSeconds: round4(intervalDuration(bpm)),
      cycles,
      cycle: { intervals: seq.length, seconds: round4(seq.length * intervalDuration(bpm)) },
      placements: resolved.map((r, i) => ({
        id: r.id,
        piece: pieces[i].piece,
        rotation: pieces[i].rotation,
        mirror: pieces[i].mirror,
        at: pieces[i].at,
        muted: pieces[i].muted,
        cells: r.cells,
        valid: r.valid,
        ...(r.gates !== null ? { gates: r.gates } : { reason: r.reason }),
      })),
      route: { order: seq.order.map(o => o.pieceId), hops },
      // `distinctInstants` is an assertion: two events of the circuit cannot coincide, so it must
      // equal `total`.
      onsets: {
        notes: hits.filter(h => h.kind === HIT.note).length,
        clicks: hits.filter(h => h.kind === HIT.click).length,
        crosses: hits.filter(h => h.kind === HIT.cross).length,
        total: hits.length,
        distinctInstants: instantes.size,
      },
      timeline: hits.map(h => h.kind === HIT.click
        ? { at: round4(h.at), kind: h.kind }
        : { at: round4(h.at), kind: h.kind, note: nombreDeHz(nameByHz, h.hz) }),
    });
  },
});
