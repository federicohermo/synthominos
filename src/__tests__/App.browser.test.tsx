import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { SHAPES, ANCHOR_INDEX } from '../pieces/pieces.ts';
import { grillaPara } from '../board-fit/grid-fit.ts';
import { MAX_PIEZAS, cellsAt } from '../board-editing/placement.ts';
import { REGIMEN, arpeggioFor } from '../musical-model/music.ts';
import { DEFAULT_BPM } from '../playback/scheduler.ts';
import { rotateN, reflect } from '../pieces/transform.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { ReactNode } from 'react';
import type { PropsDeOrientacion } from '../panels/OrientationPanel.tsx';

const motor = vi.hoisted(() => {
  const estado = { corriendo: false };
  return {
    estado,
    setSequence: vi.fn(),
    setBpm: vi.fn(),
    setClicksAudible: vi.fn(),
    startClock: vi.fn(() => { estado.corriendo = true; }),
    stopClock: vi.fn(() => { estado.corriendo = false; }),
    clockRunning: vi.fn(() => estado.corriendo),
    playNow: vi.fn(),
    playNotes: vi.fn(),
    playheadOffset: () => null,
    readSpectrum: () => null,
    cycleGeneration: () => 0,
  };
});
vi.mock('../playback/engine.ts', () => motor);

/** The counter is inside the `memo`: a wrapper outside it counts ten runs with or without the barrier. */
const panel = vi.hoisted(() => ({ ejecuciones: 0 }));
vi.mock('../panels/OrientationPanel.tsx', async (importActual) => {
  const real = await importActual<typeof import('../panels/OrientationPanel.tsx')>();
  const { memo } = await import('react');
  const memoizado = (c: unknown): c is { type: (props: { orientacion: PropsDeOrientacion }) => ReactNode } =>
    typeof c === 'object' && c !== null && 'type' in c && typeof c.type === 'function';
  if (!memoizado(real.default)) {
    throw new Error('OrientationPanel is not memoized: the count would measure the wrapper.');
  }
  const interior = real.default.type;
  return {
    default: memo((props: { orientacion: PropsDeOrientacion }) => {
      panel.ejecuciones++;
      return interior(props);
    }),
  };
});

const App = (await import('../App.tsx')).default;

/** Playwright starts at 414 x 896: the board then has 6 columns, and these cases point outside it. */
const VIEWPORT: [number, number] = [1024, 768];
const { dims: DIMS } = grillaPara(...VIEWPORT);

beforeEach(async () => {
  await page.viewport(...VIEWPORT);
  motor.estado.corriendo = false;
  for (const v of Object.values(motor)) if (typeof v === 'function' && 'mockClear' in v) v.mockClear();
});

const celdas = (c: HTMLElement) => [...c.querySelectorAll('[role="gridcell"]')] as HTMLElement[];
const anchoDe = (c: HTMLElement) => Number(c.querySelector('[role="grid"]')!.getAttribute('aria-colcount'));
const celda = (c: HTMLElement, x: number, y: number) => celdas(c)[y * anchoDe(c) + x];
const baldosa = (el: HTMLElement) => el.firstElementChild as HTMLElement;

const donde = (piece: PieceKey, x: number, y: number, rot = 0, mirror = false) => {
  const base = rotateN(SHAPES[piece], rot);
  return cellsAt(mirror ? reflect(base) : base, ANCHOR_INDEX[piece], x, y);
};

const conNota = (c: HTMLElement) => celdas(c).filter(e => baldosa(e).textContent !== '').length;

const notaDelFantasma = (c: HTMLElement) => {
  const conTexto = celdas(c).filter(e => baldosa(e).textContent !== '');
  return conTexto.map(e => e.getAttribute('title')).join('|');
};

/** A modifier tap is two events: the `keydown` opens the clean tap and the `keyup` toggles. */
const tapDeModificador = (el: EventTarget, key: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
};

const hover = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
const click = (el: HTMLElement, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));

describe('App: the composition', () => {
  it('the board and the two floating panels, with no card', async () => {
    const { container } = await render(<App />);
    expect(celdas(container).length).toBe(DIMS.w * DIMS.h);

    await expect.element(page.getByRole('button', { name: /^Piezas$/, expanded: true })).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: /^Señal$/, expanded: true })).toBeInTheDocument();

    for (const flotante of container.querySelectorAll('aside')) {
      expect(getComputedStyle(flotante).position).toBe('fixed');
    }

    expect(container.textContent).toContain('Rueda sobre el tablero');
    expect(container.textContent).toContain('arranca y para');
  });

  it('AC-FIT-008 — the page does not scroll: the board has the exact size of the viewport', async () => {
    await render(<App />);
    expect(document.documentElement.scrollHeight).toBe(document.documentElement.clientHeight);
  });

  it('AC-PNL-002 — the two floating panels fold, and the spectrum stays alive when folded', async () => {
    const { container } = await render(<App />);
    const senal = page.getByRole('button', { name: /^Señal$/ });
    const region = container.querySelector('#franja-senal')!;
    expect(region.hasAttribute('hidden')).toBe(false);
    expect(region.querySelector('canvas')).not.toBeNull();

    await senal.click();
    await vi.waitFor(() => expect(region.hasAttribute('hidden')).toBe(true));
    expect(region.querySelector('canvas')).not.toBeNull();

    await senal.click();
    await vi.waitFor(() => expect(region.hasAttribute('hidden')).toBe(false));

    const piezas = page.getByRole('button', { name: /^Piezas$/ });
    const dock = container.querySelector('#dock-piezas')!;
    expect(dock.hasAttribute('hidden')).toBe(false);
    await piezas.click();
    await vi.waitFor(() => expect(dock.hasAttribute('hidden')).toBe(true));
    expect(region.hasAttribute('hidden')).toBe(false);
    expect(dock.querySelectorAll('button').length).toBeGreaterThan(12);
    await piezas.click();
    await vi.waitFor(() => expect(dock.hasAttribute('hidden')).toBe(false));
  });

  it('AC-MUS-012 AC-PLY-005 — it starts with the tempo of the engine and the scale regime', async () => {
    const { container } = await render(<App />);
    expect(container.textContent).toContain(String(DEFAULT_BPM));
    await expect.element(page.getByRole('button', { name: REGIMEN.escala })).toHaveClass(/bg-slate-900/);
  });
});

describe('App: place', () => {
  it('AC-BRD-002 — the click places the piece in hand and fires its arpeggio', async () => {
    const { container } = await render(<App />);
    click(celda(container, 3, 2));

    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.playNow).toHaveBeenCalledWith(arpeggioFor('F', 0, false, REGIMEN.escala));
  });

  it('AC-BRD-005 — with the transport running it does NOT fire it: the arpeggio would sound two times', async () => {
    const { container } = await render(<App />);
    await page.getByRole('button', { name: 'Reproducir' }).click();
    motor.playNow.mockClear();

    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.playNow).not.toHaveBeenCalled();
  });

  it('AC-BRD-006 — `Alt`+click places MUTED, and it does not sound either', async () => {
    const { container } = await render(<App />);
    click(celda(container, 3, 2), { altKey: true });

    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.playNow).not.toHaveBeenCalled();
    const [x, y] = donde('F', 3, 2)[0];
    expect(baldosa(celda(container, x, y)).className).toContain('bg-white');
  });

  it('AC-BRD-003 — an invalid move places nothing', async () => {
    const { container } = await render(<App />);
    click(celda(container, 0, 0));
    await new Promise(r => setTimeout(r, 30));
    expect(conNota(container)).toBe(0);
    expect(motor.playNow).not.toHaveBeenCalled();
  });
});

describe('App: edit on the board', () => {
  const conUnaF = async () => {
    const vista = await render(<App />);
    click(celda(vista.container, 3, 2));
    await vi.waitFor(() => expect(conNota(vista.container)).toBe(SHAPES.F.length));
    motor.playNow.mockClear();
    return vista;
  };

  it('AC-BRD-007 — the click on an own piece REMOVES it', async () => {
    const { container } = await conUnaF();
    const [x, y] = donde('F', 3, 2)[0];
    click(celda(container, x, y));
    await vi.waitFor(() => expect(conNota(container)).toBe(0));
  });

  it('AC-BRD-010 — `Alt`+click on an own piece toggles its mute, there and back', async () => {
    const { container } = await conUnaF();
    const [x, y] = donde('F', 3, 2)[0];

    click(celda(container, x, y), { altKey: true });
    await vi.waitFor(() => expect(baldosa(celda(container, x, y)).className).toContain('bg-white'));
    expect(conNota(container)).toBe(SHAPES.F.length);

    click(celda(container, x, y), { altKey: true });
    await vi.waitFor(() => expect(baldosa(celda(container, x, y)).style.background).not.toBe(''));
  });

  it('AC-BRD-011 — the mute of one piece does not touch the others', async () => {
    const { container } = await conUnaF();
    click(celda(container, 8, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length * 2));

    const [x1, y1] = donde('F', 3, 2)[0];
    const [x2, y2] = donde('F', 8, 3)[0];
    click(celda(container, x1, y1), { altKey: true });

    await vi.waitFor(() => expect(baldosa(celda(container, x1, y1)).className).toContain('bg-white'));
    expect(baldosa(celda(container, x2, y2)).style.background).not.toBe('');
    expect(conNota(container)).toBe(SHAPES.F.length * 2);
  });

  it('AC-BRD-009 — on a piece that is NOT in hand nothing happens', async () => {
    const { container } = await conUnaF();
    await page.getByRole('button', { name: 'W, rotación 0°' }).click();
    const [x, y] = donde('F', 3, 2)[0];
    click(celda(container, x, y));

    await new Promise(r => setTimeout(r, 30));
    expect(conNota(container)).toBe(SHAPES.F.length);
  });
});

describe('App: the ghost', () => {
  it('AC-BRD-014 — it shows under the cursor and goes away when the cursor leaves the board', async () => {
    const { container } = await render(<App />);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    container.querySelector('[role="grid"]')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await vi.waitFor(() => expect(conNota(container)).toBe(0));
  });

  it('AC-BRD-015 — on an own piece it is NOT drawn: there the click edits, it does not place', async () => {
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    const [x, y] = donde('F', 3, 2)[0];
    hover(celda(container, x, y));
    await new Promise(r => setTimeout(r, 30));
    expect(conNota(container)).toBe(SHAPES.F.length);
    expect(container.querySelectorAll('.bg-rose-500').length).toBe(0);
    expect(celda(container, x, y).className).toContain('cursor-pointer');
  });
});

describe('App: the transport', () => {
  it('AC-PLY-002 — the button shows whether the clock STARTED, not whether it was pressed', async () => {
    const { container } = await render(<App />);
    await page.getByRole('button', { name: 'Reproducir' }).click();
    expect(motor.startClock).toHaveBeenCalled();
    await expect.element(page.getByRole('button', { name: 'Pausa' })).toBeVisible();

    await page.getByRole('button', { name: 'Pausa' }).click();
    expect(motor.stopClock).toHaveBeenCalled();
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
    expect(container).toBeTruthy();
  });

  it('AC-PLY-003 — if the engine does NOT start, the button stays on Reproducir', async () => {
    motor.startClock.mockImplementationOnce(() => {});
    await render(<App />);
    await page.getByRole('button', { name: 'Reproducir' }).click();
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
  });

  it('AC-BRD-030 AC-PLY-038 — Reset stops the transport AS WELL AS it empties the board', async () => {
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    await page.getByRole('button', { name: 'Reproducir' }).click();
    motor.stopClock.mockClear();

    await page.getByRole('button', { name: 'Vaciar el tablero y frenar el transporte' }).click();
    expect(motor.stopClock).toHaveBeenCalled();
    await vi.waitFor(() => expect(conNota(container)).toBe(0));
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
  });

  it('AC-PLY-006 — the tempo and the clicks go down to the engine', async () => {
    await render(<App />);
    await page.getByRole('slider').fill('128');
    await vi.waitFor(() => expect(motor.setBpm).toHaveBeenLastCalledWith(128));

    // The same render as the tempo: with two apps mounted, a query by role is a strict mode violation.
    await page.getByRole('button', { name: /^Recorrido en el vacío$/ }).click();
    await vi.waitFor(() => expect(motor.setClicksAudible).toHaveBeenLastCalledWith(true));
  });
});

describe('App: the orientation, by panel and by gesture', () => {
  it('AC-PNL-018 AC-PNL-020 — the panel does not rotate or reflect: it SAYS the orientation', async () => {
    const { container } = await render(<App />);
    for (const grados of ['0°', '90°', '180°', '270°']) {
      expect(page.getByRole('button', { name: new RegExp(`^${grados}$`) }).elements(), grados)
        .toHaveLength(0);
    }
    expect(page.getByRole('button', { name: /^Reflexión$/ }).elements()).toHaveLength(0);

    // The inner `<span>`: the `<p>` also holds the `0°` button, so its text is `0°0°`.
    const linea = () => [...container.querySelectorAll('p > span')].find(e => /^\d+°/.test(e.textContent!))!;
    expect(linea().textContent).toBe('0°');

    tapDeModificador(window, 'Shift');
    await vi.waitFor(() => expect(linea().textContent).toBe('90°'));
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(linea().textContent).toBe('90° · reflejada'));
  });

  it('AC-PCS-019 AC-PCS-020 AC-PCS-021 — the orientation belongs to the PIECE: it is remembered, and the `0°` resets one piece', async () => {
    const { container } = await render(<App />);
    const linea = () => [...container.querySelectorAll('p > span')].find(e => /^\d+°/.test(e.textContent!))!;
    const nombreDe = (key: string) => [...container.querySelectorAll('button')]
      .map(b => b.getAttribute('aria-label'))
      .find(n => n !== null && n.startsWith(`${key},`));

    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(linea().textContent).toBe('180° · reflejada'));
    expect(nombreDe('T')).toBe('T, rotación 0°');
    expect(nombreDe('F')).toBe('F, rotación 180°, reflejada');

    await page.getByRole('button', { name: 'T, rotación 0°' }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('0°'));
    await page.getByRole('button', { name: 'F, rotación 180°, reflejada' }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('180° · reflejada'));

    await page.getByRole('button', { name: /^Volver esta pieza a 0° sin reflejar$/ }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('0°'));
    expect(nombreDe('F')).toBe('F, rotación 0°');
    expect(nombreDe('T')).toBe('T, rotación 0°');
  });

  it('AC-BRD-030 AC-PCS-022 — `↺` empties the board and does NOT touch the remembered orientations', async () => {
    const { container } = await render(<App />);
    tapDeModificador(window, 'Shift');
    await vi.waitFor(() => expect(container.textContent).toContain('90°'));
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBeGreaterThan(0));

    await page.getByRole('button', { name: 'Vaciar el tablero y frenar el transporte' }).click();
    await vi.waitFor(() => expect(conNota(container)).toBe(0));
    const nombre = [...container.querySelectorAll('button')]
      .map(b => b.getAttribute('aria-label'))
      .find(n => n !== null && n.startsWith('F,'));
    expect(nombre).toBe('F, rotación 90°');
  });

  it('AC-PCS-023 — a rotation of the piece in hand changes no note of a placed piece', async () => {
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const puesta = () => donde('F', 3, 2)
      .map(([x, y]) => `${baldosa(celda(container, x, y)).textContent}@${celda(container, x, y).getAttribute('title')}`);
    const antes = puesta();

    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(container.textContent).toContain('90° · reflejada'));

    expect(puesta()).toEqual(antes);
    expect(conNota(container)).toBe(SHAPES.F.length);
  });

  it('AC-MUS-013 — the regime changes what the rotation DOES, and the ghost shows it', async () => {
    const { container } = await render(<App />);
    tapDeModificador(window, 'Shift');
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const enEscala = notaDelFantasma(container);

    await page.getByRole('button', { name: REGIMEN.orden }).click();
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(enEscala));
  });

  it('AC-BRD-024 AC-BRD-028 — `Shift` rotates, `Ctrl` reflects and the space bar toggles the transport', async () => {
    const { container } = await render(<App />);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const antes = notaDelFantasma(container);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    const conRotacion = notaDelFantasma(container);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(conRotacion));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(motor.startClock).toHaveBeenCalled());
  });

  it('AC-BRD-023 — the wheel on the board rotates, and `Ctrl`+wheel does not', async () => {
    const { container } = await render(<App />);
    const tablero = container.querySelector('div.relative')!;
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const antes = notaDelFantasma(container);

    tablero.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    const conRueda = notaDelFantasma(container);
    tablero.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 30));
    hover(celda(container, 4, 3));
    await new Promise(r => setTimeout(r, 30));
    expect(notaDelFantasma(container)).toBe(conRueda);
  });

  it('AC-BRD-026 — the right button reflects, except the `Ctrl`+click of macOS', async () => {
    const { container } = await render(<App />);
    const tablero = container.querySelector('div.relative')!;
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const antes = notaDelFantasma(container);

    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    tablero.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    const conReflexion = notaDelFantasma(container);
    tablero.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ctrlKey: true }));
    await new Promise(r => setTimeout(r, 30));
    hover(celda(container, 4, 3));
    await new Promise(r => setTimeout(r, 30));
    expect(notaDelFantasma(container)).toBe(conReflexion);
  });

  it('the choice of another piece changes the piece in hand', async () => {
    const { container } = await render(<App />);
    await page.getByRole('button', { name: 'I, rotación 0°' }).click();
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.I.length));
    expect(container.textContent).toContain('tónica');
  });

  it('AC-BRD-017 — the LETTER chooses the piece, with no visit to the panel', async () => {
    const { container } = await render(<App />);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      for (const [x, y] of donde('I', 4, 3)) {
        expect(baldosa(celda(container, x, y)).textContent, `${x},${y}`).not.toBe('');
      }
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', shiftKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      for (const [x, y] of donde('P', 4, 3)) {
        expect(baldosa(celda(container, x, y)).textContent, `${x},${y}`).not.toBe('');
      }
    });
  });
});

describe('App: what reaches the accessible tree', () => {
  it('AC-ACC-011 — no button of the app can submit a form', async () => {
    // 12 slots + 2 of the regime + 3 of the transport row + the `0°` + 2 panel headers = 20.
    const { container } = await render(<App />);
    const botones = [...container.querySelectorAll('button')];
    expect(botones.length).toBe(20);
    for (const boton of botones) {
      expect(boton.getAttribute('type'), boton.textContent ?? '').toBe('button');
    }
  });
});

describe('App: what a move of the cursor costs', () => {
  const RECORRIDO = [2, 3].flatMap(y => [1, 2, 3, 4, 5].map(x => [x, y] as const));

  const huella = (c: HTMLElement) => celdas(c).map(e => (baldosa(e).textContent === '' ? '0' : '1')).join('');

  it('to cross ten cells does not run the orientation panel, and a rotation does', async () => {
    panel.ejecuciones = 0;
    const { container } = await render(<App />);
    expect(panel.ejecuciones).toBe(1);
    panel.ejecuciones = 0;

    // `mouseover` is a continuous event: React 19 batches two dispatches in a row. So wait for the repaint.
    const huellas = new Set<string>();
    let antes = huella(container);
    for (const [x, y] of RECORRIDO) {
      hover(celda(container, x, y));
      await vi.waitFor(() => expect(huella(container)).not.toBe(antes));
      antes = huella(container);
      huellas.add(antes);
    }

    expect(huellas.size).toBe(RECORRIDO.length);
    expect(conNota(container)).toBe(SHAPES.F.length);
    expect(panel.ejecuciones).toBe(0);

    tapDeModificador(window, 'Shift');
    await vi.waitFor(() => expect(panel.ejecuciones).toBe(1));
  });
});

/** Dispatch on the cell, with `bubbles`: the global listener reads `e.target.closest('[role="gridcell"]')`. */
const tecla = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(evento);
  return evento;
};

const aLaVista = (c: HTMLElement) =>
  c.querySelector('div.relative')!.scrollIntoView({ block: 'center' });

describe('App: the board is played with the keyboard', () => {
  it('AC-ACC-013 — from the dock, ONE `Tab` enters the board and one more leaves it', async () => {
    // A real `Tab`: a count of `tabIndex` reads the DOM, not the tab order of the browser.
    const { container } = await render(<App />);
    const ancla = celdas(container).find(c => c.tabIndex === 0)!;

    const paradas = [...container.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')];
    paradas[paradas.indexOf(ancla) - 1].focus();

    await userEvent.tab();
    expect(document.activeElement).toBe(ancla);

    await userEvent.tab();
    expect(celdas(container)).not.toContain(document.activeElement);
  });

  it('AC-ACC-016 — the arrows move the DOM focus, and the page does NOT scroll', async () => {
    // Real keys: an untrusted event never runs the default action, so "no scroll" passes empty.
    const { container } = await render(<App />);
    aLaVista(container);
    const origen = celda(container, 4, 2);
    origen.focus();

    expect(document.documentElement.scrollHeight)
      .toBe(document.documentElement.clientHeight);
    const antes = [document.documentElement.scrollTop, document.documentElement.scrollLeft];

    await new Promise(r => setTimeout(r, 60));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(celda(container, 5, 2));
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(celda(container, 5, 3));
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(celda(container, 4, 3));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(origen);

    expect([document.documentElement.scrollTop, document.documentElement.scrollLeft])
      .toEqual(antes);
  });

  it('`Home` and `End` go to the ends of THEIR row, and do not leave it', async () => {
    const { container } = await render(<App />);
    aLaVista(container);
    const media = celda(container, 5, 3);
    media.focus();

    expect(tecla(media, 'End').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(celda(container, anchoDe(container) - 1, 3));
    tecla(celda(container, anchoDe(container) - 1, 3), 'Home');
    expect(document.activeElement).toBe(celda(container, 0, 3));
    tecla(celda(container, 0, 3), 'Home');
    expect(document.activeElement).toBe(celda(container, 0, 3));
  });

  it('AC-ACC-020 — `Enter` places, `Enter` on an own piece removes it, `Alt`+`Enter` mutes, and the region says it', async () => {
    const { container } = await render(<App />);
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;
    const dicho = () => container.querySelector('[aria-live="polite"]')!.textContent;
    const c = celda(container, 3, 2);
    c.focus();

    tecla(c, 'Enter');
    await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.F.length));
    expect(dicho()).toBe('pieza F colocada en fila 3, columna 4');

    tecla(c, 'Enter');
    await vi.waitFor(() => expect(conPieza()).toBe(0));
    expect(dicho()).toBe('pieza F quitada de fila 3, columna 4');

    const [mx, my] = donde('F', 3, 2)[0];
    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(baldosa(celda(container, mx, my)).className).toContain('bg-white'));
    expect(conPieza()).toBe(SHAPES.F.length);
    expect(dicho()).toBe('pieza F colocada muteada en fila 3, columna 4');

    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(dicho()).toBe('pieza F con sonido en fila 3, columna 4'));
    expect(baldosa(celda(container, mx, my)).style.background).not.toBe('');

    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(dicho()).toBe('pieza F muteada en fila 3, columna 4'));
  });

  it('AC-BRD-031 — with a cell focused the space bar does NOT toggle the transport; with the focus on the `body`, it does', async () => {
    const { container } = await render(<App />);
    const c = celda(container, 3, 2);
    c.focus();

    tecla(c, ' ');
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.startClock).not.toHaveBeenCalled();
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();

    const play = [...container.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') ?? b.textContent) === 'Reproducir')!;
    play.focus();
    tecla(play, ' ');
    expect(motor.startClock).not.toHaveBeenCalled();

    play.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(motor.startClock).toHaveBeenCalled());
    await expect.element(page.getByRole('button', { name: 'Pausa' })).toBeVisible();
  });

  it('AC-BRD-032 — with a cell focused, `Shift` DOES rotate and `Ctrl` DOES reflect', async () => {
    const { container } = await render(<App />);
    const c = celda(container, 4, 3);
    c.focus();
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const antes = notaDelFantasma(container);

    tapDeModificador(c, 'Shift');
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    const conRotacion = notaDelFantasma(container);
    tapDeModificador(c, 'Control');
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(conRotacion));
  });

  it('AC-BRD-021 AC-BRD-032 — with a cell focused, the letter STILL chooses the piece', async () => {
    const { container } = await render(<App />);
    const c = celda(container, 4, 3);
    c.focus();
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    tecla(c, 'i');
    await vi.waitFor(() => {
      for (const [x, y] of donde('I', 4, 3)) {
        expect(baldosa(celda(container, x, y)).textContent, `${x},${y}`).not.toBe('');
      }
    });
    expect(motor.startClock).not.toHaveBeenCalled();
  });

  it('AC-ACC-022 — with the focus on a cell, a mouse that leaves the grid does not clear the ghost', async () => {
    const { container } = await render(<App />);
    celda(container, 4, 3).focus();
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const conFoco = notaDelFantasma(container);

    container.querySelector('[role="grid"]')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    // A real wait: without it, the assertion runs before the re-render.
    await new Promise(r => setTimeout(r, 30));
    expect(conNota(container)).toBe(SHAPES.F.length);
    expect(notaDelFantasma(container)).toBe(conFoco);
  });

  it('AC-ACC-023 — a mouse click does NOT take the command from the mouse: the ghost follows the cursor', async () => {
    // A real click: `dispatchEvent('click')` fires no `mousedown`, so it does not move the focus.
    const { container } = await render(<App />);
    aLaVista(container);

    await userEvent.click(celda(container, 2, 1));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(celdas(container)).not.toContain(document.activeElement);

    await userEvent.hover(celda(container, 7, 4));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length * 2));
  });
});

describe('App: the background, one value', () => {
  it('AC-PNL-030 — the root div paints the same as the body, and neither is transparent', async () => {
    const { container } = await render(<App />);
    const raiz = container.firstElementChild!;
    const delDiv = getComputedStyle(raiz).backgroundColor;
    const delBody = getComputedStyle(document.body).backgroundColor;

    expect(delDiv).toBe(delBody);

    expect(delDiv).not.toBe('rgba(0, 0, 0, 0)');
    expect(delBody).not.toBe('rgba(0, 0, 0, 0)');
  });
});

describe('App: the board grows to the screen', () => {
  it('AC-FIT-008 — neither axis scrolls, on a desktop or on a phone', async () => {
    for (const [w, h] of [[1440, 900], [375, 667]] as const) {
      await page.viewport(w, h);
      const { container, unmount } = await render(<App />);
      const raiz = document.documentElement;
      expect(raiz.scrollWidth, `${w}x${h} width`).toBeLessThanOrEqual(raiz.clientWidth);
      expect(raiz.scrollHeight, `${w}x${h} height`).toBe(raiz.clientHeight);

      const tablero = container.querySelector('div.relative')!;
      expect(tablero.scrollWidth, `${w}x${h} board`).toBeLessThanOrEqual(tablero.clientWidth + 1);
      await unmount();
    }
  });

  it('AC-FIT-010 — the grid that is drawn is the one that comes from the viewport', async () => {
    await page.viewport(375, 667);
    const { container } = await render(<App />);
    const grilla = container.querySelector('[role="grid"]')!;
    const esperado = grillaPara(375, 667).dims;
    expect(Number(grilla.getAttribute('aria-colcount'))).toBe(esperado.w);
    expect(Number(grilla.getAttribute('aria-rowcount'))).toBe(esperado.h);
    expect(celdas(container).length).toBe(esperado.w * esperado.h);
  });

  it('AC-ACC-028 AC-BRD-004 — piece 13 does not enter, and the app says it', async () => {
    const { container } = await render(<App />);
    const dicho = () => container.querySelector('[aria-live="polite"]')!.textContent;
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;

    // Twelve flat `I`, two in each row: the board of 1024 x 768 has 14 columns and 11 rows.
    const primera = celda(container, 2, 0);
    primera.focus();
    tecla(primera, 'i');
    await vi.waitFor(() => expect(page.getByRole('button', { name: /^I, / }).element().getAttribute('aria-pressed')).toBe('true'));

    for (let i = 0; i < MAX_PIEZAS; i++) {
      const c = celda(container, (i % 2) * 7 + 2, Math.floor(i / 2));
      c.focus();
      tecla(c, 'Enter');
      await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.I.length * (i + 1)));
    }

    const trece = celda(container, 2, 7);
    trece.focus();
    tecla(trece, 'Enter');
    await vi.waitFor(() => expect(dicho()).toContain(`acepta ${MAX_PIEZAS} piezas`));
    expect(conPieza()).toBe(SHAPES.I.length * MAX_PIEZAS);
  });

  it('AC-FIT-021 — a smaller window deletes no piece: they come back whole when it grows', async () => {
    const { container } = await render(<App />);
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;
    const nombres = () => celdas(container)
      .map(e => e.getAttribute('aria-label')!)
      .filter(n => n.includes('pieza'));

    // Grip cell on (11,4): the `I` takes (9,4) to (13,4). It fits in 14 columns and not in 5.
    // Wait for the selection: before the re-render, `Enter` places the `F`, which also has five cells.
    const c = celda(container, 11, 4);
    c.focus();
    tecla(c, 'i');
    await vi.waitFor(() => expect(page.getByRole('button', { name: /^I, / }).element().getAttribute('aria-pressed')).toBe('true'));
    tecla(c, 'Enter');
    await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.I.length));
    const antes = nombres();

    await page.viewport(375, 667);
    await vi.waitFor(() => expect(celdas(container).length).toBe(grillaPara(375, 667).dims.w * grillaPara(375, 667).dims.h));
    expect(conPieza()).toBe(0);

    await page.viewport(...VIEWPORT);
    await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.I.length));
    expect(nombres()).toEqual(antes);
  });

  it('AC-BRD-016 AC-FIT-022 — a piece left half outside gets no clicks either: the empty cell behaves as empty', async () => {
    const { container } = await render(<App />);
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;
    const dicho = () => container.querySelector('[aria-live="polite"]')!.textContent;

    const c = celda(container, 11, 4);
    c.focus();
    tecla(c, 'i');
    await vi.waitFor(() => expect(page.getByRole('button', { name: /^I, / }).element().getAttribute('aria-pressed')).toBe('true'));
    tecla(c, 'Enter');
    await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.I.length));

    // 800 x 600 gives 11 columns: (9,4) and (10,4) stay inside, and the other three outside.
    const chico = grillaPara(800, 600).dims;
    expect(chico.w).toBe(11);
    await page.viewport(800, 600);
    await vi.waitFor(() => expect(celdas(container).length).toBe(chico.w * chico.h));
    expect(conPieza()).toBe(0);

    const tapada = celda(container, 9, 4);
    tapada.focus();
    await vi.waitFor(() => expect(conNota(container)).toBeGreaterThan(0));

    tecla(tapada, 'Enter');
    // A real wait: without it, the assertion runs before the re-render.
    await new Promise(r => setTimeout(r, 30));
    expect(conPieza()).toBe(0);
    expect(dicho()).not.toContain('quitada');

    await page.viewport(...VIEWPORT);
    await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.I.length));
  });

  it('AC-ACC-014 AC-FIT-024 — a smaller window does not leave the board with no anchor cell', async () => {
    // With the mouse, not the focus: the focused cell unmounts on the resize, and its `focusout`
    // clears the pointed cell by another way.
    const { container } = await render(<App />);
    const anclas = () => celdas(container).filter(e => e.getAttribute('tabindex') === '0');

    hover(celda(container, anchoDe(container) - 1, 4));
    await vi.waitFor(() => expect(anclas()).toEqual([celda(container, anchoDe(container) - 1, 4)]));

    const chico = grillaPara(375, 667).dims;
    await page.viewport(375, 667);
    await vi.waitFor(() => expect(celdas(container).length).toBe(chico.w * chico.h));

    expect(anclas()).toEqual([celda(container, 0, 0)]);

    expect(celdas(container).filter(e => e.className.includes('cursor-not-allowed'))).toEqual([]);
  });
});
