import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { render } from 'vitest-browser-react';
import FloatingPanel from '../FloatingPanel.tsx';
import { useDrag } from '../use-drag.ts';
import { KEYBOARD_STEP_PX, VISIBLE_MARGIN_PX } from '../drag.ts';
import type { Position } from '../drag.ts';
import { pointerEvent, stubCapture } from './pointer-gesture.ts';

/** The `pointerup` commits to the state, and React paints in the next frame. */
const oneFrame = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** A shell that keeps the position and the fold, as `App.tsx` does. `tic` renders it again and moves nothing. */
function Harness({ open, box }: { open: boolean; box?: CSSProperties }) {
  const [position, setPosition] = useState<Position>({ x: 100, y: 100 });
  const [unfolded, setUnfolded] = useState<boolean>(open);
  const [tic, setTic] = useState<number>(0);
  return (
    <div>
      <button type="button" onClick={() => setTic(t => t + 1)}>tic {tic}</button>
      <FloatingPanel
        title="Piezas"
        regionId="dock-piezas"
        open={unfolded}
        onToggle={() => setUnfolded(v => !v)}
        position={position}
        onMove={setPosition}
        box={box}
      >
        <p>contenido</p>
      </FloatingPanel>
    </div>
  );
}

/** The ref is `null` in the first render of any component that makes it, so the guard is reachable. */
function ProbeWithNoNode({ onMove }: { onMove: (p: Position) => void }) {
  const empty: RefObject<HTMLElement | null> = { current: null };
  const { onHandlePointerDown, onHandleKeyDown } = useDrag(empty, { x: 0, y: 0 }, onMove);
  return (
    <button type="button" onPointerDown={onHandlePointerDown} onKeyDown={onHandleKeyDown}>sonda</button>
  );
}

const partsOf = (container: HTMLElement) => {
  const buttons = [...container.querySelectorAll('aside button')];
  return {
    panel: container.querySelector('aside') as HTMLElement,
    handle: stubCapture(buttons[0] as HTMLElement),
    fold: buttons[1] as HTMLElement,
  };
};

const centerOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

describe('FloatingPanel: the drag', () => {
  it('AC-PNL-003 — the position goes in the two custom properties, with the unit, under a constant transform', async () => {
    const { container } = await render(<Harness open />);
    const { panel } = partsOf(container);
    expect(panel.style.getPropertyValue('--panel-x')).toBe('100px');
    expect(panel.style.getPropertyValue('--panel-y')).toBe('100px');
    expect(panel.style.transform).toBe('translate3d(var(--panel-x), var(--panel-y), 0)');
  });

  it('AC-PNL-003 — a drag of (dx, dy) moves the box by (dx, dy), during the drag and after the drop', async () => {
    const { container } = await render(<Harness open />);
    const { panel, handle } = partsOf(container);
    const before = panel.getBoundingClientRect();
    const { x, y } = centerOf(handle);

    handle.dispatchEvent(pointerEvent('pointerdown', x, y));
    window.dispatchEvent(pointerEvent('pointermove', x + 120, y + 60));
    const during = panel.getBoundingClientRect();
    expect(during.x - before.x).toBeCloseTo(120, 0);
    expect(during.y - before.y).toBeCloseTo(60, 0);

    window.dispatchEvent(pointerEvent('pointerup', x + 120, y + 60));
    await oneFrame();
    const after = panel.getBoundingClientRect();
    expect(after.x - before.x).toBeCloseTo(120, 0);
    expect(after.y - before.y).toBeCloseTo(60, 0);
  });

  it('AC-PNL-003 — the panel stays where it was dropped after a render that does not move it', async () => {
    const { container } = await render(<Harness open />);
    const { panel, handle } = partsOf(container);
    const before = panel.getBoundingClientRect();
    const r = handle.getBoundingClientRect();
    handle.dispatchEvent(pointerEvent('pointerdown', r.x, r.y));
    window.dispatchEvent(pointerEvent('pointermove', r.x + 90, r.y + 45));
    window.dispatchEvent(pointerEvent('pointerup', r.x + 90, r.y + 45));
    await oneFrame();

    container.querySelector('button')!.click();
    await oneFrame();
    expect(container.querySelector('button')!.textContent).toBe('tic 1');

    const after = panel.getBoundingClientRect();
    expect(after.x - before.x).toBeCloseTo(90, 0);
    expect(after.y - before.y).toBeCloseTo(45, 0);
  });
});

describe('FloatingPanel: the keyboard', () => {
  it('AC-PNL-004 — with the focus on the handle, each arrow moves the panel one keyboard step', async () => {
    const { container } = await render(<Harness open />);
    const { panel, handle } = partsOf(container);
    handle.focus();
    expect(document.activeElement).toBe(handle);

    const steps: [key: string, dx: number, dy: number][] = [
      ['ArrowRight', KEYBOARD_STEP_PX, 0],
      ['ArrowDown', 0, KEYBOARD_STEP_PX],
      ['ArrowLeft', -KEYBOARD_STEP_PX, 0],
      ['ArrowUp', 0, -KEYBOARD_STEP_PX],
    ];
    for (const [key, dx, dy] of steps) {
      const before = panel.getBoundingClientRect();
      const press = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      handle.dispatchEvent(press);
      await oneFrame();
      const after = panel.getBoundingClientRect();
      expect(after.x - before.x, key).toBeCloseTo(dx, 0);
      expect(after.y - before.y, key).toBeCloseTo(dy, 0);
      expect(press.defaultPrevented, key).toBe(true);
    }
  });

  it('AC-PNL-004 — another key moves nothing and keeps its default', async () => {
    const { container } = await render(<Harness open />);
    const { panel, handle } = partsOf(container);
    handle.focus();
    const before = panel.getBoundingClientRect();
    const other = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true });
    handle.dispatchEvent(other);
    await oneFrame();
    expect(panel.getBoundingClientRect().x).toBeCloseTo(before.x, 0);
    expect(panel.getBoundingClientRect().y).toBeCloseTo(before.y, 0);
    expect(other.defaultPrevented).toBe(false);
  });
});

describe('FloatingPanel: it cannot be lost, and a drag does not fold it', () => {
  it('AC-PNL-005 — a drop at (-9999, -9999) leaves the panel in the viewport, with its top edge at the top', async () => {
    const { container } = await render(<Harness open />);
    const { panel, handle } = partsOf(container);
    const r = handle.getBoundingClientRect();
    handle.dispatchEvent(pointerEvent('pointerdown', r.x, r.y));
    window.dispatchEvent(pointerEvent('pointermove', -9999, -9999));
    window.dispatchEvent(pointerEvent('pointerup', -9999, -9999));
    await oneFrame();

    const lost = panel.getBoundingClientRect();
    expect(lost.right).toBeGreaterThan(0);
    expect(lost.bottom).toBeGreaterThan(0);
    expect(lost.x).toBeLessThan(window.innerWidth);
    expect(lost.y).toBeLessThan(window.innerHeight);
    expect(lost.right).toBeCloseTo(VISIBLE_MARGIN_PX, 0);
    expect(lost.y).toBeCloseTo(0, 0);
  });

  it('AC-PNL-006 — a drag that starts and ends on the handle leaves the fold control expanded', async () => {
    const { container } = await render(<Harness open />);
    const { handle, fold } = partsOf(container);
    expect(fold.getAttribute('aria-expanded')).toBe('true');

    const { x, y } = centerOf(handle);
    handle.dispatchEvent(pointerEvent('pointerdown', x, y));
    window.dispatchEvent(pointerEvent('pointermove', x + 40, y + 40));
    window.dispatchEvent(pointerEvent('pointerup', x, y));
    // The `click` that the browser sends after a `pointerup` on the node of the `pointerdown`.
    handle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await oneFrame();

    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#dock-piezas')!.hasAttribute('hidden')).toBe(false);
  });

  it('AC-ACC-010 — the fold control is a button apart from the handle, and it hides the content without an unmount', async () => {
    const { container } = await render(<Harness open />);
    const { handle, fold } = partsOf(container);
    expect(handle).not.toBe(fold);
    expect(fold.getAttribute('aria-controls')).toBe('dock-piezas');
    fold.click();
    await oneFrame();

    expect(fold.getAttribute('aria-expanded')).toBe('false');
    const region = container.querySelector('#dock-piezas') as HTMLElement;
    expect(region.hidden).toBe(true);
    expect(region.textContent).toBe('contenido');
    expect(fold).toHaveAccessibleName('Desplegar Piezas');
    expect(fold.getAttribute('title')).toBe('Desplegar Piezas');
  });
});

describe('FloatingPanel: what is not the drag', () => {
  it('AC-ACC-030 AC-PNL-028 — the handle is named by the title and the gesture, shows the title and has no tooltip', async () => {
    const { container } = await render(<Harness open />);
    const { handle } = partsOf(container);
    expect(handle.textContent).toBe('Piezas');
    expect(handle).toHaveAccessibleName('Piezas — arrastrar el panel, o moverlo con las flechas');
    expect(handle.hasAttribute('title')).toBe(false);
  });

  it('the box comes from each panel, and the dock gives none', async () => {
    const { container } = await render(<Harness open box={{ width: '333px', height: '111px' }} />);
    const { panel } = partsOf(container);
    expect(panel.style.width).toBe('333px');
    expect(panel.style.height).toBe('111px');

    const bare = await render(<Harness open />);
    expect((bare.container.querySelector('aside') as HTMLElement).style.width).toBe('');
  });

  it('it opens folded when the shell says so', async () => {
    const { container } = await render(<Harness open={false} />);
    const { fold } = partsOf(container);
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(fold).toHaveAccessibleName('Desplegar Piezas');
  });
});

describe('use-drag: the wiring and its guards', () => {
  it('a `pointermove` with no `pointerdown` before it moves nothing', async () => {
    const { container } = await render(<Harness open />);
    const { panel } = partsOf(container);
    const before = panel.getBoundingClientRect();
    window.dispatchEvent(pointerEvent('pointermove', 500, 500));
    window.dispatchEvent(pointerEvent('pointerup', 500, 500));
    await oneFrame();
    expect(panel.getBoundingClientRect().x).toBeCloseTo(before.x, 0);
    expect(panel.getBoundingClientRect().y).toBeCloseTo(before.y, 0);
  });

  it('only the primary button of a primary pointer drags the panel', async () => {
    // Measured before the `pointerup`: where the context menu takes it, the panel sticks to the pointer.
    const { container } = await render(<Harness open />);
    const { panel, handle } = partsOf(container);
    const before = panel.getBoundingClientRect();
    const r = handle.getBoundingClientRect();
    const cases: [name: string, init: PointerEventInit][] = [
      ['secondary button', { button: 2, isPrimary: true }],
      ['pointer that is not primary', { button: 0, isPrimary: false }],
    ];
    for (const [name, init] of cases) {
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1, bubbles: true, cancelable: true, clientX: r.x, clientY: r.y, ...init,
      }));
      window.dispatchEvent(pointerEvent('pointermove', r.x + 80, r.y + 40));
      await oneFrame();
      expect(panel.getBoundingClientRect().x, name).toBeCloseTo(before.x, 0);
      expect(panel.getBoundingClientRect().y, name).toBeCloseTo(before.y, 0);
      window.dispatchEvent(pointerEvent('pointerup', r.x + 80, r.y + 40));
      await oneFrame();
      expect(panel.getBoundingClientRect().x, `${name}, released`).toBeCloseTo(before.x, 0);
    }
  });

  it('`pointercancel` ends the gesture as `pointerup` does', async () => {
    const { container } = await render(<Harness open />);
    const { panel, handle } = partsOf(container);
    const before = panel.getBoundingClientRect();
    const r = handle.getBoundingClientRect();
    handle.dispatchEvent(pointerEvent('pointerdown', r.x, r.y));
    window.dispatchEvent(pointerEvent('pointermove', r.x + 70, r.y));
    window.dispatchEvent(pointerEvent('pointercancel', r.x + 70, r.y));
    await oneFrame();
    expect(panel.getBoundingClientRect().x - before.x).toBeCloseTo(70, 0);

    const still = panel.getBoundingClientRect();
    window.dispatchEvent(pointerEvent('pointermove', r.x + 400, r.y + 400));
    await oneFrame();
    expect(panel.getBoundingClientRect().x).toBeCloseTo(still.x, 0);
  });

  it('with no node, the two handlers do nothing', async () => {
    const onMove = vi.fn();
    const { container } = await render(<ProbeWithNoNode onMove={onMove} />);
    const probe = stubCapture(container.querySelector('button') as HTMLElement);
    probe.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    window.dispatchEvent(pointerEvent('pointermove', 90, 90));
    window.dispatchEvent(pointerEvent('pointerup', 90, 90));
    probe.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await oneFrame();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('an unmount removes the three listeners of `window`', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = await render(<Harness open />);
    // StrictMode mounts two times and cleans up between them: without this, the calls of the
    // mount would make the check pass with no cleanup at all.
    remove.mockClear();
    await unmount();
    const types = remove.mock.calls.map(c => c[0]);
    for (const type of ['pointermove', 'pointerup', 'pointercancel']) {
      expect(types, type).toContain(type);
    }
    remove.mockRestore();
  });
});
