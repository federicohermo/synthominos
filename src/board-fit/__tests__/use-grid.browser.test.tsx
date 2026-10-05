import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useGrilla } from '../use-grid.ts';
import { grillaPara } from '../grid-fit.ts';
import { GRID_MIN } from '../../board-editing/placement.ts';
import type { RefObject } from 'react';

/**
 * The WIRING of the hook that measures the root container, with a real node and a real
 * `resize`.
 *
 * `grid-fit.test.ts` covers the formula and does not touch the DOM. Here is the other
 * part, where the bugs would be, and the pure function shows none of the five:
 *
 * 1. that `--cell` is written **with its unit**: without the `px`, every
 *    `calc(var(--cell) * n)` is an invalid declaration and the grid collapses to one
 *    column with no error in the console;
 * 2. that it is written **before the first paint** (`useLayoutEffect`), or that collapse
 *    shows for one frame;
 * 3. that the **dimensions come back** as the return value, which CSS cannot resolve;
 * 4. that a `resize` writes the two again; and
 * 5. that the cleanup removes the listener: StrictMode mounts twice.
 */
const basura: HTMLElement[] = [];
const nodo = (w: number, h: number): RefObject<HTMLElement | null> => {
  const el = document.createElement('div');
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  document.body.appendChild(el);
  basura.push(el);
  return { current: el };
};

afterEach(() => { basura.splice(0).forEach(el => el.remove()); });

describe('useGrilla', () => {
  it('writes `--cell` with its unit, and returns the dimensions', async () => {
    const ref = nodo(1000, 600);
    const { result } = await renderHook(() => useGrilla(ref));
    const esperado = grillaPara(1000, 600);
    // With the unit: a `--cell` with the bare value `71` makes each `calc()` that uses it
    // invalid, and the browser says nothing.
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${esperado.cell}px`);
    expect(result.current).toEqual(esperado.dims);
  });

  it('AC-FIT-011 — it measures the BOX and not `innerWidth`, so the two are the same number', async () => {
    // Two nodes of different sizes in the same window: if the hook read the window, the
    // two would write the same value. The box of the root is `100dvh` high, and on iOS
    // `innerHeight` includes the browser bar. If the formula gets one and the box has the
    // other, the board is calculated against a height that the container does not have,
    // and it overflows a few pixels. That has no safety net: no container scrolls to
    // absorb it.
    const chico = nodo(400, 400);
    const grande = nodo(1500, 900);
    const a = await renderHook(() => useGrilla(chico));
    const b = await renderHook(() => useGrilla(grande));
    expect(a.result.current).toEqual(grillaPara(400, 400).dims);
    expect(b.result.current).toEqual(grillaPara(1500, 900).dims);
    expect(a.result.current).not.toEqual(b.result.current);
  });

  it('AC-FIT-012 — a `resize` writes the two again: the cell size and the dimensions', async () => {
    const ref = nodo(1000, 600);
    const { result, unmount } = await renderHook(() => useGrilla(ref));
    const antes = result.current;

    // The box changes and the event arrives: the full gesture of a drag of the window edge.
    ref.current!.style.width = '2000px';
    ref.current!.style.height = '1200px';
    window.dispatchEvent(new Event('resize'));
    const esperado = grillaPara(2000, 1200);
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${esperado.cell}px`);
    // `waitFor` and not a direct read: the handler runs outside React, as a native
    // listener on `window`, so the `setDims` inside is processed in the next render. The
    // custom property is already written: the handler writes it.
    await vi.waitFor(() => expect(result.current).toEqual(esperado.dims));
    expect(result.current).not.toEqual(antes);

    await unmount();
    // After the unmount nothing writes: without the `removeEventListener`, StrictMode,
    // which mounts twice, leaves two live handlers on an unmounted node, outside the
    // React tree.
    const ultima = ref.current!.style.getPropertyValue('--cell');
    ref.current!.style.width = '3000px';
    ref.current!.style.height = '1800px';
    window.dispatchEvent(new Event('resize'));
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(ultima);
  });

  it('a `resize` that does not change the dimensions does NOT return a new object', async () => {
    // The half of the hook that exists to prevent re-renders: a drag of the window edge
    // is tens of `resize` events per second, and the dimensions change one or two times.
    // The setter returns the PREVIOUS object when the two numbers are equal, so React,
    // which compares by identity, does not re-render the tree.
    const ref = nodo(1000, 600);
    const { result } = await renderHook(() => useGrilla(ref));
    const antes = result.current;

    // One pixel: it moves `--cell` and does not move the dimensions.
    ref.current!.style.width = '1001px';
    window.dispatchEvent(new Event('resize'));
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${grillaPara(1001, 600).cell}px`);
    expect(result.current).toBe(antes);
  });

  it('with no node it writes nothing and returns the initial board', async () => {
    // The ref starts as `null` during the first render of any component that creates it,
    // so the guard is not defensive: it is the normal case of an aborted mount.
    const vacio: RefObject<HTMLElement | null> = { current: null };
    const { result } = await renderHook(() => useGrilla(vacio));
    expect(vacio.current).toBeNull();
    expect(result.current.w).toBeGreaterThanOrEqual(GRID_MIN.w);
    expect(result.current.h).toBeGreaterThanOrEqual(GRID_MIN.h);
  });
});
