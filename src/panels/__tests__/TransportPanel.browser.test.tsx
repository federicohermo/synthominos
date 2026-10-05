import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import TransportPanel from '../TransportPanel.tsx';
import { TEMPO_MIN, TEMPO_MAX } from '../../playback/scheduler.ts';
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

describe('TransportPanel', () => {
  it('AC-PLY-001 — paused: the button offers to play, and says it with the glyph and with the name', async () => {
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onTogglePlay })} />);

    const boton = page.getByRole('button', { name: 'Reproducir' });
    await expect.element(boton).toHaveTextContent('▶');
    await expect.element(boton).toHaveClass(/bg-emerald-600/);

    await boton.click();
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('AC-PLY-001 — running: the same button offers to pause, in the language of the active state', async () => {
    await render(<TransportPanel transporte={transporte({ playing: true })} />);

    const boton = page.getByRole('button', { name: 'Pausa' });
    await expect.element(boton).toHaveTextContent('⏸');
    await expect.element(boton).toHaveClass(/bg-slate-900/);

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
    expect(typeof onTempo.mock.calls[0][0]).toBe('number');
  });

  it('the number has its unit, which is not redundant', async () => {
    const { container } = await render(<TransportPanel transporte={transporte({ tempo: 96 })} />);
    expect(container.textContent).toContain('96');
    expect(container.textContent).toContain('bpm');
  });

  it('AC-ACC-003 AC-PNL-026 — the reset says `↺` and its accessible name says the TWO things it does', async () => {
    const onReset = vi.fn();
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onReset, onTogglePlay })} />);

    const boton = page.getByRole('button', { name: /^Vaciar el tablero y frenar el transporte$/ });
    await expect.element(boton).toHaveTextContent('↺');
    expect(boton.element().getAttribute('title')).toBe('Vaciar el tablero y frenar el transporte');
    expect(page.getByRole('button', { name: /^Reset$/ }).elements()).toHaveLength(0);

    await boton.click();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onTogglePlay).not.toHaveBeenCalled();
  });

  it('AC-ACC-005 AC-PNL-026 — the click switch has an icon and no word, is named by what it toggles and announces it with aria-pressed', async () => {
    const onToggleClicks = vi.fn();
    const apagado = await render(
      <TransportPanel transporte={transporte({ clicks: false, onToggleClicks })} />,
    );
    const boton = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: false });
    await expect.element(boton).toBeInTheDocument();
    // A button with no `aria-pressed` also matches `pressed: false`.
    expect(boton.element().getAttribute('aria-pressed')).toBe('false');
    expect(boton.element().getAttribute('title')).toBe('Recorrido en el vacío');
    expect(boton.element().textContent).toBe('');
    expect(boton.element().querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');

    await boton.click();
    expect(onToggleClicks).toHaveBeenCalledTimes(1);
    await apagado.unmount();

    await render(<TransportPanel transporte={transporte({ clicks: true })} />);
    const encendido = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: true });
    await expect.element(encendido).toBeInTheDocument();
    await expect.element(encendido).toHaveClass(/bg-slate-900/);
  });

  it('AC-ACC-004 — the Tempo slider has the accessible name "Tempo" and announces its value with the unit', async () => {
    await render(<TransportPanel transporte={transporte({ tempo: 110 })} />);

    const slider = page.getByRole('slider', { name: /^Tempo$/ });
    await expect.element(slider).toBeInTheDocument();
    expect(slider.element().getAttribute('aria-valuetext')).toBe('110 bpm');
    expect(slider.element().getAttribute('aria-label')).toBeNull();
  });

  it('AC-ACC-004 — aria-valuetext follows the tempo: the same number that the visible span shows, with its unit', async () => {
    await render(<TransportPanel transporte={transporte({ tempo: 96 })} />);

    const slider = page.getByRole('slider', { name: /^Tempo$/ });
    expect(slider.element().getAttribute('aria-valuetext')).toBe('96 bpm');
  });
});
