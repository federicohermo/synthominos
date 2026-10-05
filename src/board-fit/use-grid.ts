import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { GRID_DEFAULT } from '../board-editing/placement.ts';
import type { Dims } from '../board-editing/placement.ts';
import { grillaPara } from './grid-fit.ts';

/** It reads the box, not `window.innerHeight`, which on iOS includes the browser bar. */
export function useGrilla(raizRef: RefObject<HTMLElement | null>): Dims {
  const [dims, setDims] = useState<Dims>(GRID_DEFAULT);

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    if (raiz === null) return;

    // With the unit: a bare number makes every `calc(var(--cell) * n)` invalid, with no error.
    const escribir = () => {
      const { dims: medido, cell } = grillaPara(raiz.clientWidth, raiz.clientHeight);
      raiz.style.setProperty('--cell', `${cell}px`);
      setDims(previo => previo.w === medido.w && previo.h === medido.h ? previo : medido);
    };

    escribir();
    window.addEventListener('resize', escribir);
    return () => window.removeEventListener('resize', escribir);
  }, [raizRef]);

  return dims;
}
