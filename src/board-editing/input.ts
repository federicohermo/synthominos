import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { Rotacion } from '../pieces/orientation.ts';
import type { PlacedPiece } from './placement.ts';

export type Accion = (typeof ACCION)[keyof typeof ACCION];

export type Edicion = (typeof EDICION)[keyof typeof EDICION];

export interface EventoDeTecla {
  key: string;
  tipo: 'keydown' | 'keyup';
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** The focus is on a `<button>` or an `<input>`. */
  targetEsControl: boolean;
  targetEsCelda: boolean;
  /** While the modifier was down, no other key and no wheel event arrived. */
  tapLimpio: boolean;
}

export interface EventoDeModificador {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export const ACCION = {
  rotar: 'rotar',
  reflejar: 'reflejar',
  transporte: 'transporte',
  seleccionar: 'seleccionar',
} as const;

export const EDICION = {
  quitar: 'quitar',
  mutear: 'mutear',
  colocar: 'colocar',
  colocarMuteada: 'colocar-muteada',
} as const;

export function rotacionPorRueda(rotation: Rotacion, deltaY: number): Rotacion {
  const delta = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
  // In JS `-1 % 4` is `-1`: the `+ 4` keeps the index in range. TypeScript does not narrow `%`.
  return ((rotation + 4 + delta) % 4) as Rotacion;
}

export function siguienteRotacion(rotation: Rotacion): Rotacion {
  return rotacionPorRueda(rotation, 1);
}

/** `Ctrl`+`Shift`, the layout shortcut of Windows, has no third key: a second modifier starts no tap. */
export function abreTapLimpio(e: EventoDeModificador): boolean {
  const otroAbajo = (e.key !== 'Shift' && e.shiftKey)
    || (e.key !== 'Control' && e.ctrlKey)
    || e.altKey || e.metaKey;
  return (e.key === 'Shift' || e.key === 'Control') && !otroAbajo;
}

/** A type predicate: `in` narrows the object and not the key. */
function esPieza(k: string): k is PieceKey {
  return k in SHAPES;
}

export function piezaDeTecla(key: string): PieceKey | null {
  const letra = key.toUpperCase();
  return esPieza(letra) ? letra : null;
}

/** A focused cell vetoes the space bar only: `Shift` and `Ctrl` must still rotate and reflect there. */
export function accionDeTecla(e: EventoDeTecla): Accion | null {
  if (e.targetEsControl) return null;
  if (e.repeat) return null;

  if (e.key === 'Shift') return e.tipo === 'keyup' && e.tapLimpio ? ACCION.rotar : null;
  if (e.key === 'Control') return e.tipo === 'keyup' && e.tapLimpio ? ACCION.reflejar : null;
  if (e.key === ' ') return e.tipo === 'keydown' && !e.targetEsCelda ? ACCION.transporte : null;

  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // In a `Ctrl`+`V` that releases `Ctrl` first, the `keyup` of `V` arrives with `ctrlKey: false`.
  if (e.tipo !== 'keydown') return null;
  return piezaDeTecla(e.key) === null ? null : ACCION.seleccionar;
}

/** Each repeated `keydown` of the space bar brings its own scroll default: `repeat` does not veto this. */
export function frenaElDefault(e: EventoDeTecla): boolean {
  return !e.targetEsControl && e.key === ' ' && e.tipo === 'keydown';
}

/** On macOS `Ctrl`+click is a `contextmenu` with `ctrlKey: true`, and the `keyup` of `Ctrl` toggles too. */
export function reflejaElContextMenu(e: { ctrlKey: boolean }): boolean {
  return !e.ctrlKey;
}

export function esLaPiezaEnLaMano(ocupante: PlacedPiece | null, selected: PieceKey): boolean {
  return ocupante !== null && ocupante.piece === selected;
}

/** `colocar` does not promise a legal placement: the caller asks `isValid`. */
export function accionDeClick(ocupante: PlacedPiece | null, selected: PieceKey, altKey: boolean): Edicion | null {
  if (esLaPiezaEnLaMano(ocupante, selected)) return altKey ? EDICION.mutear : EDICION.quitar;
  if (ocupante !== null) return null;
  return altKey ? EDICION.colocarMuteada : EDICION.colocar;
}
