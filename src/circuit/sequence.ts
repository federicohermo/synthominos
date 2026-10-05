import type { Cell } from '../pieces/transform.ts';
import type { PlacedPiece, Dims } from '../board-editing/placement.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';
import { occupantAt, occupantCellIndex } from '../board-editing/placement.ts';
import { rutador } from './routing.ts';
import {
  degreeByCellIndex,
  playOrderByCellIndex,
  arpeggioFor,
  notesForRotation,
  BASE_MAP,
  DEFAULT_OCTAVE,
} from '../musical-model/music.ts';
import { SHAPES, CELLS_PER_PIECE } from '../pieces/pieces.ts';

/**
 * The board as a circuit: from a set of placed pieces to a sequence.
 *
 * The X axis is not time. A closed circuit visits the pieces one by one, and time comes
 * from the ORDER of the visit plus what it takes to get from one piece to the next. All of
 * it is integer arithmetic, and the unit is the interval, one cell travelled. To convert
 * to seconds belongs to the engine: so the same board always sounds the same, and a change
 * of tempo stretches the pattern and does not reorder it.
 */

/**
 * The base with which `claveDeTramo` packs cost and moves into one integer.
 *
 * **It must be greater than the SUM of the moves of the whole circuit, not than the moves
 * of one leg.** Held-Karp adds keys and compares sums, so what cannot carry into the field
 * of the cost is the total: 12 legs of at most 60 moves each give 720, because the
 * reference board has 60 cells and a route repeats none. So 1024, the power of two that
 * clears it with margin.
 *
 * To shrink it to 60 "because no leg is longer" is the error that this docblock exists to
 * prevent: the carry does not fail loudly. It orders the circuit wrong, and the board
 * sounds different with nothing turning red.
 */
export const PASOS_MAX = 1024;

/**
 * A piece inside the circuit: when its arpeggio starts and which five notes it plays.
 *
 * `offset` is in INTERVALS, not in seconds: the unit is one cell travelled, and the domain
 * does not know the tempo. To convert to time belongs to the engine. Because the count
 * lives in integers, the same board always sounds the same: no floating-point error
 * accumulates that depends on the order of the sum.
 *
 * `pieceId` and not the whole `PlacedPiece`, so that the engine can reconcile two
 * sequences without the geometry: it is the only part of the piece that the audio code
 * needs, and the rest would tie it to the domain.
 *
 * `notes` comes in PLAY ORDER: if the piece was placed reflected, `arpeggioFor` already
 * applied the retrograde. It is the only derivation from piece to arpeggio of the domain,
 * so `buildSequence` takes it as it is and reverses nothing again.
 */
export interface Step {
  pieceId: string;
  offset: number;
  notes: number[];
}

/**
 * A cell that a leg goes through: where it sounds, when, and with which note if the cell
 * has one to give.
 *
 * The `cell` is not decoration, although the engine needs only the `offset`. It lets the
 * guarantee "two clicks never fall on the same interval" be verified in the domain, where
 * one click can be told from another: if two coincided, the engine would schedule both and
 * the amplitudes would add up. It also lets the cell that lights up and the cell that
 * sounds come from the SAME datum.
 *
 * `note` is the MIDI note of the cell entered when the route could not avoid a piece, and
 * it is absent when the cell has no note to give: the cell is empty, or a muted piece
 * occupies it. It is optional and NOT a discriminated union, and here that is the right
 * shape because of the `cell`: the note is DERIVED from it, `noteAtCell` of the occupant
 * or nothing. So "no `note`" means exactly "this cell has no note to give", and no
 * construction can produce the wrong combination. In the engine the decision is the
 * opposite, a discriminated union: there the cell does not travel, and without it nothing
 * would stop a click with a note that it should not have.
 */
export interface Click {
  offset: number;
  cell: Cell;
  note?: number;
}

/**
 * A piece inside the circuit, whether it sounds or not: when its turn comes.
 *
 * It is what `steps` cannot answer, because a MUTED piece emits no `Step`. Mute does not
 * take it out of the circuit: it keeps its place and its time, and the circuit still
 * visits it. So a visit order read from `steps` would miss exactly the pieces that do not
 * sound. With no piece muted the two lists are the same.
 *
 * `offset` is here and in `Step` for the pieces that sound, and the two cannot disagree:
 * both come from the SAME variable of the same loop of `buildSequence`, in the same
 * iteration. It is written twice, not derived twice.
 */
export interface Visita {
  pieceId: string;
  offset: number;
}

/**
 * The whole circuit, ready to schedule: the arpeggios, the clicks, the visit order and the
 * cycle length.
 *
 * `length` is the FULL cycle, with the leg from the last piece back to the first. So it is
 * not the offset of the last step: it is where the circuit starts again. Without that leg
 * the loop would close early and the join would be audible.
 *
 * `order` holds ALL the pieces and `steps` only the ones that sound: a muted piece is in
 * the first and not in the second. On a board with nothing muted they are the same list in
 * the same order, so `order` can be compared field by field between the two versions of a
 * board.
 */
export interface Sequence {
  steps: Step[];
  clicks: Click[];
  order: Visita[];
  length: number;
}

/**
 * The cells of the piece in PLAY ORDER: `[j]` is the cell where note `j` of
 * `arpeggioFor(p.piece, p.rotation, p.mirror, regimen)` sounds.
 *
 * The step comes from the CANONICAL shape and is read BY INDEX:
 * `playOrderByCellIndex(SHAPES[p.piece], p.mirror)[k]` is the step of `p.cells[k]`, because
 * rotate, reflect and translate are `map` and cell `k` is still cell `k`. To run it over
 * `p.cells` compiles the same and returns another mapping in 53 of the 96 orientations,
 * because a rotation moves the origin of the angle. It is the most expensive trap of this
 * module.
 *
 * The retrograde is ALREADY APPLIED, with the same criterion as `arpeggioFor`: the
 * reflection reverses the order IN TIME and does not move which note belongs to which
 * cell, so with `mirror` the first note that sounds is the one of degree 4. The reversal
 * is not done here: `playOrderByCellIndex` does it. It is the only derivation of the
 * retrograde over cells of the domain, and the same one that feeds the number shown on the
 * board. A second copy of a rule that is also PAINTED on screen is how the cell that
 * lights up and the cell that is read come to say different things.
 *
 * Because the reversal lives in the domain and not in the consumer, `[j]` matches
 * `notes[j]` and nobody reverses again. It is the rule that `sequence.ts` declares for
 * `Step.notes`, held from both ends.
 *
 * It exists because `Step` carries no cells: the way from note `j` to the cell where it
 * shows is a derivation of its own, and `gates` needs it only for steps 0 and 4. It does
 * not reopen the rule that the geometry decides the circuit: a mapping from degree to cell
 * is not a route and not a distance.
 */
export function cellsByPlayOrder(p: PlacedPiece): Cell[] {
  const pasos = playOrderByCellIndex(SHAPES[p.piece], p.mirror);
  // The inverse table: `pasos[k]` is the step of cell `k`, and this is the cell of each
  // step. Both are permutations of `0..n-1`, and to confuse them compiles.
  const porPaso = new Array<Cell>(pasos.length);
  pasos.forEach((paso, k) => { porPaso[paso] = p.cells[k]; });
  return porPaso;
}

/**
 * The two gates of a piece: where the circuit enters and where it leaves.
 *
 * They are read from the PLAY ORDER, not from degrees 0 and 4. A derivation by degree does
 * not look at the reflection: with `mirror` the first note that sounds is the one of
 * degree 4, so entry and exit come out EXACTLY swapped against the melody in half of the
 * placement space. Measured on `L`/0/reflected on (1,1): by degree the circuit enters at
 * [1,3], which is degree 0 and the LAST note, and leaves at [0,0], which is the FIRST. The
 * leg before it walks up to that entry, so that the first thing to sound is at the
 * opposite end of the piece.
 *
 * With ONE derivation the two cannot disagree. It is the same argument by which the number
 * of clicks is read from the length of the route and not computed.
 *
 * The two are never the same cell: they are two different steps of the same piece. Today
 * that is not what protects `routeBetween` from `a === b`. Two things do: two pieces do
 * not overlap, so the exit gate of one and the entry gate of the next are different cells,
 * and the guard of `n === 1`, because with one piece there is no leg to trace. But it is
 * the property that would make safe any future leg that leaves and enters the same piece.
 *
 * It is exported although `buildSequence` is its only consumer in `src/`: `simulate_board`
 * reports the gates of each piece, and the tools are a facade over the domain, not a copy.
 * Without this export those three lines exist twice and can disagree.
 */
export function gates(p: PlacedPiece): { entrada: Cell; salida: Cell } {
  const orden = cellsByPlayOrder(p);
  // `orden[orden.length - 1]` and not `orden.at(-1)`: `at` returns `Cell | undefined` and
  // the return type does not admit an undefined that can never happen.
  return { entrada: orden[0], salida: orden[orden.length - 1] };
}

/**
 * The MIDI note of the cell `cell` of the piece `p`, or `null` if `p` does not occupy it.
 *
 * It is the derivation from cell to note, a pure function of the domain and not three
 * lines inside `buildSequence`. The reason is the same that keeps `cellsByPlayOrder`
 * outside `gates`: a derivation hidden in its only consumer cannot be checked against
 * anything. And `cell-text.ts` does this same chain to PAINT the note of a cell. If the
 * two drifted apart, the cell would show one note and sound another when a leg enters it.
 *
 * The two traps of the chain, which compile the same and sound wrong:
 *
 * - The degree comes from `degreeByCellIndex(SHAPES[p.piece])`, the CANONICAL shape, and
 *   travels BY INDEX. To run it over `p.cells`, which is rotated, reflected and
 *   translated, returns another mapping in 53 of the 96 orientations.
 * - The arpeggio is the ASCENDING one of `notesForRotation`, and NEVER `arpeggioFor`,
 *   which has the retrograde applied. The degree reads the shape forward: to index a
 *   reversed arpeggio with it gives the mirrored note. `arpeggioFor` answers in which
 *   ORDER the notes sound. This function answers which note is on a cell, and that is
 *   another question.
 *
 * And a third: the REGIME is PASSED ON, not fixed here. This function gives the
 * `Click.note` of `clickEn`, the note that sounds when a leg CROSSES an occupied cell, and
 * also the `crossed` that `simulate_board` reports. If it stayed in `escala` while the
 * piece plays `orden`, the cell would show one note and sound another in 36 of 48
 * combinations. That is the bug that this docblock exists to prevent. `tsc` forces a
 * change to the line but does not say which answer is right.
 */
export function noteAtCell(p: PlacedPiece, cell: Cell, regimen: RegimenDeRotacion): number | null {
  const k = occupantCellIndex(p, cell[0], cell[1]);
  if (k < 0) return null;
  const ascendente = notesForRotation(BASE_MAP[p.piece], DEFAULT_OCTAVE, p.rotation, regimen);
  return ascendente[degreeByCellIndex(SHAPES[p.piece])[k]];
}

/**
 * The click of one cell of a route: with a note if a piece that sounds occupies the cell,
 * without one if the cell is empty **or if the piece that occupies it is muted**.
 *
 * A MISSING `note` says "there is no note to give", so there is no `note: null` in between
 * that someone could read as a third state (see `Click`).
 *
 * The mute condition is not a decorative symmetry: the note of the crossing is exactly the
 * note that mute turned off. Without it a muted piece would still sound each time a leg
 * crosses it. Measured: a crossing survives on 32 % of the boards of three pieces, so it
 * is one board in three and not a rare case. The crossing does not go away: it is still a
 * click, silent, the same as on an empty cell. The only change is its `kind` on the UI
 * side.
 */
function clickEn(offset: number, celda: Cell, placed: readonly PlacedPiece[], regimen: RegimenDeRotacion): Click {
  const ocupante = occupantAt(placed, celda[0], celda[1]);
  const nota = ocupante === null || ocupante.muted ? null : noteAtCell(ocupante, celda, regimen);
  return nota === null ? { offset, cell: celda } : { offset, cell: celda, note: nota };
}

/**
 * The five clicks with which a muted piece sounds: one for each cell, at the same offsets
 * that its five notes would have and in the same play order.
 *
 * ## Why it reuses `Click` and not a `Step` with a flag
 *
 * `Click` has exactly the shape needed, `{ offset, cell, note? }`, where the ABSENCE of
 * `note` means "this cell has no note to give". And a muted cell **is** a cell that the
 * circuit goes through and that has no note to give. It reuses the case that exists and
 * invents no third one.
 *
 * The alternative, a `Step` with `muted: true` and the notes inside, leaves the engine to
 * decide if something that comes in the message sounds. That is the split that
 * `.agents/rules/audio.md` rejects: what reaches the engine is what sounds, with no
 * condition to evaluate.
 *
 * It is free in the circuit: the cycle length, the visit order and the offsets of the
 * other pieces do not depend on whether the piece sounds, only on its gates and its
 * place. Mute changes WHAT is heard in those five intervals, not WHEN.
 */
function clicksDeMuteada(p: PlacedPiece, offset: number): Click[] {
  return cellsByPlayOrder(p).map((cell, j) => ({ offset: offset + j, cell }));
}

/**
 * The key with which Held-Karp compares two legs: **the cost first, and at equal cost the
 * MOVES**.
 *
 * ## Why two criteria, and the cost alone is not enough
 *
 * If the cost of a leg WERE its number of moves, a tie in cost would be a tie in duration,
 * and a tie-break by index would change nothing that is heard. The crossing cost breaks
 * that identity: a crossing costs `CROSS_COST` but lasts ONE interval, so two circuits can
 * cost the same and last different times.
 *
 * Measured on the board `U`(2,0) `T`(4,2) `I`(7,2) `W`(7,4) `F`(3,4): the circuits
 * `U>T>F>I>W` and `U>W>I>T>F` **both cost 24**, but have **17 and 21 moves**. Without this
 * criterion the one with the smaller index wins, and the index is the PLACEMENT ORDER. So
 * the same board sounds with a cycle of 37 or of 41 intervals, by the order in which the
 * pieces were placed. Over 120 boards of 5 pieces it happened on 8.3 %.
 *
 * That contradicts the central rule of the circuit: **the geometry decides it**. With the
 * moves as the second criterion the choice is geometric again, and it is also the right
 * one musically: at equal cost, the shorter cycle.
 *
 * The index is still the THIRD criterion, and there it is harmless: two circuits that tie
 * in cost AND in moves last the same, so which one wins does not change the rhythm.
 *
 * They are packed into one integer, and not compared as pairs, because Held-Karp adds legs
 * and compares sums: with `cost * PASOS_MAX + steps` the sum of keys orders the same as a
 * comparison of (sum of costs, sum of moves) in that order, **as long as the sum of moves
 * stays below `PASOS_MAX`**. With 12 legs of at most 60 moves the maximum is 720, so it
 * cannot carry. All integers, so the exact equality of the tie-break in the reconstruction
 * stays exact and not approximate.
 */
function claveDeTramo(r: { cost: number; steps: number }): number {
  return r.cost * PASOS_MAX + r.steps;
}

/**
 * The shortest directed circuit that visits the `n` pieces, by exact Held-Karp.
 *
 * It returns the visit order, always starting at index 0. The cycle is closed and has no
 * start, so a fixed start loses no solution: every Hamiltonian cycle goes through node 0.
 * It also removes the `n` equivalent rotations of one circuit, which would need a
 * tie-break too.
 *
 * ## Why exact and not nearest neighbour
 *
 * Because the rules of the instrument fix the limit of `n`: the piece limit, `MAX_PIEZAS`,
 * is 12, so `O(n^2 * 2^n)` is 12^2 x 4096 = 590 thousand operations in the
 * WORST case possible, not in the typical one. Measured: 1.87 ms with 12 pieces. The
 * greedy search costs less and gives circuits +20.1 % longer on average and +79 % in the
 * worst case. The usual argument against the exact TSP does not apply when the domain
 * bounds `n`.
 *
 * ## The dynamic programming goes BACKWARD, and that is not a detail
 *
 * `g[j][mask]` = least cost to start at `j`, visit all of `mask` and return to 0. The
 * usual formulation goes forward (`dp[mask][j]` = cost to reach `j` with `mask` visited),
 * and with it the tie-break can only be resolved by the LAST leg. Backward, the circuit is
 * rebuilt forward from 0, and each move takes the SMALLEST index that still reaches the
 * optimum. That gives the lexicographically smallest circuit among all the optimal ones.
 * It is the tie-break of the circuit, the smallest order of placement indices, and
 * without it two identical boards could sound different by how the JS engine walked the
 * `for`.
 *
 * All integers, with no `Math.random` and no dates: the equality
 * `cost + rest === optimum` of the tie-break is exact, not approximate.
 */
function shortestCircuit(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length;
  const size = 1 << n;

  // Sentinel for "not reachable": any value greater than the most expensive circuit
  // possible works. With the key of `claveDeTramo` the ceiling on the reference board is
  // 12 legs x (maximum cost 300 x PASOS_MAX + 60) = 3.7 million, so 0x3fffffff stays more
  // than two orders of magnitude above it and far from the edge of Int32: adding a leg to
  // it does not overflow.
  const INF = 0x3fffffff;
  const g = new Int32Array(n * size).fill(INF);

  // `mask` walks the subsets of {1..n-1}: 0 is never pending because it is the start.
  // With an empty `mask` nothing is left to visit and only the return remains.
  for (let j = 0; j < n; j++) g[j * size] = cost[j][0];

  for (let mask = 2; mask < size; mask++) {
    if (mask & 1) continue;
    for (let j = 0; j < n; j++) {
      if ((mask >> j) & 1) continue;
      let best = INF;
      for (let k = 1; k < n; k++) {
        const bit = 1 << k;
        if (!(mask & bit)) continue;
        const c = cost[j][k] + g[k * size + (mask ^ bit)];
        if (c < best) best = c;
      }
      g[j * size + mask] = best;
    }
  }

  const order = [0];
  let cur = 0;
  // All the bits except bit 0: the pieces left to visit at the start.
  let mask = size - 2;
  while (mask !== 0) {
    const objetivo = g[cur * size + mask];
    for (let k = 1; k < n; k++) {
      const bit = 1 << k;
      if (!(mask & bit)) continue;
      if (cost[cur][k] + g[k * size + (mask ^ bit)] !== objetivo) continue;
      order.push(k);
      cur = k;
      mask ^= bit;
      break;
    }
  }
  return order;
}

/**
 * The sequence that a board sounds: which piece starts at which interval, which cells the
 * legs go through, and how long the cycle lasts.
 *
 * The order is NOT the placement order: it is the order of the shortest circuit between
 * the gates of the pieces. To move a piece reorders the music.
 *
 * ## The arithmetic of the offsets
 *
 * Each piece spans `CELLS_PER_PIECE - 1` intervals: five notes leave four gaps between the
 * first and the last. If it starts at `o`, its last note falls on `o + 4`, its clicks on
 * `o + 5 ... o + 4 + (d - 1)` and the first note of the next piece on `o + 4 + d`, where
 * `d` is the MOVES of the leg. With `d = 1` there are no clicks and the next note falls
 * exactly one interval after the last one: two adjacent pieces are contiguous, with no
 * audible join.
 *
 * `length` closes with the leg from the last piece to the first added too, so it is
 * `4n + the sum of the legs`. Without that last leg the loop would close early and the
 * circuit would not be closed.
 *
 * ## The cost orders, the moves measure time
 *
 * They are TWO numbers and not two readings of one: a leg that crosses a piece costs
 * `CROSS_COST` for each occupied cell it enters, but still lasts one interval for each
 * move. The cost goes into the matrix that orders the circuit, and makes a route prefer to
 * go around. The moves, and only they, go into the offsets. To mix them would stretch the
 * cycle with silences where there is nothing to wait for.
 *
 * Both come from the SAME route query, kept in `rutas`: the route that is scheduled is the
 * one that the circuit chose, and the number of clicks is not computed. It is the length
 * of that route.
 *
 * The `regimen` goes through the function and decides nothing: it governs which notes each
 * piece fires and which note a crossing sounds, and it does not touch the circuit, the
 * gates or the offsets. That is on purpose: the regime shifts the arpeggio and not the
 * entry gate, so a change of regime does not reorder the board.
 *
 * ## The muted piece keeps its place and its time, and does not sound
 *
 * Mute comes in AFTER the circuit is chosen, and that is not an implementation detail: it
 * is the property. `puertas`, `rutas` and `circuito` do not read `muted`, so the visit
 * order, the offsets of the other pieces and `length` are identical to those of the same
 * board with nothing muted. The only change is in those five intervals, which go from one
 * `Step` with five notes to five `Click`s with no `note`.
 *
 * That is why `order` exists apart from `steps`: the muted piece is in the circuit and not
 * in the steps, so a circuit read from `steps` would skip exactly the pieces that do not
 * sound.
 *
 * `clickEn` sets the other edge: a leg that CROSSES a muted piece does not sound its note
 * either. Without that, mute would be partial on one board in three.
 */
export function buildSequence(placed: readonly PlacedPiece[], regimen: RegimenDeRotacion, dims: Dims): Sequence {
  const n = placed.length;
  if (n === 0) return { steps: [], clicks: [], order: [], length: 0 };

  // With ONE piece there is no leg: the cycle is its arpeggio, and it starts again
  // contiguous. **The circuit exists BETWEEN pieces, and with one piece there is no
  // between**, so there are no clicks to emit. The alternative was the leg from the piece
  // to itself, from its exit gate (step 4) to its entry gate (step 0), and **it was
  // rejected by ear**: with a `Z` on `(0,1)(1,1)(1,0)(2,0)(3,0)` that leg has 3 moves and
  // its route is `[[2,0],[1,0]]`, so the two clicks fell ON the piece that had just
  // sounded. It did not sound like a circuit: it sounded like two hits on top of the
  // arpeggio. That `routeBetween` goes around the pieces today removes the symptom and not
  // the reason: those clicks would fall on empty cells and would still be surplus.
  //
  // The cycle has `CELLS_PER_PIECE` intervals and not `CELLS_PER_PIECE - 1`: the five
  // notes span 4 intervals, so with a length of 4 the last note of one pass and the first
  // of the next would fall on the SAME interval. With 5 the repetition is contiguous: the
  // next note falls one interval after the last one. It is the same rule that two adjacent
  // pieces follow.
  //
  // The branch of the muted piece goes here TOO, and not only in the loop: this early
  // return builds its `Step` without the loop. An implementation that changed only the
  // loop would leave the one board that is muted in full, the board of one piece, as the
  // only one that sounds.
  if (n === 1) {
    const p = placed[0];
    return {
      steps: p.muted ? [] : [{ pieceId: p.id, offset: 0, notes: arpeggioFor(p.piece, p.rotation, p.mirror, regimen) }],
      clicks: p.muted ? clicksDeMuteada(p, 0) : [],
      order: [{ pieceId: p.id, offset: 0 }],
      length: CELLS_PER_PIECE,
    };
  }

  const puertas = placed.map(gates);
  // The n x n routes at once, 144 with the full board, and not one batch for the matrix
  // and another for the clicks: so it is not possible to order the circuit with one route
  // and schedule another.
  // The whole `placed` and not "the other pieces": a leg can also cross the two pieces it
  // joins, and to avoid them is just as good.
  // One route finder and not `n^2` loose calls to `routeBetween`: inside, it remembers the
  // distances by destination, which are `n` and not `n^2`. With 12 pieces that is 12
  // Dijkstra runs and not 144, and it is what makes a board of 390 cells fit in the same
  // budget as the board of 60. The whole argument is in the docblock of `rutador`, in
  // `routing.ts`.
  const ruta = rutador(placed, dims);
  const rutas = puertas.map((desde) => puertas.map((hasta) => ruta(desde.salida, hasta.entrada)));
  const circuito = shortestCircuit(rutas.map((fila) => fila.map(claveDeTramo)));

  const steps: Step[] = [];
  const order: Visita[] = [];
  const clicks: Click[] = [];
  let offset = 0;

  for (let t = 0; t < n; t++) {
    const p = placed[circuito[t]];
    order.push({ pieceId: p.id, offset });
    // The muted piece emits no `Step` and emits its five clicks at the same offsets.
    // Nothing below changes: the circuit is already chosen, because `order` comes from the
    // gates and from the cost, which do not read the mute, and `offset` advances the same.
    // Mute changes what is heard, not when.
    if (p.muted) clicks.push(...clicksDeMuteada(p, offset));
    // `arpeggioFor` returns a new array on each call, so there is no defensive copy to
    // make: `Step.notes` is mutable by contract and aliases nothing. A copy here would be
    // needed only if the notes were stored in `PlacedPiece`, and the docblock of
    // `arpeggioFor` explains why they are not and cannot be.
    else steps.push({ pieceId: p.id, offset, notes: arpeggioFor(p.piece, p.rotation, p.mirror, regimen) });

    const ultima = offset + (CELLS_PER_PIECE - 1);
    const ruta = rutas[circuito[t]][circuito[(t + 1) % n]];
    for (let m = 0; m < ruta.path.length; m++) clicks.push(clickEn(ultima + 1 + m, ruta.path[m], placed, regimen));

    offset = ultima + ruta.steps;
  }

  return { steps, clicks, order, length: offset };
}
