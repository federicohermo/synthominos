import { grillaPara } from '../board-fit/grid-fit.ts';
import { DOCK_COLUMNS, SLOT_GRID_GAP_PX, SLOT_PX, gridWidth } from './slot-grid.ts';

/** In px from the top left corner of the viewport. */
export interface Position { x: number; y: number }

/** Other field names than `Position` on purpose: TypeScript then refuses one where the other goes. */
export interface Delta { dx: number; dy: number }

export interface Box { width: number; height: number }

export const KEYBOARD_STEP_PX = 16;

/** More than the height of the handle: the part of a panel that stays in view holds its handle. */
export const VISIBLE_MARGIN_PX = 48;

export const START_MARGIN_PX = 8;

/** The `p-2` of `FloatingPanel.tsx`. */
export const PANEL_PADDING_PX = 8;

export const SIGNAL_PANEL_WIDTH_CELLS = 3;

// In a viewport smaller than the margin, `min > max`: the panel goes to `max`, and nothing throws.
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** The top limit is 0 and not a margin: the handle is on the top edge, and above the viewport it is lost. */
export function movePanel(pos: Position, delta: Delta, viewport: Box, box: Box): Position {
  return {
    x: clamp(pos.x + delta.dx, VISIBLE_MARGIN_PX - box.width, viewport.width - VISIBLE_MARGIN_PX),
    y: clamp(pos.y + delta.dy, 0, viewport.height - VISIBLE_MARGIN_PX),
  };
}

/** `null` and not a zero step for another key: the caller then leaves the key to the browser. */
export function arrowStep(key: string): Delta | null {
  if (key === 'ArrowLeft') return { dx: -KEYBOARD_STEP_PX, dy: 0 };
  if (key === 'ArrowRight') return { dx: KEYBOARD_STEP_PX, dy: 0 };
  if (key === 'ArrowUp') return { dx: 0, dy: -KEYBOARD_STEP_PX };
  if (key === 'ArrowDown') return { dx: 0, dy: KEYBOARD_STEP_PX };
  return null;
}

/** The slot grid is the widest row of the dock, so the grid and the padding give its exact width. */
export function dockStartPosition(viewport: Box): Position {
  const width = gridWidth(DOCK_COLUMNS, SLOT_PX, SLOT_GRID_GAP_PX) + PANEL_PADDING_PX * 2;
  return { x: viewport.width - width - START_MARGIN_PX, y: START_MARGIN_PX };
}

/** The cell of this viewport and not the target cell: the drawn cell goes from 64 to 74.1 px. */
export function signalPanelStartPosition(viewport: Box): Position {
  const { cell } = grillaPara(viewport.width, viewport.height);
  return { x: START_MARGIN_PX, y: viewport.height - cell - START_MARGIN_PX };
}
