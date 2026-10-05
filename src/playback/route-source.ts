import type { Sequence } from '../circuit/sequence.ts';
import type { PlacedPiece } from '../board-editing/placement.ts';
import type { Cell } from '../pieces/transform.ts';
import { cellsByPlayOrder } from '../circuit/sequence.ts';
import { cycleGeneration } from './engine.ts';

/**
 * The sounding/queued pair of the sequence WITH cells, so that the playhead draws what
 * sounds and not what will sound.
 *
 * The engine has its own pair, but its `Sequence` carries no `pieceId` and no `cell`:
 * the engine speaks MIDI and does not know `Cell`. The only sequence with cells is that
 * of the circuit, and the UI derives it from `placed`, which is the CURRENT board: the
 * queued sequence. Without this module the playhead would follow the queued circuit
 * while the old one sounds, during a wait of up to 7.5 s.
 *
 * It lives outside the engine for that same border: it speaks `Cell`. It is the same
 * step across the border that `proyectarAlMotor` (`playback/engine-bridge.ts`) makes
 * when it projects the sequence for `setSequence`.
 *
 * A module singleton and NOT React state, on purpose: a requestAnimationFrame loop
 * reads it, like `readSpectrum()`. As state it would be one render for each frame, for
 * data that the loop uses and drops.
 *
 * What is kept is not the raw `Sequence` but its TABLE BY OFFSET, built once when the
 * sequence is queued. Two reasons, and neither is style:
 *
 * - `Step` does not carry the cells of its five notes, so to go from an offset to a
 *   cell the sequence must be joined with `placed` through `cellsByPlayOrder`. In the
 *   loop, that would repeat 60 times a second a join that does not change between
 *   frames.
 * - The join must stay FROZEN with the sequence. `placed` is the current board: if the
 *   loop looked at it live, a piece removed during the cycle would go dark before it
 *   stops sounding. The playhead must draw the sounding sequence.
 */

/** The three sounds that the playhead can be on: see `MARCA`. */
export type MarcaKind = (typeof MARCA)[keyof typeof MARCA];

/**
 * What the playhead is on in one interval of the cycle: a cell, and WHICH of the three
 * possible sounds plays there.
 *
 * It is the translation of `Sequence` that the drawing needs and that the circuit has
 * no reason to give: `Step` carries `pieceId`, `offset` and `notes` but NOT the cells
 * of its five notes, and `Click` carries its cell, but apart. To join the two, indexed
 * by offset, is work of the UI and not of the model.
 *
 * Three kinds and not a boolean. "Nothing in this interval" is the absence of the mark.
 * With a mark there are three cases: `routeBetween` can cross an OCCUPIED cell when it
 * is not the turn of that piece, and that crossing sounds a note (`Click.note`) that is
 * neither the own note of a piece nor the click. A boolean does not tell the three
 * apart, hence the const object.
 */
export interface Marca {
  cell: Cell;
  /** A note of a piece, a crossing or a click: the three look different. */
  kind: MarcaKind;
}

/**
 * A cell that has not sounded yet: it is placed but never sounded inside the cycle, so
 * it is drawn veiled until the playhead reaches it for the first time.
 *
 * `offset` is the interval where it loses its veil, or `null` if the piece is not even
 * in the sounding cycle and waits, queued, for the boundary: there is no instant to
 * wait for yet, only the swap.
 *
 * It carries the `id` of the piece and not only the cell because the loss of the veil
 * is remembered: without it, to remove a piece and place another on the same cell would
 * make the new one start with no veil. The ids are monotonic
 * (`String(++idRef.current)` in `App`), so they are never reused.
 */
export interface CeldaPorEstrenar {
  id: string;
  cell: Cell;
  offset: number | null;
}

/**
 * The three sounds that the playhead can be on in one interval of the cycle: the own
 * note of a piece, the crossing or the click.
 *
 * The crossing is over an occupied cell when it is not its turn, and the click over an
 * empty cell. A const object and not a boolean because the set has THREE values and not
 * two, and `erasableSyntaxOnly` refuses `enum` (see `Marca` for the reason).
 */
export const MARCA = { nota: 'nota', cruce: 'cruce', click: 'click' } as const;

/** A cell of a piece inside the cycle: where it is and in which interval it sounds. */
interface CeldaDePieza {
  cell: Cell;
  offset: number;
}

/** A sequence ready to draw: the cell of each offset, and the pieces that sound in it. */
interface Ruta {
  marcas: (Marca | null)[];
  ids: string[];
  /** The five cells of each piece, with the interval where each one sounds. */
  porPieza: Map<string, CeldaDePieza[]>;
}

const RUTA_VACIA: Ruta = { marcas: [], ids: [], porPieza: new Map() };

let activa: Ruta = RUTA_VACIA;
let pendiente: Ruta | null = null;

/**
 * The last cycle generation seen.
 *
 * It is compared with `cycleGeneration()` because only the engine knows the exact
 * instant of the swap: `collectWindow` decides it half an interval before the boundary,
 * and no count over `placed` sees it come.
 */
let generacion = 0;

/**
 * The pieces that entered the cycle at the last swap and still have veiled cells.
 *
 * It is replaced whole at each swap. To remember which cells ALREADY lost the veil is
 * the job of the draw loop, which sees it frame by frame.
 */
let estrenando: string[] = [];

let veloActual: CeldaPorEstrenar[] = [];

/**
 * Queues the new sequence.
 *
 * The same effect of `use-engine.ts` that calls `setSequence` calls it: the two queues
 * get the sequence together, or the playhead and the sound would look at different
 * cycles.
 *
 * Only the last one is kept, as in the engine: what is queued is the WHOLE sequence, so
 * two changes before the boundary count as one.
 */
export function encolar(s: Sequence, placed: readonly PlacedPiece[]): void {
  pendiente = construir(s, placed);
  recomputarVelo();
}

/**
 * Returns the draw queue to zero. The Reset of the shell calls it, through
 * `reiniciarRecorrido()` of `use-engine.ts`, and NOBODY else.
 *
 * It exists because this module advances only when `cycleGeneration()` goes up, and
 * `tick()` moves that counter: the clock. With the transport stopped, `activa` and
 * `estrenando` stay frozen, but `encolar` still computes the veil from them. Without
 * this reset, the veil of pieces that left is drawn over an empty board until the next
 * Play.
 *
 * Reset stops the transport AND empties the board. It is an explicit order to return to
 * zero, not an edit of the board, so it is the only place where it is correct not to
 * wait for the cycle boundary. That holds for the engine, and for this SECOND queue
 * too: the two reset by the same path, or the two queues disagree.
 *
 * So it is NOT enough that `encolar` clears alone when the sequence comes empty: that
 * would turn "the board is empty" into "return to zero", and those are different
 * things. To remove the last piece with the transport running must still let the cycle
 * finish. The reset is an ORDER, not a consequence.
 *
 * `generacion` is the only one that does NOT return to its initial value: it syncs with
 * the engine. `cycleGen` is never reset, because that would make the UI believe in a
 * swap that did not happen. To set `generacion` to zero would bring that lie back from
 * this side, and with the queued sequence that `encolar` leaves right after, the next
 * frame would swap OUTSIDE the cycle boundary.
 */
export function reiniciar(): void {
  activa = RUTA_VACIA;
  pendiente = null;
  estrenando = [];
  generacion = cycleGeneration();
  // Through `recomputarVelo` and not `veloActual = []`, so that the veil has one place
  // where it is computed: with the three above at zero, it comes out empty and with a
  // new identity, which is the signal that the draw loop looks at to build again.
  recomputarVelo();
}

/**
 * The sequence that sounds now, as a table indexed by offset.
 *
 * The draw loop calls it, and the swap happens HERE: in the same frame where the engine
 * reports it, not when React finds out.
 *
 * That the loop also runs while paused, like that of `Spectrum`, is not a problem: it
 * is what makes the swap be seen in the exact frame.
 */
export function rutaActiva(): readonly (Marca | null)[] {
  const g = cycleGeneration();
  if (g === generacion) return activa.marcas;

  // The generation ALWAYS syncs, with a queued sequence or without: if the engine
  // counted a swap that had no counterpart here, to stay behind would make the next
  // `encolar` start in the next frame and not wait for its boundary.
  generacion = g;
  if (pendiente === null) return activa.marcas;

  // The pieces that were not sounding start in this cycle, and they lose the veil CELL
  // BY CELL: it is the only thing that shows the exact moment of the turn of the piece.
  const sonaban = new Set(activa.ids);
  estrenando = pendiente.ids.filter((id) => !sonaban.has(id));

  activa = pendiente;
  pendiente = null;
  recomputarVelo();
  return activa.marcas;
}

/**
 * The placed cells that never sounded yet, to draw them veiled.
 *
 * They are two different populations, and so `offset` can be `null`:
 *
 * - Those of a piece that ALREADY entered the cycle and whose turn has not come: they
 *   have an offset, and lose the veil when the playhead reaches them. This shows that
 *   the play order is not the placement order: the piece does not light up when the
 *   cycle starts but when its turn comes.
 * - Those of a queued piece, which has not even entered: there is no instant to wait
 *   for yet, only the cycle boundary. Offset `null`.
 *
 * The IDENTITY of the array is the change signal: while it is the same array, the loop
 * has nothing to build again. It changes on `encolar` and on the swap, very rare
 * against the 60 frames a second that read it.
 */
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

/**
 * Joins the sequence with the board and returns the table indexed by offset.
 *
 * The cells of the notes come from `cellsByPlayOrder`, the pure function of the circuit
 * that already has the retrograde applied, and those of the clicks from `Click.cell`.
 * NONE is calculated here: between the two farthest cells of the board there are 792
 * shortest paths, 792 ways to draw a circuit that is not the one that sounds, so the
 * view must not choose its own.
 *
 * `occupantAt` stays out on purpose, although it looks like the short way. NOT for its
 * cost (measured: 4.1 us for a whole board with 12 pieces, see its docblock), but
 * because it answers about `placed`, the CURRENT board. The loop needs the data of the
 * sequence that sounds, and the frozen sequence already has it.
 */
function construir(s: Sequence, placed: readonly PlacedPiece[]): Ruta {
  const marcas: (Marca | null)[] = new Array<Marca | null>(Math.max(0, s.length)).fill(null);
  const porPieza = new Map<string, CeldaDePieza[]>();
  const porId = new Map(placed.map((p) => [p.id, p]));

  for (const step of s.steps) {
    const pieza = porId.get(step.pieceId);
    // It cannot happen: the shell derives the sequence from the SAME pieces that it
    // gives here (those that fit the current grid, see `visibles` in `App.tsx`) with a
    // `useMemo`, and gives them together to the hook in the same effect. If it did
    // happen, that step has no marks and the playhead crosses it in the dark and does
    // not draw an invented cell. Silence is better than a lie, because a wrong cell
    // reads as a wrong model.
    if (!pieza) continue;
    const celdas = cellsByPlayOrder(pieza);
    const deLaPieza: CeldaDePieza[] = [];
    for (let j = 0; j < celdas.length; j++) {
      marcas[step.offset + j] = { cell: celdas[j], kind: MARCA.nota };
      deLaPieza.push({ cell: celdas[j], offset: step.offset + j });
    }
    porPieza.set(step.pieceId, deLaPieza);
  }

  // The clicks are written after the notes. Their offsets do not collide (a test of
  // `sequence.test.ts` guarantees it), so the order changes nothing today. If they
  // ever collided, the mark written last would stay: that of the click.
  //
  // `Click.note` tells the crossing of an occupied cell from the click: `routeBetween`
  // does not know what is under the path it draws (the view does not choose its own
  // circuit), so the same offset can fall on an empty cell or on a piece whose turn
  // has not come. When it falls on a piece, that cell SOUNDS its note, and that must
  // look different from the click.
  for (const c of s.clicks) {
    marcas[c.offset] = { cell: c.cell, kind: c.note !== undefined ? MARCA.cruce : MARCA.click };
  }

  // `ids` and `porPieza` come from `s.steps` and NOT from `s.order`, so a MUTED piece
  // enters neither: it has no veil. That is a decision and not an accident of where
  // the `for` is written. The veil says "this has not sounded yet", and a muted piece
  // will never sound, so to veil it until its "turn" would promise something that will
  // not happen. Also, opacity is already taken to say that, and mute has another
  // channel: the white tile of `Board.tsx`.
  //
  // What does cover it is the MARKS: its five cells enter through the `for` of the
  // clicks above, so the playhead still goes over it cell by cell (it takes that time)
  // but with `MARCA.click` and not `MARCA.nota`: with the border of the click. That is
  // deliberate too: what sounds there IS a click.
  return { marcas, ids: s.steps.map((st) => st.pieceId), porPieza };
}
