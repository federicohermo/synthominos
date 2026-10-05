import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import TransportPanel from '../TransportPanel.tsx';
import { TEMPO_MIN, TEMPO_MAX } from '../../playback/scheduler.ts';
import type { PropsDeTransporte } from '../TransportPanel.tsx';

/**
 * The transport is presentational and has three controls. So the thing to verify is not
 * that it renders, but the two things that its component ARGUES:
 *
 * 1. **the icon IS the state**: what the user sees is what a press does, and the color
 *    repeats it; and
 * 2. the button has no text, so the `aria-label` is not decoration: it is the only name
 *    that the button has.
 *
 * The two are claims about the DOM that the component gives.
 */
const transporte = (over: Partial<PropsDeTransporte> = {}): PropsDeTransporte => ({
  tempo: 110,
  playing: false,
  // This component reads `clicks` and `onToggleClicks`: the click switch is in this row, as
  // a button with an icon and no word.
  clicks: false,
  onToggleClicks: vi.fn(),
  onTempo: vi.fn(),
  onTogglePlay: vi.fn(),
  onReset: vi.fn(),
  ...over,
});

describe('TransportPanel', () => {
  it('AC-PLY-001 — paused: the button offers to play, and says it with the glyph and with the name', async () => {
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onTogglePlay })} />);

    const boton = page.getByRole('button', { name: 'Reproducir' });
    await expect.element(boton).toHaveTextContent('▶');
    // The green is what a transport asks the user to read as "press this to make it
    // sound", and NOT the `bg-slate-100` of the off state: the reset button is next to it
    // and the two would look the same.
    await expect.element(boton).toHaveClass(/bg-emerald-600/);

    await boton.click();
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('AC-PLY-001 — running: the same button offers to pause, in the language of the active state', async () => {
    await render(<TransportPanel transporte={transporte({ playing: true })} />);

    const boton = page.getByRole('button', { name: 'Pausa' });
    await expect.element(boton).toHaveTextContent('⏸');
    // `bg-slate-900 text-white` is the language with which the dock marks the active
    // regime, applied to the same concept.
    await expect.element(boton).toHaveClass(/bg-slate-900/);

    // And the `title` says the same as the accessible name: the pointer and the screen
    // reader cannot tell two different stories of one button.
    expect(boton.element().getAttribute('title')).toBe('Pausa');
  });

  it('the tempo travels as a number, not as the string of the input', async () => {
    const onTempo = vi.fn();
    await render(<TransportPanel transporte={transporte({ onTempo })} />);

    const slider = page.getByRole('slider');
    expect(slider.element().getAttribute('min')).toBe(String(TEMPO_MIN));
    expect(slider.element().getAttribute('max')).toBe(String(TEMPO_MAX));

    await slider.fill('128');
    expect(onTempo).toHaveBeenCalledWith(128);
    // The reason for the `Number`: a `'128'` that arrives as a string goes on to `setBpm`
    // and from there to the arithmetic of the scheduler.
    expect(typeof onTempo.mock.calls[0][0]).toBe('number');
  });

  it('the number has its unit, which is not redundant', async () => {
    // The instrument uses bpm and intervals: a bare "110" is ambiguous.
    const { container } = await render(<TransportPanel transporte={transporte({ tempo: 96 })} />);
    expect(container.textContent).toContain('96');
    expect(container.textContent).toContain('bpm');
  });

  it('AC-ACC-003 AC-PNL-026 — the reset says `↺` and its accessible name says the TWO things it does', async () => {
    // The button has no word, and a glyph is not an accessible name. The name says the two
    // halves because the two happen (it empties the board and stops the transport), and the
    // `title` says exactly the same: the pointer and the screen reader cannot tell two
    // stories of one button.
    const onReset = vi.fn();
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onReset, onTogglePlay })} />);

    const boton = page.getByRole('button', { name: /^Vaciar el tablero y frenar el transporte$/ });
    await expect.element(boton).toHaveTextContent('↺');
    expect(boton.element().getAttribute('title')).toBe('Vaciar el tablero y frenar el transporte');
    // And no button is named `Reset`: the falsifiable side of the name.
    expect(page.getByRole('button', { name: /^Reset$/ }).elements()).toHaveLength(0);

    await boton.click();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onTogglePlay).not.toHaveBeenCalled();
  });

  it('AC-ACC-005 AC-PNL-026 — the click switch has an icon and no word, is named by what it toggles and announces it with aria-pressed', async () => {
    // The component is presentational, so `aria-pressed` follows the prop: the test
    // compares two renders, and does not click and wait for an update.
    const onToggleClicks = vi.fn();
    const apagado = await render(
      <TransportPanel transporte={transporte({ clicks: false, onToggleClicks })} />,
    );
    const boton = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: false });
    await expect.element(boton).toBeInTheDocument();
    // Explicit, and not only by `pressed: false`: a button WITHOUT `aria-pressed` also
    // matches `pressed: false`, so that query alone would pass with the attribute deleted,
    // and only the color would say the state.
    expect(boton.element().getAttribute('aria-pressed')).toBe('false');
    expect(boton.element().getAttribute('title')).toBe('Recorrido en el vacío');
    // A real icon-only button: the name comes from the `aria-label` because the button has
    // no text, and the SVG is hidden from the tree so that it is not announced with the label.
    expect(boton.element().textContent).toBe('');
    expect(boton.element().querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');

    await boton.click();
    expect(onToggleClicks).toHaveBeenCalledTimes(1);
    await apagado.unmount();

    await render(<TransportPanel transporte={transporte({ clicks: true })} />);
    const encendido = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: true });
    await expect.element(encendido).toBeInTheDocument();
    // When on, it uses the `bg-slate-900` with which the dock marks the active state.
    await expect.element(encendido).toHaveClass(/bg-slate-900/);
  });

  // This test asks the accessibility tree and not the structure of the DOM:
  // `getByRole('slider', { name })` finds the control only if the accessible name really
  // resolved (through `aria-labelledby`). So it verifies the decision (the name comes from
  // the visible span and is not written twice in an `aria-label`) and not only "the
  // attribute is written". The name is anchored with a regex because `getByRole` matches by
  // SUBSTRING, the same trap that `PiecePalette.browser.test.tsx` notes.
  it('AC-ACC-004 — the Tempo slider has the accessible name "Tempo" and announces its value with the unit', async () => {
    await render(<TransportPanel transporte={transporte({ tempo: 110 })} />);

    const slider = page.getByRole('slider', { name: /^Tempo$/ });
    await expect.element(slider).toBeInTheDocument();
    expect(slider.element().getAttribute('aria-valuetext')).toBe('110 bpm');
    // The name comes from `aria-labelledby`, not from a second `aria-label`: if someone
    // adds an `aria-label` with the same text, this assertion catches it although the
    // accessible name is still "Tempo".
    expect(slider.element().getAttribute('aria-label')).toBeNull();
  });

  it('AC-ACC-004 — aria-valuetext follows the tempo: the same number that the visible span shows, with its unit', async () => {
    await render(<TransportPanel transporte={transporte({ tempo: 96 })} />);

    const slider = page.getByRole('slider', { name: /^Tempo$/ });
    expect(slider.element().getAttribute('aria-valuetext')).toBe('96 bpm');
  });
});
