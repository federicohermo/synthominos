import { memo } from 'react';
import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import { MINI_BOX, MINI_CELL_PX } from '../pieces/piece-mini.ts';
import { PIECE_COLOR } from '../pieces/palette.ts';
import { miniCells } from '../pieces/piece-mini.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import { DOCK_COLUMNS, SLOT_GRID_GAP_PX, SLOT_PX } from './slot-grid.ts';
import type { Orientacion, MemoriaDeOrientacion } from '../pieces/orientation.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';

export interface PropsDeOrientacion {
  selected: PieceKey;
  orientaciones: MemoriaDeOrientacion;
  regimen: RegimenDeRotacion;
  onSelect: (piece: PieceKey) => void;
  onRegimen: (regimen: RegimenDeRotacion) => void;
  onResetOrientacion: () => void;
}

/** A `memo`: the shell renders again for each crossed cell, and no prop here depends on it. */
export default memo(function OrientationPanel({ orientacion }: { orientacion: PropsDeOrientacion }) {
  const { selected, orientaciones, onSelect } = orientacion;
  const hablada = (o: Orientacion) => {
    const { grados, reflejada } = textoDeOrientacion(o.rotation, o.mirror);
    return `rotación ${grados}${reflejada === null ? '' : `, ${reflejada}`}`;
  };
  return (
    /* Fixed tracks and not `1fr`: with `1fr` the width of the dock decides the shape of a slot. */
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${DOCK_COLUMNS}, ${SLOT_PX}px)`, gap: `${SLOT_GRID_GAP_PX}px` }}
    >
      {(Object.keys(SHAPES) as PieceKey[]).map(key=> {
        const suya = orientaciones[key];
        const celdas = miniCells(key, suya.rotation, suya.mirror);
        const ocupada = new Set(celdas.map(([x, y]) => `${x},${y}`));
        const activo = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={()=> onSelect(key)}
            aria-label={`${key}, ${hablada(suya)}`}
            aria-pressed={activo}
            style={{ width: `${SLOT_PX}px`, height: `${SLOT_PX}px` }}
            className={`relative rounded-lg border flex items-center justify-center ${activo? 'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
          >
            {/* Five fixed tracks: with `auto` tracks, a rotation of the `I` changes the width of the row. */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${MINI_BOX}, ${MINI_CELL_PX}px)`,
                gridTemplateRows: `repeat(${MINI_BOX}, ${MINI_CELL_PX}px)`,
              }}
            >
              {Array.from({ length: MINI_BOX * MINI_BOX }, (_, i) => {
                const x = i % MINI_BOX; const y = Math.floor(i / MINI_BOX);
                const llena = ocupada.has(`${x},${y}`);
                // The border inverts with the slot: no one color reaches 3:1 (WCAG 1.4.11) on the
                // two backgrounds.
                return (
                  <div key={i}
                    className={llena ? (activo ? 'border border-slate-400' : 'border border-slate-900') : ''}
                    style={llena ? { background: PIECE_COLOR[key].bg } : undefined}
                  />
                );
              })}
            </div>
            {/* On the background of the slot: the corner of the box is filled in some orientations, and a
                letter on a piece color has no sure contrast. */}
            <span
              aria-hidden="true"
              className={`absolute bottom-0 right-0 rounded-tl px-0.5 text-[9px] leading-[1.2] font-medium ${activo? 'bg-slate-900':'bg-slate-100'}`}
            >{key}</span>
          </button>
        );
      })}
    </div>
  );
});
