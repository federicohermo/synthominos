import type { Cell } from './transform.ts';
import type { PieceKey } from './pieces.ts';
import { rotate90, normalize, rotateN, reflect } from './transform.ts';
import {
  notesForRotation,
  BASE_MAP,
  CHROMATIC,
  DEFAULT_OCTAVE,
  NOTES_PER_PIECE,
  REGIMEN,
} from '../musical-model/music.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from './pieces.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';

/**
 * The seven checks of the model.
 *
 * The space is the 96 combinations of piece x rotation x reflection, but each check
 * covers what belongs to it and not the 96 by habit. `checkArrayOrder` and `checkAnchors`
 * do cover the 96: they are the geometric ones, and the orientation is exactly what can
 * break them. `checkNotes` covers 96 too (12 pieces x 4 rotations x 2 REGIMES; the
 * reflection stays out because it only reverses the order). `checkShapes` covers the 12
 * canonical shapes, because a rotation changes neither the count of cells nor the
 * connection. `checkDistinct` and `checkLetters` cover the 96: they need the 8
 * orientations of each shape to reduce it to its canonical key. `checkBaseMap` covers
 * the set once.
 *
 * Five of the seven look at each piece alone, by its SHAPE. `checkBaseMap` does compare
 * pieces, but by their TONIC. The other two are the only ones that go outside one piece.
 * `checkDistinct` compares two SHAPES at a time, so it is the only one that can see a `Z`
 * that is the reflected `N`. `checkLetters` compares each shape with an EXTERNAL table,
 * and is the only one that can see two letters swapped: a swap leaves the set of the 12
 * keys intact, so it passes `checkDistinct`.
 *
 * They RETURN the result and do not throw or assert. So the test of this module and the
 * tool `check_invariants` of the MCP server use them the same way: the tool must answer
 * with the detail and not die.
 *
 * What they cover is not cosmetic. The first one, the order of the array, is the most
 * dangerous rule of the repo: to break it misplaces the pieces and puts the loops out of
 * phase **with no visible error**.
 */

/**
 * The four rotations that `checkNotes` and `checkArrayOrder` cover.
 *
 * They are written and not derived from a `ROTATION_COUNT`: the repo has no such
 * constant, and the number 4 is not a parameter. It is the arithmetic of the quarter
 * turn: `rotate90` applied four times is the identity. The REGIMES are a parameter, so
 * they come from `Object.values(REGIMEN)` in this module: a third regime must enter the
 * check with no edit here, and a fifth rotation does not exist.
 *
 * They are indices and not angles: `rotateN` and `notesForRotation` take indices.
 */
export const ROTATIONS = [0, 1, 2, 3];

/**
 * The 12 pentominoes by their letter, written FROM THE STANDARD DEFINITION and not
 * derived from `SHAPES`.
 *
 * It is useful only because it is an EXTERNAL reference: `checkLetters` compares it with
 * `SHAPES`, and a table derived from `SHAPES` would check itself. That is the difference
 * between a check that catches a `Z` that is the reflected `N` and one that cannot see
 * it, like every check that looks at one shape at a time.
 *
 * They come from the naming of Golomb and Conway, which names each pentomino by the
 * letter it looks like. They are copied **as drawings**, so that an audit runs nothing:
 * each cell is `[x, y]` with `y` growing DOWN, so the drawing reads from top to bottom.
 *
 * ```text
 *   F      I      L      N      P      T      U      V      W      X      Y      Z
 *  .FF     I      L.     .N     PP    TTT    U.U    V..    W..    .X.    .Y     ZZ.
 *  FF.     I      L.     .N     PP    .T.    UUU    V..    WW.    XXX    YY     .Z.
 *  .F.     I      L.     NN     P.    .T.           VVV    .WW    .X.    .Y     .ZZ
 *          I      LL     N.                                              .Y
 *          I
 * ```
 *
 * The CHIRALITY does not have to be fixed, so no note says which of the two enantiomers
 * each one is. The comparison is by canonical key, which collapses the 8 orientations, so
 * the `L` and the `J` have the same key, and so do the `N` and the `S`, and the `F` and
 * its mirror image. That is correct and not a concession: the app generates the other 7
 * orientations of each piece live, so `SHAPES` holds one representative and not a
 * privileged shape.
 */
export const PENTOMINOS_CANONICOS: Record<PieceKey, Cell[]> = {
  F: [[1,0],[2,0],[0,1],[1,1],[1,2]],
  I: [[0,0],[0,1],[0,2],[0,3],[0,4]],
  L: [[0,0],[0,1],[0,2],[0,3],[1,3]],
  N: [[1,0],[1,1],[0,2],[1,2],[0,3]],
  P: [[0,0],[1,0],[0,1],[1,1],[0,2]],
  T: [[0,0],[1,0],[2,0],[1,1],[1,2]],
  U: [[0,0],[2,0],[0,1],[1,1],[2,1]],
  V: [[0,0],[0,1],[0,2],[1,2],[2,2]],
  W: [[0,0],[0,1],[1,1],[1,2],[2,2]],
  X: [[1,0],[0,1],[1,1],[2,1],[1,2]],
  Y: [[1,0],[0,1],[1,1],[1,2],[1,3]],
  Z: [[0,0],[1,0],[1,1],[1,2],[2,2]],
};

export interface CheckResult {
  name: string;
  ok: boolean;
  failures: string[];
}

const PIECES = Object.keys(SHAPES) as PieceKey[];
// The two regimes come from `REGIMEN` and are not listed by hand: a third one enters
// `checkNotes` with no edit, and is not left with no check that looks at it.
const REGIMENES: RegimenDeRotacion[] = Object.values(REGIMEN);

/**
 * A comparison of cells that does not tell `-0` from `0`.
 *
 * The raw `rotate90` negates the coordinate, so it gives `-0` when the coordinate is 0,
 * and both `toEqual` and `deepStrictEqual` tell `-0` from `0`. To add 0 collapses them:
 * `-0 + 0` is `+0`.
 */
const sameCell = (a: Cell, b: Cell): boolean => a[0] + 0 === b[0] + 0 && a[1] + 0 === b[1] + 0;

const result = (name: string, failures: string[]): CheckResult =>
  ({ name, ok: failures.length === 0, failures });

/** Applies to a shape the same chain as the UI: `rotateN`, and then the reflection. */
function transformShape(cells: Cell[], rotation: number, mirror: boolean): Cell[] {
  const r = rotateN(cells, rotation);
  return mirror ? reflect(r) : r;
}

/**
 * Where each cell must be, rebuilt **cell by cell**.
 *
 * It applies the raw primitives (`rotate90` k times, the negation of the reflection) and
 * normalizes ONCE at the end. It does not go through `rotateN` or `reflect`. That gives
 * the check its value: if the composed function filtered, sorted or regrouped cells, this
 * rebuild would not, and the indices would stop matching.
 *
 * It is no accident that a normalization at each step and one at the end give the same
 * result: the normalization is a translation, and a translation commutes with the
 * rotation up to another translation, which the last normalization absorbs.
 */
function expectedShape(cells: Cell[], rotation: number, mirror: boolean): Cell[] {
  let raw: Cell[] = cells.map(([x, y]): Cell => [x, y]);
  for (let i = 0; i < rotation; i++) raw = rotate90(raw);
  if (mirror) raw = raw.map(([x, y]): Cell => [-x, y]);
  return normalize(raw);
}

/**
 * 1. Array order: the cell at index `k` after a transformation is the image of the
 *    original cell `k`.
 *
 * The check rebuilds the transformation **cell by cell**, with the same translation that
 * the whole function applied. If `rotateN` filtered, sorted or regrouped, cell `k` would
 * stop matching its image and the check would fail. It is the only way to assert the
 * property, because the set of cells is the same when the order changes.
 */
export function checkArrayOrder(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    for (const rot of ROTATIONS) {
      for (const mirror of [false, true]) {
        const got = transformShape(SHAPES[p], rot, mirror);
        const expected = expectedShape(SHAPES[p], rot, mirror);

        for (let k = 0; k < got.length; k++) {
          if (!sameCell(got[k], expected[k])) {
            failures.push(
              `${p} rot${rot}${mirror ? ' mirror' : ''}: celda ${k} es ` +
              `(${got[k]}) y deberia ser (${expected[k]})`,
            );
          }
        }
      }
    }
  }
  return result('orden del array', failures);
}

/**
 * 2. Grip cell: `ANCHOR_INDEX[p]` is in range, and its transformed cell is the image of
 *    the original grip cell.
 *
 * It is a corollary of check 1, and is checked apart on purpose. The click falls where
 * the user pointed because of this property: the grip cell travels as an INDEX and is
 * resolved against `PlacedPiece.cells`.
 */
export function checkAnchors(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const idx = ANCHOR_INDEX[p];
    if (!Number.isInteger(idx) || idx < 0 || idx >= SHAPES[p].length) {
      failures.push(`${p}: ANCHOR_INDEX ${idx} fuera de [0, ${SHAPES[p].length})`);
      continue;
    }
    for (const rot of ROTATIONS) {
      for (const mirror of [false, true]) {
        const got = transformShape(SHAPES[p], rot, mirror)[idx];
        const expected = expectedShape(SHAPES[p], rot, mirror)[idx];

        if (!sameCell(got, expected)) {
          failures.push(
            `${p} rot${rot}${mirror ? ' mirror' : ''}: el ancla quedo en ` +
            `(${got}) y deberia estar en (${expected})`,
          );
        }
      }
    }
  }
  return result('ancla', failures);
}

/** 3. Shapes: 5 cells, none repeated, connected by sides. */
export function checkShapes(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const cells = SHAPES[p];
    if (cells.length !== CELLS_PER_PIECE) {
      failures.push(`${p}: tiene ${cells.length} celdas y deberia tener ${CELLS_PER_PIECE}`);
    }

    const keys = cells.map(([x, y]) => `${x},${y}`);
    if (new Set(keys).size !== keys.length) failures.push(`${p}: tiene celdas repetidas`);

    if (!isConnected(cells)) failures.push(`${p}: no es conexa por lados`);
  }
  return result('formas', failures);
}

/** A breadth-first search over the 4 cells that share a side: a diagonal does not connect a pentomino. */
function isConnected(cells: Cell[]): boolean {
  if (cells.length === 0) return true;
  const keys = new Set(cells.map(([x, y]) => `${x},${y}`));
  const seen = new Set<string>([`${cells[0][0]},${cells[0][1]}`]);
  const queue: Cell[] = [cells[0]];

  while (queue.length > 0) {
    // The `!` comes with its reason, which is the rule of the repo: the condition of the
    // `while` above guarantees a queue that is not empty, and TypeScript cannot relate
    // `length` to what `shift()` returns. The other way out, an `if (!c) continue`, would
    // be an unreachable branch: a line not covered, against the threshold of 100.
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (keys.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push([x + dx, y + dy]);
      }
    }
  }
  return seen.size === keys.size;
}

/** 4. `BASE_MAP`: a bijection onto the 12 pitch classes. */
export function checkBaseMap(): CheckResult {
  const failures: string[] = [];
  const pcs = PIECES.map(p => BASE_MAP[p]);

  if (pcs.length !== CHROMATIC.length) {
    failures.push(`hay ${pcs.length} piezas para ${CHROMATIC.length} clases de altura`);
  }
  if (new Set(pcs).size !== pcs.length) failures.push('dos piezas comparten tonica');
  for (const p of PIECES) {
    const pc = BASE_MAP[p];
    if (!Number.isInteger(pc) || pc < 0 || pc >= CHROMATIC.length) {
      failures.push(`${p}: tonica ${pc} fuera de [0, ${CHROMATIC.length})`);
    }
  }
  return result('BASE_MAP', failures);
}

/**
 * 5. Notes: 5 distinct ones BEFORE the retrograde, as many as the cells of a piece, and
 *    in the order that the REGIME guarantees.
 *
 * The middle part: `degreeByCellIndex` pairs the two lists by index, so `NOTES_PER_PIECE`
 * and `CELLS_PER_PIECE` MUST be equal. Without this check, a formula of 4 notes with
 * `NOTES_PER_PIECE = 4` passes every other check and every test, and the cell of degree 4
 * renders `undefinedNaN`: `midiName(undefined)` does not throw, it returns garbage.
 *
 * ## Why the order check is SPLIT by regime
 *
 * Strictly ascending is a property of the scale regime and not of the model. The four
 * formulas rise, but a cyclic shift of the arpeggio puts in a descent by design.
 * Measured: strictly ascending fails in **36 of the 48** combinations of the order
 * regime. Applied to the 96, it would leave `check_invariants` failing BY DESIGN, and a
 * check that fails by design gets turned off whole, which is worse than no check.
 *
 * In the order regime the equivalent and stronger check is that the arpeggio IS a cyclic
 * permutation of the one at rotation 0. It implies what ascending implies (the five
 * notes, none repeated) and it also ties the shift, which is what this regime adds. It
 * still catches the case this check exists for: a wrong shift that leaves a gap and
 * paints it as `undefinedNaN`.
 *
 * What holds in the two regimes, `length` and "none repeated", stays shared.
 */
export function checkNotes(): CheckResult {
  const failures: string[] = [];
  // The two are literals (`5`), so TypeScript knows that the comparison is false and
  // narrows them to `never` inside the `if`. The check is NOT spare: it exists for the
  // day that one of the two changes, which is when the model breaks with no noise. But to
  // interpolate a `never` is the one thing `restrict-template-expressions` does not
  // forgive, and rightly: it says that text can never be produced. Read through a
  // `number` variable, the `if` is a comparison of numbers again and the message is
  // reachable.
  const notas: number = NOTES_PER_PIECE;
  const celdas: number = CELLS_PER_PIECE;
  if (notas !== celdas) {
    failures.push(
      `NOTES_PER_PIECE (${notas}) y CELLS_PER_PIECE (${celdas}) ` +
      'tienen que ser iguales: cada celda dispara su nota',
    );
  }
  for (const p of PIECES) {
    for (const regimen of REGIMENES) {
      // The arpeggio at rotation 0, which in the order regime is the reference of the
      // shift. It is asked once for each piece and not once for each rotation: it is the
      // same in the four.
      const referencia = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, regimen);

      // This is NOT redundant with the shift check below. That check is RELATIVE to
      // rotation 0, so a uniform shift (`rot + 1` in place of `rot`) moves the reference
      // with the rest and passes unseen. Measured: the mutation `(j + rot + 1)` in
      // `notesForRotation` leaves `checkNotes` passing without this check. What fixes it
      // is that rotation 0 of the order regime is the major pentatonic of the tonic, the
      // same as in the scale regime. That is also the property that makes the comparison
      // of the two auditable.
      if (regimen === REGIMEN.orden) {
        const enEscala = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala);
        if (referencia.join() !== enEscala.join()) {
          failures.push(
            `${p} rot0: los dos regimenes tienen que dar lo mismo a rotacion 0 ` +
            `(escala ${enEscala.join(',')} vs orden ${referencia.join(',')})`,
          );
        }
      }

      for (const rot of ROTATIONS) {
        const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, regimen);
        if (ns.length !== NOTES_PER_PIECE) {
          failures.push(`${p} rot${rot} [${regimen}]: ${ns.length} notas y deberian ser ${NOTES_PER_PIECE}`);
        }
        if (new Set(ns).size !== ns.length) failures.push(`${p} rot${rot} [${regimen}]: tiene notas repetidas`);

        if (regimen === REGIMEN.escala) {
          for (let i = 1; i < ns.length; i++) {
            if (ns[i] <= ns[i - 1]) {
              failures.push(`${p} rot${rot} [${regimen}]: la nota ${i} (${ns[i]}) no supera a la anterior (${ns[i - 1]})`);
            }
          }
        } else {
          // The shift is SEARCHED and not assumed, and then compared with `rot`. So the
          // check verifies two things apart: that it is a cyclic permutation, and that
          // the shift is the one asked for. To compute the arpeggio again and compare it
          // with itself would verify nothing.
          const desplazamiento = referencia.indexOf(ns[0]);
          if (desplazamiento < 0) {
            failures.push(`${p} rot${rot} [${regimen}]: arranca en ${ns[0]}, que no esta en el arpegio de rotacion 0`);
          } else {
            for (let i = 0; i < ns.length; i++) {
              const esperada = referencia[(desplazamiento + i) % referencia.length];
              if (ns[i] !== esperada) {
                failures.push(`${p} rot${rot} [${regimen}]: la nota ${i} (${ns[i]}) rompe la permutacion ciclica, deberia ser ${esperada}`);
              }
            }
            const pedido = rot % referencia.length;
            if (desplazamiento !== pedido) {
              failures.push(`${p} rot${rot} [${regimen}]: corrido ${desplazamiento} posiciones y deberian ser ${pedido}`);
            }
          }
        }
      }
    }
  }
  return result('notas', failures);
}

/**
 * The canonical key of a shape: the smallest of its 8 orientations, serialized.
 *
 * It sorts the cells before it joins them because its two consumers, `checkDistinct` and
 * `checkLetters`, look at the SET and not at the order. `checkArrayOrder` covers the
 * order. It adds 0 to each coordinate for the same reason as `sameCell`: `rotate90` gives
 * `-0`, and `-0` does not serialize like `0`.
 *
 * It is not exported, on purpose: the two checks that use it are in this module, and a
 * second copy of this logic outside would go out of step.
 */
function canonicalKey(cells: Cell[]): string {
  const variantes: string[] = [];
  for (const rot of ROTATIONS) {
    for (const mirror of [false, true]) {
      const t = transformShape(cells, rot, mirror);
      variantes.push(t.map(([x, y]) => `${x + 0},${y + 0}`).sort().join(' '));
    }
  }
  return variantes.sort()[0];
}

/**
 * 6. Distinct pieces: the 12 shapes are 12 DISTINCT pentominoes, up to rotation and
 *    reflection.
 *
 * Without it, a `Z` written as `[[0,1],[1,1],[1,0],[2,0],[3,0]]`, which is the reflected
 * `N`, is accepted. It passes `checkShapes` (five cells, none repeated, connected), and
 * `checkArrayOrder`, `checkAnchors`, `checkBaseMap` and `checkNotes` too, because none of
 * them compares two SHAPES: the only one that compares pieces is `checkBaseMap`, by their
 * tonic, and the `Z` and the `N` have different tonics. The board then has eleven
 * pentominoes and one repeated, and only the drawing shows it. This occurred: the bug
 * lived from the first commit.
 *
 * The comparison is by canonical key and not by pairs: 12 keys against 66 pairs, and
 * above all the message names the OTHER piece, which is the datum that the fix needs.
 */
export function checkDistinct(): CheckResult {
  const failures: string[] = [];
  const porClave = new Map<string, PieceKey>();

  for (const p of PIECES) {
    const clave = canonicalKey(SHAPES[p]);
    const previa = porClave.get(clave);
    if (previa === undefined) porClave.set(clave, p);
    else failures.push(`${p}: es la misma forma que ${previa} rotada o reflejada`);
  }
  return result('piezas distintas', failures);
}

/**
 * 7. Letters: each shape is the pentomino THAT ITS LETTER NAMES, and not only one that
 *    differs from the other eleven.
 *
 * `checkDistinct` leaves this gap open: a SWAP of two letters passes it, because the set
 * of the 12 keys does not change and `checkDistinct` has nothing to complain about.
 * Measured with `L` and `Y` swapped in `SHAPES`: `checkDistinct` passes with 0 failures
 * and this check reports 2.
 *
 * The eye does not catch it either. The letter gives the piece its tonic through
 * `BASE_MAP`, so two swapped letters sound swapped, and the only symptom is that the
 * piece that looks like an `L` plays the note of the `Y`.
 *
 * The comparison is with `PENTOMINOS_CANONICOS`, written from the standard naming: if the
 * table came from `SHAPES`, the check would check itself. And it uses `canonicalKey` and
 * not a second copy of that logic, which would go out of step: that is exactly the family
 * of bug this file hunts. A degenerate `canonicalKey` is not a shared blind spot: a key
 * that collapsed different shapes would leave this check passing but would make
 * `checkDistinct` fail, because the 12 would share one key.
 */
export function checkLetters(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const esperada = canonicalKey(PENTOMINOS_CANONICOS[p]);
    const tiene = canonicalKey(SHAPES[p]);
    if (tiene !== esperada) {
      // The message names the letter that the shape IS, when that letter exists: it is
      // the datum that turns "the Z is wrong" into "the Z is the N", which was the real
      // bug.
      const enRealidad = PIECES.find(otra => canonicalKey(PENTOMINOS_CANONICOS[otra]) === tiene);
      failures.push(
        `${p}: no es el pentomino ${p}, ` +
        (enRealidad === undefined ? 'ni ningun otro de los 12' : `es el ${enRealidad}`),
      );
    }
  }
  return result('letras', failures);
}

/** The seven at once. The tool `check_invariants` consumes this. */
export function checkAll(): CheckResult[] {
  return [
    checkArrayOrder(), checkAnchors(), checkShapes(), checkBaseMap(), checkNotes(),
    checkDistinct(), checkLetters(),
  ];
}
