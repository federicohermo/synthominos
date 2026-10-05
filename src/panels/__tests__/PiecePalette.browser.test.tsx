import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import Dock from '../PiecePalette.tsx';
import { REGIMEN } from '../../musical-model/music.ts';
import { ORIENTACIONES_INICIALES } from '../../pieces/orientation.ts';
import type { PropsDeOrientacion } from '../OrientationPanel.tsx';
import type { PropsDeTransporte } from '../TransportPanel.tsx';
import type { MemoriaDeOrientacion } from '../../pieces/orientation.ts';

/**
 * The dock: the twelve thumbnails, the regime selector, the orientation readout and the
 * transport.
 *
 * Half of what this file verifies is an ABSENCE, and that changes the shape of the
 * assertion: «the four degree buttons do not exist» is falsifiable only with an anchored
 * `queryByRole` that gives nothing. A test that renders and asks nothing does not verify it.
 *
 * It also holds a measurement: the line «Notas actuales» takes TWO reserved lines and does
 * not change its height between the best and the worst of the 48 cases. When the line
 * wrapped, it moved all that is below it 20 px down, at the moment of the press.
 *
 * It needs a layout: it is measured with `getBoundingClientRect`, which gives zero in jsdom.
 */
/** The twelve at zero, with the entries that the test overrides. */
const memoria = (pisadas: Partial<MemoriaDeOrientacion> = {}): MemoriaDeOrientacion =>
  ({ ...ORIENTACIONES_INICIALES, ...pisadas });

const orientacion = (over: Partial<PropsDeOrientacion> = {}): PropsDeOrientacion => ({
  selected: 'F',
  // The TWELVE: the orientation readout derives the one of `selected` and does not get it
  // loose. That prevents the readout from saying one thing while the thumbnail draws
  // another.
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

/**
 * The dock with the fold already resolved, so that the cases below speak of their subject.
 *
 * The fold adds two props, `abierto` and `onToggle`, which are state of the shell. None of
 * these tests is about them: the test that verifies the fold is below and uses `Dock`
 * directly.
 */
const PiecePalette = (props: { orientacion: PropsDeOrientacion; transporte: PropsDeTransporte }) =>
  <Dock {...props} abierto onToggle={vi.fn()} />;

/** Not one sharp: the best case of the 48. */
const SIN_SOSTENIDOS = [60, 62, 64, 67, 69];
/** `F#4 · G#4 · A#4 · C#5 · D#5`, five sharps: the worst, and it comes from N rot1, U rot0 and Z rot3. */
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

    // The layout must be real: in jsdom the two would be 0 and the test would pass empty.
    expect(mejor).toBeGreaterThan(0);
    expect(peor).toBe(mejor);
    // And they are TWO lines and not one stretched line: the `2lh` is tied to the font, so
    // the test compares against the real line height and not against 40 px from memory.
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
    // The `F` sounds in C: the letter is the SHAPE and not the sound, the trap that the
    // `describe_piece` tool also warns of.
    expect(container.textContent).toContain('tónica C');
  });

  it('AC-PNL-020 — the buttons that turn or reflect a piece are NOT in the DOM', async () => {
    // The names are ANCHORED: `getByRole` matches by substring, and the `aria-label` of the
    // twelve slots says «rotación 180°», so a loose `/180°/` would find the slot and this
    // test would never fail.
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
    // The click switch is in the dock, because `TransportPanel` is a child of it. The test
    // verifies that it is not a row with a visible label but a button of the transport
    // row, below the `border-t`.
    const recorrido = page.getByRole('button', { name: /^Recorrido en el vacío$/ }).element();
    expect(recorrido.textContent).toBe('');
    expect(recorrido.closest('div.border-t')).not.toBeNull();
    // And no label stays without its control: a `<span>` that names a group that does not
    // exist leaves a dangling `aria-labelledby` or, worse, a text on screen that matches
    // nothing.
    expect(container.querySelector('#reflexion-etiqueta')).toBeNull();
    expect(container.querySelector('#recorrido-etiqueta')).toBeNull();
    expect([...container.querySelectorAll('button')].map(b => b.textContent))
      .not.toContain('OFF');
  });

  it('AC-ACC-007 — the regime is the row `Rotación`, with its TWO symmetric buttons', async () => {
    // The regime is a row of its own. It is a `role="group"` with a name, and it is not an
    // ON/OFF: neither of the two values is the absence of the other.
    const onRegimen = vi.fn();
    const { container } = await render(
      <PiecePalette
        orientacion={orientacion({ regimen: REGIMEN.escala, onRegimen })}
        transporte={transporte()}
      />,
    );
    await expect.element(page.getByRole('group', { name: /^Rotación$/ })).toBeInTheDocument();
    // No second group is named `cambia`: the dock has ONE group.
    expect(page.getByRole('group', { name: /^cambia$/ }).elements()).toHaveLength(0);
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(1);

    const botones = [...container.querySelectorAll('[role="group"] button')];
    expect(botones).toHaveLength(2);
    // The two declare `aria-pressed`, so neither is `null`, and exactly one is `true`: the
    // state that the row paints dark is the one that the tree announces.
    expect(botones.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    await expect.element(page.getByRole('button', { name: REGIMEN.escala })).toHaveClass(/bg-slate-900/);

    await page.getByRole('button', { name: REGIMEN.orden }).click();
    expect(onRegimen).toHaveBeenCalledWith(REGIMEN.orden);
  });

  it('the word that joins the sentence is not lost: the `title` of the group says it', async () => {
    // `cambia` is not on screen, and without it `Rotación | escala orden` can be read as if
    // the rotation had two values.
    const { container } = await render(
      <PiecePalette orientacion={orientacion()} transporte={transporte()} />,
    );
    const grupo = container.querySelector('[role="group"]')!;
    expect(grupo.getAttribute('title')).toContain('rotación cambia');
  });

  it('the orientation reads as text, which the thumbnail cannot say', async () => {
    // The six blind pieces, `I T U V W X`, sound different and look the same in 29 of the
    // 96 combinations. The test verifies by TEXT and never by `className`.
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

    // It says the orientation of the PIECE IN HAND, not a global one. With the same memory
    // and another `selected` the readout changes, which makes the memory visible.
    const otra = memoria({ F: { rotation: 2, mirror: true }, T: { rotation: 1, mirror: false } });
    const { container } = await render(
      <PiecePalette orientacion={orientacion({ selected: 'T', orientaciones: otra })} transporte={transporte()} />,
    );
    expect(container.textContent).toContain('90°');
    expect(container.textContent).not.toContain('reflejada');
  });

  it('AC-PNL-021 — the `0°` button asks to return the piece in hand to the start orientation', async () => {
    // The panel is presentational: the test can verify only that the gesture reaches the
    // callback of the shell, and that the button has a name. The visible label says only
    // the degrees, but the button resets the reflection too, so the accessible name must
    // say the two things.
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
    // The same bug as the note line: if it wraps, it moves all that is below it at the
    // moment of the touch. The worst case of length is `270° · reflejada`.
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
    // And ONE line, not two: the worst case fits and does not wrap.
    expect(corto.h).toBe(Math.round(corto.interlineado));
  });

  it('AC-ACC-010 — the header is a BUTTON that folds, and folded it leaves only the header', async () => {
    // A `<button>` and not an `<h2>` with `onClick`: it is a control, and a control that
    // exists only for the mouse is a debt.
    const onToggle = vi.fn();
    const abierto = await render(
      <Dock orientacion={orientacion()} transporte={transporte()} abierto onToggle={onToggle} />,
    );
    const encabezado = page.getByRole('button', { name: /^Piezas$/, expanded: true });
    await expect.element(encabezado).toBeInTheDocument();
    // The region that the button controls exists, and it holds the content.
    const region = abierto.container.querySelector('#dock-piezas')!;
    expect(region.getAttribute('aria-controls')).toBeNull();
    expect(encabezado.element().getAttribute('aria-controls')).toBe('dock-piezas');
    expect(region.hasAttribute('hidden')).toBe(false);

    await encabezado.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    await abierto.unmount();

    // Folded: the header still says what the panel is, and the content is HIDDEN and not
    // unmounted. The `ResizeObserver` of the spectrum and the barrier of the `memo` of
    // `OrientationPanel` depend on that.
    const plegado = await render(
      <Dock orientacion={orientacion()} transporte={transporte()} abierto={false} onToggle={onToggle} />,
    );
    await expect.element(page.getByRole('button', { name: /^Piezas$/, expanded: false })).toBeInTheDocument();
    const oculta = plegado.container.querySelector('#dock-piezas')!;
    expect(oculta.hasAttribute('hidden')).toBe(true);
    // The tree stays alive: the twelve thumbnails are in the DOM although they do not show.
    expect(oculta.querySelectorAll('button').length).toBeGreaterThan(12);
  });

  it('the box of the dock is measured in CELLS, which keeps it off (9,5) on the reference board', async () => {
    // With fixed sizes, the count of the cells that the dock covers holds for one viewport
    // only: on the reference board of 10 × 6 cells, a dock 640 px high and centred enters
    // row 5 at 1366 x 768 and covers `(9,5)`, where the playhead starts. Measured in
    // cells, it covers the same eight cells always.
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
    // It is the only place where the four direct gestures and the letter are written:
    // without it they are invisible. And it cannot go below the board: that gives the page
    // a scroll.
    const { container } = await render(
      <PiecePalette orientacion={orientacion()} transporte={transporte()} />,
    );
    expect(container.textContent).toContain('Rueda sobre el tablero');
    expect(container.textContent).toContain('refleja');
    expect(container.textContent).toContain('arranca y para');
    expect(container.textContent).toContain('pieza la elige');
  });

  it('the order of the dock, from top to bottom', async () => {
    // The click switch is in the transport, so between the thumbnails and the `border-t`
    // there are two rows, and neither belongs to another panel.
    const { container } = await render(
      <PiecePalette orientacion={orientacion()} transporte={transporte()} />,
    );
    const texto = container.textContent!;
    expect(texto.indexOf('Rotación')).toBeLessThan(texto.indexOf('tónica'));
    expect(texto.indexOf('tónica')).toBeLessThan(texto.indexOf('Notas actuales'));
    expect(texto.indexOf('Notas actuales')).toBeLessThan(texto.indexOf('Tempo'));
  });
});
