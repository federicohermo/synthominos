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

/**
 * The shell, whole and in a browser.
 *
 * `App.tsx` has no `useEffect`: the six live in `use-engine.ts` and `use-input.ts`. But
 * it owns ALL the state and the handlers that move it: the placement gesture, the three
 * ways to edit on the board, when the courtesy arpeggio fires and when it does not, and
 * the three derivations that must carry the regime.
 *
 * The engine is mocked with a double that REMEMBERS if it started. That makes it
 * verifiable that the transport button shows whether the clock started, and not whether
 * the button was pressed. All the rest is real: the domain, the three components and
 * the DOM.
 */
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

/**
 * How many times the panel of the twelve thumbnails RUNS.
 *
 * `hover` lives in `App.tsx`, so each cell that the cursor crosses re-renders the whole
 * tree. `OrientationPanel` is 337 elements (1 grid + 12 x (button + grid + 25 cells +
 * span), with `MINI_BOX = 5`), and none depends on the hover. Without the `memo` it is
 * TEN runs for ten crossed cells, one for each cell.
 *
 * The count is taken FROM HERE and not with a counter in the component: a counter inside
 * is production code that exists for the test.
 *
 * ## Why the counter is INSIDE the `memo` and does not wrap it
 *
 * `real.default` is a `memo` and `.type` is the function inside it. The mock counts
 * there and wraps in `memo` again, so it makes the same barrier as the real component
 * and measures what happens behind it.
 *
 * The obvious form, a function with no memo that renders `<Real {...props} />`, is
 * measured and it gives a FALSE result: ten with the panel memoized and ten without the
 * memo, because it counts the wrapper, which is never behind the barrier. It is the
 * failure mode this repo hunts: a green oracle that measures another thing.
 *
 * React exposes `.type` at runtime but its types do not: `memo(fn)` resolves to
 * `NamedExoticComponent`, which does not declare it. So it is narrowed with a real check
 * and not with an `as`: if someone removes the `memo`, the mock does not guess. It
 * throws, with the reason.
 *
 * The mock belongs to the file, and the counter also goes up in the other tests: the
 * test that measures sets it to zero before the mount.
 */
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

/**
 * The viewport of these tests, and why there is one.
 *
 * The board comes from the viewport, so the window size is not a detail of the runner.
 * Without it, Playwright starts at **414 x 896**, a phone in portrait, and the board has
 * **6 columns**, where half a dozen of these cases point at cells that do not exist. A
 * desktop viewport is set, and the expected dimensions come from the same pure function
 * that computes them, not from two numbers written by hand: if the formula changes,
 * these tests follow it.
 */
const VIEWPORT: [number, number] = [1024, 768];
const { dims: DIMS } = grillaPara(...VIEWPORT);

beforeEach(async () => {
  await page.viewport(...VIEWPORT);
  motor.estado.corriendo = false;
  for (const v of Object.values(motor)) if (typeof v === 'function' && 'mockClear' in v) v.mockClear();
});

/**
 * The cells of the board, in index order.
 *
 * By ROLE and not by structure: the grid is `role="row"` with cells inside, so
 * `div.grid > div` returns the rows and not the cells. Their number cannot be written:
 * the board has the size that fits the window of the test browser.
 */
const celdas = (c: HTMLElement) => [...c.querySelectorAll('[role="gridcell"]')] as HTMLElement[];
/**
 * The width of the RENDERED board, read from the accessible tree.
 *
 * It is not a constant: the app measures its container and draws the cells that fit, so
 * the width depends on the window size of the test browser. `aria-colcount` is the
 * attribute the screen reader gets. To read the width from it keeps these tests whole
 * when the window size of Playwright changes.
 */
const anchoDe = (c: HTMLElement) => Number(c.querySelector('[role="grid"]')!.getAttribute('aria-colcount'));
const celda = (c: HTMLElement, x: number, y: number) => celdas(c)[y * anchoDe(c) + x];
const baldosa = (el: HTMLElement) => el.firstElementChild as HTMLElement;

/** Where the cells of a piece land, placed with its grip cell on (x, y). */
const donde = (piece: PieceKey, x: number, y: number, rot = 0, mirror = false) => {
  const base = rotateN(SHAPES[piece], rot);
  return cellsAt(mirror ? reflect(base) : base, ANCHOR_INDEX[piece], x, y);
};

/** How many cells of the board have text: one for each cell of a placed piece. */
const conNota = (c: HTMLElement) => celdas(c).filter(e => baldosa(e).textContent !== '').length;

/**
 * What the ghost says, cell by cell: it changes with the rotation (another note) and
 * with the reflection (another `#N`).
 *
 * It lives at module level and not inside a `describe`, because the two writers of the
 * pointed cell read it, the mouse and the keyboard focus, and they are in different
 * blocks. Two copies are two ways to measure the same ghost differently.
 */
const notaDelFantasma = (c: HTMLElement) => {
  const conTexto = celdas(c).filter(e => baldosa(e).textContent !== '');
  return conTexto.map(e => e.getAttribute('title')).join('|');
};

/**
 * The COMPLETE gesture of a modifier: two events and not one. The `keydown` opens the
 * clean tap and the `keyup` toggles, so that `Ctrl`+C does not flip the reflection.
 *
 * It receives the target because the two cases matter: on `window` it is the global
 * shortcut, and on a cell it is the same shortcut with the board focused.
 */
const tapDeModificador = (el: EventTarget, key: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
};

const hover = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
const click = (el: HTMLElement, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));

describe('App: the composition', () => {
  it('the board and the two floating panels, with no card', async () => {
    // No card exists: the board IS the screen and the two panels float on top. The
    // assertion is by ROLE AND NAME and not by `className`, so the test survives the
    // next change of layout.
    const { container } = await render(<App />);
    expect(celdas(container).length).toBe(DIMS.w * DIMS.h);

    // The two floating panels exist and they fold: the header is a control, not an `<h2>`.
    await expect.element(page.getByRole('button', { name: /^Piezas$/, expanded: true })).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: /^Señal$/, expanded: true })).toBeInTheDocument();

    // And they do not PUSH the grid: the two are `fixed`, so they are out of the flow.
    for (const flotante of container.querySelectorAll('aside')) {
      expect(getComputedStyle(flotante).position).toBe('fixed');
    }

    // The legend of gestures: it is the only place where the four direct gestures and
    // the letter shortcut are written.
    expect(container.textContent).toContain('Rueda sobre el tablero');
    expect(container.textContent).toContain('arranca y para');
  });

  it('AC-FIT-008 — the page does not scroll: the board has the exact size of the viewport', async () => {
    await render(<App />);
    // The falsifiable half that needs no five viewports: if the root grows more than the
    // window (a card again, a floating panel in the flow, a `min-h-screen` with content
    // below), this fails.
    expect(document.documentElement.scrollHeight).toBe(document.documentElement.clientHeight);
  });

  it('AC-PNL-002 — the two floating panels fold, and the spectrum stays alive when folded', async () => {
    // A fold HIDES and does not unmount. Two measured things depend on it: the
    // `ResizeObserver` of the spectrum, which draws again because its container changes
    // SIZE, and the `memo` barrier of `OrientationPanel`, which a new mount pays in full.
    const { container } = await render(<App />);
    const senal = page.getByRole('button', { name: /^Señal$/ });
    const region = container.querySelector('#franja-senal')!;
    expect(region.hasAttribute('hidden')).toBe(false);
    expect(region.querySelector('canvas')).not.toBeNull();

    await senal.click();
    await vi.waitFor(() => expect(region.hasAttribute('hidden')).toBe(true));
    // The canvas stays in the DOM: that keeps the observer at work.
    expect(region.querySelector('canvas')).not.toBeNull();

    await senal.click();
    await vi.waitFor(() => expect(region.hasAttribute('hidden')).toBe(false));

    // And the dock, with the same mechanism and its own state: they are two independent
    // folds, not one shared. Here too the fold HIDES and does not unmount: the `memo`
    // barrier of `OrientationPanel` depends on it, and a new mount pays it in full.
    const piezas = page.getByRole('button', { name: /^Piezas$/ });
    const dock = container.querySelector('#dock-piezas')!;
    expect(dock.hasAttribute('hidden')).toBe(false);
    await piezas.click();
    await vi.waitFor(() => expect(dock.hasAttribute('hidden')).toBe(true));
    // The signal panel did not fold with it.
    expect(region.hasAttribute('hidden')).toBe(false);
    // The twelve slots stay in the DOM.
    expect(dock.querySelectorAll('button').length).toBeGreaterThan(12);
    await piezas.click();
    await vi.waitFor(() => expect(dock.hasAttribute('hidden')).toBe(false));
  });

  it('AC-MUS-012 AC-PLY-005 — it starts with the tempo of the engine and the scale regime', async () => {
    // `DEFAULT_BPM` is one declaration: the state of the shell and the state of the
    // engine cannot differ, because they come from the same number.
    const { container } = await render(<App />);
    expect(container.textContent).toContain(String(DEFAULT_BPM));
    // The app opens in the scale regime.
    await expect.element(page.getByRole('button', { name: REGIMEN.escala })).toHaveClass(/bg-slate-900/);
  });
});

describe('App: place', () => {
  it('AC-BRD-002 — the click places the piece in hand and fires its arpeggio', async () => {
    const { container } = await render(<App />);
    click(celda(container, 3, 2));

    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    // The click is the only immediate way to hear the piece: the new piece is not in the
    // sounding sequence.
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
    // The piece is placed so that it does not sound: a courtesy arpeggio contradicts the
    // gesture at the moment of the gesture.
    const { container } = await render(<App />);
    click(celda(container, 3, 2), { altKey: true });

    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.playNow).not.toHaveBeenCalled();
    // And it shows: the muted tile goes white and keeps its note.
    const [x, y] = donde('F', 3, 2)[0];
    expect(baldosa(celda(container, x, y)).className).toContain('bg-white');
  });

  it('AC-BRD-003 — an invalid move places nothing', async () => {
    const { container } = await render(<App />);
    // Against the edge: a part of the `F` falls outside the board.
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
    // A new object and not a mutation: the piece stays on the board with its five cells.
    expect(conNota(container)).toBe(SHAPES.F.length);

    click(celda(container, x, y), { altKey: true });
    await vi.waitFor(() => expect(baldosa(celda(container, x, y)).style.background).not.toBe(''));
  });

  it('AC-BRD-011 — the mute of one piece does not touch the others', async () => {
    // The `map` returns the SAME reference for the pieces that do not change, and a new
    // object only for the muted one: never mutate what React already has.
    const { container } = await conUnaF();
    click(celda(container, 8, 3));   // a second `F`, far from the first
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length * 2));

    const [x1, y1] = donde('F', 3, 2)[0];
    const [x2, y2] = donde('F', 8, 3)[0];
    click(celda(container, x1, y1), { altKey: true });

    await vi.waitFor(() => expect(baldosa(celda(container, x1, y1)).className).toContain('bg-white'));
    // The other keeps its color: the mute belongs to one piece, not to the board.
    expect(baldosa(celda(container, x2, y2)).style.background).not.toBe('');
    expect(conNota(container)).toBe(SHAPES.F.length * 2);
  });

  it('AC-BRD-009 — on a piece that is NOT in hand nothing happens', async () => {
    const { container } = await conUnaF();
    // The piece in hand changes, and the placed `F` gets a click again.
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
    // It would be all pink and say "it does not fit here" on the one cell where the click
    // does something.
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    const [x, y] = donde('F', 3, 2)[0];
    hover(celda(container, x, y));
    await new Promise(r => setTimeout(r, 30));
    // Five cells with a note stay, the cells of the piece, and no pink cell of a clash.
    expect(conNota(container)).toBe(SHAPES.F.length);
    expect(container.querySelectorAll('.bg-rose-500').length).toBe(0);
    // And the cursor says that a click works there.
    expect(celda(container, x, y).className).toContain('cursor-pointer');
  });
});

describe('App: the transport', () => {
  it('AC-PLY-002 — the button shows whether the clock STARTED, not whether it was pressed', async () => {
    // The decision lives in `alternarTransporte`. Here the wiring is verified against an
    // engine that answers.
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
    // Without Web Audio, `startClock` starts nothing. To believe the request leaves the
    // button saying that something sounds when nothing sounds.
    motor.startClock.mockImplementationOnce(() => {});
    await render(<App />);
    await page.getByRole('button', { name: 'Reproducir' }).click();
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
  });

  it('AC-BRD-030 AC-PLY-038 — Reset stops the transport AS WELL AS it empties the board', async () => {
    // To empty only `placed` leaves the engine at work on its active cycle: up to 7.5 s
    // of sound on a board that is already empty.
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    await page.getByRole('button', { name: 'Reproducir' }).click();
    motor.stopClock.mockClear();

    // The button shows `↺` and no word: the query uses its accessible name, which says
    // the two halves that this test verifies.
    await page.getByRole('button', { name: 'Vaciar el tablero y frenar el transporte' }).click();
    expect(motor.stopClock).toHaveBeenCalled();
    await vi.waitFor(() => expect(conNota(container)).toBe(0));
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
  });

  it('AC-PLY-006 — the tempo and the clicks go down to the engine', async () => {
    await render(<App />);
    await page.getByRole('slider').fill('128');
    await vi.waitFor(() => expect(motor.setBpm).toHaveBeenLastCalledWith(128));

    // The click switch is an icon-only control of the transport row: the query uses its
    // accessible name, which is its `aria-label`. And on the SAME render as the tempo: a
    // second `render(<App />)` leaves two apps mounted, and a query by role on the whole
    // page is then a strict mode violation.
    await page.getByRole('button', { name: /^Recorrido en el vacío$/ }).click();
    await vi.waitFor(() => expect(motor.setClicksAudible).toHaveBeenLastCalledWith(true));
  });
});

describe('App: the orientation, by panel and by gesture', () => {
  it('AC-PNL-018 AC-PNL-020 — the panel does not rotate or reflect: it SAYS the orientation', async () => {
    // The panel has no four buttons of degrees and no ON/OFF of reflection: they would
    // duplicate the wheel, `Shift`, the right button and `Ctrl`. In their place is the
    // orientation readout: a line of text that cannot be pressed.
    //
    // This test has two halves, from the shell: the six controls do not exist, and the
    // readout follows the gesture.
    const { container } = await render(<App />);
    for (const grados of ['0°', '90°', '180°', '270°']) {
      expect(page.getByRole('button', { name: new RegExp(`^${grados}$`) }).elements(), grados)
        .toHaveLength(0);
    }
    expect(page.getByRole('button', { name: /^Reflexión$/ }).elements()).toHaveLength(0);

    // The inner `<span>` and not the `<p>`: the readout shares its paragraph with the
    // `0°` button, so the `textContent` of the `<p>` says `0°0°`.
    const linea = () => [...container.querySelectorAll('p > span')].find(e => /^\d+°/.test(e.textContent!))!;
    expect(linea().textContent).toBe('0°');

    tapDeModificador(window, 'Shift');
    await vi.waitFor(() => expect(linea().textContent).toBe('90°'));
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(linea().textContent).toBe('90° · reflejada'));
  });

  it('AC-PCS-019 AC-PCS-020 AC-PCS-021 — the orientation belongs to the PIECE: it is remembered, and the `0°` resets one piece', async () => {
    // The four criteria that only the shell can verify, because the memory lives here:
    // the gesture touches one entry, a return to a piece brings it as it was left, the
    // `0°` does not touch the other eleven, and the readout follows the piece.
    const { container } = await render(<App />);
    const linea = () => [...container.querySelectorAll('p > span')].find(e => /^\d+°/.test(e.textContent!))!;
    // The two headers of the floating panels are `<button>` with NO `aria-label` (their
    // name is their visible text), so they are filtered out before the read.
    const nombreDe = (key: string) => [...container.querySelectorAll('button')]
      .map(b => b.getAttribute('aria-label'))
      .find(n => n !== null && n.startsWith(`${key},`));

    // The `F` at 180° and reflected, with the two keyboard gestures.
    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(linea().textContent).toBe('180° · reflejada'));
    // And the other eleven did not move.
    expect(nombreDe('T')).toBe('T, rotación 0°');
    expect(nombreDe('F')).toBe('F, rotación 180°, reflejada');

    // Go to the `T` and come back: the `F` is as it was left, and the readout follows it.
    await page.getByRole('button', { name: 'T, rotación 0°' }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('0°'));
    await page.getByRole('button', { name: 'F, rotación 180°, reflejada' }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('180° · reflejada'));

    // The `0°` sets the `F` back to the initial orientation, the degrees AND the
    // reflection, and touches no other piece.
    await page.getByRole('button', { name: /^Volver esta pieza a 0° sin reflejar$/ }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('0°'));
    expect(nombreDe('F')).toBe('F, rotación 0°');
    expect(nombreDe('T')).toBe('T, rotación 0°');
  });

  it('AC-BRD-030 AC-PCS-022 — `↺` empties the board and does NOT touch the remembered orientations', async () => {
    // The cost is written: the invariant "after `↺` the app is as it was when it opened"
    // is given up, so that this button keeps one scope that has a name.
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
    // The central promise of the orientation memory: "it changes no note". It breaks if
    // the memory of the shell becomes the source of what is already on the board. Each
    // `PlacedPiece` keeps its own orientation, so the `title` of its five cells (note and
    // `#N`, so sound AND order) does not move. It is read from the DOM and not from the
    // state, because the thing to verify is that the board did not change, not that the
    // shell did not write it.
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const puesta = () => donde('F', 3, 2)
      .map(([x, y]) => `${baldosa(celda(container, x, y)).textContent}@${celda(container, x, y).getAttribute('title')}`);
    const antes = puesta();

    // The `F` in hand at 90° and reflected: the two gestures, the two on one entry.
    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(container.textContent).toContain('90° · reflejada'));

    expect(puesta()).toEqual(antes);
    expect(conNota(container)).toBe(SHAPES.F.length);
  });

  it('AC-MUS-013 — the regime changes what the rotation DOES, and the ghost shows it', async () => {
    // Without the regime in the three derivations, a change of regime does not re-derive
    // the board.
    const { container } = await render(<App />);
    // The rotation is by `Shift`: no `90°` button exists, the rotation is a modifier of
    // the direct gesture. What the test measures, that the regime reaches the three
    // derivations, does not depend on the gesture that gives a rotation other than zero.
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

    // The zoom of the browser is an accessibility affordance: a gesture of the system
    // wins over one of the app.
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
    // The context menu NEVER opens on the board.
    expect(menu.defaultPrevented).toBe(true);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    // On macOS, `Ctrl`+click arrives as `contextmenu` with `ctrlKey`, and there the
    // `keyup` of `Ctrl` toggles: to count the two gives a net of zero, and the reflection
    // never answers on an Apple laptop with no mouse.
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
    // It is not redundant with the test of `use-input`: what it adds is the callback of
    // the shell, which translates the piece to the state entry and which no test of the
    // hook exercises.
    const { container } = await render(<App />);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true }));

    // The oracle is WHERE the ghost lands and not how many cells it has: the twelve
    // pieces have five, so a count does not tell an `I` from an `F`.
    await vi.waitFor(() => {
      for (const [x, y] of donde('I', 4, 3)) {
        expect(baldosa(celda(container, x, y)).textContent, `${x},${y}`).not.toBe('');
      }
    });
    // And in lower case as much as in upper case: `Shift`+`p` is the same piece.
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
    // The tree has no `<form>` today, so there is no bug, and for that reason nothing
    // else falsifies this line: it exists for a future regression. The default of a
    // `<button>` inside a form is `submit`, and in this app that is a reload of the page
    // that loses the whole board, with no undo.
    //
    // The assertion is on the WHOLE app and not component by component, because the
    // buttons come from several files (the twelve slots, the regime, the three of the
    // transport row) and no file has them all.
    //
    // The count: 12 slots + 2 of the regime + 3 of the transport row = 17. The `0°` of
    // the orientation readout makes 18. The TWO headers of the floating panels, which
    // are `<button>` with `aria-expanded`, make 20.
    const { container } = await render(<App />);
    const botones = [...container.querySelectorAll('button')];
    expect(botones.length).toBe(20);
    for (const boton of botones) {
      expect(boton.getAttribute('type'), boton.textContent ?? '').toBe('button');
    }
  });
});

describe('App: what a move of the cursor costs', () => {
  /** Ten inner cells: two rows of five, with the whole ghost inside the board. */
  const RECORRIDO = [2, 3].flatMap(y => [1, 2, 3, 4, 5].map(x => [x, y] as const));

  /** The footprint of the ghost: which cells of the board have a note, as a bitmap. */
  const huella = (c: HTMLElement) => celdas(c).map(e => (baldosa(e).textContent === '' ? '0' : '1')).join('');

  it('to cross ten cells does not run the orientation panel, and a rotation does', async () => {
    panel.ejecuciones = 0;
    const { container } = await render(<App />);
    // The initial render is counted APART, and that makes the zero below falsifiable: a
    // panel that never runs, or a broken mock, also gives zero.
    expect(panel.ejecuciones).toBe(1);
    panel.ejecuciones = 0;

    // The loop waits for the ghost to REPAINT before it moves the cursor again, and that
    // is not ceremony: `mouseover` is a CONTINUOUS event, so React 19 schedules its
    // re-render at default priority, and two dispatches in a row are paid as one.
    // Measured with a `setTimeout(0)` between them: 8 of 10. So the test counts less work
    // than a real cursor pays, which crosses one cell for each drawn frame.
    const huellas = new Set<string>();
    let antes = huella(container);
    for (const [x, y] of RECORRIDO) {
      hover(celda(container, x, y));
      await vi.waitFor(() => expect(huella(container)).not.toBe(antes));
      antes = huella(container);
      huellas.add(antes);
    }

    // Ten different positions of the ghost, so TEN re-renders of the tree: the shell
    // worked the ten times, which is the half of the system that this number measures.
    expect(huellas.size).toBe(RECORRIDO.length);
    expect(conNota(container)).toBe(SHAPES.F.length);
    // And the panel did not run one time. Without the `memo` it is ten, one for each
    // cell: 3370 elements reconciled to reach the same DOM.
    expect(panel.ejecuciones).toBe(0);

    // The memo did not freeze it: when the orientation REALLY changes, it runs. Without
    // this half, a broken panel also gives the zero above. The rotation is by `Shift`,
    // the gesture that exists: no `90°` button exists.
    tapDeModificador(window, 'Shift');
    await vi.waitFor(() => expect(panel.ejecuciones).toBe(1));
  });
});

/**
 * The keyboard on the WHOLE shell.
 *
 * `Board.browser.test.tsx` already verifies the roving tabindex, the arrows, `Home`/`End`
 * and the four actions against a lone `Board` with fixed props. What exists only HERE is
 * what needs the complete page: the `Tab` that enters from the dock and leaves in one
 * press, the global listener of `window` (from which the board takes the space bar and
 * leaves `Shift` and `Ctrl` on), the tie-break between the focus and the mouse for the
 * same `hover`, and the `aria-live` region, which belongs to the shell because the
 * shell knows which edit happened.
 *
 * The events are dispatched ON THE NODE of the cell and with `bubbles`, not on `window`:
 * the global listener reads `e.target.closest('[role="gridcell"]')`, and a
 * `window.dispatchEvent(...)` arrives with `target === window`, which is no cell. So a
 * dispatch on `window` verifies the opposite case to the one it says.
 */
const tecla = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(evento);
  return evento;
};

/** The board, whole in view: what scrolls after that is the key and not the `.focus()`. */
const aLaVista = (c: HTMLElement) =>
  c.querySelector('div.relative')!.scrollIntoView({ block: 'center' });

describe('App: the board is played with the keyboard', () => {
  it('AC-ACC-013 — from the dock, ONE `Tab` enters the board and one more leaves it', async () => {
    // A REAL `Tab`, by Playwright, and not a count of the cells with a `tabIndex` other
    // than -1: the two are not the same. The count measures the DOM, and is also true
    // with the `0` on a cell that the browser skips. The criterion is about what the
    // browser does with the TAB ORDER, the one thing that makes the board an exit trap
    // or not.
    const { container } = await render(<App />);
    const ancla = celdas(container).find(c => c.tabIndex === 0)!;

    // The control of the dock that is JUST before the board, taken from the DOM order
    // and not by its name: so a new button in the dock does not break this test.
    const paradas = [...container.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')];
    paradas[paradas.indexOf(ancla) - 1].focus();

    await userEvent.tab();
    expect(document.activeElement).toBe(ancla);

    // And one more press leaves it behind. With one tab stop for each cell, this line
    // lands on the cell (1,0), and all that comes after the board is that many `Tab`
    // presses away.
    await userEvent.tab();
    expect(celdas(container)).not.toContain(document.activeElement);
  });

  it('AC-ACC-016 — the arrows move the DOM focus, and the page does NOT scroll', async () => {
    // REAL keys, by Playwright, and that is the whole reason for this test: a
    // `dispatchEvent` makes an UNTRUSTED event, and an untrusted event **never runs the
    // default action**. So "the page did not scroll" is true also if `preventDefault`
    // does not exist. It is the failure mode this repo hunts, a green assertion that
    // cannot turn red. `Board.browser.test.tsx` verifies the `preventDefault` with
    // synthetic events, which is the correct oracle there, because it asserts what the
    // HANDLER does. Here the assertion is about what the BROWSER does, and for that the
    // key must be real.
    const { container } = await render(<App />);
    aLaVista(container);
    const origen = celda(container, 4, 2);
    origen.focus();

    // The root container has the exact size of `100dvh` and is `overflow-hidden`, so the
    // page **has no scroll to lose**. That property is stronger than "the arrows keep
    // the scroll position", and the first assertion below states it.
    //
    // What the REAL keys verify is that the arrows move the focus, and that no page
    // scroll shows in the attempt. `Board.browser.test.tsx` verifies the `preventDefault`
    // itself with synthetic events.
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

    // The default of the four arrows is to scroll: the scroll position must not move
    // while the focus moves.
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
    // And at the end it stays: `Home` does not jump to the row above, which is what it
    // does if the pair looks at the whole board and not at the row.
    tecla(celda(container, 0, 3), 'Home');
    expect(document.activeElement).toBe(celda(container, 0, 3));
  });

  it('AC-ACC-020 — `Enter` places, `Enter` on an own piece removes it, `Alt`+`Enter` mutes, and the region says it', async () => {
    // The four enter by the SAME `onCellClick` as the click, so by `accionDeClick`. What
    // is verified here is that the shell receives them the same, and that the `aria-live`
    // region tells the edit that the board applied and not the one requested.
    //
    // The oracle of the board is the ACCESSIBLE NAME of the cell and not how many have
    // text: with the focus set, the focused cell IS `hover`, so the ghost draws five
    // cells with text also on the empty board. `cellNameFor` does not confuse them: a
    // cell with a ghost is named "libre", the same as an empty one.
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

    // `Alt` means "muted" on the two sides of the gesture, also with the keyboard.
    const [mx, my] = donde('F', 3, 2)[0];
    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(baldosa(celda(container, mx, my)).className).toContain('bg-white'));
    expect(conPieza()).toBe(SHAPES.F.length);
    expect(dicho()).toBe('pieza F colocada muteada en fila 3, columna 4');

    // And on a piece ALREADY muted it gives the sound back: the announcement says the
    // state the piece is LEFT in, not which key was pressed.
    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(dicho()).toBe('pieza F con sonido en fila 3, columna 4'));
    expect(baldosa(celda(container, mx, my)).style.background).not.toBe('');

    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(dicho()).toBe('pieza F muteada en fila 3, columna 4'));
  });

  it('AC-BRD-031 — with a cell focused the space bar does NOT toggle the transport; with the focus on the `body`, it does', async () => {
    // The oracle is the TRANSPORT (the engine and the name of the button) and not
    // "`preventDefault` was called": the space bar stops the default also with the cell
    // focused, because its default is to scroll, and that must stop whoever handles the
    // key. With `preventDefault` as the oracle, the test is green with the bug present.
    const { container } = await render(<App />);
    const c = celda(container, 3, 2);
    c.focus();

    tecla(c, ' ');
    // The same press DID edit: without the guard, one `Space` places the piece AND
    // starts the transport.
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.startClock).not.toHaveBeenCalled();
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();

    // With a `<button>` focused it does not toggle either, by the other guard: there
    // the browser must keep the WHOLE event to activate the control, with no `blur()`
    // by hand.
    const play = [...container.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') ?? b.textContent) === 'Reproducir')!;
    play.focus();
    tecla(play, ' ');
    expect(motor.startClock).not.toHaveBeenCalled();

    // And with the focus nowhere, the space bar still belongs to the transport: the
    // cell takes ONE key in ONE place, it does not turn it off.
    play.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(motor.startClock).toHaveBeenCalled());
    await expect.element(page.getByRole('button', { name: 'Pausa' })).toBeVisible();
  });

  it('AC-BRD-032 — with a cell focused, `Shift` DOES rotate and `Ctrl` DOES reflect', async () => {
    // It is apart from the test of the space bar on purpose: that one verifies that the
    // shortcut is off, this one that NO MORE is off. To widen the guard of the global
    // listener so that it matches the cell is tempting, it is one line, and it turns
    // off the three shortcuts to fix one.
    const { container } = await render(<App />);
    const c = celda(container, 4, 3);
    c.focus();
    // The focused cell IS the pointed cell: the ghost shows with no touch of the mouse.
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const antes = notaDelFantasma(container);

    tapDeModificador(c, 'Shift');
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    // The reflection does not change the NOTE of a cell, it changes the order: what
    // moves is the `#N`, so the oracle is the whole `title` and not the note alone.
    const conRotacion = notaDelFantasma(container);
    tapDeModificador(c, 'Control');
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(conRotacion));
  });

  it('AC-BRD-021 AC-BRD-032 — with a cell focused, the letter STILL chooses the piece', async () => {
    // `targetEsCelda` turns off the space bar and only the space bar. The `switch` of
    // the `onKeyDown` of the cell ends with `default: return`, so nothing else handles a
    // letter and there is no double fire to prevent. A veto there turns the shortcut off
    // where it is most useful.
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
    // And the transport stays stopped: the letter chooses and does nothing else.
    expect(motor.startClock).not.toHaveBeenCalled();
  });

  it('AC-ACC-022 — with the focus on a cell, a mouse that leaves the grid does not clear the ghost', async () => {
    // THE tie-break rule: while the DOM focus is inside the board, the focus wins over
    // the mouse. Without it the mouse clears the ghost of the focused cell and the
    // roving tabindex has no anchor. Then "the focused cell is the hover" is a promise
    // that the mouse breaks.
    const { container } = await render(<App />);
    celda(container, 4, 3).focus();
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const conFoco = notaDelFantasma(container);

    container.querySelector('[role="grid"]')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    // A real wait: the same gesture with the focus OUTSIDE clears it in the same tick,
    // so without the wait this assertion passes because it runs before the re-render.
    await new Promise(r => setTimeout(r, 30));
    expect(conNota(container)).toBe(SHAPES.F.length);
    expect(notaDelFantasma(container)).toBe(conFoco);
  });

  it('AC-ACC-023 — a mouse click does NOT take the command from the mouse: the ghost follows the cursor', async () => {
    // The other direction of the same rule: a `div` with `tabIndex` is focusable BY
    // CLICK. Without the `preventDefault` of the `mousedown`, the first click sets
    // `focoEnTablero`, and from there the mouse is inert: the ghost is frozen on the
    // clicked cell until `Tab` leaves the board. It is the primary gesture of the
    // product, broken at the first click.
    //
    // A REAL click and hover, by Playwright, and that is the whole reason for the test:
    // a `dispatchEvent('click')` fires no `mousedown` and so **does not move the
    // focus**. With synthetic events this assertion is green with the bug present. It is
    // the same failure mode as the one of the arrows, some lines above.
    const { container } = await render(<App />);
    aLaVista(container);

    await userEvent.click(celda(container, 2, 1));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    // And the focus did not stay in the board, which is what the guard guarantees.
    expect(celdas(container)).not.toContain(document.activeElement);

    // Five cells of the placed piece plus the five of the new ghost: with an inert
    // mouse they stay five.
    await userEvent.hover(celda(container, 7, 4));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length * 2));
  });
});

describe('App: the background, one value', () => {
  // The background color has one value. A hex written by hand in the `body` and a
  // Tailwind class on the root `div` that resolves to the same hex are two copies with
  // nothing to tie them, and a grep of the hex does not find the second: it is the name
  // of a class, not a color. So the hex is not written here: its only place in `src/` is
  // the token.
  it('AC-PNL-030 — the root div paints the same as the body, and neither is transparent', async () => {
    const { container } = await render(<App />);
    // The first child of the container, found by position and not by a layout class: so
    // this test still measures the BACKGROUND when the layout changes.
    const raiz = container.firstElementChild!;
    const delDiv = getComputedStyle(raiz).backgroundColor;
    const delBody = getComputedStyle(document.body).backgroundColor;

    // The assertion is that they MATCH, not that each has a fixed string: to compare
    // each against `rgb(248, 250, 252)` lets a later change move one and not the other,
    // which is the duplicate that the token deletes.
    expect(delDiv).toBe(delBody);

    // And that neither is transparent: if the token goes away from the two sides, the
    // two compute `rgba(0, 0, 0, 0)` and the equality above holds empty. That is the
    // failure mode to close: green with no background.
    expect(delDiv).not.toBe('rgba(0, 0, 0, 0)');
    expect(delBody).not.toBe('rgba(0, 0, 0, 0)');
  });
});

describe('App: the board grows to the screen', () => {
  it('AC-FIT-008 — neither axis scrolls, on a desktop or on a phone', async () => {
    // The half that only the whole app can show: the board has the size of the
    // container, and the two floating panels go on top and do not push it. The two ends
    // of the table of reference boxes are tested: the large desktop and the phone in
    // portrait.
    for (const [w, h] of [[1440, 900], [375, 667]] as const) {
      await page.viewport(w, h);
      const { container, unmount } = await render(<App />);
      const raiz = document.documentElement;
      expect(raiz.scrollWidth, `${w}x${h} width`).toBeLessThanOrEqual(raiz.clientWidth);
      expect(raiz.scrollHeight, `${w}x${h} height`).toBe(raiz.clientHeight);

      // And the board does not scroll either.
      const tablero = container.querySelector('div.relative')!;
      expect(tablero.scrollWidth, `${w}x${h} board`).toBeLessThanOrEqual(tablero.clientWidth + 1);
      await unmount();
    }
  });

  it('AC-FIT-010 — the grid that is drawn is the one that comes from the viewport', async () => {
    // The small end of the table: 5 columns by 9 rows on a phone in portrait, against
    // the 26 x 15 of a desktop.
    await page.viewport(375, 667);
    const { container } = await render(<App />);
    const grilla = container.querySelector('[role="grid"]')!;
    const esperado = grillaPara(375, 667).dims;
    expect(Number(grilla.getAttribute('aria-colcount'))).toBe(esperado.w);
    expect(Number(grilla.getAttribute('aria-rowcount'))).toBe(esperado.h);
    expect(celdas(container).length).toBe(esperado.w * esperado.h);
  });

  it('AC-ACC-028 AC-BRD-004 — piece 13 does not enter, and the app says it', async () => {
    // The piece limit, which the area does not give: 154 cells hold 30 pieces, and the
    // exact circuit is `O(n^2 * 2^n)`. It is the only refusal that does not explain
    // itself (an invalid move is seen, because the ghost is pink), so it is announced.
    const { container } = await render(<App />);
    const dicho = () => container.querySelector('[aria-live="polite"]')!.textContent;
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;

    // Twelve flat `I`, two in each row: the `I` is 5 x 1 and the board of 1024 x 768 has
    // 14 columns and 11 rows, so two fit in each row with room to spare. The letter is
    // pressed ONE time (the selection is state of the shell, not of the placement
    // gesture), and the placement starts only when the ghost says `I`.
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
    // The board did not change.
    await vi.waitFor(() => expect(dicho()).toContain(`acepta ${MAX_PIEZAS} piezas`));
    expect(conPieza()).toBe(SHAPES.I.length * MAX_PIEZAS);
  });

  it('AC-FIT-021 — a smaller window deletes no piece: they come back whole when it grows', async () => {
    // The repo has no undo, and a drag of the window edge is not an edit gesture. The
    // piece that does not fit is stored: it is not drawn, it does not sound, and it
    // comes back identical when there is room.
    const { container } = await render(<App />);
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;
    const nombres = () => celdas(container)
      .map(e => e.getAttribute('aria-label')!)
      .filter(n => n.includes('pieza'));

    // A flat `I` well to the right: with the grip cell on (11,4) it takes (9,4) to
    // (13,4), so it fits in 14 columns and not in 5.
    //
    // The test WAITS for the selection before the `Enter`, as in the test of the piece
    // limit: the letter is state of the shell, and until the re-render `Enter` places
    // the piece that was in hand. Without the wait this test places an `F`, which also
    // has five cells, so the count passes all the same and the test does not verify
    // what its comment says.
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
    // The case that the test above does not touch: there the window leaves the WHOLE
    // piece outside, and here it leaves it **half outside**, two cells inside the new
    // grid and three outside. It is the only state where the model and what is seen can
    // differ. The piece is not drawn (the criterion is the whole piece), so its inner
    // cells look empty. If the shell asked for the occupant on `placed` and not on the
    // visible pieces, a click there would remove a piece that is not on screen and
    // announce it.
    //
    // There is no undo: to delete by accident what is not seen is the gesture that the
    // whole stored piece makes impossible.
    const { container } = await render(<App />);
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;
    const dicho = () => container.querySelector('[aria-live="polite"]')!.textContent;

    // The same flat `I` of the test above: grip cell on (11,4), so the cells 9 to 13.
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

    // The click on (9,4), which the model still has as occupied, removes nothing and
    // announces nothing. With the `I` in hand, the only gesture that could remove it.
    const tapada = celda(container, 9, 4);
    tapada.focus();
    // The focus on it already writes the pointed cell, so here the OTHER half of the
    // same query shows: the ghost is drawn, so the gesture that the cell promises is a
    // placement (invalid, because the stored piece still occupies it) and not an edit.
    // If `hoverEdita` read `placed`, the ghost would turn off and the cursor would
    // promise an edit on a cell that looks empty.
    await vi.waitFor(() => expect(conNota(container)).toBeGreaterThan(0));

    tecla(tapada, 'Enter');
    // A real wait, and no assertion in the same tick: without the wait, this `expect`
    // passes because it runs before the re-render, not because nothing happened.
    await new Promise(r => setTimeout(r, 30));
    expect(conPieza()).toBe(0);
    expect(dicho()).not.toContain('quitada');

    // And it did not really remove it: when the window grows, the piece comes back whole.
    await page.viewport(...VIEWPORT);
    await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.I.length));
  });

  it('AC-ACC-014 AC-FIT-024 — a smaller window does not leave the board with no anchor cell', async () => {
    // The OTHER state that the new grid can leave pointing outside, and it is not a
    // piece: the pointed cell. The mouse and the focus write it, and neither hears of a
    // `resize`, so the pair that is kept can fall outside `dims`.
    //
    // `Board` puts the anchor of the roving tabindex on that cell. If it is not bounded,
    // NO cell has `tabIndex={0}` and the whole board leaves the tab order: for a person
    // who uses the keyboard, the app cannot be reached until a mouse touches the board.
    //
    // The pointed cell is set with the MOUSE and not with the focus on purpose: when the
    // window shrinks, the focused cell UNMOUNTS. If the browser emits the `focusout` of
    // that unmount, the pointed cell clears by another way and the test passes with
    // nothing verified. The `mouseover` has no second way: the pointer did not move, so
    // no `mouseout` clears it.
    const { container } = await render(<App />);
    const anclas = () => celdas(container).filter(e => e.getAttribute('tabindex') === '0');

    // A cell at the far right, which the small board does not have.
    hover(celda(container, anchoDe(container) - 1, 4));
    await vi.waitFor(() => expect(anclas()).toEqual([celda(container, anchoDe(container) - 1, 4)]));

    const chico = grillaPara(375, 667).dims;
    await page.viewport(375, 667);
    await vi.waitFor(() => expect(celdas(container).length).toBe(chico.w * chico.h));

    // Exactly ONE tab stop stays, and it is (0,0): the target of the `?? [0, 0]` of
    // `Board`, which is what a cleared pointed cell gives.
    expect(anclas()).toEqual([celda(container, 0, 0)]);

    // And the other half of the same dangling pointed cell: with `hover` outside the
    // board, `previewValid` gives `false` and the 45 cells show `cursor-not-allowed`,
    // which says "it does not fit here" where the move fits.
    expect(celdas(container).filter(e => e.className.includes('cursor-not-allowed'))).toEqual([]);
  });
});
