import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import Dock from '../PiecePalette.tsx';
import { REGIMEN } from '../../musical-model/music.ts';
import { ORIENTACIONES_INICIALES } from '../../pieces/orientation.ts';
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

const PiecePalette = (props: { orientacion: PropsDeOrientacion; transporte: PropsDeTransporte }) =>
  <Dock {...props} abierto onToggle={vi.fn()} />;

/** Not one sharp: the best case of the 48. */
const SIN_SOSTENIDOS = [60, 62, 64, 67, 69];
/** Five sharps, the longest string of the 48: N rot1, U rot0 and Z rot3 give it. */
const CINCO_SOSTENIDOS = [66, 68, 70, 73, 75];

describe('PiecePalette', () => {
  it('the note line reserves two lines and does not jump between the best and the worst case', async () => {
    const alto = async (noteSet: number[]) => {
      const { container, unmount } = await render(
        <PiecePalette orientacion={orientacion({ noteSet })} transporte={transporte()} />,
      );
      const linea = [...container.querySelectorAll('p')]
        .find(p => p.textContent!.startsWith('Notas actuales'))!;
      const h = Math.round(linea.getBoundingClientRect().height);
      await unmount();
      return h;
    };

    const mejor = await alto(SIN_SOSTENIDOS);
    const peor = await alto(CINCO_SOSTENIDOS);

    expect(mejor).toBeGreaterThan(0);
    expect(peor).toBe(mejor);
    const { container } = await render(
      <PiecePalette orientacion={orientacion()} transporte={transporte()} />,
    );
    const linea = [...container.querySelectorAll('p')]
      .find(p => p.textContent!.startsWith('Notas actuales'))!;
    const interlineado = parseFloat(getComputedStyle(linea).lineHeight);
    expect(mejor).toBe(Math.round(interlineado * 2));
  });

  it('the tonic of the piece in hand is said by its name', async () => {
    const { container } = await render(
      <PiecePalette orientacion={orientacion({ selected: 'F' })} transporte={transporte()} />,
    );
    expect(container.textContent).toContain('tónica C');
  });

  it('AC-PNL-020 — the buttons that turn or reflect a piece are NOT in the DOM', async () => {
    const { container } = await render(
      <PiecePalette
        orientacion={orientacion({ orientaciones: memoria({ F: { rotation: 2, mirror: true } }) })}
        transporte={transporte()}
      />,
    );
    for (const grados of ['90°', '180°', '270°']) {
      expect(page.getByRole('button', { name: new RegExp(`^${grados}$`) }).elements(), grados)
        .toHaveLength(0);
    }
    expect(page.getByRole('button', { name: /^Reflexión$/ }).elements()).toHaveLength(0);
    const recorrido = page.getByRole('button', { name: /^Recorrido en el vacío$/ }).element();
    expect(recorrido.textContent).toBe('');
    expect(recorrido.closest('div.border-t')).not.toBeNull();
    expect(container.querySelector('#reflexion-etiqueta')).toBeNull();
    expect(container.querySelector('#recorrido-etiqueta')).toBeNull();
    expect([...container.querySelectorAll('button')].map(b => b.textContent))
      .not.toContain('OFF');
  });

  it('AC-ACC-007 — the regime is the row `Rotación`, with its TWO symmetric buttons', async () => {
    const onRegimen = vi.fn();
    const { container } = await render(
      <PiecePalette
        orientacion={orientacion({ regimen: REGIMEN.escala, onRegimen })}
        transporte={transporte()}
      />,
    );
    await expect.element(page.getByRole('group', { name: /^Rotación$/ })).toBeInTheDocument();
    expect(page.getByRole('group', { name: /^cambia$/ }).elements()).toHaveLength(0);
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(1);

    const botones = [...container.querySelectorAll('[role="group"] button')];
    expect(botones).toHaveLength(2);
    expect(botones.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    await expect.element(page.getByRole('button', { name: REGIMEN.escala })).toHaveClass(/bg-slate-900/);

    await page.getByRole('button', { name: REGIMEN.orden }).click();
    expect(onRegimen).toHaveBeenCalledWith(REGIMEN.orden);
  });

  it('the word that joins the sentence is not lost: the `title` of the group says it', async () => {
    const { container } = await render(
      <PiecePalette orientacion={orientacion()} transporte={transporte()} />,
    );
    const grupo = container.querySelector('[role="group"]')!;
    expect(grupo.getAttribute('title')).toContain('rotación cambia');
  });

  it('the orientation reads as text, which the thumbnail cannot say', async () => {
    const sinReflejar = await render(
      <PiecePalette
        orientacion={orientacion({ orientaciones: memoria({ F: { rotation: 3, mirror: false } }) })}
        transporte={transporte()}
      />,
    );
    expect(sinReflejar.container.textContent).toContain('270°');
    expect(sinReflejar.container.textContent).not.toContain('reflejada');
    await sinReflejar.unmount();

    const conReflexion = await render(
      <PiecePalette
        orientacion={orientacion({ orientaciones: memoria({ F: { rotation: 2, mirror: true } }) })}
        transporte={transporte()}
      />,
    );
    expect(conReflexion.container.textContent).toContain('180° · reflejada');
    await conReflexion.unmount();

    const otra = memoria({ F: { rotation: 2, mirror: true }, T: { rotation: 1, mirror: false } });
    const { container } = await render(
      <PiecePalette orientacion={orientacion({ selected: 'T', orientaciones: otra })} transporte={transporte()} />,
    );
    expect(container.textContent).toContain('90°');
    expect(container.textContent).not.toContain('reflejada');
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
    const boton = page.getByRole('button', { name: /^Volver esta pieza a 0° sin reflejar$/ });
    await expect.element(boton).toHaveTextContent('0°');
    expect(boton.element().getAttribute('title')).toBe('Volver esta pieza a 0° sin reflejar');
    await boton.click();
    expect(onResetOrientacion).toHaveBeenCalledTimes(1);
  });

  it('AC-PNL-019 — the orientation readout reserves its line and does not jump with the worst case', async () => {
    const alto = async (o: { rotation: 0 | 1 | 2 | 3; mirror: boolean }) => {
      const { container, unmount } = await render(
        <PiecePalette
          orientacion={orientacion({ orientaciones: memoria({ F: o }) })}
          transporte={transporte()}
        />,
      );
      const linea = [...container.querySelectorAll('p')]
        .find(p => /^\d+°/.test(p.textContent!))!;
      const h = Math.round(linea.getBoundingClientRect().height);
      const interlineado = parseFloat(getComputedStyle(linea).lineHeight);
      await unmount();
      return { h, interlineado };
    };

    const corto = await alto({ rotation: 0, mirror: false });
    const largo = await alto({ rotation: 3, mirror: true });
    expect(corto.h).toBeGreaterThan(0);
    expect(largo.h).toBe(corto.h);
    expect(corto.h).toBe(Math.round(corto.interlineado));
  });

  it('AC-ACC-010 — the header is a BUTTON that folds, and folded it leaves only the header', async () => {
    const onToggle = vi.fn();
    const abierto = await render(
      <Dock orientacion={orientacion()} transporte={transporte()} abierto onToggle={onToggle} />,
    );
    const encabezado = page.getByRole('button', { name: /^Piezas$/, expanded: true });
    await expect.element(encabezado).toBeInTheDocument();
    const region = abierto.container.querySelector('#dock-piezas')!;
    expect(region.getAttribute('aria-controls')).toBeNull();
    expect(encabezado.element().getAttribute('aria-controls')).toBe('dock-piezas');
    expect(region.hasAttribute('hidden')).toBe(false);

    await encabezado.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    await abierto.unmount();

    const plegado = await render(
      <Dock orientacion={orientacion()} transporte={transporte()} abierto={false} onToggle={onToggle} />,
    );
    await expect.element(page.getByRole('button', { name: /^Piezas$/, expanded: false })).toBeInTheDocument();
    const oculta = plegado.container.querySelector('#dock-piezas')!;
    expect(oculta.hasAttribute('hidden')).toBe(true);
    expect(oculta.querySelectorAll('button').length).toBeGreaterThan(12);
  });

  it('the box of the dock is measured in CELLS, which keeps it off (9,5) on the reference board', async () => {
    const { container } = await render(
      <Dock orientacion={orientacion()} transporte={transporte()} abierto onToggle={vi.fn()} />,
    );
    const dock = container.querySelector('aside')!;
    for (const px of [73, 180]) {
      container.style.setProperty('--cell', `${px}px`);
      const caja = dock.getBoundingClientRect();
      expect(Math.round(caja.width), `${px}`).toBe(px * 2);
      expect(Math.round(parseFloat(getComputedStyle(dock).maxHeight)), `${px}`).toBe(px * 4);
    }
  });

  it('the gesture legend is in the dock', async () => {
    const { container } = await render(
      <PiecePalette orientacion={orientacion()} transporte={transporte()} />,
    );
    expect(container.textContent).toContain('Rueda sobre el tablero');
    expect(container.textContent).toContain('refleja');
    expect(container.textContent).toContain('arranca y para');
    expect(container.textContent).toContain('pieza la elige');
  });

  it('the order of the dock, from top to bottom', async () => {
    const { container } = await render(
      <PiecePalette orientacion={orientacion()} transporte={transporte()} />,
    );
    const texto = container.textContent!;
    expect(texto.indexOf('Rotación')).toBeLessThan(texto.indexOf('tónica'));
    expect(texto.indexOf('tónica')).toBeLessThan(texto.indexOf('Notas actuales'));
    expect(texto.indexOf('Notas actuales')).toBeLessThan(texto.indexOf('Tempo'));
  });
});
