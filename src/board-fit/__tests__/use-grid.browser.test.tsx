import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useGrilla } from '../use-grid.ts';
import { grillaPara } from '../grid-fit.ts';
import { GRID_MIN } from '../../board-editing/placement.ts';
import type { RefObject } from 'react';

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
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${esperado.cell}px`);
    expect(result.current).toEqual(esperado.dims);
  });

  it('AC-FIT-011 — it measures the BOX and not `innerWidth`, so the two are the same number', async () => {
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

    ref.current!.style.width = '2000px';
    ref.current!.style.height = '1200px';
    window.dispatchEvent(new Event('resize'));
    const esperado = grillaPara(2000, 1200);
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${esperado.cell}px`);
    // The handler is a native listener, outside React: the `setDims` is processed in the next render.
    await vi.waitFor(() => expect(result.current).toEqual(esperado.dims));
    expect(result.current).not.toEqual(antes);

    await unmount();
    const ultima = ref.current!.style.getPropertyValue('--cell');
    ref.current!.style.width = '3000px';
    ref.current!.style.height = '1800px';
    window.dispatchEvent(new Event('resize'));
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(ultima);
  });

  it('a `resize` that does not change the dimensions does NOT return a new object', async () => {
    const ref = nodo(1000, 600);
    const { result } = await renderHook(() => useGrilla(ref));
    const antes = result.current;

    ref.current!.style.width = '1001px';
    window.dispatchEvent(new Event('resize'));
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${grillaPara(1001, 600).cell}px`);
    expect(result.current).toBe(antes);
  });

  it('with no node it writes nothing and returns the initial board', async () => {
    const vacio: RefObject<HTMLElement | null> = { current: null };
    const { result } = await renderHook(() => useGrilla(vacio));
    expect(vacio.current).toBeNull();
    expect(result.current.w).toBeGreaterThanOrEqual(GRID_MIN.w);
    expect(result.current.h).toBeGreaterThanOrEqual(GRID_MIN.h);
  });
});
