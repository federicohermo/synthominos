import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { arrowStep, movePanel } from './drag.ts';
import type { Box, Position } from './drag.ts';

interface Start {
  pointer: Position;
  position: Position;
  box: Box;
}

// The panel is `fixed`: it sits in the visual viewport, which `innerWidth` and `innerHeight` measure.
const viewport = (): Box => ({ width: window.innerWidth, height: window.innerHeight });

const boxOf = (node: HTMLElement): Box => {
  const r = node.getBoundingClientRect();
  return { width: r.width, height: r.height };
};

// With the unit: a bare number makes the whole `translate3d` invalid, with no error in the console.
const write = (node: HTMLElement, p: Position) => {
  node.style.setProperty('--panel-x', `${p.x}px`);
  node.style.setProperty('--panel-y', `${p.y}px`);
};

/** The gesture writes the node, and `onMove` runs once at its end: a render for each `pointermove` runs the board. */
export function useDrag(
  panelRef: RefObject<HTMLElement | null>,
  position: Position,
  onMove: (p: Position) => void,
) {
  const start = useRef<Start | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return;
    write(panel, position);

    const target = (e: PointerEvent, s: Start) => movePanel(
      s.position,
      { dx: e.clientX - s.pointer.x, dy: e.clientY - s.pointer.y },
      viewport(),
      s.box,
    );

    const onPointerMove = (e: PointerEvent) => {
      const s = start.current;
      if (s === null) return;
      write(panel, target(e, s));
    };

    // The browser sends `pointercancel` when it takes the gesture: without it the panel follows a free pointer.
    const onPointerEnd = (e: PointerEvent) => {
      const s = start.current;
      if (s === null) return;
      start.current = null;
      onMove(target(e, s));
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [panelRef, position, onMove]);

  const onHandlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    // Where the context menu takes the `pointerup` (macOS opens it on press), a drag of another button never ends.
    if (e.button !== 0 || !e.isPrimary) return;
    const panel = panelRef.current;
    if (panel === null) return;
    start.current = { pointer: { x: e.clientX, y: e.clientY }, position, box: boxOf(panel) };
    // Without the capture, a fast drag leaves the handle and the events stop with the panel halfway.
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [panelRef, position]);

  const onHandleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (panel === null) return;
    const step = arrowStep(e.key);
    if (step === null) return;
    e.preventDefault();
    onMove(movePanel(position, step, viewport(), boxOf(panel)));
  }, [panelRef, position, onMove]);

  return { onHandlePointerDown, onHandleKeyDown };
}
