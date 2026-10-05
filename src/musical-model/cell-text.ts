import {
  degreeByCellIndex,
  playOrderByCellIndex,
  notesForRotation,
  midiName,
  BASE_MAP,
  DEFAULT_OCTAVE,
} from './music.ts';
import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { RegimenDeRotacion } from './music.ts';

export interface CellText {
  /** The position in the order of sound, `0..4`. A reflection moves it. */
  step: number;
  /** It comes from the degree. A reflection does not move it. */
  note: string;
}

const memo = new Map<string, readonly CellText[]>();

/** Element `k` belongs to `SHAPES[piece][k]`: the number comes from the step, the note from the degree. */
export function cellTextFor(piece: PieceKey, rotation: number, mirror: boolean, regimen: RegimenDeRotacion): readonly CellText[] {
  const key = `${piece}${rotation}${mirror}${regimen}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const arp = notesForRotation(BASE_MAP[piece], DEFAULT_OCTAVE, rotation, regimen);
  const pasos = playOrderByCellIndex(SHAPES[piece], mirror);
  const fresh: readonly CellText[] = degreeByCellIndex(SHAPES[piece])
    .map((degree, k) => ({ step: pasos[k], note: midiName(arp[degree]) }));
  memo.set(key, fresh);
  return fresh;
}
