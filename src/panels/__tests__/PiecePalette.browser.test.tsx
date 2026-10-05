import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import Dock from '../PiecePalette.tsx';
import { REGIMEN } from '../../musical-model/music.ts';
import { ORIENTACIONES_INICIALES } from '../../pieces/orientation.ts';
import { pointerEvent, stubCapture } from './pointer-gesture.ts';
import type { PropsDeOrientacion } from '../OrientationPanel.tsx';
import type { PropsDeTransporte } from '../TransportPanel.tsx';
import type { MemoriaDeOrientacion } from '../../pieces/orientation.ts';

const memoria = (pisadas: Partial<MemoriaDeOrientacion> = {}): MemoriaDeOrientacion =>
  ({ ...ORIENTACIONES_INICIALES, ...pisadas });

const orientacion = (over: Partial<PropsDeOrientacion> = {}): PropsDeOrientacion => ({
  selected: 'F',
  orientaciones: ORIENTACIONES_INICIALES,
  regimen: REGIMEN.escala,
  noteSet: [60, 62, 64, 67, 69],
  onSelect: vi.fn(),
  onRegimen: vi.fn(),
  onResetOrientacion: vi.fn(),
  ...over,
});

const transporte = (over: Partial<PropsDeTransporte> = {}): PropsDeTransporte => ({
  tempo: 110,
  playing: false,
  clicks: false,
  onTempo: vi.fn(),
  onTogglePlay: vi.fn(),
  onToggleClicks: vi.fn(),
  onReset: vi.fn(),
  ...over,
});

/** Far from the four edges: no drag of this file reaches the clamp, so the expected position is a sum. */
const POSITION = { x: 24, y: 24 };

const PiecePalette = (props: { orientacion: PropsDeOrientacion; transporte: PropsDeTransporte }) =>
  <Dock {...props} abierto onToggle={vi.fn()} position={POSITION} onMove={vi.fn()} />;

/** Anchored: `getByRole` matches a name as a substring, and the handle and the fold control both say `Piezas`. */
const HANDLE = /^Piezas — arrastrar el panel, o moverlo con las flechas$/;
const FOLD = /^Plegar Piezas$/;
const UNFOLD = /^Desplegar Piezas$/;
const GROUP = /^Qué cambia la rotación$/;
const SCALE = /^La rotación cambia la fórmula de escala$/;
const ORDER = /^La rotación cambia el arranque del arpegio$/;
const ZERO = /^Volver esta pieza a 0° sin reflejar$/;
const CLOCK = /^Tempo: 110 bpm$/;
const SLOT = /^F, rotación 0°$/;

/** A `<button>▾</button>` has an accessible name, "▾": a name needs one letter or one digit. */
const ONLY_SYMBOLS = /^[^\p{L}\p{N}]+$/u;

/** No letter on screen: a glyph, a number or nothing. The handle and the slots show letters. */
const NO_LETTER = /^[^\p{L}]*$/u;

const describeButton = (el: Element) => `<button> "${el.textContent ?? ''}"`;

/** Playwright starts at 414 x 896: a desktop window gives the measures of the dock their real room. */
const VIEWPORT: [number, number] = [1024, 768];

beforeEach(async () => {
  await page.viewport(...VIEWPORT);
});

describe('PiecePalette', () => {
  it('AC-PNL-027 — the open dock shows fewer than 210 characters, and no prose', async () => {
    const { container } = await render(<PiecePalette orientacion={orientacion()} transporte={transporte()} />);
    const text = container.querySelector('aside')!.textContent!;

    expect(text.length).toBeLessThan(210);
    // The floor: the twelve letters stay, so an empty dock does not pass.
    expect(text.length).toBeGreaterThan(12);
    const prose = [
      'Rueda sobre el tablero', 'arranca y para', 'pieza la elige',
      'Rotación', 'Notas actuales', 'tónica', 'Tempo', 'bpm',
    ];
    for (const words of prose) expect(text, words).not.toContain(words);
  });

  it('AC-PNL-010 — the open dock does not scroll, with a cell of 69.5 px and of 73 px', async () => {
    const { container } = await render(<PiecePalette orientacion={orientacion()} transporte={transporte()} />);
    const dock = container.querySelector('aside')!;
    const region = container.querySelector('#dock-piezas')!;

    for (const cell of ['69.5px', '73px']) {
      container.style.setProperty('--cell', cell);
      expect(region.clientHeight, cell).toBeGreaterThan(0);
      expect(region.scrollHeight - region.clientHeight, cell).toBe(0);
      expect(dock.scrollHeight - dock.clientHeight, cell).toBe(0);
    }
  });

  it('AC-PNL-028 AC-ACC-002 — the open dock has 21 buttons, and each is named with a letter or a digit', async () => {
    const { container } = await render(<PiecePalette orientacion={orientacion()} transporte={transporte()} />);
    const buttons = [...container.querySelectorAll('aside button')];

    // 12 slots, the handle, the fold control, 2 of the regime, the `0°`, the clock and 3 of the transport row.
    expect(buttons).toHaveLength(21);
    for (const button of buttons) {
      expect(button, describeButton(button)).toHaveAccessibleName();
      expect(button, `${describeButton(button)} is named by a glyph`).not.toHaveAccessibleName(ONLY_SYMBOLS);
    }
  });

  it('AC-PNL-028 — each button with no letter on screen has a tooltip equal to its name, and the handle has none', async () => {
    const { container } = await render(<PiecePalette orientacion={orientacion()} transporte={transporte()} />);
    const buttons = [...container.querySelectorAll('aside button')];
    const wordless = buttons.filter(b => NO_LETTER.test(b.textContent!.trim()));

    // The fold control, 2 of the regime, the `0°`, the clock and 3 of the transport row.
    expect(wordless).toHaveLength(8);
    for (const button of wordless) {
      const tooltip = button.getAttribute('title');
      expect(tooltip, describeButton(button)).not.toBeNull();
      expect(button, describeButton(button)).toHaveAccessibleName(tooltip!);
    }

    const handle = page.getByRole('button', { name: HANDLE }).element();
    expect(handle.hasAttribute('title')).toBe(false);
    expect(handle.textContent).toBe('Piezas');
  });

  it('AC-ACC-007 — no `aria-labelledby` of the dock points at a missing `id`, and the group and the clock keep a name', async () => {
    const { container } = await render(<PiecePalette orientacion={orientacion()} transporte={transporte()} />);
    const dock = container.querySelector('aside')!;

    // Compared with an empty list: a loop over zero elements would ask nothing.
    const dangling = [...dock.querySelectorAll('[aria-labelledby]')]
      .flatMap(el => el.getAttribute('aria-labelledby')!.split(/\s+/))
      .filter(id => document.getElementById(id) === null);
    expect(dangling).toEqual([]);

    expect(dock.querySelector('#rotacion-etiqueta')).toBeNull();
    expect(dock.querySelector('#tempo-etiqueta')).toBeNull();
    await expect.element(page.getByRole('group', { name: GROUP })).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: CLOCK })).toBeInTheDocument();
  });

  it('AC-PNL-006 — a drag that starts and ends on the handle does not fold the dock', async () => {
    const onToggle = vi.fn();
    const onMove = vi.fn();
    const { container } = await render(
      <Dock
        orientacion={orientacion()}
        transporte={transporte()}
        abierto
        onToggle={onToggle}
        position={POSITION}
        onMove={onMove}
      />,
    );
    const handle = stubCapture(page.getByRole('button', { name: HANDLE }).element());

    handle.dispatchEvent(pointerEvent('pointerdown', 200, 200));
    window.dispatchEvent(pointerEvent('pointermove', 260, 240));
    window.dispatchEvent(pointerEvent('pointerup', 260, 240));
    // The `click` that the browser sends after a drag: with one header button, it would fold.
    handle.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onMove).toHaveBeenCalledWith({ x: POSITION.x + 60, y: POSITION.y + 40 });
    expect(onToggle).not.toHaveBeenCalled();
    expect(page.getByRole('button', { name: FOLD }).element().getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#dock-piezas')!.hasAttribute('hidden')).toBe(false);
  });

  it('AC-ACC-010 — the header is two buttons: the handle that drags and the fold control', async () => {
    const onToggle = vi.fn();
    const open = await render(
      <Dock
        orientacion={orientacion()}
        transporte={transporte()}
        abierto
        onToggle={onToggle}
        position={POSITION}
        onMove={vi.fn()}
      />,
    );
    expect(page.getByRole('button', { name: /Piezas/ }).elements()).toHaveLength(2);

    const handle = page.getByRole('button', { name: HANDLE }).element();
    expect(handle.hasAttribute('aria-expanded')).toBe(false);
    expect(handle.hasAttribute('aria-controls')).toBe(false);

    const fold = page.getByRole('button', { name: FOLD, expanded: true });
    await expect.element(fold).toBeInTheDocument();
    expect(fold.element().getAttribute('aria-controls')).toBe('dock-piezas');
    const region = open.container.querySelector('#dock-piezas')!;
    expect(region.getAttribute('aria-controls')).toBeNull();
    expect(region.hasAttribute('hidden')).toBe(false);

    await fold.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    await open.unmount();

    const folded = await render(
      <Dock
        orientacion={orientacion()}
        transporte={transporte()}
        abierto={false}
        onToggle={onToggle}
        position={POSITION}
        onMove={vi.fn()}
      />,
    );
    await expect.element(page.getByRole('button', { name: UNFOLD, expanded: false })).toBeInTheDocument();
    const hidden = folded.container.querySelector('#dock-piezas')!;
    expect(hidden.hasAttribute('hidden')).toBe(true);
    expect(hidden.querySelectorAll('button').length).toBeGreaterThan(12);
  });

  it('AC-ACC-007 AC-PNL-022 — the regime is one named group of two symmetric buttons, with no visible word', async () => {
    const onRegimen = vi.fn();
    const { container } = await render(
      <PiecePalette orientacion={orientacion({ regimen: REGIMEN.escala, onRegimen })} transporte={transporte()} />,
    );
    await expect.element(page.getByRole('group', { name: GROUP })).toBeInTheDocument();
    expect(page.getByRole('group', { name: /^Rotación$/ }).elements()).toHaveLength(0);
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(1);

    const buttons = [...container.querySelectorAll('[role="group"] button')];
    expect(buttons).toHaveLength(2);
    expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(container.querySelector('[role="group"]')!.textContent).toBe('⇗⇄');
    await expect.element(page.getByRole('button', { name: SCALE })).toHaveClass(/bg-slate-900/);

    await page.getByRole('button', { name: ORDER }).click();
    expect(onRegimen).toHaveBeenCalledWith(REGIMEN.orden);
    // A single choice and not a toggle: the pressed button asks for its own regime again.
    await page.getByRole('button', { name: SCALE }).click();
    expect(onRegimen).toHaveBeenLastCalledWith(REGIMEN.escala);
  });

  it('AC-PNL-020 — no button turns or reflects a piece, and there is no range input', async () => {
    const { container } = await render(
      <PiecePalette
        orientacion={orientacion({ orientaciones: memoria({ F: { rotation: 2, mirror: true } }) })}
        transporte={transporte()}
      />,
    );
    // Anchored: the slots are named «rotación 180°», so a loose `/180°/` finds a slot.
    for (const grados of ['90°', '180°', '270°']) {
      expect(page.getByRole('button', { name: new RegExp(`^${grados}$`) }).elements(), grados)
        .toHaveLength(0);
    }
    expect(page.getByRole('button', { name: /^Reflexión$/ }).elements()).toHaveLength(0);
    expect(container.querySelectorAll('aside input[type="range"]')).toHaveLength(0);

    const recorrido = page.getByRole('button', { name: /^Recorrido en el vacío$/ }).element();
    expect(recorrido.textContent).toBe('');
    expect(recorrido.closest('div.border-t')).not.toBeNull();
    expect(container.querySelector('#reflexion-etiqueta')).toBeNull();
    expect(container.querySelector('#recorrido-etiqueta')).toBeNull();
    expect([...container.querySelectorAll('button')].map(b => b.textContent)).not.toContain('OFF');
  });

  it('the orientation reads as text, which the thumbnail cannot say', async () => {
    const line = () => page.getByRole('button', { name: ZERO }).element().closest('p')!;
    const notReflected = await render(
      <PiecePalette
        orientacion={orientacion({ orientaciones: memoria({ F: { rotation: 3, mirror: false } }) })}
        transporte={transporte()}
      />,
    );
    expect(line().textContent).toContain('270°');
    expect(line().textContent).not.toContain('reflejada');
    await notReflected.unmount();

    const reflected = await render(
      <PiecePalette
        orientacion={orientacion({ orientaciones: memoria({ F: { rotation: 2, mirror: true } }) })}
        transporte={transporte()}
      />,
    );
    expect(line().textContent).toContain('180° · reflejada');
    await reflected.unmount();

    const other = memoria({ F: { rotation: 2, mirror: true }, T: { rotation: 1, mirror: false } });
    await render(
      <PiecePalette orientacion={orientacion({ selected: 'T', orientaciones: other })} transporte={transporte()} />,
    );
    expect(line().textContent).toContain('90°');
    expect(line().textContent).not.toContain('reflejada');
  });

  it('AC-PNL-021 — the `0°` button asks to return the piece in hand to the start orientation', async () => {
    const onResetOrientacion = vi.fn();
    await render(
      <PiecePalette
        orientacion={orientacion({
          orientaciones: memoria({ F: { rotation: 2, mirror: true } }),
          onResetOrientacion,
        })}
        transporte={transporte()}
      />,
    );
    const button = page.getByRole('button', { name: ZERO });
    await expect.element(button).toHaveTextContent('0°');
    expect(button.element().getAttribute('title')).toBe('Volver esta pieza a 0° sin reflejar');
    await button.click();
    expect(onResetOrientacion).toHaveBeenCalledTimes(1);
  });

  it('AC-PNL-019 — the orientation readout reserves its line and does not jump with the worst case', async () => {
    const height = async (o: { rotation: 0 | 1 | 2 | 3; mirror: boolean }) => {
      const { unmount } = await render(
        <PiecePalette orientacion={orientacion({ orientaciones: memoria({ F: o }) })} transporte={transporte()} />,
      );
      const line = page.getByRole('button', { name: ZERO }).element().closest('p')!;
      const h = Math.round(line.getBoundingClientRect().height);
      const lineHeight = parseFloat(getComputedStyle(line).lineHeight);
      await unmount();
      return { h, lineHeight };
    };

    const short = await height({ rotation: 0, mirror: false });
    const long = await height({ rotation: 3, mirror: true });
    expect(short.h).toBeGreaterThan(0);
    expect(long.h).toBe(short.h);
    expect(short.h).toBe(Math.round(short.lineHeight));
  });

  it('the order of the dock, from top to bottom', async () => {
    const { container } = await render(<PiecePalette orientacion={orientacion()} transporte={transporte()} />);
    const buttons = [...container.querySelectorAll('aside button')];
    const at = (name: RegExp) => buttons.indexOf(page.getByRole('button', { name }).element());

    expect(at(HANDLE)).toBeLessThan(at(SLOT));
    expect(at(SLOT)).toBeLessThan(at(SCALE));
    expect(at(SCALE)).toBeLessThan(at(ZERO));
    expect(at(ZERO)).toBeLessThan(at(CLOCK));
    expect(at(CLOCK)).toBeLessThan(at(/^Reproducir$/));
  });
});
