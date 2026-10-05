import { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import TransportPanel from '../TransportPanel.tsx';
import { DRAG_STEP_PX } from '../tempo.ts';
import { useAtajosDeTeclado } from '../../board-editing/use-input.ts';
import { TEMPO_MIN, TEMPO_MAX } from '../../playback/scheduler.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PropsDeTransporte } from '../TransportPanel.tsx';

const transporte = (over: Partial<PropsDeTransporte> = {}): PropsDeTransporte => ({
  tempo: 110,
  playing: false,
  clicks: false,
  onToggleClicks: vi.fn(),
  onTempo: vi.fn(),
  onTogglePlay: vi.fn(),
  onReset: vi.fn(),
  ...over,
});

/** The name carries the number: a name that does not follow the tempo finds no button. */
const clock = (bpm: number) => page.getByRole('button', { name: new RegExp(`^Tempo: ${bpm} bpm$`) });

/** With `bubbles`: React listens at the root, so an event that does not bubble reaches no `on*` prop. */
const wheel = (node: Element, init: WheelEventInit) => {
  node.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }));
};

const press = (node: EventTarget, key: string, type = 'keydown'): KeyboardEvent => {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  node.dispatchEvent(event);
  return event;
};

const pointer = (node: Element, type: string, clientY: number, init: PointerEventInit = {}) => {
  node.dispatchEvent(new PointerEvent(type, {
    clientY, pointerId: 7, bubbles: true, isPrimary: true, ...init,
  }));
};

interface Shortcuts {
  rotar: () => void;
  reflejar: () => void;
  transporte: () => void;
  seleccionar: (pieza: PieceKey) => void;
}

/** The global key listener of the instrument, mounted over the panel: the guard it applies is the one under test. */
function WithShortcuts({ actions }: { actions: Shortcuts }) {
  const tapLimpio = useRef(false);
  useAtajosDeTeclado(actions, tapLimpio);
  return <TransportPanel transporte={transporte()} />;
}

describe('TransportPanel', () => {
  it('AC-PLY-001 — paused: the button offers to play, and says it with the glyph and with the name', async () => {
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onTogglePlay })} />);

    const button = page.getByRole('button', { name: 'Reproducir' });
    await expect.element(button).toHaveTextContent('▶');
    await expect.element(button).toHaveClass(/bg-emerald-600/);

    await button.click();
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('AC-PLY-001 — running: the same button offers to pause, in the language of the active state', async () => {
    await render(<TransportPanel transporte={transporte({ playing: true })} />);

    const button = page.getByRole('button', { name: 'Pausa' });
    await expect.element(button).toHaveTextContent('⏸');
    await expect.element(button).toHaveClass(/bg-slate-900/);

    expect(button.element().getAttribute('title')).toBe('Pausa');
  });

  it('AC-PNL-023 AC-ACC-004 — the clock shows the number and nothing else, and its name says the number with the unit', async () => {
    const at110 = await render(<TransportPanel transporte={transporte({ tempo: 110 })} />);
    expect(page.getByRole('slider').elements()).toHaveLength(0);
    expect(at110.container.querySelectorAll('input')).toHaveLength(0);

    const node = clock(110).element();
    expect(node.textContent).toBe('110');
    expect(node).toHaveAccessibleName('Tempo: 110 bpm');
    expect(node.getAttribute('title')).toBe('Tempo: 110 bpm');
    expect(at110.container.textContent).not.toContain('bpm');
    expect(at110.container.textContent).not.toContain('Tempo');
    // A number that changes its width with each digit does not read at a glance.
    expect(getComputedStyle(node).fontVariantNumeric).toContain('tabular-nums');
    await at110.unmount();

    await render(<TransportPanel transporte={transporte({ tempo: 96 })} />);
    expect(clock(96).element().textContent).toBe('96');
    expect(clock(96).element()).toHaveAccessibleName('Tempo: 96 bpm');
  });

  it('AC-PNL-024 — the wheel moves the tempo one bpm for a small and a large step, a horizontal wheel does not, and the ends stop it', async () => {
    const onTempo = vi.fn<(bpm: number) => void>();
    const middle = await render(<TransportPanel transporte={transporte({ tempo: 110, onTempo })} />);
    for (const deltaY of [-100, -1]) {
      wheel(clock(110).element(), { deltaY });
      expect(onTempo, `${deltaY}`).toHaveBeenLastCalledWith(111);
    }
    expect(typeof onTempo.mock.calls[0][0]).toBe('number');
    for (const deltaY of [100, 1]) {
      wheel(clock(110).element(), { deltaY });
      expect(onTempo, `${deltaY}`).toHaveBeenLastCalledWith(109);
    }
    wheel(clock(110).element(), { deltaX: 100, deltaY: 0 });
    expect(onTempo).toHaveBeenLastCalledWith(110);
    await middle.unmount();

    const atTop = vi.fn();
    const top = await render(<TransportPanel transporte={transporte({ tempo: TEMPO_MAX, onTempo: atTop })} />);
    wheel(clock(TEMPO_MAX).element(), { deltaY: -100 });
    expect(atTop).toHaveBeenCalledWith(TEMPO_MAX);
    await top.unmount();

    const atBottom = vi.fn();
    await render(<TransportPanel transporte={transporte({ tempo: TEMPO_MIN, onTempo: atBottom })} />);
    wheel(clock(TEMPO_MIN).element(), { deltaY: 100 });
    expect(atBottom).toHaveBeenCalledWith(TEMPO_MIN);
  });

  it('AC-PNL-024 — with the focus on the clock, up, right, down and left give +1, +1, -1 and -1, and the ends stop them', async () => {
    const onTempo = vi.fn<(bpm: number) => void>();
    const middle = await render(<TransportPanel transporte={transporte({ tempo: 110, onTempo })} />);

    const node = clock(110).element();
    expect(press(node, 'ArrowUp').defaultPrevented).toBe(true);
    expect(onTempo).toHaveBeenLastCalledWith(111);
    press(node, 'ArrowRight');
    expect(onTempo).toHaveBeenLastCalledWith(111);
    press(node, 'ArrowDown');
    expect(onTempo).toHaveBeenLastCalledWith(109);
    press(node, 'ArrowLeft');
    expect(onTempo).toHaveBeenLastCalledWith(109);

    // Another key changes no tempo and keeps its default.
    expect(press(node, 'f').defaultPrevented).toBe(false);
    expect(onTempo).toHaveBeenCalledTimes(4);
    await middle.unmount();

    const atTop = vi.fn();
    const top = await render(<TransportPanel transporte={transporte({ tempo: TEMPO_MAX, onTempo: atTop })} />);
    press(clock(TEMPO_MAX).element(), 'ArrowUp');
    expect(atTop).toHaveBeenCalledWith(TEMPO_MAX);
    await top.unmount();

    const atBottom = vi.fn();
    await render(<TransportPanel transporte={transporte({ tempo: TEMPO_MIN, onTempo: atBottom })} />);
    press(clock(TEMPO_MIN).element(), 'ArrowDown');
    expect(atBottom).toHaveBeenCalledWith(TEMPO_MIN);
  });

  it('AC-BRD-029 — with the focus on the clock, a letter, the space bar, `Shift` and `Ctrl` give no action and keep their default', async () => {
    const actions = { rotar: vi.fn(), reflejar: vi.fn(), transporte: vi.fn(), seleccionar: vi.fn() };
    await render(<WithShortcuts actions={actions} />);

    const node = clock(110).element();
    expect(node).toBeInstanceOf(HTMLButtonElement);
    for (const key of ['f', ' ', 'Shift', 'Control']) {
      expect(press(node, key).defaultPrevented, key).toBe(false);
      press(node, key, 'keyup');
    }
    expect(actions.seleccionar).not.toHaveBeenCalled();
    expect(actions.transporte).not.toHaveBeenCalled();
    expect(actions.rotar).not.toHaveBeenCalled();
    expect(actions.reflejar).not.toHaveBeenCalled();

    // The same keys on a node that is not a control act: the listener is mounted, so the check above can fail.
    press(document.body, 'f');
    expect(actions.seleccionar).toHaveBeenCalledWith('F');
    press(document.body, 'Shift');
    press(document.body, 'Shift', 'keyup');
    expect(actions.rotar).toHaveBeenCalledTimes(1);
  });

  it('AC-PNL-025 — a drag up by two drag steps adds two bpm, the start point gives the start tempo, and the release ends it', async () => {
    const onTempo = vi.fn<(bpm: number) => void>();
    await render(<TransportPanel transporte={transporte({ tempo: 110, onTempo })} />);

    const node = clock(110).element();
    // A synthetic `pointerId` makes Chromium throw on the capture, so the spy records it.
    const captures: number[] = [];
    vi.spyOn(node, 'setPointerCapture').mockImplementation(id => { captures.push(id); });

    pointer(node, 'pointerdown', 300);
    expect(captures).toEqual([7]);

    pointer(node, 'pointermove', 300 - 2 * DRAG_STEP_PX);
    pointer(node, 'pointermove', 300 - 20 * DRAG_STEP_PX);
    pointer(node, 'pointermove', 300 + 20 * DRAG_STEP_PX);
    pointer(node, 'pointermove', 300);
    pointer(node, 'pointermove', -100);
    expect(onTempo.mock.calls.map(c => c[0])).toEqual([112, 130, 90, 110, TEMPO_MAX]);

    pointer(node, 'pointerup', 300);
    pointer(node, 'pointermove', 200);
    expect(onTempo).toHaveBeenCalledTimes(5);
  });

  it('AC-PNL-025 — a gesture that the browser cancels ends the drag as a release does', async () => {
    const onTempo = vi.fn<(bpm: number) => void>();
    await render(<TransportPanel transporte={transporte({ tempo: 110, onTempo })} />);

    const node = clock(110).element();
    vi.spyOn(node, 'setPointerCapture').mockImplementation(() => undefined);

    pointer(node, 'pointerdown', 300);
    pointer(node, 'pointermove', 280);
    expect(onTempo).toHaveBeenCalledExactlyOnceWith(120);

    pointer(node, 'pointercancel', 280);
    pointer(node, 'pointermove', 200);
    expect(onTempo).toHaveBeenCalledTimes(1);
  });

  it('only the primary button of a primary pointer drags the clock', async () => {
    // Checked before the `pointerup`: where the context menu takes it, the tempo sticks to the pointer.
    const onTempo = vi.fn<(bpm: number) => void>();
    await render(<TransportPanel transporte={transporte({ tempo: 110, onTempo })} />);

    const node = clock(110).element();
    const captures: number[] = [];
    vi.spyOn(node, 'setPointerCapture').mockImplementation(id => { captures.push(id); });

    for (const init of [{ button: 2 }, { isPrimary: false }]) {
      pointer(node, 'pointerdown', 300, init);
      pointer(node, 'pointermove', 300 - 20 * DRAG_STEP_PX);
      expect(onTempo, JSON.stringify(init)).not.toHaveBeenCalled();
      pointer(node, 'pointerup', 300 - 20 * DRAG_STEP_PX);
    }
    expect(captures).toEqual([]);
  });

  it('AC-ACC-003 AC-PNL-026 — the reset says `↺` and its accessible name says the TWO things it does', async () => {
    const onReset = vi.fn();
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onReset, onTogglePlay })} />);

    const button = page.getByRole('button', { name: /^Vaciar el tablero y frenar el transporte$/ });
    await expect.element(button).toHaveTextContent('↺');
    expect(button.element().getAttribute('title')).toBe('Vaciar el tablero y frenar el transporte');
    expect(page.getByRole('button', { name: /^Reset$/ }).elements()).toHaveLength(0);

    await button.click();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onTogglePlay).not.toHaveBeenCalled();
  });

  it('AC-ACC-005 AC-PNL-026 — the click switch has an icon and no word, is named by what it toggles and announces it with aria-pressed', async () => {
    const onToggleClicks = vi.fn();
    const off = await render(
      <TransportPanel transporte={transporte({ clicks: false, onToggleClicks })} />,
    );
    const button = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: false });
    await expect.element(button).toBeInTheDocument();
    // A button with no `aria-pressed` also matches `pressed: false`.
    expect(button.element().getAttribute('aria-pressed')).toBe('false');
    expect(button.element().getAttribute('title')).toBe('Recorrido en el vacío');
    expect(button.element().textContent).toBe('');
    expect(button.element().querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');

    await button.click();
    expect(onToggleClicks).toHaveBeenCalledTimes(1);
    await off.unmount();

    await render(<TransportPanel transporte={transporte({ clicks: true })} />);
    const on = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: true });
    await expect.element(on).toBeInTheDocument();
    await expect.element(on).toHaveClass(/bg-slate-900/);
  });
});
