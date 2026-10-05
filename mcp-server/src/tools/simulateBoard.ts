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

/**
 * What a board sounds like, without hearing it.
 *
 * It goes through the same three stages as the app, **with the same functions**: place
 * (`cellsAt`/`isValid`), build the sequence of the circuit (`buildSequence`) and run the
 * real scheduler. None of that is written again here: the circuit, the legs and the
 * offsets come from the domain, and the server only composes and formats.
 *
 * The loop of windows is deliberate. An idealized formula would answer what the
 * scheduler *should* do. This loop answers what it **does**, the cut of
 * `scheduledUntil` included.
 */

/** Rounding to group and to report: the event times come from floating point arithmetic. */
const round4 = (t: number): number => Math.round(t * 1e4) / 1e4;

/** Where the circuit enters a piece and where it leaves. */
interface Gates {
  entry: Cell;
  exit: Cell;
}

/** A cell of the route that is occupied, with the note that sounds when the route enters it. */
interface Cruce {
  cell: Cell;
  note: string;
}

const placementSchema = z.object({
  piece: z.enum(PIECE_KEYS),
  rotation: z.number().int().min(0).max(3).default(0),
  mirror: z.boolean().default(false),
  // A muted piece keeps its place and its time in the circuit but does not sound its
  // notes: five clicks go where its arpeggio was. The tool accepts it so that it can
  // answer "what changes if I mute this one" with no derivation by hand. The default is
  // `false` because that is the usual board.
  muted: z.boolean().default(false),
  at: z.tuple([z.number().int(), z.number().int()])
    .describe(`Cell [x, y] where the GRIP CELL lands, not the corner. The board is ${GRID_DEFAULT.w}x${GRID_DEFAULT.h} unless \`dims\` is given, and y grows down.`),
});

const inputSchema = z.object({
  pieces: z.array(placementSchema).min(1).max(MAX_PIEZAS)
    .describe('The pieces, in the order of placement: each one collides with the valid ones before it.'),
  // The board is not a fixed 10x6: in the app the viewport decides it, and a caller must
  // be able to ask about the same board that is on the screen. The default is the
  // reference board, so a query with no `dims` answers for that board.
  //
  // The piece limit does NOT come from the area, so `pieces` uses `MAX_PIEZAS` and not
  // `GRID_W * GRID_H / CELLS_PER_PIECE`. On the 10x6 board the two numbers agree, 60 ÷ 5,
  // and on any other board they do not: the limit that rules is that of the circuit,
  // which is exponential in the piece count.
  dims: z.object({
    w: z.number().int().min(GRID_MIN.w).max(64),
    h: z.number().int().min(GRID_MIN.h).max(64),
  }).default(GRID_DEFAULT)
    .describe(`The size of the board, in cells. The default is ${GRID_DEFAULT.w}x${GRID_DEFAULT.h}, the reference board.`),
  bpm: z.number().min(40).max(240).default(DEFAULT_BPM),
  // The limit counts cycles, not bars. A limit in bars would make the cost of the loop of
  // windows depend on the tempo and on the board at the same time. With cycles, the board
  // bounds the worst case: 10 pieces give a cycle of 8.98 s at 110 bpm, so ~36 s of
  // simulation with 4.
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
 * The note name of a frequency, or the rounded frequency if the map does not know it.
 *
 * The map is built from the notes of each `Step`, and today EVERY `Hit` with a pitch
 * comes from there. That includes the crossing, whose pitch is that of a cell of a piece
 * that does have its `Step`. So the tool cannot reach the second half. It is a function
 * of its own and not a `??` inside the `map` for that reason: what to do with an unknown
 * `hz` is a decision, to say it in Hz and not show `undefined`. A decision that nobody
 * can exercise is one that nobody can review. Here it has a name, a doc and a test that
 * exercises it.
 *
 * The lookup hits only with EXACT float equality. That holds because the key is computed
 * with the same `midiToHz` on the same input that the scheduler used. If it ever stops
 * holding, the symptom is this fallback and not a `NaN`.
 */
export function nombreDeHz(nameByHz: ReadonlyMap<number, string>, hz: number): string {
  return nameByHz.get(hz) ?? `${Math.round(hz)}Hz`;
}

/** One resolved placement: what the answer reports for each entry of `pieces`. */
interface Resolved {
  id: string;
  cells: Cell[];
  valid: boolean;
  /** Non-null exactly when the placement is valid: a piece that is not on the board has no gates. */
  gates: Gates | null;
  reason: string | null;
}

/**
 * The two gates of a piece, with the names of the answer.
 *
 * It only renames. `gates` of the domain decides which cell is which, **the same**
 * function that `buildSequence` uses to build the circuit. A local copy would be three
 * lines that could disagree with the circuit that the tool says it explains. The repo
 * rule asks for an export in `src/`, not for the copy.
 */
function gatesOf(p: PlacedPiece): Gates {
  const { entrada, salida } = gates(p);
  return { entry: entrada, exit: salida };
}

/**
 * The crossings of a leg: the cells that the route enters and that are occupied, with
 * the note that sounds there.
 *
 * **It reads `Click.note` and does NOT derive the note from the cell again**, although
 * the domain exports the two pure functions for it (`occupantAt` and `noteAtCell`). The
 * `Click` already has the pitch that `buildSequence` gave it. To derive it again here
 * would be two places that compute the same thing with nothing that makes them agree.
 * That is exactly what the tool exists to rule out: its only value is to report what
 * the app will sound, not a second opinion about it.
 *
 * Empty when the leg enters no piece, never absent: the answer always has the field, so
 * that a reader does not confuse a board with no crossings with a board with no report.
 */
function crucesDe(tramo: readonly { cell: Cell; note?: number }[]): Cruce[] {
  return tramo.flatMap((c): Cruce[] => c.note === undefined ? [] : [{ cell: c.cell, note: midiName(c.note) }]);
}

/**
 * Stage 1: placement, with the board rules of `board-editing/placement.ts`.
 *
 * The reason for a rejection comes from the same functions and not from a copy of their
 * conditions. `isValid(cells, [])` answers only for the edges, because the empty board
 * cannot collide with anything. `occupantAt` says WHICH piece the collision was with.
 *
 * It also returns each valid `PlacedPiece` because they are the exact input of
 * `buildSequence`: to rebuild them outside from `Resolved` would build the same thing
 * twice.
 */
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

    // Only a valid piece becomes an obstacle, as in the app: a rejected placement
    // leaves nothing on the board.
    let gates: Gates | null = null;
    if (valid) {
      // No `notes`: the piece does not store its arpeggio. `buildSequence` derives it
      // with the same `arpeggioFor` that the app uses. To compose it here by hand would
      // be one more copy of that derivation, and the derivation has one owner.
      const p: PlacedPiece = { id, piece: e.piece, rotation: e.rotation, mirror: e.mirror, cells, muted: e.muted };
      placed.push(p);
      gates = gatesOf(p);
    }
    resolved.push({ id, cells, valid, gates, reason });
  });

  return { resolved, placed };
}

/**
 * Stage 3: the timeline, from the scheduler run in windows of `TICK_MS`.
 *
 * It starts the clock as `startClock` does: the origin is `CLOCK_START_DELAY` ahead and
 * `scheduledUntil` is strictly before it, which prevents the loss of the event at
 * offset 0. The times are reported on the same scale, with instant 0 at the start of
 * the clock.
 *
 * **One sequence and one origin**, so there is one cut and no grouping by event time:
 * the limit is the end of the last requested cycle.
 *
 * The cut `at < end` needs no tolerance. Nothing crosses the edge of the cycle: the
 * notes of a piece take `o..o+4`, its clicks go on to `o+4+(d-1)` and the next piece
 * starts at `o+4+d`. So the last event of a cycle falls on interval `length - 1`, and a
 * whole interval of margin is left against the floating point error.
 *
 * The `sort` is not cosmetic: `collectHits` emits all the steps first and then all the
 * clicks, each over the whole window, so the output is ordered by step and not by time.
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

    // Stage 2: the sequence of the circuit, the same one the app builds. An invalid
    // piece is not in `placed`, so it does not enter the circuit.
    const seq = buildSequence(placed, regimen, dims);
    // The circuit and not the steps: a MUTED piece visits its place and emits no `Step`.
    // A count of steps would report a circuit with nodes missing and would merge two
    // legs into one.
    const n = seq.order.length;

    // The projection to the `Sequence` of the ENGINE, which has no `pieceId` and no
    // `cell`: the engine speaks MIDI and does not know `Cell`, so the two shapes are
    // different on purpose. `App.tsx` makes this same projection by itself, and the
    // duplication is accepted: this tool exists to reproduce what the app does WITH THE
    // SAME functions, and a shared helper would break exactly that property.
    const engine: Sequence = {
      steps: seq.steps.map(({ offset, notes }) => ({ offset, notes })),
      // `note` travels and `cell` does not: it is the same projection that `App.tsx`
      // makes. To drop `note` still typechecks, because `note` is optional, and the tool
      // would report the crossings as silent clicks, different from what the app sounds.
      // That is exactly the property this tool exists to hold.
      //
      // The ternary and not `({ offset, note })`: with the short form the silent click
      // has the key `note` PRESENT and `undefined`, the intermediate state that the
      // docblock of `Click` rejects. Absence means "empty cell", and a present field with
      // the value undefined is a third state that waits for someone to read it with `in`
      // or with `Object.keys`.
      clicks: seq.clicks.map((c) => c.note === undefined ? { offset: c.offset } : { offset: c.offset, note: c.note }),
      length: seq.length,
    };

    // Note name by frequency, built with the SAME `midiToHz` that the scheduler used: the
    // exact float equality holds because it is the same function on the same input. It
    // avoids an inversion of the formula by hand.
    const nameByHz = new Map<number, string>();
    for (const s of seq.steps) for (const m of s.notes) nameByHz.set(midiToHz(m), midiName(m));

    // An object and not a `Map`: `Map.get` returns `| undefined` although the key is
    // always there, and to cover that would need a `!` or a `??` that lies about the case.
    const puertas: Record<string, Gates> = {};
    for (const r of resolved) if (r.gates !== null) puertas[r.id] = r.gates;

    // The legs, read from the SAME sequence that will sound. `distance` comes from a
    // count of the clicks of the leg and not from a second measure of the distance: so
    // the reported route and the instant of the next note cannot disagree. The leg from
    // the last piece to the first uses the same rule as the others. Its edge is
    // `seq.length`, which is offset 0 of the next cycle, and that is why the join has no
    // mark.
    // With ONE piece there are no legs, so the guard is explicit: a leg exists BETWEEN
    // pieces, and the domain already says so with `clicks: []`. Without the guard the
    // `map` makes a leg from the piece to itself and reports
    // `distance: path.length + 1`, which with no clicks is ALWAYS 1. That 1 contradicts
    // the two cells that the answer prints next to it. Measured on the empty board:
    // with the `Z` alone `routeBetween(exit, entry, []).steps` is 3, and with the `F` it
    // is 2. The measure is `.steps`, not `.cost`. `cycle` says that the cycle still
    // lasts: the 5 intervals of the arpeggio, not a leg.
    const hops = n === 1 ? [] : seq.order.map((step, t) => {
      const ultima = step.offset + CELLS_PER_PIECE - 1;
      const siguiente = t + 1 < n ? seq.order[t + 1].offset : seq.length;
      const to = seq.order[(t + 1) % n].pieceId;
      // The whole clicks of the leg and not only their cells: `path` and `crossed` are
      // two reads of THIS list, so they cannot disagree.
      const tramo = seq.clicks.filter(c => c.offset > ultima && c.offset < siguiente);
      return {
        from: step.pieceId,
        to,
        exit: puertas[step.pieceId].exit,
        entry: puertas[to].entry,
        distance: tramo.length + 1,
        path: tramo.map(c => c.cell),
        // The crossings of THIS leg: the subset of `path` that falls on a piece, each
        // with the note that sounds there.
        crossed: crucesDe(tramo),
      };
    });

    const hits = timeline(engine, bpm, cycles);
    const instantes = new Set(hits.map(h => round4(h.at)));

    return json({
      bpm,
      // The regime travels IN THE ANSWER, not only in the input: in 36 of the 48
      // combinations of piece x rotation the same piece has two arpeggios, so a
      // `timeline` with notes and no regime is ambiguous. The circuit does NOT depend on
      // it: the legs, the gates and the offsets are equal in the two. It moves only the
      // pitches.
      regimen,
      barSeconds: round4(barDuration(bpm)),
      // The gap between consecutive events of the circuit, which comes from the bar:
      // without this number a reader must compute `bar / 16` by hand to read the
      // `timeline`.
      intervalSeconds: round4(intervalDuration(bpm)),
      cycles,
      // The cycle in the two units: the board sets it in INTERVALS and the tempo only
      // stretches it. Two different boards give different cycles at the same bpm.
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
        // The gates say how the piece enters the circuit: the cell that receives the
        // circuit and the cell that it leaves from. The column of the grip cell says
        // nothing about when the piece sounds.
        ...(r.gates !== null ? { gates: r.gates } : { reason: r.reason }),
      })),
      // The order of the CIRCUIT, which includes the muted pieces: they are still nodes
      // of the circuit although they do not sound.
      route: { order: seq.order.map(o => o.pieceId), hops },
      // Two events of the circuit cannot coincide BY CONSTRUCTION: the notes of a piece
      // take `o..o+4`, its clicks `o+5..o+4+(d-1)` and the next note `o+4+d`. Verified
      // on 3000 random boards with no failure. So a count of the events at one instant
      // is always 1, and a field that always returns the same number gives no
      // information.
      //
      // `distinctInstants` is an ASSERTION and not a descriptor: it must equal `total`,
      // and the two must equal `cycles * cycle.intervals`, because the circuit takes all
      // its intervals with no gap. If they differ, an event was emitted twice or two
      // events collided.
      onsets: {
        notes: hits.filter(h => h.kind === HIT.note).length,
        clicks: hits.filter(h => h.kind === HIT.click).length,
        crosses: hits.filter(h => h.kind === HIT.cross).length,
        total: hits.length,
        distinctInstants: instantes.size,
      },
      // Flat and not grouped by instant: with no coincidences, a group would wrap each
      // event in an array of one. `kind` is the discriminant of the `Hit` of the engine
      // as it comes, not a label translated here.
      //
      // The TWO branches with a pitch have a note, and the discriminant is read from the
      // `Hit`, not from the presence of `hz`. The crossing has a pitch like the note: it
      // differs because it is shorter and softer, not because it sounds different. The
      // only silent one is `HIT.click`. Its cells are in `route.hops`.
      timeline: hits.map(h => h.kind === HIT.click
        ? { at: round4(h.at), kind: h.kind }
        : { at: round4(h.at), kind: h.kind, note: nombreDeHz(nameByHz, h.hz) }),
    });
  },
});
