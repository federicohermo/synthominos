import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import OrientationPanel from '../OrientationPanel.tsx';
import { MINI_BOX, MINI_CELL_PX } from '../../pieces/piece-mini.ts';
import { PIECE_COLOR } from '../../pieces/palette.ts';
import { SHAPES } from '../../pieces/pieces.ts';
import { REGIMEN } from '../../musical-model/music.ts';
import { ORIENTACIONES_INICIALES } from '../../pieces/orientation.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PropsDeOrientacion } from '../OrientationPanel.tsx';
import type { MemoriaDeOrientacion, Orientacion } from '../../pieces/orientation.ts';

const PIEZAS = Object.keys(SHAPES) as PieceKey[];

const memoria = (pisadas: Partial<MemoriaDeOrientacion> = {}): MemoriaDeOrientacion =>
  ({ ...ORIENTACIONES_INICIALES, ...pisadas });

const todas = (o: Orientacion): MemoriaDeOrientacion =>
  Object.fromEntries(PIEZAS.map(p => [p, o])) as MemoriaDeOrientacion;

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

describe('OrientationPanel', () => {
  it('AC-PNL-013 — there are twelve, each with its letter', async () => {
    const { container } = await render(<OrientationPanel orientacion={orientacion()} />);
    const botones = container.querySelectorAll('button');
    expect(botones.length).toBe(PIEZAS.length);
    for (const key of PIEZAS) {
      expect(container.textContent).toContain(key);
    }
  });

  it('AC-ACC-009 — the accessible name says the REMEMBERED orientation, not the canonical one', async () => {
    const a = await render(<OrientationPanel orientacion={orientacion({
      orientaciones: memoria({ F: { rotation: 1, mirror: true } }),
    })} />);
    await expect.element(page.getByRole('button', { name: 'F, rotación 90°, reflejada' })).toBeVisible();
    await a.unmount();

    await render(<OrientationPanel orientacion={orientacion({
      orientaciones: memoria({ Z: { rotation: 2, mirror: false } }),
    })} />);
    await expect.element(page.getByRole('button', { name: 'Z, rotación 180°' })).toBeVisible();
  });

  it('AC-ACC-009 AC-PNL-032 — each thumbnail says and draws ITS orientation, not the one of the piece in hand', async () => {
    const distintas = Object.fromEntries(
      PIEZAS.map((p, i) => [p, { rotation: (i % 4) as 0 | 1 | 2 | 3, mirror: i % 2 === 1 }]),
    ) as MemoriaDeOrientacion;
    const { container } = await render(
      <OrientationPanel orientacion={orientacion({ orientaciones: distintas })} />,
    );
    for (const [i, key] of PIEZAS.entries()) {
      const boton = [...container.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label')!.startsWith(`${key},`))!;
      const grados = (i % 4) * 90;
      const esperado = `${key}, rotación ${grados}°${i % 2 === 1 ? ', reflejada' : ''}`;
      expect(boton.getAttribute('aria-label'), key).toBe(esperado);
    }
  });

  it('AC-PNL-032 — a rotation of ONE piece leaves the other eleven exactly as they were', async () => {
    const huella = (c: HTMLElement) => [...c.querySelectorAll('button')].map(b => ({
      nombre: b.getAttribute('aria-label'),
      celdas: [...b.querySelectorAll('div.grid > div')]
        .map((d, i) => ((d as HTMLElement).style.background !== '' ? i : -1))
        .filter(i => i >= 0).join(','),
    }));

    const antes = await render(<OrientationPanel orientacion={orientacion()} />);
    const base = huella(antes.container);
    await antes.unmount();

    const { container } = await render(<OrientationPanel orientacion={orientacion({
      orientaciones: memoria({ L: { rotation: 3, mirror: true } }),
    })} />);
    const ahora = huella(container);

    for (const [i, key] of PIEZAS.entries()) {
      if (key === 'L') {
        expect(ahora[i], 'the L must change').not.toEqual(base[i]);
      } else {
        expect(ahora[i], key).toEqual(base[i]);
      }
    }
  });

  it('AC-PNL-013 — a rotation moves NO pixel of the slot grid, which is why the box is fixed', async () => {
    const medir = async (orientaciones: MemoriaDeOrientacion) => {
      const { container, unmount } = await render(
        <OrientationPanel orientacion={orientacion({ orientaciones })} />,
      );
      const anchos = [...container.querySelectorAll('button')]
        .map(b => Math.round(b.getBoundingClientRect().width));
      const altos = [...container.querySelectorAll('button')]
        .map(b => Math.round(b.getBoundingClientRect().height));
      await unmount();
      return { anchos, altos };
    };

    const base = await medir(todas({ rotation: 0, mirror: false }));
    expect(base.anchos[0]).toBeGreaterThan(0);

    for (const rotation of [1, 2, 3] as const) {
      for (const mirror of [false, true]) {
        const { anchos, altos } = await medir(todas({ rotation, mirror }));
        expect(anchos, `rot${rotation}${mirror ? ' mirror' : ''}`).toEqual(base.anchos);
        expect(altos, `rot${rotation}${mirror ? ' mirror' : ''}`).toEqual(base.altos);
      }
    }

    const distintas = Object.fromEntries(
      PIEZAS.map((p, i) => [p, { rotation: (i % 4) as 0 | 1 | 2 | 3, mirror: i % 2 === 1 }]),
    ) as MemoriaDeOrientacion;
    const mezcla = await medir(distintas);
    expect(mezcla.anchos, 'twelve different orientations').toEqual(base.anchos);
    expect(mezcla.altos, 'twelve different orientations').toEqual(base.altos);
  });

  it('AC-PNL-013 — the box is 5 × MINI_CELL_PX, and not the size of the piece', async () => {
    const { container } = await render(<OrientationPanel orientacion={orientacion()} />);
    for (const boton of container.querySelectorAll('button')) {
      const caja = boton.querySelector('div.grid')!;
      expect(caja.children.length).toBe(MINI_BOX * MINI_BOX);

      const pistas = getComputedStyle(caja).gridTemplateColumns.split(' ');
      expect(pistas.length).toBe(MINI_BOX);
      for (const p of pistas) expect(Math.round(parseFloat(p))).toBe(MINI_CELL_PX);
      expect(Math.round(caja.getBoundingClientRect().width)).toBe(MINI_BOX * MINI_CELL_PX);
    }
  });

  it('AC-PNL-014 — the shape is painted in the color of the piece, and the background of the slot is NOT', async () => {
    const { container } = await render(<OrientationPanel orientacion={orientacion({ selected: 'F' })} />);
    const boton = container.querySelector('button')!;
    const llenas = [...boton.querySelectorAll('div.grid > div')]
      .filter(d => (d as HTMLElement).style.background !== '');

    expect(llenas.length).toBe(SHAPES.F.length);
    expect(getComputedStyle(boton).backgroundColor).not.toBe(PIECE_COLOR.F.bg);
  });

  it('AC-PNL-014 — the border is INVERTED with the state, and the two colors are different', async () => {
    const bordeDe = async (selected: PieceKey, mira: PieceKey) => {
      const { container, unmount } = await render(
        <OrientationPanel orientacion={orientacion({ selected })} />,
      );
      const boton = [...container.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label')!.startsWith(`${mira},`))!;
      const llena = [...boton.querySelectorAll('div.grid > div')]
        .find(d => (d as HTMLElement).style.background !== '')!;
      const color = getComputedStyle(llena).borderTopColor;
      await unmount();
      return color;
    };

    const seleccionada = await bordeDe('F', 'F');
    const suelta = await bordeDe('Z', 'F');
    expect(seleccionada).not.toBe(suelta);
    expect(seleccionada).not.toBe('');
    expect(suelta).not.toBe('');
  });

  it('AC-PNL-015 — the click gives the piece that was pressed', async () => {
    const onSelect = vi.fn();
    await render(<OrientationPanel orientacion={orientacion({ onSelect })} />);
    await page.getByRole('button', { name: 'W, rotación 0°' }).click();
    expect(onSelect).toHaveBeenCalledWith('W');
  });

  it('AC-ACC-008 — the twelve declare aria-pressed and exactly one is true', async () => {
    const { container, unmount } = await render(
      <OrientationPanel orientacion={orientacion({ selected: 'F' })} />,
    );
    const botones = [...container.querySelectorAll('button')];
    expect(botones.length).toBe(PIEZAS.length);
    for (const boton of botones) {
      expect(boton.getAttribute('aria-pressed')).not.toBeNull();
    }
    const presionados = botones.filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(presionados.length).toBe(1);
    await expect.element(page.getByRole('button', { name: /^F,/, pressed: true })).toBeVisible();
    await unmount();

    const { container: otro, unmount: unmountOtro } = await render(
      <OrientationPanel orientacion={orientacion({ selected: 'W' })} />,
    );
    const botonesOtro = [...otro.querySelectorAll('button')];
    const presionadosOtro = botonesOtro.filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(presionadosOtro.length).toBe(1);
    await expect.element(page.getByRole('button', { name: /^W,/, pressed: true })).toBeVisible();
    await unmountOtro();
  });
});
