import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { occupantAt, occupantCellIndex } from './placement.ts';
import type { Cell } from '../pieces/transform.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { PlacedPiece, Dims } from './placement.ts';
import type { RegimenDeRotacion } from '../musical-model/music.ts';
import { cellTextFor } from '../musical-model/cell-text.ts';
import { cellNameFor } from '../accessibility/cell-name.ts';
import type { CeldaOcupada } from '../accessibility/cell-name.ts';
import type { CellText } from '../musical-model/cell-text.ts';
import {
  NOTA_RAZON,
  PASO_RAZON,
  AIRE_RAZON,
  RADIO_RAZON,
  RESERVA_RAZON,
  PASO_ABAJO_RAZON,
  PASO_DERECHA_RAZON,
  ANILLO_FOCO_CLARO_RAZON,
  ANILLO_FOCO_OSCURO_RAZON,
} from '../board-fit/grid-fit.ts';

const celdas = (n: number) => `calc(var(--cell) * ${n})`;
import { PIECE_COLOR } from '../pieces/palette.ts';
import Playhead from '../playback/Playhead.tsx';

interface Props {
  placed: readonly PlacedPiece[];
  previewCells: readonly Cell[];
  previewValid: boolean;
  hover: Cell | null;
  selected: PieceKey;
  rotation: number;
  mirror: boolean;
  regimen: RegimenDeRotacion;
  onCellClick: (x: number, y: number, altKey: boolean) => void;
  onCellEnter: (cell: Cell) => void;
  onMouseLeave: () => void;
  focoEnTablero: boolean;
  onFoco: (celda: Cell | null) => void;
  hoverEdita: boolean;
  onContextMenu: (e: MouseEvent<HTMLDivElement>) => void;
  dims: Dims;
  boardRef: RefObject<HTMLDivElement | null>;
}

export default function Board({
  placed, previewCells, previewValid, hover, selected, rotation, mirror, regimen,
  onCellClick, onCellEnter, onMouseLeave, focoEnTablero, onFoco, hoverEdita, onContextMenu,
  dims, boardRef,
}: Props) {
  const ghostIndexAt = new Map(previewCells.map(([x, y], k) => [`${x},${y}`, k]));

  const [cursorX, cursorY] = hover ?? [0, 0];

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>, x: number, y: number) => {
    // `frenaElDefault` already blocks the scroll of the space bar, from the global listener.
    if (e.key === 'Enter' || e.key === ' ') { onCellClick(x, y, e.altKey); return; }

    let destinoX = x; let destinoY = y;
    switch (e.key) {
      case 'ArrowLeft': destinoX = x - 1; break;
      case 'ArrowRight': destinoX = x + 1; break;
      case 'ArrowUp': destinoY = y - 1; break;
      case 'ArrowDown': destinoY = y + 1; break;
      case 'Home': destinoX = 0; break;
      case 'End': destinoX = dims.w - 1; break;
      default: return;
    }
    // Also at the edge: without this the arrow scrolls the page.
    e.preventDefault();
    const dx = Math.min(dims.w - 1, Math.max(0, destinoX));
    const dy = Math.min(dims.h - 1, Math.max(0, destinoY));
    // A change of `tabIndex` does not move the DOM focus. The node comes from the event: the cells
    // have no refs, so that the loop of `Playhead` has no handle.
    const grilla = e.currentTarget.closest('[role="grid"]')!;
    grilla.querySelectorAll<HTMLElement>('[role="gridcell"]')[dy * dims.w + dx].focus();
  };

  // A move of the focus between two cells is a `blur` and then a `focus`: `relatedTarget` tells
  // it from an exit.
  const alSalirElFoco = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) onFoco(null);
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div ref={boardRef} className="relative" onContextMenu={onContextMenu}>
        <Playhead />
        {/* Real rows: `display: contents` on a wrapper removes the node from the accessible tree
            in some browsers. */}
        <div
          className="grid"
          role="grid"
          aria-label={`Tablero de ${dims.w} por ${dims.h}`}
          aria-rowcount={dims.h}
          aria-colcount={dims.w}
          onMouseLeave={onMouseLeave}
          onBlur={alSalirElFoco}
        >
          {Array.from({ length: dims.h }, (_, fila) => (
          <div
            key={fila}
            role="row"
            className="grid"
            style={{ gridTemplateColumns: `repeat(${dims.w}, var(--cell))` }}
          >
          {Array.from({ length: dims.w }, (_, columna) => {
            const i = fila * dims.w + columna;
            const x = columna; const y = fila;
            const occ = occupantAt(placed, x, y);
            const ghostIndex = ghostIndexAt.get(`${x},${y}`);
            const ghost = ghostIndex !== undefined;

            let cell: CellText | null = null;
            let ocupada: CeldaOcupada | null = null;
            if (occ) {
              cell = cellTextFor(occ.piece, occ.rotation, occ.mirror, regimen)[occupantCellIndex(occ, x, y)];
              ocupada = { piece: occ.piece, muted: occ.muted, cell };
            } else if (ghostIndex !== undefined) {
              cell = cellTextFor(selected, rotation, mirror, regimen)[ghostIndex];
            }

            let tone: string;
            const style: CSSProperties = {};
            if (occ && ghost) tone = 'bg-rose-500 text-white';
            // No `style.color`: the `fg` of a piece is chosen against its own `bg`, and on white
            // some cannot be read.
            else if (occ && occ.muted) tone = 'bg-white shadow-sm';
            else if (occ) {
              tone = 'shadow-sm';
              style.background = PIECE_COLOR[occ.piece].bg;
              style.color = PIECE_COLOR[occ.piece].fg;
            }
            else if (ghost) tone = previewValid ? 'bg-slate-300' : 'bg-rose-300';
            else tone = 'bg-white hover:bg-slate-100';

            // The radius paints nothing here: the focus ring follows it. `outline` and `box-shadow` are
            // ink overflow, but `transform: scale` counts for the scrollable overflow.
            const caja: CSSProperties = { width: celdas(1), height: celdas(1), padding: celdas(AIRE_RAZON), borderRadius: celdas(RADIO_RAZON) };
            if (focoEnTablero && x === cursorX && y === cursorY) {
              caja.boxShadow = `inset 0 0 0 ${celdas(ANILLO_FOCO_OSCURO_RAZON)} #0f172a`;
              caja.outline = `${celdas(ANILLO_FOCO_CLARO_RAZON)} solid #fff`;
              caja.outlineOffset = celdas(-(ANILLO_FOCO_OSCURO_RAZON + ANILLO_FOCO_CLARO_RAZON));
            }

            return (
              <div key={i}
                role="gridcell"
                tabIndex={x === cursorX && y === cursorY ? 0 : -1}
                onClick={(e) => onCellClick(x, y, e.altKey)}
                onKeyDown={(e) => alTeclear(e, x, y)}
                /* A `div` with `tabIndex` takes focus by click: then `focoEnTablero` vetoes
                   `onMouseEnter` and the ghost freezes. */
                onMouseDown={(e) => e.preventDefault()}
                onFocus={() => onFoco([x, y])}
                /* With the focus inside, the mouse is inert: a scroll also fires `mouseenter`,
                   under a still pointer. */
                onMouseEnter={() => { if (!focoEnTablero) onCellEnter([x, y]); }}
                style={caja}
                aria-label={cellNameFor(x, y, ocupada)}
                className={previewValid || !hover || hoverEdita ? 'cursor-pointer' : 'cursor-not-allowed'}
                title={cell ? `(${x},${y}) · ${cell.note} · paso ${cell.step}` : `(${x},${y})`}
              >
                {/* The border stays 1 px: in `calc()` it gives fractions that the browser rounds
                    differently on each edge. */}
                <div style={{ ...style, borderRadius: celdas(RADIO_RAZON), paddingBottom: celdas(RESERVA_RAZON), fontSize: celdas(NOTA_RAZON) }}
                  className={`relative w-full h-full border border-slate-900 flex items-center justify-center leading-none font-semibold tabular-nums ${tone}`}>
                  {cell && <span
                    className="absolute font-normal leading-tight opacity-70"
                    style={{ bottom: celdas(PASO_ABAJO_RAZON), right: celdas(PASO_DERECHA_RAZON), fontSize: celdas(PASO_RAZON) }}
                  >#{cell.step}</span>}
                  {cell?.note ?? ''}
                </div>
              </div>
            );
          })}
          </div>
          ))}
        </div>
      </div>
    </div>
  );
}
