import { SHAPES } from './pieces.ts';
import type { PieceKey } from './pieces.ts';

export type Rotacion = (typeof ROTACION)[keyof typeof ROTACION];

export interface Orientacion {
  rotation: Rotacion;
  mirror: boolean;
}

export type MemoriaDeOrientacion = Record<PieceKey, Orientacion>;

/** The values are the indices that `rotateN` counts: one quarter turn counterclockwise on screen each. */
export const ROTACION = { cero: 0, noventa: 1, ciento_ochenta: 2, doscientos_setenta: 3 } as const;

export const ORIENTACION_INICIAL: Orientacion = { rotation: ROTACION.cero, mirror: false };

export const ORIENTACIONES_INICIALES: MemoriaDeOrientacion = Object.fromEntries(
  (Object.keys(SHAPES) as PieceKey[]).map(p => [p, ORIENTACION_INICIAL]),
) as MemoriaDeOrientacion;
