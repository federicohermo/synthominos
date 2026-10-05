import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useAtajosDeTeclado, useRuedaRota } from '../use-input.ts';
import type { RefObject } from 'react';

/**
 * The two input effects, with REAL events.
 *
 * The decisions of `use-input.ts` live in `board-editing/input.ts`, as pure functions
 * with node tests. The WIRING does not, and the wiring is where the two bugs are that no
 * test of a pure function can catch:
 *
 * 1. **The passive listener.** React registers `wheel` as passive on its root container.
 *    So with an `onWheel` prop, `preventDefault()` would be a no-op that the browser only
 *    reports in the console: the wheel would rotate and the page would still scroll, so
 *    it **would seem to work**. Only a real browser tells the two apart: jsdom does not
 *    model `passive` at all.
 * 2. **`Ctrl`+wheel that reflects on release.** The two hooks write the clean tap. If the
 *    wheel does not break it BEFORE its own `ctrlKey` guard, the `keyup` of `Ctrl` finds
 *    it clean and toggles the reflection.
 */
const acciones = () => ({ rotar: vi.fn(), reflejar: vi.fn(), transporte: vi.fn(), seleccionar: vi.fn() });

/** The ref of the clean tap, which the two hooks share and both write. */
const tap = (v = false): RefObject<boolean> => ({ current: v });

/** Loose nodes that the test must remove from the document at the end. */
const basura: HTMLElement[] = [];
const enElDocumento = <T extends HTMLElement>(el: T): T => {
  document.body.appendChild(el);
  basura.push(el);
  return el;
};

beforeEach(() => { basura.splice(0).forEach(el => el.remove()); });
afterEach(() => { basura.splice(0).forEach(el => el.remove()); });

/**
 * A `keydown` + `keyup` of the same modifier: the full gesture, which is the one that acts.
 *
 * It is **synchronous** and not `async`: the two `dispatchEvent` calls run their listeners
 * at once, and the assertions after them read mock counters, not React state. An `async`
 * here is not free: the `await` of the caller puts a microtask between the gesture and
 * the assertion, and that kind of wait makes a test pass for the wrong reason.
 */
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
    // The two questions are different on purpose: there is no action, but each repeated
    // `keydown` brings its own default, which is to scroll.
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    const e = new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(a.transporte).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it('AC-BRD-029 — on a button or an input, the event belongs to the browser and not to us', async () => {
    // This lets the space bar activate the button that has the focus, and not toggle the
    // transport twice. The two branches of `esControl`, one at a time.
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
    // `'q'` is not a pentomino, and that is load-bearing: if it were, this test would not
    // measure "no action". The same holds for the `'c'` of the `Ctrl`+C test above.
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));
    tap_(window, 'q');
    expect(a.rotar).not.toHaveBeenCalled();
    expect(a.reflejar).not.toHaveBeenCalled();
    expect(a.transporte).not.toHaveBeenCalled();
    expect(a.seleccionar).not.toHaveBeenCalled();
  });

  it('AC-BRD-017 — the letter selects the piece and does NOT start the transport', async () => {
    // The second `expect` is the one that matters. A letter branch written as a separate
    // `if` AFTER the chain of `despachar`, and not before the `else transporte()`, selects
    // the piece and also starts the instrument, and typecheck and lint both pass. No test
    // of the pure function can see it: the bug lives in the wiring.
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true }));
    expect(a.seleccionar).toHaveBeenCalledWith('L');
    expect(a.transporte).not.toHaveBeenCalled();

    // With `Ctrl` down the whole shortcut belongs to the browser: no selection and no
    // transport.
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
    // The line that separates "it works" from "it seems to work", and it **does** tell the
    // two apart. A mutation pass verified it: with the registration changed to
    // `{ passive: true }`, this `expect` fails, because Chromium applies the `passive`
    // semantics to a synthetic event too. With `wheel` registered by a JSX prop the
    // listener would be passive, `preventDefault()` a no-op, and the page would scroll
    // under the piece that rotates.
    expect(e.defaultPrevented).toBe(true);
  });

  it('and the registration says it explicitly, which makes the contract visible', async () => {
    // The assertion above is about BEHAVIOR and this one is about FORM. Both are worth it
    // because they fail for different reasons: if someone moves the wheel to an `onWheel`
    // prop, the one above fails with a `defaultPrevented` of false, which does not say
    // why, and this one fails with the message that the `addEventListener` is missing.
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
    // And it STILL breaks the tap, which is the whole point: otherwise the `keyup` of
    // `Ctrl` would find the tap clean and reflect the piece on release.
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
    // In a real mount the ref is filled after the first render. The assertion is that
    // this first pass does not throw and leaves no listener on `null`.
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
