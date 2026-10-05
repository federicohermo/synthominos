/** Chromium throws `NotFoundError` on a capture with a `pointerId` that it did not send, and the `pointerdown` stops. */
export function stubCapture<T extends Element>(el: T): T {
  el.setPointerCapture = () => undefined;
  el.releasePointerCapture = () => undefined;
  return el;
}

export function pointerEvent(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 1, bubbles: true, cancelable: true, clientX: x, clientY: y, isPrimary: true,
  });
}

/** With no `click` at the end: the test of that synthetic `click` sends it where the reader sees it. */
export function drag(handle: HTMLElement, dx: number, dy: number): void {
  const r = handle.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  stubCapture(handle);
  handle.dispatchEvent(pointerEvent('pointerdown', x, y));
  window.dispatchEvent(pointerEvent('pointermove', x + dx, y + dy));
  window.dispatchEvent(pointerEvent('pointerup', x + dx, y + dy));
}
