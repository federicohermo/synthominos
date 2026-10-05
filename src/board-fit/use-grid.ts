import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { GRID_DEFAULT } from '../board-editing/placement.ts';
import type { Dims } from '../board-editing/placement.ts';
import { grillaPara } from './grid-fit.ts';

/**
 * Measures the root container and answers **the dimensions of the board**. It also writes
 * the cell size to the custom property `--cell`.
 *
 * It is the third input hook of the UI, next to the two of `use-input.ts`, and the same
 * rule puts it here: **a global listener lives in a `use-*.ts` hook, in its own effect**,
 * with the `ref` created in the shell. `App.tsx` declares no `useEffect`: this hook gives
 * the shell only a `ref` and a call.
 *
 * ## Why the cell size goes in a custom property and the dimensions in state
 *
 * Because they change at two different frequencies. That is the only reason why this
 * hook writes in two places:
 *
 * - **Every cell, every row, the veil and the playhead read the cell size**, and it
 *   changes at each pixel of a drag of the window edge. With the number in React state,
 *   one drag is tens of re-renders of the tree per second. With `--cell`, a resize moves
 *   all of that and React does not know: the custom property inherits downward and the
 *   browser resolves each `calc()`.
 * - **CSS cannot resolve the dimensions**: `cols × rows` decides how many nodes exist, so
 *   it must be React state. But it changes much less: one or two times in a full drag,
 *   when a row enters or leaves. The functional setter below returns **the previous
 *   object** when the two numbers are equal, so a `resize` that adds or removes no cell
 *   re-renders nothing.
 *
 * That inheritance also decides **on which node** `--cell` is written: the root container
 * and not the board container. The two floating panels are `fixed` and live outside
 * `Board`, so their boxes, measured in cells, would not resolve `var(--cell)` if it hung
 * from there.
 *
 * ## Why it measures the BOX and not `window.innerWidth`
 *
 * Because they must be the same number. The root container is `100dvh` high, and on iOS
 * `innerHeight` includes the browser bar. If the formula gets one and the box has the
 * other, the board is calculated against a height that the container does not have, and
 * it overflows a few pixels with no failure. An overflow has no safety net, because
 * `Board` has no scroll of its own. Read from `clientWidth`/`clientHeight` of the node
 * itself, the number that enters the formula **is** the size of the box.
 *
 * ## `useLayoutEffect` and not `useEffect`
 *
 * For two reasons. With `--cell` not defined, `repeat(cols, var(--cell))` is an invalid
 * declaration and the grid collapses to one column. And until the effect runs, the
 * dimensions are `GRID_DEFAULT`, the reference board of 10 × 6, which is almost never
 * the right one. A `useEffect` runs AFTER the first paint, so both would show for one
 * frame. With `useLayoutEffect`, the `setDims` inside is processed **before** the paint.
 *
 * ## No debounce
 *
 * The handler does one layout read and one write of a custom property, and the browser
 * already groups the `resize` events per frame. A debounce would add the one artifact
 * that the fit must not have: the board behind the window during a drag.
 */
export function useGrilla(raizRef: RefObject<HTMLElement | null>): Dims {
  const [dims, setDims] = useState<Dims>(GRID_DEFAULT);

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    if (raiz === null) return;

    // `setProperty` on the node and not `style={{ '--cell': … }}` in the JSX: React types
    // `style` as `CSSProperties`, which admits no custom property, so the JSX path needs
    // an `as React.CSSProperties`, an assertion to write a string.
    //
    // **With the unit.** A `--cell` with the bare value `72` makes every
    // `calc(var(--cell) * n)` invalid, and the grid collapses with no error in the console.
    const escribir = () => {
      const { dims: medido, cell } = grillaPara(raiz.clientWidth, raiz.clientHeight);
      raiz.style.setProperty('--cell', `${cell}px`);
      // The PREVIOUS object when the numbers did not change: React compares by identity,
      // so a new object with the same values would re-render the whole tree at each pixel
      // of the drag. `--cell` exists to prevent exactly that.
      setDims(previo => previo.w === medido.w && previo.h === medido.h ? previo : medido);
    };

    escribir();
    window.addEventListener('resize', escribir);
    return () => window.removeEventListener('resize', escribir);
  }, [raizRef]);

  return dims;
}
