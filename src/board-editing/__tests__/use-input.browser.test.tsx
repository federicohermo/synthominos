import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useAtajosDeTeclado, useRuedaRota } from '../use-input.ts';
import type { RefObject } from 'react';

const acciones = () => ({ rotar: vi.fn(), reflejar: vi.fn(), transporte: vi.fn(), seleccionar: vi.fn() });

const tap = (v = false): RefObject<boolean> => ({ current: v });

const basura: HTMLElement[] = [];
const enElDocumento = <T extends HTMLElement>(el: T): T => {
  document.body.appendChild(el);
  basura.push(el);
  return el;
};

beforeEach(() => { basura.splice(0).forEach(el => el.remove()); });
afterEach(() => { basura.splice(0).forEach(el => el.remove()); });

/** Synchronous: an `await` in the caller puts a microtask between the gesture and the assertion. */
function tap_(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
}

describe('useAtajosDeTeclado', () => {
  it('AC-BRD-024 — Shift rotates and Ctrl reflects, on RELEASE and at the end of a clean tap', async () => {
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    tap_(window, 'Shift');
    expect(a.rotar).toHaveBeenCalledTimes(1);
    expect(a.reflejar).not.toHaveBeenCalled();

    tap_(window, 'Control');
    expect(a.reflejar).toHaveBeenCalledTimes(1);
    expect(a.transporte).not.toHaveBeenCalled();
  });

  it('AC-BRD-028 — the space bar toggles the transport and blocks its default, which is to scroll', async () => {
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(a.transporte).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('AC-BRD-028 — the space bar with auto-repeat blocks the default but does NOT toggle twice', async () => {
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    const e = new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(a.transporte).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it('AC-BRD-029 — on a button or an input, the event belongs to the browser and not to us', async () => {
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    for (const el of [document.createElement('button'), document.createElement('input')]) {
      enElDocumento(el);
      const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      expect(e.defaultPrevented, el.tagName).toBe(false);
    }
    expect(a.transporte).not.toHaveBeenCalled();
  });

  it('AC-BRD-024 — any key breaks the tap: Ctrl+C does not toggle the reflection', async () => {
    const a = acciones();
    const t = tap(true);
    await renderHook(() => useAtajosDeTeclado(a, t));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true, bubbles: true }));
    expect(t.current).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(t.current).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));
    expect(a.reflejar).not.toHaveBeenCalled();
  });

  it('a key with no action calls nothing', async () => {
    // `Q` is not a pentomino.
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));
    tap_(window, 'q');
    expect(a.rotar).not.toHaveBeenCalled();
    expect(a.reflejar).not.toHaveBeenCalled();
    expect(a.transporte).not.toHaveBeenCalled();
    expect(a.seleccionar).not.toHaveBeenCalled();
  });

  it('AC-BRD-017 — the letter selects the piece and does NOT start the transport', async () => {
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true }));
    expect(a.seleccionar).toHaveBeenCalledWith('L');
    expect(a.transporte).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(a.seleccionar).toHaveBeenCalledTimes(1);
    expect(a.transporte).not.toHaveBeenCalled();
  });

  it('on unmount it releases window: nothing stays listening', async () => {
    const a = acciones();
    const { unmount } = await renderHook(() => useAtajosDeTeclado(a, tap()));
    await unmount();

    tap_(window, 'Shift');
    expect(a.rotar).not.toHaveBeenCalled();
  });
});

describe('useRuedaRota', () => {
  const tablero = () => enElDocumento(document.createElement('div'));

  const rueda = (el: HTMLElement, init: WheelEventInit) => {
    const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(e);
    return e;
  };

  it('AC-BRD-023 — the wheel rotates AND BLOCKS THE SCROLL: the listener is not passive', async () => {
    const el = tablero();
    const alRotar = vi.fn();
    await renderHook(() => useRuedaRota({ current: el }, alRotar, tap()));

    const e = rueda(el, { deltaY: 120 });
    expect(alRotar).toHaveBeenCalledWith(120);
    // Chromium applies the `passive` semantics to a synthetic event too.
    expect(e.defaultPrevented).toBe(true);
  });

  it('and the registration says it explicitly, which makes the contract visible', async () => {
    const el = tablero();
    const registro = vi.spyOn(el, 'addEventListener');
    await renderHook(() => useRuedaRota({ current: el }, vi.fn(), tap()));

    const wheel = registro.mock.calls.find(([tipo]) => tipo === 'wheel');
    expect(wheel, 'the wheel must go through addEventListener and not through a prop').toBeDefined();
    expect(wheel![2]).toEqual({ passive: false });
    registro.mockRestore();
  });

  it('AC-BRD-023 — Ctrl+wheel is the browser zoom: it does not rotate and does not block the default', async () => {
    const el = tablero();
    const alRotar = vi.fn();
    const t = tap(true);
    await renderHook(() => useRuedaRota({ current: el }, alRotar, t));

    const e = rueda(el, { deltaY: 120, ctrlKey: true });
    expect(alRotar).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    expect(t.current).toBe(false);
  });

  it('AC-BRD-023 — a pure horizontal scroll does not rotate and does not block the scroll', async () => {
    const el = tablero();
    const alRotar = vi.fn();
    await renderHook(() => useRuedaRota({ current: el }, alRotar, tap()));

    const e = rueda(el, { deltaX: 80, deltaY: 0 });
    expect(alRotar).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('with no node yet, it subscribes to nothing and does not fail', async () => {
    const alRotar = vi.fn();
    const ref: RefObject<HTMLDivElement | null> = { current: null };
    await renderHook(() => useRuedaRota(ref, alRotar, tap()));
    expect(alRotar).not.toHaveBeenCalled();
  });

  it('on unmount it releases the node', async () => {
    const el = tablero();
    const alRotar = vi.fn();
    const { unmount } = await renderHook(() => useRuedaRota({ current: el }, alRotar, tap()));
    await unmount();

    const e = rueda(el, { deltaY: 120 });
    expect(alRotar).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});
