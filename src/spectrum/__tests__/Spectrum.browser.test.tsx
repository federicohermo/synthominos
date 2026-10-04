import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-react';

/**
 * El espectro, sobre un canvas de VERDAD.
 *
 * Es el archivo que decide si jsdom sirve o no, y la respuesta esta medida en el fuente:
 * usa `getContext('2d')`, `createLinearGradient`, `setTransform`, `fillText`,
 * `ResizeObserver`, `matchMedia('(resolution: Xdppx)')`, `devicePixelRatio` y
 * `getBoundingClientRect`. En jsdom el primero devuelve `null` sin el paquete nativo
 * `canvas` —o sea que el efecto entero se corta en su segunda linea—, los dos del medio
 * no existen y el ultimo devuelve ceros. Cubrirlo ahi exigiria mockear exactamente el
 * codigo que se quiere cubrir.
 *
 * El motor va mockeado porque lo que este modulo decide es QUE DIBUJA segun haya senal
 * o no; de donde sale la senal es problema de `engine.ts`, que tiene sus propios tests.
 */
const motor = vi.hoisted(() => ({ bins: null as Uint8Array | null }));
vi.mock('../../playback/engine.ts', () => ({ readSpectrum: () => motor.bins }));

const Spectrum = (await import('../Spectrum.tsx')).default;
const loop = await import('../spectrum-loop.ts');
const { GAP, MIN_BAR, IDLE_TEXT } = await import('../spectrum.constants.ts');

/** Dos cuadros: el loop lee, dibuja y vuelve a agendar en el mismo `draw`. */
const cuadro = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Un canvas suelto con tamano real, para llamar al loop sin montar el componente. */
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

/** Cuantos pixeles del canvas no son transparentes: la medida de "se dibujo algo". */
const pintados = (canvas: HTMLCanvasElement): number => {
  const g = canvas.getContext('2d')!;
  const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
  return n;
};

describe('Spectrum — el montaje', () => {
  it('AC-SPC-020 — monta un canvas dimensionado por el layout, no por atributos', async () => {
    const { container } = await render(<Spectrum />);
    const canvas = container.querySelector('canvas')!;

    await vi.waitFor(() => expect(canvas.width).toBeGreaterThan(0));
    // El backing store sale del rect CSS por el dpr: es lo que jsdom no puede dar,
    // porque ahi `getBoundingClientRect` devuelve ceros y el canvas quedaria en 0×0.
    const rect = canvas.getBoundingClientRect();
    expect(canvas.width).toBe(Math.round(rect.width * window.devicePixelRatio));
    expect(canvas.height).toBe(Math.round(rect.height * window.devicePixelRatio));
  });

  it('AC-SPC-016 — el reposo y la senal se dibujan DISTINTO, y el reposo lo dice con palabras', async () => {
    // Lo que separa los dos estados NO es cuanta tinta hay —medido: el reposo pinta las
    // 48 ranuras de alto completo, o sea la misma area que las barras al maximo— sino
    // que el reposo escribe. Una linea plana al ras del canvas se lee igual que "el
    // audio esta roto", y por eso el estado sin contexto se dibuja con un texto.
    const escribio = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
    try {
      const { container } = await render(<Spectrum />);
      const canvas = container.querySelector('canvas')!;

      await cuadro();
      expect(pintados(canvas)).toBeGreaterThan(0);
      expect(escribio).toHaveBeenCalledWith(IDLE_TEXT, expect.any(Number), expect.any(Number));

      // 128 bins al maximo: con senal deja de escribir y pasa a dibujar barras.
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

  it('AC-SPC-025 — al desmontar corta el loop y suelta el observer', async () => {
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

describe('drawBars / drawIdle — lo que se dibuja', () => {
  const lienzo = () => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 96;
    return c;
  };

  it('AC-SPC-013 — una barra en cero no pinta nada, y una minima igual se ve', () => {
    // `MIN_BAR` existe porque por debajo de eso no se ve que hay algo: una barra con
    // senal tiene que dejar tinta aunque su valor sea casi cero.
    const c = lienzo();
    const g = c.getContext('2d')!;

    loop.drawBars(g, 200, 96, new Float32Array([0, 0, 0]), '#000');
    expect(pintados(c)).toBe(0);

    loop.drawBars(g, 200, 96, new Float32Array([0, 0.0001, 0]), '#000');
    const conMinima = pintados(c);
    expect(conMinima).toBeGreaterThan(0);
    // Y no mas alta que `MIN_BAR` px de alto por barra: el minimo es un piso, no un salto.
    expect(conMinima).toBeLessThanOrEqual(Math.ceil(200 / 3) * MIN_BAR);
  });

  it('AC-SPC-015 — el reposo pinta las 48 ranuras y el texto', () => {
    const c = lienzo();
    const g = c.getContext('2d')!;
    const escrito = vi.spyOn(g, 'fillText');

    loop.drawIdle(g, 200, 96);
    expect(escrito).toHaveBeenCalledWith(IDLE_TEXT, 100, 48);
    expect(pintados(c)).toBeGreaterThan(0);
    escrito.mockRestore();
  });

  it('AC-SPC-014 — las barras respetan el `GAP` entre ranuras', () => {
    const c = lienzo();
    const g = c.getContext('2d')!;
    const rects = vi.spyOn(g, 'fillRect');

    loop.drawBars(g, 200, 96, new Float32Array([1, 1]), '#000');
    const [, , ancho] = rects.mock.calls[0];
    expect(ancho).toBe(200 / 2 - GAP);
    rects.mockRestore();
  });
});

describe('iniciarEspectro — las guardas y el dpr', () => {
  it('AC-SPC-026 — sin canvas no arranca nada, y su limpieza no explota', () => {
    // Es lo que tiene un `ref.current` recien montado. Con el loop adentro del
    // componente este camino no lo podia ejercer nadie.
    expect(() => loop.iniciarEspectro(null)()).not.toThrow();
  });

  it('AC-SPC-026 — sin contexto 2d tampoco: la app queda muda, no rota', () => {
    // `getContext('2d')` devuelve null cuando el navegador no puede darlo. Se fabrica
    // ese navegador, porque es la unica forma de saber que la guarda hace lo que dice.
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

  it('AC-SPC-024 — un canvas sin padre se observa a si mismo', () => {
    // El observer mira el CONTENEDOR y no el canvas —cambiarle width/height dentro del
    // propio callback puede realimentarlo— y cae al canvas cuando no hay contenedor.
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

  it('AC-SPC-021 — un dpr que no vale cae a 1 en vez de dejar el canvas en cero', () => {
    const canvas = canvasSuelto(120, 60);
    const antes = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { get: () => 0, configurable: true });
    try {
      const limpiar = loop.iniciarEspectro(canvas);
      // Con `dpr` en 0 y sin el `|| 1`, el backing store quedaria en 0×0 y no se
      // dibujaria un solo pixel — un canvas apagado que no avisa.
      expect(canvas.width).toBe(120);
      expect(canvas.height).toBe(60);
      limpiar();
    } finally {
      if (antes) Object.defineProperty(window, 'devicePixelRatio', antes);
    }
  });

  it('AC-SPC-022 — el cambio de densidad re-mide Y re-arma la media query', () => {
    // El `ResizeObserver` no cubre el dpr: arrastrar la ventana a un monitor con otra
    // densidad cambia `devicePixelRatio` sin cambiar un pixel CSS, asi que el observer
    // no dispara y el canvas se queda con el backing store de la pantalla anterior. Y
    // la media query hay que re-armarla con el valor NUEVO cada vez, o solo sirve una.
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
      // Se re-armo con el valor nuevo y se solto la anterior: dos consultas, un solo
      // listener vivo.
      expect(consultas.length).toBe(2);
      expect(consultas[0].listeners).toBe(0);
      expect(consultas[1].listeners).toBe(1);

      limpiar();
      expect(consultas[1].listeners).toBe(0);
    } finally {
      window.matchMedia = real;
    }
  });

  it('AC-SPC-023 — el ResizeObserver re-mide cuando el contenedor cambia de tamano', async () => {
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

describe('iniciarEspectro — el reposo no redibuja de balde', () => {
  // Las tres transiciones de la clave `dibujado`. Un booleano de "ya dibuje el
  // reposo" cubriria las dos primeras y fallaria muda en la tercera -es la
  // diferencia que separa el arreglo correcto de cambiar una falla muda por otra.

  it('AC-SPC-017 — reposo -> reposo: tras el primer cuadro, mas cuadros no vuelven a tocar el canvas', async () => {
    const canvas = canvasSuelto();
    const limpiar = loop.iniciarEspectro(canvas);
    try {
      // Primer cuadro: dibuja el reposo una vez (dibujado pasa de '' a 'reposo').
      await cuadro();

      // Espiar operaciones REALES de canvas y no `drawIdle` en si: es lo que el
      // hallazgo cuenta -55 operaciones por cuadro repetidas de balde-, y espiar
      // el modulo de produccion en vez del prototipo dejaria pasar un `drawIdle`
      // reescrito que igual golpeara el canvas por otro camino.
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

  it('AC-SPC-018 — un resize invalida la clave y vuelve a dibujar el reposo', async () => {
    const canvas = canvasSuelto();
    const limpiar = loop.iniciarEspectro(canvas);
    try {
      // Reposo ya estable: el cuadro siguiente, sin resize, no volveria a pintar.
      await cuadro();

      const escrito = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
      try {
        // Redimensionar borra el canvas (cambiar width/height lo limpia): la
        // clave tiene que invalidarse o el canvas queda en blanco hasta que
        // llegue senal.
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

  it('AC-SPC-019 — senal -> reposo: cuando readSpectrum vuelve a null, redibuja el reposo y no deja las barras congeladas', async () => {
    const canvas = canvasSuelto();
    const limpiar = loop.iniciarEspectro(canvas);
    try {
      await cuadro();

      // Canvas lleno de barras: es el estado que un booleano de "ya dibuje el
      // reposo" no distingue de "nunca dibuje nada".
      motor.bins = new Uint8Array(128).fill(255);
      await cuadro();
      await cuadro();

      motor.bins = null;
      const escrito = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
      try {
        await cuadro();
        await cuadro();
        // `fillText` solo lo llama `drawIdle`: si aparecio, el reposo se
        // redibujo de verdad y no quedo la ultima barra pintada.
        expect(escrito).toHaveBeenCalledWith(IDLE_TEXT, expect.any(Number), expect.any(Number));
      } finally {
        escrito.mockRestore();
      }
    } finally {
      limpiar();
    }
  });
});
