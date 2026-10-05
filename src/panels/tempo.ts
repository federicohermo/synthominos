import { TEMPO_MAX, TEMPO_MIN } from '../playback/scheduler.ts';

/** In px: the vertical drag on the tempo clock that changes the tempo by one bpm. */
export const DRAG_STEP_PX = 2;

/** Rounded: a drag divides pixels by a step, and the clock shows a whole number. */
export function clampTempo(bpm: number): number {
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(bpm)));
}

/** The sign and not the size: one notch of a mouse is about 100, one frame of a trackpad is 1 or 2. */
export function wheelStep(deltaY: number): number {
  if (deltaY < 0) return 1;
  if (deltaY > 0) return -1;
  return 0;
}

export function tempoKeyStep(key: string): number | null {
  if (key === 'ArrowUp' || key === 'ArrowRight') return 1;
  if (key === 'ArrowDown' || key === 'ArrowLeft') return -1;
  return null;
}

/** From the tempo at the start: a sum step by step sticks at the clamp when the drag goes past it. */
export function dragTempo(start: number, dy: number): number {
  return clampTempo(start - dy / DRAG_STEP_PX);
}
