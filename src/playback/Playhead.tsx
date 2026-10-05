import { useEffect, useRef } from 'react';
import { AIRE_RAZON, RADIO_RAZON } from '../board-fit/grid-fit.ts';
import { NOTA, iniciarCabeza, borde } from './playhead-loop.ts';

const celdas = (n: number) => `calc(var(--cell) * ${n})`;

export default function Playhead() {
  const capaRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  // The border goes on the inner tile: on the box that moves, it would cover the gap
  // between cells.
  const resalteRef = useRef<HTMLDivElement>(null);

  useEffect(() => iniciarCabeza(capaRef.current, ref.current, resalteRef.current), []);


  // `z-10`: the tiles of `Board.tsx` are positioned and come later in the DOM, so without
  // it they paint over the two layers. The veil comes first, so the playhead paints over it.
  return (
    <>
      <div ref={capaRef} aria-hidden="true" className="absolute top-0 left-0 z-10 pointer-events-none" />
      <div
        ref={ref}
        aria-hidden="true"
        className="absolute top-0 left-0 z-10 pointer-events-none"
        style={{ width: celdas(1), height: celdas(1), padding: celdas(AIRE_RAZON), display: 'none' }}
      >
        <div ref={resalteRef} className="w-full h-full" style={{ borderRadius: celdas(RADIO_RAZON), boxShadow: borde(NOTA) }} />
      </div>
    </>
  );
}
