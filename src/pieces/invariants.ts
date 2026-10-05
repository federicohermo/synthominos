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

export const ROTATIONS = [0, 1, 2, 3];

/** Written from the standard naming and not derived from `SHAPES`: `checkLetters` needs an external reference. */
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
const REGIMENES: RegimenDeRotacion[] = Object.values(REGIMEN);

/** `rotate90` gives `-0`, and to add 0 makes it `+0`. */
const sameCell = (a: Cell, b: Cell): boolean => a[0] + 0 === b[0] + 0 && a[1] + 0 === b[1] + 0;

const result = (name: string, failures: string[]): CheckResult =>
  ({ name, ok: failures.length === 0, failures });

/** The same chain as the UI: `rotateN`, and then the reflection. */
function transformShape(cells: Cell[], rotation: number, mirror: boolean): Cell[] {
  const r = rotateN(cells, rotation);
  return mirror ? reflect(r) : r;
}

/** It uses the raw primitives and not `rotateN` or `reflect`: a reorder inside those shows as a mismatch. */
function expectedShape(cells: Cell[], rotation: number, mirror: boolean): Cell[] {
  let raw: Cell[] = cells.map(([x, y]): Cell => [x, y]);
  for (let i = 0; i < rotation; i++) raw = rotate90(raw);
  if (mirror) raw = raw.map(([x, y]): Cell => [-x, y]);
  return normalize(raw);
}

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
              `${p} rot${rot}${mirror ? ' mirror' : ''}: cell ${k} is ` +
              `(${got[k]}) and must be (${expected[k]})`,
            );
          }
        }
      }
    }
  }
  return result('array order', failures);
}

export function checkAnchors(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const idx = ANCHOR_INDEX[p];
    if (!Number.isInteger(idx) || idx < 0 || idx >= SHAPES[p].length) {
      failures.push(`${p}: ANCHOR_INDEX ${idx} is outside [0, ${SHAPES[p].length})`);
      continue;
    }
    for (const rot of ROTATIONS) {
      for (const mirror of [false, true]) {
        const got = transformShape(SHAPES[p], rot, mirror)[idx];
        const expected = expectedShape(SHAPES[p], rot, mirror)[idx];

        if (!sameCell(got, expected)) {
          failures.push(
            `${p} rot${rot}${mirror ? ' mirror' : ''}: the grip cell is at ` +
            `(${got}) and must be at (${expected})`,
          );
        }
      }
    }
  }
  return result('grip cell', failures);
}

export function checkShapes(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const cells = SHAPES[p];
    if (cells.length !== CELLS_PER_PIECE) {
      failures.push(`${p}: has ${cells.length} cells and must have ${CELLS_PER_PIECE}`);
    }

    const keys = cells.map(([x, y]) => `${x},${y}`);
    if (new Set(keys).size !== keys.length) failures.push(`${p}: has a repeated cell`);

    if (!isConnected(cells)) failures.push(`${p}: is not connected by sides`);
  }
  return result('shapes', failures);
}

function isConnected(cells: Cell[]): boolean {
  if (cells.length === 0) return true;
  const keys = new Set(cells.map(([x, y]) => `${x},${y}`));
  const seen = new Set<string>([`${cells[0][0]},${cells[0][1]}`]);
  const queue: Cell[] = [cells[0]];

  while (queue.length > 0) {
    // The `while` guarantees a queue that is not empty: TypeScript cannot relate `length` to `shift()`.
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

export function checkBaseMap(): CheckResult {
  const failures: string[] = [];
  const pcs = PIECES.map(p => BASE_MAP[p]);

  if (pcs.length !== CHROMATIC.length) {
    failures.push(`${pcs.length} pieces for ${CHROMATIC.length} pitch classes`);
  }
  if (new Set(pcs).size !== pcs.length) failures.push('two pieces share a tonic');
  for (const p of PIECES) {
    const pc = BASE_MAP[p];
    if (!Number.isInteger(pc) || pc < 0 || pc >= CHROMATIC.length) {
      failures.push(`${p}: tonic ${pc} is outside [0, ${CHROMATIC.length})`);
    }
  }
  return result('BASE_MAP', failures);
}

export function checkNotes(): CheckResult {
  const failures: string[] = [];
  // Read through a `number`: the two literals narrow to `never` inside the `if`, and a
  // template cannot take a `never`.
  const notas: number = NOTES_PER_PIECE;
  const celdas: number = CELLS_PER_PIECE;
  if (notas !== celdas) {
    failures.push(
      `NOTES_PER_PIECE (${notas}) and CELLS_PER_PIECE (${celdas}) ` +
      'must be equal: each cell fires its note',
    );
  }
  for (const p of PIECES) {
    for (const regimen of REGIMENES) {
      const referencia = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, regimen);

      // The shift check below is relative to rotation 0, so a uniform shift passes it. This one
      // fixes rotation 0.
      if (regimen === REGIMEN.orden) {
        const enEscala = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala);
        if (referencia.join() !== enEscala.join()) {
          failures.push(
            `${p} rot0: the two regimes must give the same notes at rotation 0 ` +
            `(escala ${enEscala.join(',')} vs orden ${referencia.join(',')})`,
          );
        }
      }

      for (const rot of ROTATIONS) {
        const ns = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, rot, regimen);
        if (ns.length !== NOTES_PER_PIECE) {
          failures.push(`${p} rot${rot} [${regimen}]: ${ns.length} notes and must be ${NOTES_PER_PIECE}`);
        }
        if (new Set(ns).size !== ns.length) failures.push(`${p} rot${rot} [${regimen}]: has a repeated note`);

        if (regimen === REGIMEN.escala) {
          for (let i = 1; i < ns.length; i++) {
            if (ns[i] <= ns[i - 1]) {
              failures.push(`${p} rot${rot} [${regimen}]: note ${i} (${ns[i]}) is not above the note before it (${ns[i - 1]})`);
            }
          }
        } else {
          const desplazamiento = referencia.indexOf(ns[0]);
          if (desplazamiento < 0) {
            failures.push(`${p} rot${rot} [${regimen}]: starts at ${ns[0]}, which is not in the arpeggio of rotation 0`);
          } else {
            for (let i = 0; i < ns.length; i++) {
              const esperada = referencia[(desplazamiento + i) % referencia.length];
              if (ns[i] !== esperada) {
                failures.push(`${p} rot${rot} [${regimen}]: note ${i} (${ns[i]}) breaks the cyclic permutation, it must be ${esperada}`);
              }
            }
            const pedido = rot % referencia.length;
            if (desplazamiento !== pedido) {
              failures.push(`${p} rot${rot} [${regimen}]: shifted ${desplazamiento} positions and must be ${pedido}`);
            }
          }
        }
      }
    }
  }
  return result('notes', failures);
}

/** `+ 0` turns the `-0` of `rotate90` into `0`: the two serialize differently. */
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

export function checkDistinct(): CheckResult {
  const failures: string[] = [];
  const porClave = new Map<string, PieceKey>();

  for (const p of PIECES) {
    const clave = canonicalKey(SHAPES[p]);
    const previa = porClave.get(clave);
    if (previa === undefined) porClave.set(clave, p);
    else failures.push(`${p}: is the same shape as ${previa}, rotated or reflected`);
  }
  return result('distinct pieces', failures);
}

export function checkLetters(): CheckResult {
  const failures: string[] = [];
  for (const p of PIECES) {
    const esperada = canonicalKey(PENTOMINOS_CANONICOS[p]);
    const tiene = canonicalKey(SHAPES[p]);
    if (tiene !== esperada) {
      const enRealidad = PIECES.find(otra => canonicalKey(PENTOMINOS_CANONICOS[otra]) === tiene);
      failures.push(
        `${p}: is not the pentomino ${p}, ` +
        (enRealidad === undefined ? 'and no other of the 12' : `it is the ${enRealidad}`),
      );
    }
  }
  return result('letters', failures);
}

export function checkAll(): CheckResult[] {
  return [
    checkArrayOrder(), checkAnchors(), checkShapes(), checkBaseMap(), checkNotes(),
    checkDistinct(), checkLetters(),
  ];
}
