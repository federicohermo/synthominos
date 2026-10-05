import { memo } from 'react';
import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import { MINI_BOX, MINI_CELL_PX, MINI_PISTA_PX } from '../pieces/piece-mini.ts';
import { PIECE_COLOR } from '../pieces/palette.ts';
import { miniCells } from '../pieces/piece-mini.ts';
import { textoDeOrientacion } from './orientation-text.ts';
import type { Orientacion, MemoriaDeOrientacion } from '../pieces/orientation.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';

export interface PropsDeOrientacion {
  selected: PieceKey;
  orientaciones: MemoriaDeOrientacion;
  regimen: RegimenDeRotacion;
  noteSet: readonly number[];
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
    /* `auto-fill`, not a breakpoint: a breakpoint follows the viewport, and the dock is two cells wide. */
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${MINI_PISTA_PX}px, 1fr))` }}
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
            className={`px-2 py-1 rounded-lg border text-sm flex flex-col items-center justify-center gap-1 ${activo? 'bg-slate-900 text-white':'bg-slate-100 hover:bg-slate-200'}`}
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
            <span className="text-xs leading-none">{key}</span>
          </button>
        );
      })}
    </div>
  );
});
