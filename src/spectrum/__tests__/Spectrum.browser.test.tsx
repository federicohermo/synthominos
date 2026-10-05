import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-react';

/**
 * The spectrum, on a REAL canvas.
 *
 * This file decides whether jsdom is enough, and the source gives the answer: the loop uses
 * `getContext('2d')`, `createLinearGradient`, `setTransform`, `fillText`, `ResizeObserver`,
 * `matchMedia('(resolution: Xdppx)')`, `devicePixelRatio` and `getBoundingClientRect`. In
 * jsdom the first returns `null` without the native `canvas` package, so the whole loop
 * stops at its second line. Others do not exist there, and the last returns zeros. To cover
 * the loop in jsdom would need a mock of exactly the code under test.
 *
 * The engine is mocked because this module decides WHAT IT DRAWS with a signal and with no
 * signal. Where the signal comes from belongs to `engine.ts`, which has its own tests.
 */
const motor = vi.hoisted(() => ({ bins: null as Uint8Array | null }));
vi.mock('../../playback/engine.ts', () => ({ readSpectrum: () => motor.bins }));

const Spectrum = (await import('../Spectrum.tsx')).default;
const loop = await import('../spectrum-loop.ts');
const { GAP, MIN_BAR, IDLE_TEXT } = await import('../spectrum-loop.ts');

/** Two frames: the loop reads, draws and schedules the next frame in the same `draw`. */
const cuadro = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** A loose canvas with a real size, to call the loop with no mount of the component. */
const canvasSuelto = (w = 200, h = 96) => {
  const caja = document.createElement('div');
  caja.style.width = `${w}px`;
  caja.style.height = `${h}px`;
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  caja.appendChild(canvas);
  document.body.appendChild(caja);
  sueltos.push(caja);
  return canvas;
};

const sueltos: HTMLElement[] = [];
beforeEach(() => { motor.bins = null; });
afterEach(() => { sueltos.splice(0).forEach(el => el.remove()); });

/** How many pixels of the canvas are not transparent: the measure of "something is drawn". */
const pintados = (canvas: HTMLCanvasElement): number => {
  const g = canvas.getContext('2d')!;
  const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
  return n;
};

describe('Spectrum: the mount', () => {
  it('AC-SPC-020 — it mounts a canvas sized by the layout, not by attributes', async () => {
    const { container } = await render(<Spectrum />);
    const canvas = container.querySelector('canvas')!;

    await vi.waitFor(() => expect(canvas.width).toBeGreaterThan(0));
    // The drawing surface is the CSS rect times the pixel density. jsdom cannot give that:
    // there `getBoundingClientRect` returns zeros and the canvas would stay at 0×0.
    const rect = canvas.getBoundingClientRect();
    expect(canvas.width).toBe(Math.round(rect.width * window.devicePixelRatio));
    expect(canvas.height).toBe(Math.round(rect.height * window.devicePixelRatio));
  });

  it('AC-SPC-016 — the idle state and the signal are drawn in DIFFERENT ways, and the idle state says it in words', async () => {
    // What separates the two states is NOT the amount of paint (measured: the idle state
    // paints the 48 lanes at full height, the same area as the bars at the maximum) but
    // that the idle state writes. A flat line at the bottom of the canvas reads the same
    // as "the audio is broken", so the state with no signal is drawn with a text.
    const escribio = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
    try {
      const { container } = await render(<Spectrum />);
      const canvas = container.querySelector('canvas')!;

      await cuadro();
      expect(pintados(canvas)).toBeGreaterThan(0);
      expect(escribio).toHaveBeenCalledWith(IDLE_TEXT, expect.any(Number), expect.any(Number));

      // 128 bins at the maximum: with a signal it stops writing and draws bars.
      escribio.mockClear();
      motor.bins = new Uint8Array(128).fill(255);
      await cuadro();
      await cuadro();
      expect(escribio).not.toHaveBeenCalled();
      expect(pintados(canvas)).toBeGreaterThan(0);
    } finally {
      escribio.mockRestore();
    }
  });

  it('AC-SPC-025 — on unmount it stops the loop and disconnects the observer', async () => {
    const desconectar = vi.spyOn(ResizeObserver.prototype, 'disconnect');
    const cancelar = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = await render(<Spectrum />);
    await cuadro();

    await unmount();
    expect(desconectar).toHaveBeenCalled();
    expect(cancelar).toHaveBeenCalled();
    desconectar.mockRestore();
    cancelar.mockRestore();
  });
});

describe('drawBars / drawIdle: what is drawn', () => {
  const lienzo = () => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 96;
    return c;
  };

  it('AC-SPC-013 — a bar at zero paints nothing, and a minimum bar still shows', () => {
    // `MIN_BAR` exists because below it a bar cannot be seen: a bar with signal must
    // leave paint although its value is near zero.
    const c = lienzo();
    const g = c.getContext('2d')!;

    loop.drawBars(g, 200, 96, new Float32Array([0, 0, 0]), '#000');
    expect(pintados(c)).toBe(0);

    loop.drawBars(g, 200, 96, new Float32Array([0, 0.0001, 0]), '#000');
    const conMinima = pintados(c);
    expect(conMinima).toBeGreaterThan(0);
    // And no higher than `MIN_BAR` px for each bar: the minimum is a floor, not a jump.
    expect(conMinima).toBeLessThanOrEqual(Math.ceil(200 / 3) * MIN_BAR);
  });

  it('AC-SPC-015 — the idle state paints the 48 lanes and the text', () => {
    const c = lienzo();
    const g = c.getContext('2d')!;
    const escrito = vi.spyOn(g, 'fillText');

    loop.drawIdle(g, 200, 96);
    expect(escrito).toHaveBeenCalledWith(IDLE_TEXT, 100, 48);
    expect(pintados(c)).toBeGreaterThan(0);
    escrito.mockRestore();
  });

  it('AC-SPC-014 — the bars keep the `GAP` between lanes', () => {
    const c = lienzo();
    const g = c.getContext('2d')!;
    const rects = vi.spyOn(g, 'fillRect');

    loop.drawBars(g, 200, 96, new Float32Array([1, 1]), '#000');
    const [, , ancho] = rects.mock.calls[0];
    expect(ancho).toBe(200 / 2 - GAP);
    rects.mockRestore();
  });
});

describe('iniciarEspectro: the guards and the pixel density', () => {
  it('AC-SPC-026 — with no canvas it starts nothing, and its cleanup does not throw', () => {
    // A `ref.current` is `null` before the mount. Because the loop is a function, one call
    // reaches this path.
    expect(() => loop.iniciarEspectro(null)()).not.toThrow();
  });

  it('AC-SPC-026 — with no 2D context it starts nothing either: the app is mute, not broken', () => {
    // `getContext('2d')` returns null when the browser cannot give one. The test makes
    // that browser, the only way to know that the guard does what it says.
    const canvas = canvasSuelto();
    const real = canvas.getContext.bind(canvas);
    canvas.getContext = (() => null) as HTMLCanvasElement['getContext'];
    try {
      const limpiar = loop.iniciarEspectro(canvas);
      expect(() => limpiar()).not.toThrow();
    } finally {
      canvas.getContext = real;
    }
  });

  it('AC-SPC-024 — a canvas with no parent observes itself', () => {
    // The observer watches the CONTAINER and not the canvas, because a change of width or
    // height inside its own callback can feed back into it. It falls to the canvas when
    // there is no container.
    const suelto = document.createElement('canvas');
    const observados: Element[] = [];
    const observar = vi.spyOn(ResizeObserver.prototype, 'observe')
      .mockImplementation(function (this: ResizeObserver, el: Element) { observados.push(el); });
    try {
      loop.iniciarEspectro(suelto)();
      expect(observados).toEqual([suelto]);
    } finally {
      observar.mockRestore();
    }
  });

  it('AC-SPC-021 — a pixel density that is not valid falls to 1 and does not leave the canvas at zero', () => {
    const canvas = canvasSuelto(120, 60);
    const antes = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { get: () => 0, configurable: true });
    try {
      const limpiar = loop.iniciarEspectro(canvas);
      // With `dpr` at 0 and without the `|| 1`, the drawing surface would stay at 0×0 and
      // not one pixel would be drawn: a dark canvas that gives no warning.
      expect(canvas.width).toBe(120);
      expect(canvas.height).toBe(60);
      limpiar();
    } finally {
      if (antes) Object.defineProperty(window, 'devicePixelRatio', antes);
    }
  });

  it('AC-SPC-022 — a change of density measures again AND builds the media query again', () => {
    // The `ResizeObserver` does not cover the pixel density: a window dragged to a monitor
    // of another density changes `devicePixelRatio` and not one CSS pixel, so the observer
    // does not fire and the canvas keeps the drawing surface of the earlier screen. And the
    // media query must be built again with the NEW value each time, or it works only once.
    const canvas = canvasSuelto(120, 60);
    const consultas: { query: string; listeners: number }[] = [];
    const real = window.matchMedia.bind(window);

    window.matchMedia = ((query: string) => {
      const entrada = { query, listeners: 0 };
      consultas.push(entrada);
      const mql = real(query);
      return {
        ...mql,
        matches: mql.matches,
        media: query,
        addEventListener: (_t: string, fn: () => void) => { entrada.listeners++; disparar = fn; },
        removeEventListener: () => { entrada.listeners--; },
      } as unknown as MediaQueryList;
    });

    let disparar: (() => void) | null = null;
    try {
      const limpiar = loop.iniciarEspectro(canvas);
      expect(consultas.length).toBe(1);
      expect(consultas[0].query).toBe(`(resolution: ${window.devicePixelRatio}dppx)`);
      expect(consultas[0].listeners).toBe(1);

      disparar!();
      // It was built again with the new value and the earlier one was released: two
      // queries, one live listener.
      expect(consultas.length).toBe(2);
      expect(consultas[0].listeners).toBe(0);
      expect(consultas[1].listeners).toBe(1);

      limpiar();
      expect(consultas[1].listeners).toBe(0);
    } finally {
      window.matchMedia = real;
    }
  });

  it('AC-SPC-023 — the ResizeObserver measures again when the container changes size', async () => {
    const canvas = canvasSuelto(120, 60);
    const limpiar = loop.iniciarEspectro(canvas);
    try {
      expect(canvas.width).toBe(Math.round(120 * window.devicePixelRatio));
      canvas.parentElement!.style.width = '240px';
      await vi.waitFor(() =>
        expect(canvas.width).toBe(Math.round(240 * window.devicePixelRatio)));
    } finally {
      limpiar();
    }
  });
});

describe('iniciarEspectro: the idle state does not redraw for nothing', () => {
  // The three transitions of the key `dibujado`. A boolean "the idle state is drawn" would
  // cover the first two and fail in silence on the third. That is the difference between
  // the right fix and one silent failure in place of another.

  it('AC-SPC-017 — idle -> idle: after the first frame, more frames do not touch the canvas again', async () => {
    const canvas = canvasSuelto();
    const limpiar = loop.iniciarEspectro(canvas);
    try {
      // First frame: it draws the idle state once (dibujado goes from '' to 'reposo').
      await cuadro();

      // The spies are on REAL canvas operations and not on `drawIdle` itself: that is what
      // the finding counts, 55 operations repeated on each frame for nothing. A spy on the
      // production module and not on the prototype would let pass a `drawIdle` written in
      // another way that still hits the canvas.
      const limpiado = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect');
      const escrito = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
      try {
        await cuadro();
        await cuadro();
        await cuadro();
        expect(limpiado).not.toHaveBeenCalled();
        expect(escrito).not.toHaveBeenCalled();
      } finally {
        limpiado.mockRestore();
        escrito.mockRestore();
      }
    } finally {
      limpiar();
    }
  });

  it('AC-SPC-018 — a resize invalidates the key and draws the idle state again', async () => {
    const canvas = canvasSuelto();
    const limpiar = loop.iniciarEspectro(canvas);
    try {
      // The idle state is stable: the next frame, with no resize, would not paint again.
      await cuadro();

      const escrito = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
      try {
        // A resize clears the canvas (a change of width or height erases it): the key
        // must be invalidated, or the canvas stays blank until a signal comes.
        canvas.parentElement!.style.width = '300px';
        await vi.waitFor(() =>
          expect(canvas.width).toBe(Math.round(300 * window.devicePixelRatio)));
        await cuadro();
        expect(escrito).toHaveBeenCalledWith(IDLE_TEXT, expect.any(Number), expect.any(Number));
      } finally {
        escrito.mockRestore();
      }
    } finally {
      limpiar();
    }
  });

  it('AC-SPC-019 — signal -> idle: when readSpectrum returns null again, it draws the idle state again and does not leave the bars frozen', async () => {
    const canvas = canvasSuelto();
    const limpiar = loop.iniciarEspectro(canvas);
    try {
      await cuadro();

      // A canvas full of bars: the state that a boolean "the idle state is drawn" does not
      // tell from "nothing is drawn".
      motor.bins = new Uint8Array(128).fill(255);
      await cuadro();
      await cuadro();

      motor.bins = null;
      const escrito = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
      try {
        await cuadro();
        await cuadro();
        // Only `drawIdle` calls `fillText`: if it was called, the idle state was really
        // drawn again and the last bars did not stay painted.
        expect(escrito).toHaveBeenCalledWith(IDLE_TEXT, expect.any(Number), expect.any(Number));
      } finally {
        escrito.mockRestore();
      }
    } finally {
      limpiar();
    }
  });
});
