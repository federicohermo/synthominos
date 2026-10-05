import type { Cell } from '../pieces/transform.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import { centroid, angleFromCentroid, pathThroughCells } from '../pieces/transform.ts';

/**
 * The musical model: from a pitch class, a rotation and a REGIME, to five MIDI notes.
 *
 * What the rotation does is one of two things, and the regime selects it. In the scale
 * regime (`escala`) the rotation selects the scale formula: it changes WHICH NOTES the
 * piece sounds and not their order. In the order regime (`orden`) it shifts the arpeggio
 * cyclically on a fixed major pentatonic: it changes WHERE THE ARPEGGIO STARTS and not
 * the material. The two are design decisions of the instrument and not data, so the
 * mapping is here, and the formulas are the `PENT_*` constants of this file.
 *
 * The two exist together because the question of which rule makes the instrument more
 * expressive has no answer on paper. To have them together builds the comparison, so
 * that the ear can decide. The regime travels as a PARAMETER so that to remove the loser
 * is to delete one branch and not to untangle it. Measured: the two differ in 36 of the
 * 48 combinations of piece x rotation, and are exactly equal in the 12 at rotation 0.
 */

/**
 * What the rotation does: it changes the SCALE or it changes the ORDER.
 *
 * See `REGIMEN` in this file for the two values and the reason the two exist.
 *
 * It is derived from the const object and is not an `enum`: `erasableSyntaxOnly` rejects
 * an enum, and that same option lets node load `src/` with no build. It is the same
 * pattern as `HitKind` over `HIT` and `MarcaKind` over `MARCA`: a closed set is written
 * once, as values, and the type is derived.
 *
 * It travels as a PARAMETER through all the model (`notesForRotation`, `arpeggioFor`,
 * `noteAtCell`, `buildSequence`) and never as a global: the repo has no global state, and
 * the regime is state of `App.tsx`, like the tempo. That also makes the removal of one of
 * the two, when the choice is made, the deletion of one branch and not the untangling of
 * a singleton.
 */
export type RegimenDeRotacion = (typeof REGIMEN)[keyof typeof REGIMEN];

/** The 12 pitch classes, in order. The index IS the pitch class. */
export const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;

export const PENT_MAJOR: number[] = [0,2,4,7,9];
export const PENT_MINOR: number[] = [0,3,5,7,10];
export const PENT_BLUES5: number[] = [0,3,5,6,7];

/**
 * The two regimes of rotation: WHAT the rotation changes.
 *
 * - `escala`: selects one of four formulas, built on the constants above. A rotation
 *   changes WHICH NOTES the piece sounds and not their order.
 * - `orden`: ALWAYS the major pentatonic, shifted `rot` positions. A rotation changes
 *   WHERE THE ARPEGGIO STARTS and not the material.
 *
 * The two exist together because the question (which of the two rules makes the
 * instrument more expressive) has no answer on paper. The two regimes build the
 * comparison so that the ear can decide, and to remove the loser is to delete one branch
 * of `notesForRotation`.
 *
 * The fixed formula of `orden` is the major pentatonic and no other, and that makes the
 * comparison AUDITABLE: it is the formula of rotation 0 in `escala`, so at 0° the two
 * regimes sound the same, and they diverge as the piece turns. With any other fixed
 * formula the two systems would meet at no point, and the comparison would be of two
 * different instruments.
 *
 * A const object and not an `enum`: `erasableSyntaxOnly` rejects an enum, and that same
 * option lets node load `src/` with no build, which the MCP server needs. The derived
 * union type is `RegimenDeRotacion`, in this file.
 */
export const REGIMEN = { escala: 'escala', orden: 'orden' } as const;

/**
 * The regime the app opens with: `escala`.
 *
 * It is the default of the STATE of `App.tsx` and never a default of a parameter. The
 * functions of the domain take the regime with no default value on purpose: a caller that
 * forgets it fails the typecheck, and does not get one regime in silence. The two differ
 * in 36 of the 48 combinations. It is the same criterion as `dur` and `rel` in
 * `scheduleVoice`.
 */
export const DEFAULT_REGIMEN = REGIMEN.escala;

/**
 * The notes that a piece fires: the four formulas are pentatonic.
 *
 * It is equal to `CELLS_PER_PIECE` and it **must be**, not by chance: 5 notes because the
 * scale is pentatonic and 5 cells because the piece is a pentomino, and
 * `degreeByCellIndex` pairs the two lists so that each cell has its note.
 *
 * A formula of 4 notes would leave a cell with no note: `ascending[4]` would be
 * `undefined`, and `midiName` of that does not throw. It returns `undefinedNaN`, and the
 * cell paints it. A formula of 6 would leave a note that no cell fires.
 *
 * `checkNotes()` of `invariants.ts` verifies it, and that is where it must be: written
 * only here, it is a statement and not a net.
 */
export const NOTES_PER_PIECE = 5;

/**
 * Piece → pitch class of its tonic (F→C, I→C#, … Z→B).
 *
 * It is typed `Record<PieceKey, number>` and not `as const`: a piece added with no tonic
 * is a compile error.
 *
 * Take care with the name collision: the PIECE `F` sounds with the tonic C, and the note
 * F belongs to the piece `T`.
 */
export const BASE_MAP: Record<PieceKey, number> = {
  F:0, I:1, L:2, N:3, P:4, T:5, U:6, V:7, W:8, X:9, Y:10, Z:11,
};

/** The octave in which the arpeggio of a piece is built. */
export const DEFAULT_OCTAVE = 4;

/**
 * The tolerance of the two comparisons of `degreeByCellIndex`.
 *
 * The two are "this cell is on the centroid", a distance against the epsilon, and "these
 * two cells have the same angle", the size of the bucket to which the angle is rounded
 * before the sort.
 *
 * It is an epsilon and not `0` because the centroid is a mean of fifths: `2/5 + 2/5 +
 * 1/5` does not always give exactly `1`, and a cell that IS geometrically at the center
 * can be 1e-16 away from it.
 *
 * `transform.test.ts` uses it too, to assert which cells are on the centroid: it is the
 * same question, so it is the same number and not a copy.
 */
export const DEGREE_EPSILON = 1e-9;

/** The MIDI note of pitch class `pc` in octave `octave`. C4 = 60. */
export function midiFor(pc: number, octave: number): number { return 12*(octave+1) + pc; }

/** The readable name of a MIDI note, for example `C4`. */
export function midiName(m: number): string { const pc = m%12; const o = Math.floor(m/12)-1; return `${CHROMATIC[pc]}${o}`; }

/**
 * A scale formula turned into MIDI notes on a tonic and an octave.
 *
 * It is outside `notesForRotation` because the two regimes need it the same, and written
 * twice it would be two copies of the rule of the `octShift`, which is exactly the rule
 * that nobody would keep in step.
 */
function notasDeFormula(basePc: number, octave: number, formula: readonly number[], transpose: number): number[] {
  return formula.map(iv => {
    const total = basePc + iv + transpose;
    const pc = ((total%12)+12)%12;
    const octShift = Math.floor((basePc + iv + transpose)/12);
    return midiFor(pc, octave + octShift);
  });
}

/**
 * The five notes of a piece for its rotation AND ITS REGIME.
 *
 * - `escala`: 0° → major pentatonic · 90° → minor · 180° → minor with blue note ·
 *   270° → major transposed +7. A rotation changes the material and not the order.
 * - `orden`: ALWAYS the major pentatonic, shifted `rot` positions. A rotation changes
 *   where the arpeggio starts and not the material: the piece has ONE set of five pitches
 *   in the four rotations, against the 43 sets that `escala` gives over the 48
 *   combinations.
 *
 * At rotation 0 the two return exactly the same, and not by chance: the fixed formula of
 * `orden` is that of rotation 0 of `escala`. That lets the ear compare the two regimes.
 * Without it they would be two instruments.
 *
 * `regimen` has NO default on purpose: a caller that forgets it would get one regime in
 * silence, and the two differ in 36 of the 48 combinations. The point is that the
 * typecheck catches it. It is the same criterion as `dur` and `rel` in `scheduleVoice`.
 *
 * The octave shift (`octShift`) is deliberate: when the sum passes B, the note goes UP
 * one octave and does not wrap, so the pieces with a high tonic open more register. It
 * keeps the arpeggio ascending: a wrap would break the contour with a jump down.
 *
 * ## Two MEASURED consequences of `orden`, written because they are audible
 *
 * The arpeggio does not always rise: a cyclic shift puts in a descent, and always the
 * same one. The top note comes back down **exactly 9 semitones**, because the ceiling of
 * `PENT_MAJOR` is 9 above the tonic, against a largest rise of 3 in `escala`. And the
 * register is 7 semitones narrower at the top (`C4..G#5` against `C4..D#6`), because the
 * fixed formula does not have the +7 transposition of rotation 3.
 *
 * Neither of the two is an effect to correct: they are direct consequences of the
 * request, to change the order with no change of the notes, and they are exactly what the
 * ear must judge. The variant that would avoid them is to adjust the octave of the notes
 * that wrap around: `D4 E4 G4 A4 C5` in place of `D4 E4 G4 A4 C4`, a conditional `+12` in
 * one line. It is rejected because it changes the MIDI notes although not the pitch
 * classes, and the request says no change of the notes. It is written here in case the
 * ear asks for it.
 */
export function notesForRotation(basePc: number, octave: number, rot: number, regimen: RegimenDeRotacion): number[]{
  if (regimen === REGIMEN.orden) {
    const base = notasDeFormula(basePc, octave, PENT_MAJOR, 0);
    // The shift uses a modulo and not a bare `base[j + rot]`: the type of `rotation` in
    // this module is an unbounded `number`, and without the modulo a value outside `0..3`
    // would return `undefined`, which `midiName` does not reject: it paints
    // `undefinedNaN` in the cell.
    //
    // The modulo is there TWICE because the `%` of JS keeps the sign of the dividend:
    // with a negative `rot`, `(j + rot) % 5` is negative and `base[-1]` is `undefined`
    // again, the same hole this line exists to close. The `+ largo` before the second `%`
    // brings it into range. Only then is it true that ANY `rot`, a negative one included,
    // gives a cyclic permutation, which is what `checkNotes` verifies. This is a net and
    // not the fix: the fix is a type that does not admit the value, and to bound it
    // crosses the package edge to `mcp-server/`, so it is a change of signature on the
    // two sides.
    const largo = base.length;
    return base.map((_n, j) => base[(((j + rot) % largo) + largo) % largo]);
  }
  let formula = PENT_MAJOR, transpose=0;
  if (rot===1) formula = PENT_MINOR;
  else if (rot===2) formula = PENT_BLUES5;
  else if (rot===3) { formula = PENT_MAJOR; transpose = 7; }
  return notasDeFormula(basePc, octave, formula, transpose);
}

/**
 * The arpeggio of a placed piece, IN THE ORDER IT SOUNDS: the five MIDI notes it fires,
 * with the retrograde applied if the piece is reflected.
 *
 * It is the whole derivation `(piece, rotation, reflection) -> notes`, and the ONLY place
 * that composes `BASE_MAP` + `notesForRotation` + the `reverse`. To compose it by hand is
 * easy: four copies of it existed at one time, and nothing kept them equal.
 *
 * **`PlacedPiece` does not carry the notes, and cannot carry them.** A stored field is a
 * datum that can contradict the piece: nothing prevents a `PlacedPiece` with
 * `rotation: 1` and the notes of rotation 0. The board, which derives, and the engine,
 * which would read the field, would then say different things. The derivation is cheap.
 * The contradiction is not.
 *
 * The reflection reverses the ORDER IN TIME and not which note belongs to which cell. So
 * the `reverse` applies to the result, and `notesForRotation` does not take `mirror`. A
 * caller that needs the note of ONE cell must index the ASCENDING arpeggio with the
 * degree, `notesForRotation(...)[degreeByCellIndex(...)[k]]`, as `cell-text.ts` does for
 * the board, and must not use this function.
 *
 * The octave is `DEFAULT_OCTAVE` and not a parameter: the whole app plays in one octave.
 * A caller that needs another (today only `describe_piece`, which exposes it as an
 * argument) uses `notesForRotation` directly.
 *
 * The REGIME is a parameter and passes through as it is. This function selects none: to
 * select one here would detach it from the one the board selected, and the same piece
 * would sound different for each caller.
 */
export function arpeggioFor(piece: PieceKey, rotation: number, mirror: boolean, regimen: RegimenDeRotacion): number[] {
  const asc = notesForRotation(BASE_MAP[piece], DEFAULT_OCTAVE, rotation, regimen);
  return mirror ? asc.reverse() : asc;
}

/**
 * Which degree of the arpeggio each cell of a shape owns. IT RETURNS BY INDEX: element
 * `k` is the degree (`0..n-1`) of `cells[k]`, not the reverse.
 *
 * **Degree `g` goes to the cell that the walk of `pathThroughCells` visits at position
 * `g`**: the arpeggio WALKS the piece and never passes over one of its own cells. The
 * preferred move is orthogonal. In the four pieces that admit no orthogonal walk (`F`,
 * `T`, `Y` and `X`, whose graph of cells is a tree with a node of 3 or 4 links) a
 * diagonal move is tolerated, which at least reaches a cell that touches the one before.
 *
 * The angular ring around the centroid knows nothing about which cells touch, so it comes
 * in as a TIE-BREAK and not as the order. Taken as the order it leaves, over the 48 moves
 * of the 12 pieces, **four that pass over** a cell that has not sounded yet (in `I`, `T`,
 * `U` and `Y`) and nine diagonals. The walk of `pathThroughCells` gives 0 and 5.
 *
 * The diagonal is tolerated ONLY inside the piece: the circuit between pieces
 * (`routeBetween`) moves only up, down, left and right. The asymmetry is on purpose.
 * Inside the piece the alternative is to pass over a cell. Outside, that problem does not
 * exist, because the circuit steps on and sounds every cell it passes.
 *
 * It takes the shape and not the `PieceKey` on purpose: that makes it testable on
 * arbitrary shapes, and keeps `music.ts` from knowing `SHAPES`.
 *
 * It takes the CANONICAL shape, not the transformed one. The mapping travels by index (a
 * rotation is a `map`, so cell `k` stays cell `k`), and this is the most expensive trap
 * of this module: on `p.cells`, which is rotated and translated, it compiles the same and
 * returns another mapping. With the walk this is not a GEOMETRIC necessity: a rotation
 * and a reflection keep which cells touch, so a walk is a walk in the 8 orientations. But
 * it stays the rule: the angular tie-break DOES depend on the orientation, and the travel
 * by index is what holds `ANCHOR_INDEX` and the gates of the circuit.
 *
 * ## Degree 0 is an end of the walk, not the center of the figure
 *
 * Degree 0 is **the end where the walk of the shape starts**. It is not the cell on the
 * centroid, although the center of a figure looks like its root. In the `I` that choice
 * is incompatible with a walk of the piece: a start at the center of a line of five
 * forces a jump of 4 cells that the shape does not need.
 *
 * Degree 0 is also the cell where the circuit ENTERS the piece (`gates`), but only
 * without reflection. With `mirror` the retrograde reverses the order in time, so the
 * first note that sounds, and so the entry gate, is that of degree `n-1`. A caller that
 * wants the position of a cell in the ORDER IN WHICH IT SOUNDS must ask
 * `playOrderByCellIndex`, the only function that knows the reflection. The degree answers
 * which NOTE the cell owns, a question that the reflection does not move.
 *
 * ## What the angular order does
 *
 * It BREAKS TIES and nothing more. But it applies in the 12 pieces, so it is not
 * decoration: a walk and its reverse are equally good, and the angular rank selects the
 * direction. `angularRank` holds that algorithm.
 *
 * That the SHAPE and not the board decides the direction is a rule of the instrument and
 * not a convenience of the implementation. The alternative was measured: to enter at the
 * end nearest to the piece before it in the circuit would shorten the cycle in 79 % of
 * the boards, by 10.4 % on average. It is rejected all the same, because to move a piece
 * would then change the arpeggio of its neighbors: **a piece must sound the same wherever
 * it is.**
 */
export function degreeByCellIndex(cells: readonly Cell[]): number[] {
  const orden = pathThroughCells(cells, angularRank(cells));
  const grados = new Array<number>(cells.length);
  // `pathThroughCells` returns the cell of each position. This is the inverse table: the
  // degree of each cell. The two are permutations of `0..n-1`, and to confuse them
  // compiles.
  orden.forEach((k, degree) => { grados[k] = degree; });
  return grados;
}

/**
 * The STEP of each cell of a shape: its position in the order in which the arpeggio
 * sounds.
 *
 * IT RETURNS BY INDEX, like `degreeByCellIndex`: element `k` is the step (`0..n-1`) of
 * `cells[k]`.
 *
 * It is the degree with the retrograde applied, and so **the only part of the
 * cell-to-note mapping that the reflection moves**. Without `mirror` the step IS the
 * degree. With `mirror` it is `n-1-degree`, because the reflection reverses the order IN
 * TIME and does not move which note belongs to which cell. It is the same rule that
 * `arpeggioFor` applies to the notes, applied here to the cells.
 *
 * The two things that the instrument shows and uses in the order of sound come from
 * here:
 *
 * - `cellsByPlayOrder`, and with it the GATES of the circuit (`gates`). A `reverse` of
 *   its own there would be a second copy of this rule.
 * - The number that `Board.tsx` paints in the corner of each cell. **Step 0 is always
 *   the cell where the circuit enters**, and from there the count rises to `n-1`, which
 *   is always the exit: in the 12 pieces, with and without reflection. With the degree
 *   that holds only without reflection: the reflected half of the placement space would
 *   be entered at `#4` and counted backward.
 *
 * The note of a cell is NOT asked with this. It is asked with the degree against the
 * ASCENDING arpeggio (`notesForRotation`). The two pairs are correct, and to cross them
 * compiles: `ascending[degree]` and `arpeggioFor(...)[step]` give the SAME note, but
 * `ascending[step]` gives the mirrored note in every reflected piece.
 */
export function playOrderByCellIndex(cells: readonly Cell[], mirror: boolean): number[] {
  const grados = degreeByCellIndex(cells);
  const ultimo = cells.length - 1;
  return mirror ? grados.map(g => ultimo - g) : grados;
}

/**
 * The angular rank of each cell around the centroid, BY INDEX: element `k` is the
 * position (`0..n-1`) of `cells[k]` in the ring.
 *
 * This order only BREAKS TIES between walks of equal quality (see `degreeByCellIndex`).
 * It is kept whole (the exception of the centroid, the clockwise direction and the
 * tie-break by index) because a change to it would change the direction of the walk of
 * each piece, which is audible.
 *
 * It is exported although `degreeByCellIndex` is its only consumer in `src/`: with no
 * export the tests would have to write those three decisions again to exercise them,
 * which is coverage with no verification.
 *
 * Three rules, in this order:
 *
 * 1. The cells ON the centroid leave the ring and take the first places. Only `I`, `X`
 *    and `Z` have one. The exception is not for looks: `Math.atan2(0, 0)` returns `0` IN
 *    SILENCE and would put them in the ring as if they were to the east.
 * 2. The rest is sorted by ascending angle around the centroid, which with the `y` axis
 *    down is clockwise on screen.
 * 3. At equal angle the SMALLER ORIGINAL INDEX wins. The tie-break applies in `F`, `I`
 *    and `T`, which have cells collinear with the centroid.
 *
 * The third criterion is WRITTEN in the comparator and not left to a stable `sort`:
 * stability is guaranteed since ES2019, but to rely on it would leave the rule said
 * nowhere.
 *
 * The angles are computed before and not inside the comparator: `sort` calls it
 * O(n log n) times, and to compare always the SAME number is what makes the epsilon of
 * the tie behave.
 *
 * ## Why the tie is compared by bucket and not with `Math.abs(a - b) < eps`
 *
 * Because "they are less than epsilon apart" is NOT transitive: with three angles
 * staggered at half the tolerance, `a` ties with `b` and `b` with `c` but `a` does not
 * tie with `c`, and such a comparator gives `sort` an order that depends on the pivot.
 * With the 12 shapes of `SHAPES` it does not occur, because the ties are exact: they come
 * from identical subtractions. But this function takes arbitrary shapes on purpose. To
 * round the angle to an integer count of buckets makes it a total order by construction:
 * two angles are in the same bucket or they are not, and that is transitive.
 */
export function angularRank(cells: readonly Cell[]): number[] {
  const cent = centroid(cells);

  const center: number[] = [];
  const ring: number[] = [];
  const bucket = new Array<number>(cells.length);

  for (let k = 0; k < cells.length; k++) {
    const dx = cells[k][0] - cent[0];
    const dy = cells[k][1] - cent[1];
    if (Math.hypot(dx, dy) < DEGREE_EPSILON) {
      center.push(k);
    } else {
      bucket[k] = Math.round(angleFromCentroid(cells[k], cent) / DEGREE_EPSILON);
      ring.push(k);
    }
  }

  ring.sort((a, b) => bucket[a] === bucket[b] ? a - b : bucket[a] - bucket[b]);

  const rank = new Array<number>(cells.length);
  [...center, ...ring].forEach((k, posicion) => { rank[k] = posicion; });
  return rank;
}
