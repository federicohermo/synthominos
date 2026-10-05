import { useEffect } from 'react';
import type { RefObject } from 'react';
import { accionDeTecla, frenaElDefault, abreTapLimpio, piezaDeTecla, ACCION } from './input.ts';
import type { PieceKey } from '../pieces/pieces.ts';

interface Acciones {
  rotar: () => void;
  reflejar: () => void;
  transporte: () => void;
  seleccionar: (pieza: PieceKey) => void;
}

export function useAtajosDeTeclado(acciones: Acciones, tapLimpio: RefObject<boolean>): void {
  const { rotar, reflejar, transporte, seleccionar } = acciones;

  useEffect(()=>{
    const esControl = (t: EventTarget | null) =>
      t instanceof HTMLButtonElement || t instanceof HTMLInputElement;

    // The events of `window` arrive with `e.target === window`, which has no `closest`.
    const esCelda = (t: EventTarget | null) =>
      t instanceof Element && t.closest('[role="gridcell"]') !== null;

    const despachar = (e: KeyboardEvent, tipo: 'keydown' | 'keyup') => {
      const evento = {
        key: e.key, tipo, repeat: e.repeat,
        ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        targetEsControl: esControl(e.target),
        targetEsCelda: esCelda(e.target),
        tapLimpio: tapLimpio.current,
      };
      if (frenaElDefault(evento)) e.preventDefault();
      const accion = accionDeTecla(evento);
      if (accion === null) return;
      const pieza = piezaDeTecla(e.key);
      if (accion === ACCION.rotar) rotar();
      else if (accion === ACCION.reflejar) reflejar();
      else if (pieza !== null) seleccionar(pieza);
      else transporte();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      tapLimpio.current = abreTapLimpio(e);
      despachar(e, 'keydown');
    };
    const onKeyUp = (e: KeyboardEvent) => despachar(e, 'keyup');

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return ()=>{
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [rotar, reflejar, transporte, seleccionar, tapLimpio]);
}

/** React registers `wheel` as passive: `preventDefault()` in an `onWheel` prop does nothing. */
export function useRuedaRota(
  nodo: RefObject<HTMLDivElement | null>,
  alRotar: (deltaY: number) => void,
  tapLimpio: RefObject<boolean>,
): void {
  useEffect(()=>{
    const elemento = nodo.current;
    if (!elemento) return;
    const onWheel = (e: WheelEvent) => {
      // Before the guards: `Ctrl` and the wheel must break the tap, or the `keyup` of `Ctrl`
      // reflects the piece.
      tapLimpio.current = false;
      // `Ctrl` and the wheel are the browser zoom.
      if (e.ctrlKey) return;
      // A `deltaY` of 0 is a pure horizontal scroll.
      if (e.deltaY === 0) return;
      e.preventDefault();
      alRotar(e.deltaY);
    };
    elemento.addEventListener('wheel', onWheel, { passive: false });
    return ()=> elemento.removeEventListener('wheel', onWheel);
  }, [nodo, alRotar, tapLimpio]);
}
