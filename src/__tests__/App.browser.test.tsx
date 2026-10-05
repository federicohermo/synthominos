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
 * El shell, entero y en un navegador.
 *
 * `App.tsx` no tiene un solo `useEffect` —los seis viven en
 * `use-engine.ts` y `use-input.ts`— pero sigue siendo dueño de TODO el estado y de los
 * handlers que lo mueven, y eso es lo que no verificaba nada: el gesto de colocar, las
 * tres formas de editar en el tablero, cuándo se dispara el arpegio de
 * cortesía y cuándo no, y las tres derivaciones que AC15 del 017 obliga a llevar el
 * régimen.
 *
 * El motor va mockeado con un doble que RECUERDA si arrancó: es lo que hace verificable
 * que el botón de transporte refleje si el reloj arrancó de verdad y no si se lo apretó
 * —el ítem AC10, que esperó catorce specs—. Todo lo demás es real: el
 * dominio, los tres componentes y el DOM.
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
 * Cuantas veces se EJECUTA el panel de las doce miniaturas (AC6 y AC7).
 *
 * `hover` vive en `App.tsx`, asi que cada celda que el cursor cruza re-renderiza el arbol
 * entero — y `OrientationPanel` son 337 elementos (1 grilla + 12 x (boton + grilla + 25
 * celdas + span), con `MINI_BOX = 5`) de los que ninguno depende del hover. Antes del memo
 * de este spec eran DIEZ ejecuciones al cruzar diez celdas, una por celda.
 *
 * Se instrumenta DESDE ACA y no metiendo un contador en el componente: un contador adentro
 * seria codigo de produccion que existe para el test.
 *
 * ## Por que el contador va ADENTRO del `memo` y no envolviendolo
 *
 * `real.default` es un `memo` y `.type` es la funcion que tiene adentro; el mock cuenta ahi
 * y vuelve a envolver en `memo`, o sea que reproduce la misma barrera que el componente
 * real y mide lo que pasa detras de ella.
 *
 * La forma obvia —una funcion sin memoizar que renderiza `<Real {...props} />`— esta
 * medida y MIENTE: da diez con el panel memoizado y diez sin memoizar, porque lo que cuenta
 * es el envoltorio, que nunca esta detras de la barrera. Es exactamente el modo de falla
 * que este repo persigue, un oraculo verde midiendo otra cosa.
 *
 * React expone `.type` en runtime pero sus tipos no —`memo(fn)` resuelve a
 * `NamedExoticComponent`, que no lo declara—, asi que se estrecha con un chequeo de verdad
 * y no con un `as`: el dia que alguien saque el `memo`, el mock no adivina, tira con el
 * motivo puesto.
 *
 * El mock es de archivo y el contador sube tambien durante los otros tests: el que mide lo
 * pone en cero antes de montar.
 */
const panel = vi.hoisted(() => ({ ejecuciones: 0 }));
vi.mock('../panels/OrientationPanel.tsx', async (importActual) => {
  const real = await importActual<typeof import('../panels/OrientationPanel.tsx')>();
  const { memo } = await import('react');
  const memoizado = (c: unknown): c is { type: (props: { orientacion: PropsDeOrientacion }) => ReactNode } =>
    typeof c === 'object' && c !== null && 'type' in c && typeof c.type === 'function';
  if (!memoizado(real.default)) {
    throw new Error('OrientationPanel dejo de estar memoizado: la medicion pasaria a medir el envoltorio.');
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
 * El viewport de estos tests, y por que ahora hay uno.
 *
 * El tablero sale del viewport, asi que el tamano de la ventana dejo de
 * ser un detalle del runner: sin fijarlo, Playwright arranca en **414 x 896** —un telefono
 * en vertical— y el tablero queda de **6 columnas**, donde media docena de estos casos
 * apuntan a celdas que no existen. Se fija uno de escritorio, y las dimensiones esperadas
 * salen de la misma pura que las calcula y no de dos numeros escritos a mano: si la formula
 * cambia, estos tests la siguen.
 */
const VIEWPORT: [number, number] = [1024, 768];
const { dims: DIMS } = grillaPara(...VIEWPORT);

beforeEach(async () => {
  await page.viewport(...VIEWPORT);
  motor.estado.corriendo = false;
  for (const v of Object.values(motor)) if (typeof v === 'function' && 'mockClear' in v) v.mockClear();
});

/**
 * Las celdas del tablero, en orden de indice.
 *
 * Por ROL y no por estructura: la grilla es `role="row"` con celdas adentro, asi que
 * `div.grid > div` devuelve las filas y no las celdas. Y cuantas son no se puede
 * escribir: desde el 031 el tablero mide lo que entra en la ventana del navegador de test.
 */
const celdas = (c: HTMLElement) => [...c.querySelectorAll('[role="gridcell"]')] as HTMLElement[];
/**
 * El ancho del tablero RENDERIZADO, leido del arbol de accesibilidad.
 *
 * No es una constante, y esa es la mitad que este archivo nota: la app
 * mide su contenedor y dibuja las celdas que entran, asi que el ancho depende del tamano
 * de la ventana del navegador de test y no de una constante. Leerlo de `aria-colcount` —el
 * mismo atributo que el 025 puso para el lector de pantalla— es lo que hace que estos
 * tests no se rompan al cambiar el tamano de la ventana de Playwright.
 */
const anchoDe = (c: HTMLElement) => Number(c.querySelector('[role="grid"]')!.getAttribute('aria-colcount'));
const celda = (c: HTMLElement, x: number, y: number) => celdas(c)[y * anchoDe(c) + x];
const baldosa = (el: HTMLElement) => el.firstElementChild as HTMLElement;

/** Donde caen las celdas de una pieza colocada con el ancla en (x, y). */
const donde = (piece: PieceKey, x: number, y: number, rot = 0, mirror = false) => {
  const base = rotateN(SHAPES[piece], rot);
  return cellsAt(mirror ? reflect(base) : base, ANCHOR_INDEX[piece], x, y);
};

/** Cuantas celdas del tablero tienen texto: una por celda de pieza colocada. */
const conNota = (c: HTMLElement) => celdas(c).filter(e => baldosa(e).textContent !== '').length;

/**
 * Lo que dice el fantasma, celda por celda: cambia con la rotacion (otra nota) y con la
 * reflexion (otro `#N`).
 *
 * Vive a nivel de modulo y no adentro de un `describe` porque lo leen los dos escritores
 * del cursor —el mouse y el foco del teclado—, que estan en bloques distintos; dos copias
 * serian dos formas de medir el mismo fantasma distinto.
 */
const notaDelFantasma = (c: HTMLElement) => {
  const conTexto = celdas(c).filter(e => baldosa(e).textContent !== '');
  return conTexto.map(e => e.getAttribute('title')).join('|');
};

/**
 * El gesto COMPLETO de un modificador: son dos eventos y no uno. El `keydown` abre el tap
 * limpio y el `keyup` es el que alterna, para que `Ctrl`+C no de vuelta la reflexion.
 *
 * Recibe el target porque los dos casos importan: sobre `window` es el atajo global del
 * la entrada directa, y sobre una celda es el mismo atajo con el tablero enfocado.
 */
const tapDeModificador = (el: EventTarget, key: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
};

const hover = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
const click = (el: HTMLElement, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));

describe('App — la composicion', () => {
  it('021 — el tablero y los dos flotantes, sin una sola tarjeta', async () => {
    // No hay tarjetas: el tablero ES la pantalla y los dos paneles flotan encima. Se
    // afirma por ROL Y NOMBRE y no por `className`, que es lo que deja que el test
    // sobreviva al proximo cambio de layout.
    const { container } = await render(<App />);
    expect(celdas(container).length).toBe(DIMS.w * DIMS.h);

    // Los dos flotantes existen y son plegables: el encabezado es un control, no un `<h2>`.
    await expect.element(page.getByRole('button', { name: /^Piezas$/, expanded: true })).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: /^Señal$/, expanded: true })).toBeInTheDocument();

    // Y no EMPUJAN la grilla: los dos son `fixed`, o sea que salen del flujo.
    for (const flotante of container.querySelectorAll('aside')) {
      expect(getComputedStyle(flotante).position).toBe('fixed');
    }

    // La leyenda de gestos sobrevivio a la mudanza del `<footer>`: es el unico lugar donde
    // los cuatro gestos del 013 y la letra del 018 estan escritos.
    expect(container.textContent).toContain('Rueda sobre el tablero');
    expect(container.textContent).toContain('arranca y para');
  });

  it('AC-FIT-008 — la pagina no scrollea: el tablero mide exactamente el viewport', async () => {
    await render(<App />);
    // Es la mitad falsable de AC1 que no necesita cinco viewports: si el raiz creciera mas
    // que la ventana —una tarjeta de vuelta, un flotante en el flujo, un `min-h-screen`
    // con contenido debajo— esto se cae.
    expect(document.documentElement.scrollHeight).toBe(document.documentElement.clientHeight);
  });

  it('AC-PNL-002 — los dos flotantes se pliegan, y el espectro sigue vivo al plegarse', async () => {
    // Plegar OCULTA y no desmonta, y de eso dependen dos cosas medidas: el
    // `ResizeObserver` del espectro —que redibuja porque su contenedor cambia de TAMAÑO— y
    // la barrera del `memo` de `OrientationPanel`, que se pagaria entera al remontar.
    const { container } = await render(<App />);
    const senal = page.getByRole('button', { name: /^Señal$/ });
    const region = container.querySelector('#franja-senal')!;
    expect(region.hasAttribute('hidden')).toBe(false);
    expect(region.querySelector('canvas')).not.toBeNull();

    await senal.click();
    await vi.waitFor(() => expect(region.hasAttribute('hidden')).toBe(true));
    // El canvas sigue en el DOM: es lo que hace que el observador siga observando.
    expect(region.querySelector('canvas')).not.toBeNull();

    await senal.click();
    await vi.waitFor(() => expect(region.hasAttribute('hidden')).toBe(false));

    // Y el dock de piezas, con el mismo mecanismo y su propio estado: son dos plegados
    // independientes, no uno compartido. Acá también OCULTA y no desmonta — de eso depende
    // la barrera del `memo` de `OrientationPanel`, que remontar pagaría entera.
    const piezas = page.getByRole('button', { name: /^Piezas$/ });
    const dock = container.querySelector('#dock-piezas')!;
    expect(dock.hasAttribute('hidden')).toBe(false);
    await piezas.click();
    await vi.waitFor(() => expect(dock.hasAttribute('hidden')).toBe(true));
    // La franja no se plegó con él.
    expect(region.hasAttribute('hidden')).toBe(false);
    // Las doce miniaturas siguen en el DOM.
    expect(dock.querySelectorAll('button').length).toBeGreaterThan(12);
    await piezas.click();
    await vi.waitFor(() => expect(dock.hasAttribute('hidden')).toBe(false));
  });

  it('AC-MUS-012 AC-PLY-005 — arranca con el tempo del motor y el regimen de siempre', async () => {
    // `DEFAULT_BPM` es una sola declaracion: el estado del shell y el del motor no
    // pueden discrepar porque salen del mismo numero.
    const { container } = await render(<App />);
    expect(container.textContent).toContain(String(DEFAULT_BPM));
    // Abrir la app suena como sonaba (AC11 del 017).
    await expect.element(page.getByRole('button', { name: REGIMEN.escala })).toHaveClass(/bg-slate-900/);
  });
});

describe('App — colocar', () => {
  it('AC-BRD-002 — el click coloca la pieza en la mano y dispara su arpegio', async () => {
    const { container } = await render(<App />);
    click(celda(container, 3, 2));

    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    // El click es la unica forma inmediata de escuchar la pieza: con D5 del 009 la
    // pieza nueva ni siquiera entra al recorrido que esta sonando.
    expect(motor.playNow).toHaveBeenCalledWith(arpeggioFor('F', 0, false, REGIMEN.escala));
  });

  it('AC-BRD-005 — con el transporte corriendo NO lo dispara: seria el arpegio dos veces', async () => {
    const { container } = await render(<App />);
    await page.getByRole('button', { name: 'Reproducir' }).click();
    motor.playNow.mockClear();

    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.playNow).not.toHaveBeenCalled();
  });

  it('AC-BRD-006 — `Alt`+click coloca MUTEADA, y tampoco suena', async () => {
    // La pieza se pone justamente para que no suene: un arpegio de cortesia
    // contradiria el gesto en el momento de hacerlo.
    const { container } = await render(<App />);
    click(celda(container, 3, 2), { altKey: true });

    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.playNow).not.toHaveBeenCalled();
    // Y se ve: la baldosa muteada cae al blanco conservando su nota.
    const [x, y] = donde('F', 3, 2)[0];
    expect(baldosa(celda(container, x, y)).className).toContain('bg-white');
  });

  it('AC-BRD-003 — una jugada invalida no coloca nada', async () => {
    const { container } = await render(<App />);
    // Contra el borde: parte de la `F` cae fuera del tablero.
    click(celda(container, 0, 0));
    await new Promise(r => setTimeout(r, 30));
    expect(conNota(container)).toBe(0);
    expect(motor.playNow).not.toHaveBeenCalled();
  });
});

describe('App — editar en el tablero', () => {
  const conUnaF = async () => {
    const vista = await render(<App />);
    click(celda(vista.container, 3, 2));
    await vi.waitFor(() => expect(conNota(vista.container)).toBe(SHAPES.F.length));
    motor.playNow.mockClear();
    return vista;
  };

  it('AC-BRD-007 — el click sobre la pieza propia la QUITA', async () => {
    const { container } = await conUnaF();
    const [x, y] = donde('F', 3, 2)[0];
    click(celda(container, x, y));
    await vi.waitFor(() => expect(conNota(container)).toBe(0));
  });

  it('AC-BRD-010 — `Alt`+click sobre la pieza propia alterna su muteo, ida y vuelta', async () => {
    const { container } = await conUnaF();
    const [x, y] = donde('F', 3, 2)[0];

    click(celda(container, x, y), { altKey: true });
    await vi.waitFor(() => expect(baldosa(celda(container, x, y)).className).toContain('bg-white'));
    // Objeto nuevo y no mutacion: la pieza sigue en el tablero con sus cinco celdas.
    expect(conNota(container)).toBe(SHAPES.F.length);

    click(celda(container, x, y), { altKey: true });
    await vi.waitFor(() => expect(baldosa(celda(container, x, y)).style.background).not.toBe(''));
  });

  it('AC-BRD-011 — mutear una pieza no toca a las demas', async () => {
    // El `map` devuelve la MISMA referencia para las que no cambian, y objetos nuevos
    // solo para la que se muteo: nunca mutar lo que ya se entrego a React.
    const { container } = await conUnaF();
    click(celda(container, 8, 3));   // una segunda `F`, lejos de la primera
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length * 2));

    const [x1, y1] = donde('F', 3, 2)[0];
    const [x2, y2] = donde('F', 8, 3)[0];
    click(celda(container, x1, y1), { altKey: true });

    await vi.waitFor(() => expect(baldosa(celda(container, x1, y1)).className).toContain('bg-white'));
    // La otra sigue con su color: el muteo es de una pieza, no del tablero.
    expect(baldosa(celda(container, x2, y2)).style.background).not.toBe('');
    expect(conNota(container)).toBe(SHAPES.F.length * 2);
  });

  it('AC-BRD-009 — sobre una pieza que NO esta en la mano no pasa nada', async () => {
    const { container } = await conUnaF();
    // Se cambia la pieza en la mano y se vuelve a apretar la `F` colocada.
    await page.getByRole('button', { name: 'W, rotación 0°' }).click();
    const [x, y] = donde('F', 3, 2)[0];
    click(celda(container, x, y));

    await new Promise(r => setTimeout(r, 30));
    expect(conNota(container)).toBe(SHAPES.F.length);
  });
});

describe('App — el fantasma', () => {
  it('AC-BRD-014 — aparece bajo el cursor y desaparece al salir del tablero', async () => {
    const { container } = await render(<App />);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    container.querySelector('[role="grid"]')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await vi.waitFor(() => expect(conNota(container)).toBe(0));
  });

  it('AC-BRD-015 — sobre la pieza propia NO se pinta: ahi el click edita, no coloca', async () => {
    // Saldria rosa entero, diciendo "aca no entra" sobre la unica celda donde el click
    // si hace algo (AC20 del 014).
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    const [x, y] = donde('F', 3, 2)[0];
    hover(celda(container, x, y));
    await new Promise(r => setTimeout(r, 30));
    // Sigue habiendo cinco celdas con nota —las de la pieza— y ninguna rosa de choque.
    expect(conNota(container)).toBe(SHAPES.F.length);
    expect(container.querySelectorAll('.bg-rose-500').length).toBe(0);
    // Y el cursor dice que ahi se puede apretar.
    expect(celda(container, x, y).className).toContain('cursor-pointer');
  });
});

describe('App — el transporte', () => {
  it('AC-PLY-002 — el boton refleja si el reloj ARRANCO, no si se lo apreto', async () => {
    // AC10, que espero catorce specs: la decision vive en
    // `alternarTransporte` y aca se verifica el cableado contra un motor que contesta.
    const { container } = await render(<App />);
    await page.getByRole('button', { name: 'Reproducir' }).click();
    expect(motor.startClock).toHaveBeenCalled();
    await expect.element(page.getByRole('button', { name: 'Pausa' })).toBeVisible();

    await page.getByRole('button', { name: 'Pausa' }).click();
    expect(motor.stopClock).toHaveBeenCalled();
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
    expect(container).toBeTruthy();
  });

  it('AC-PLY-003 — si el motor NO arranca, el boton se queda en Reproducir', async () => {
    // Sin Web Audio `startClock` no arranca nada. Creerle a lo que se pidio dejaria el
    // boton diciendo que suena algo que no suena.
    motor.startClock.mockImplementationOnce(() => {});
    await render(<App />);
    await page.getByRole('button', { name: 'Reproducir' }).click();
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
  });

  it('AC-BRD-030 AC-PLY-038 — Reset frena el transporte ADEMAS de vaciar el tablero', async () => {
    // Vaciar solo `placed` deja al motor terminando su ciclo activo: hasta 7,5 s sonando
    // sobre un tablero que ya esta vacio.
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    await page.getByRole('button', { name: 'Reproducir' }).click();
    motor.stopClock.mockClear();

    // El boton perdio la palabra `Reset` y quedo en `↺`: se lo busca por
    // el nombre accesible nuevo, que dice las dos mitades que este test verifica.
    await page.getByRole('button', { name: 'Vaciar el tablero y frenar el transporte' }).click();
    expect(motor.stopClock).toHaveBeenCalled();
    await vi.waitFor(() => expect(conNota(container)).toBe(0));
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
  });

  it('AC-PLY-006 — el tempo y los clicks bajan al motor', async () => {
    await render(<App />);
    await page.getByRole('slider').fill('128');
    await vi.waitFor(() => expect(motor.setBpm).toHaveBeenLastCalledWith(128));

    // El recorrido dejo de ser una fila con etiqueta visible y paso a ser
    // el metronomo de la fila de transporte: se lo busca por su nombre accesible, que es
    // la misma etiqueta mudada a `aria-label`. Y sobre el MISMO render que el tempo: el
    // segundo `render(<App />)` que habia aca dejaba dos apps montadas, que con una
    // consulta por rol sobre la pagina entera es una violacion de modo estricto.
    await page.getByRole('button', { name: /^Recorrido en el vacío$/ }).click();
    await vi.waitFor(() => expect(motor.setClicksAudible).toHaveBeenLastCalledWith(true));
  });
});

describe('App — la orientacion, por panel y por gesto', () => {
  it('AC-PNL-018 AC-PNL-020 — el panel ya no rota ni refleja: lo que hace es DECIR la orientacion', async () => {
    // La tarjeta perdio los cuatro botones de grados y el ON/OFF de
    // Reflexion, porque duplicaban la rueda, `Shift`, el boton derecho y `Ctrl`. Lo que
    // queda en su lugar es un lector: una linea de texto que no se puede apretar.
    //
    // Este test es la mitad de arriba de AC1 desde el shell —los seis controles no estan—
    // y la mitad de abajo de AC4: la linea sigue al gesto.
    const { container } = await render(<App />);
    for (const grados of ['0°', '90°', '180°', '270°']) {
      expect(page.getByRole('button', { name: new RegExp(`^${grados}$`) }).elements(), grados)
        .toHaveLength(0);
    }
    expect(page.getByRole('button', { name: /^Reflexión$/ }).elements()).toHaveLength(0);

    // El `<span>` de adentro y no el `<p>`: la linea comparte parrafo con
    // el boton `0°`, asi que el `textContent` del `<p>` dice `0°0°`.
    const linea = () => [...container.querySelectorAll('p > span')].find(e => /^\d+°/.test(e.textContent!))!;
    expect(linea().textContent).toBe('0°');

    tapDeModificador(window, 'Shift');
    await vi.waitFor(() => expect(linea().textContent).toBe('90°'));
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(linea().textContent).toBe('90° · reflejada'));
  });

  it('AC-PCS-019 AC-PCS-020 AC-PCS-021 — la orientacion es de la PIEZA: se recuerda, y el `0°` resetea una sola', async () => {
    // Los cuatro criterios que sólo el shell puede verificar, porque la memoria vive acá:
    // AC1/AC2 (el gesto toca una ranura), AC5 (volver a una pieza la trae como la
    // dejaste), AC7 (el `0°` no toca las otras once) y AC9 (la línea sigue a la pieza).
    const { container } = await render(<App />);
    const linea = () => [...container.querySelectorAll('p > span')].find(e => /^\d+°/.test(e.textContent!))!;
    // Los dos encabezados de los flotantes son `<button>` SIN `aria-label` —su nombre es su
    // texto visible— asi que hay que filtrarlos antes de leerlo.
    const nombreDe = (key: string) => [...container.querySelectorAll('button')]
      .map(b => b.getAttribute('aria-label'))
      .find(n => n !== null && n.startsWith(`${key},`));

    // La `F` a 180° y reflejada, con los dos gestos de teclado.
    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(linea().textContent).toBe('180° · reflejada'));
    // Y las otras once no se movieron: es el criterio que le da nombre al spec.
    expect(nombreDe('T')).toBe('T, rotación 0°');
    expect(nombreDe('F')).toBe('F, rotación 180°, reflejada');

    // Ir a la `T` y volver: la `F` sigue como la dejaste (AC5), y la línea la sigue (AC9).
    await page.getByRole('button', { name: 'T, rotación 0°' }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('0°'));
    await page.getByRole('button', { name: 'F, rotación 180°, reflejada' }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('180° · reflejada'));

    // El `0°` devuelve la `F` al arranque —los grados Y la reflexión— y no toca a nadie más.
    await page.getByRole('button', { name: /^Volver esta pieza a 0° sin reflejar$/ }).click();
    await vi.waitFor(() => expect(linea().textContent).toBe('0°'));
    expect(nombreDe('F')).toBe('F, rotación 0°');
    expect(nombreDe('T')).toBe('T, rotación 0°');
  });

  it('AC-BRD-030 AC-PCS-022 — `↺` vacia el tablero y NO toca las orientaciones recordadas', async () => {
    // AC8, con su costo escrito: se renuncia al invariante «después de `↺` la app queda
    // como recién abierta» para que este botón conserve un alcance único y nombrable.
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

  it('AC-PCS-023 — rotar la pieza en la mano no cambia una nota de la que ya esta puesta', async () => {
    // AC11, que hasta este review solo tenia la confirmacion a ojo de T025 `[M]`. Es la
    // promesa central del spec —«no cambia una nota»— y la que se rompe sola si algun dia
    // la memoria del shell pasa a ser la fuente de lo que ya esta en el tablero: hoy cada
    // `PlacedPiece` guarda la suya y por eso el `title` de sus cinco celdas —nota y `#N`,
    // o sea sonido Y orden— no se mueve. Se lee del DOM y no del estado porque lo que hay
    // que verificar es que el tablero no cambio, no que el shell no lo escribio.
    const { container } = await render(<App />);
    click(celda(container, 3, 2));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const puesta = () => donde('F', 3, 2)
      .map(([x, y]) => `${baldosa(celda(container, x, y)).textContent}@${celda(container, x, y).getAttribute('title')}`);
    const antes = puesta();

    // La `F` de la mano a 90° y reflejada: los dos gestos, los dos sobre una sola ranura.
    tapDeModificador(window, 'Shift');
    tapDeModificador(window, 'Control');
    await vi.waitFor(() => expect(container.textContent).toContain('90° · reflejada'));

    expect(puesta()).toEqual(antes);
    expect(conNota(container)).toBe(SHAPES.F.length);
  });

  it('AC-MUS-013 — el regimen cambia lo que la rotacion HACE, y se ve en el fantasma', async () => {
    // AC7 del 017: sin llevar el regimen a las tres derivaciones, cambiarlo no
    // re-derivaria el tablero.
    const { container } = await render(<App />);
    // Se rota con `Shift`: no hay boton `90°`, la rotacion es un modificador del gesto
    // directo. Lo que el test mide —que el regimen llegue a las tres derivaciones— es
    // independiente del gesto con el que se llegue a una rotacion distinta de cero.
    tapDeModificador(window, 'Shift');
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const enEscala = notaDelFantasma(container);

    await page.getByRole('button', { name: REGIMEN.orden }).click();
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(enEscala));
  });

  it('AC-BRD-024 AC-BRD-028 — `Shift` rota, `Ctrl` refleja y la barra alterna el transporte', async () => {
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

  it('AC-BRD-023 — la rueda sobre el tablero rota, y `Ctrl`+rueda no', async () => {
    const { container } = await render(<App />);
    const tablero = container.querySelector('div.relative')!;
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const antes = notaDelFantasma(container);

    tablero.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    // El zoom del navegador es una afordancia de accesibilidad: un gesto del sistema le
    // gana a uno nuestro.
    const conRueda = notaDelFantasma(container);
    tablero.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 30));
    hover(celda(container, 4, 3));
    await new Promise(r => setTimeout(r, 30));
    expect(notaDelFantasma(container)).toBe(conRueda);
  });

  it('AC-BRD-026 — el boton derecho refleja, salvo el `Ctrl`+click de macOS', async () => {
    const { container } = await render(<App />);
    const tablero = container.querySelector('div.relative')!;
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const antes = notaDelFantasma(container);

    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    tablero.dispatchEvent(menu);
    // El menu contextual no se abre NUNCA sobre el tablero.
    expect(menu.defaultPrevented).toBe(true);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    // En macOS `Ctrl`+click llega como `contextmenu` con `ctrlKey`, y ahi el que alterna
    // es el `keyup` del `Ctrl`: contar los dos daria neto cero y la reflexion no
    // respondería nunca en una laptop de Apple sin mouse.
    const conReflexion = notaDelFantasma(container);
    tablero.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ctrlKey: true }));
    await new Promise(r => setTimeout(r, 30));
    hover(celda(container, 4, 3));
    await new Promise(r => setTimeout(r, 30));
    expect(notaDelFantasma(container)).toBe(conReflexion);
  });

  it('elegir otra pieza cambia lo que hay en la mano', async () => {
    const { container } = await render(<App />);
    await page.getByRole('button', { name: 'I, rotación 0°' }).click();
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.I.length));
    expect(container.textContent).toContain('tónica');
  });

  it('AC-BRD-017 — la LETRA elige la pieza, sin ir al panel', async () => {
    // No es redundante con el test de `use-input`: lo que cubre de mas es el callback del
    // shell, que es el que traduce la pieza a la ranura de estado y que ningun test del
    // hook ejerce.
    const { container } = await render(<App />);
    hover(celda(container, 4, 3));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true }));

    // El oraculo es DONDE cae el fantasma y no cuantas celdas tiene: las doce piezas
    // tienen cinco, asi que contarlas no distingue una `I` de una `F`.
    await vi.waitFor(() => {
      for (const [x, y] of donde('I', 4, 3)) {
        expect(baldosa(celda(container, x, y)).textContent, `${x},${y}`).not.toBe('');
      }
    });
    // Y en minuscula tanto como en mayuscula: `Shift`+`p` es la misma pieza.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', shiftKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      for (const [x, y] of donde('P', 4, 3)) {
        expect(baldosa(celda(container, x, y)).textContent, `${x},${y}`).not.toBe('');
      }
    });
  });
});

describe('App — lo que llega al arbol de accesibilidad', () => {
  it('AC-ACC-011 — ningun boton de la app puede enviar un formulario', async () => {
    // Hoy no hay un solo `<form>` en el arbol, asi que no hay bug — y por eso mismo
    // esta es la unica linea que nada mas falsea: existe para una
    // regresion futura. El default de un `<button>` dentro de un formulario es
    // `submit`, y en esta app eso significa recargar la pagina perdiendo el tablero
    // entero, sin deshacer.
    //
    // Se afirma sobre la app COMPLETA y no componente por componente porque los botones
    // salen de tres archivos —doce miniaturas, el regimen en la tarjeta, y los tres del
    // transporte— y ninguno de los tres los tiene todos.
    //
    // Llegaron a ser 22, con los cuatro grados y el ON/OFF de Reflexion, y sin el del
    // recorrido mudado: 12 + 2 + 3 = 17. La orientacion por pieza devuelve UNO —el `0°` de la linea de
    // orientacion— y son 18. El 021 suma los DOS encabezados de los flotantes, que pasan de
    // `<h2>` a `<button>` con `aria-expanded`: 20.
    const { container } = await render(<App />);
    const botones = [...container.querySelectorAll('button')];
    expect(botones.length).toBe(20);
    for (const boton of botones) {
      expect(boton.getAttribute('type'), boton.textContent ?? '').toBe('button');
    }
  });
});

describe('App — lo que cuesta mover el cursor', () => {
  /** Diez celdas interiores: dos filas de cinco, con el fantasma entero adentro del tablero. */
  const RECORRIDO = [2, 3].flatMap(y => [1, 2, 3, 4, 5].map(x => [x, y] as const));

  /** La huella del fantasma: que celdas del tablero tienen nota, como un mapa de bits. */
  const huella = (c: HTMLElement) => celdas(c).map(e => (baldosa(e).textContent === '' ? '0' : '1')).join('');

  it('cruzar diez celdas ya no ejecuta el panel de orientacion, y rotar si', async () => {
    panel.ejecuciones = 0;
    const { container } = await render(<App />);
    // El render inicial se cuenta APARTE, y es lo que vuelve falsificable el cero de abajo:
    // un panel que no se ejecutara nunca —o un mock roto— tambien daria cero.
    expect(panel.ejecuciones).toBe(1);
    panel.ejecuciones = 0;

    // Se espera a que el fantasma se REPINTE antes de mover el cursor otra vez, y no es
    // ceremonia: `mouseover` es un evento CONTINUO, asi que React 19 agenda su re-render en
    // prioridad default y dos despachos seguidos se cobran como uno solo. Medido con un
    // `setTimeout(0)` entre medio: daban 8 de 10, o sea el test contando menos trabajo del
    // que paga un cursor de verdad, que cruza una celda por cuadro dibujado.
    const huellas = new Set<string>();
    let antes = huella(container);
    for (const [x, y] of RECORRIDO) {
      hover(celda(container, x, y));
      await vi.waitFor(() => expect(huella(container)).not.toBe(antes));
      antes = huella(container);
      huellas.add(antes);
    }

    // Diez posiciones distintas del fantasma, o sea DIEZ re-renders del arbol: el shell
    // trabajo las diez veces, que es la mitad del sistema que este numero mide.
    expect(huellas.size).toBe(RECORRIDO.length);
    expect(conNota(container)).toBe(SHAPES.F.length);
    // Y el panel no se ejecuto una sola vez. Antes del `memo` eran diez, una por celda:
    // 3.370 elementos reconciliados para llegar al mismo DOM.
    expect(panel.ejecuciones).toBe(0);

    // La memo no lo congelo: cuando la orientacion cambia DE VERDAD, se ejecuta. Sin esta
    // mitad, el cero de arriba lo cumpliria igual un panel roto. Se rota con `Shift`, que
    // es el gesto que hay: no existe un boton `90°`.
    tapDeModificador(window, 'Shift');
    await vi.waitFor(() => expect(panel.ejecuciones).toBe(1));
  });
});

/**
 * El teclado sobre el SHELL entero.
 *
 * `Board.browser.test.tsx` ya verifica el roving tabindex, las flechas, `Home`/`End` y las
 * cuatro acciones contra un `Board` suelto y con props fijas. Lo que solo existe ACA es lo
 * que necesita la pagina completa: el `Tab` que entra desde la paleta y sale en uno solo,
 * el listener global de `window` —que es de quien el tablero le saca la barra sin apagarle
 * `Shift` ni `Ctrl`—, el desempate entre el foco y el mouse por el mismo `hover`, y la
 * region `aria-live`, que es del shell porque es el shell el que sabe que edicion ocurrio.
 *
 * Los eventos van despachados SOBRE EL NODO de la celda y con `bubbles`, no sobre `window`:
 * el listener global mira `e.target.closest('[role="gridcell"]')`, y un
 * `window.dispatchEvent(...)` llega con `target === window`, que no es ninguna celda. O sea
 * que despachar en `window` verificaria el caso contrario al que dice verificar.
 */
const tecla = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(evento);
  return evento;
};

/** El tablero, entero a la vista: lo que scrollea despues es la tecla y no el `.focus()`. */
const aLaVista = (c: HTMLElement) =>
  c.querySelector('div.relative')!.scrollIntoView({ block: 'center' });

describe('App — el tablero se toca con el teclado', () => {
  it('AC-ACC-013 — desde la paleta, UN `Tab` entra al tablero y otro lo pasa de largo', async () => {
    // `Tab` de VERDAD, por Playwright, y no el conteo de cuantas celdas tienen `tabIndex`
    // distinto de -1: las dos cosas no son la misma. El conteo mide el DOM y seria cierto
    // igual con el `0` sobre una celda que el navegador se saltea; lo que AC1 y AC12
    // afirman es lo que hace el navegador con el ORDEN DE TABULACION, que es lo unico que
    // convierte —o no— a la tarjeta del tablero en una trampa de salida.
    const { container } = await render(<App />);
    const ancla = celdas(container).find(c => c.tabIndex === 0)!;

    // El control de la paleta que esta JUSTO antes del tablero, tomado del orden del DOM y
    // no por su nombre: asi agregarle un boton a la paleta no rompe este test.
    const paradas = [...container.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')];
    paradas[paradas.indexOf(ancla) - 1].focus();

    await userEvent.tab();
    expect(document.activeElement).toBe(ancla);

    // Y una sola pulsacion mas lo deja atras. Con sesenta paradas esta linea aterrizaria en
    // la celda (1,0) y todo lo que viene detras del tablero quedaria a sesenta `Tab`.
    await userEvent.tab();
    expect(celdas(container)).not.toContain(document.activeElement);
  });

  it('AC-ACC-016 — las flechas mueven el foco del DOM, y la pagina NO scrollea', async () => {
    // Teclas de VERDAD, por Playwright, y esa es toda la razon de ser de este test: un
    // `dispatchEvent` fabrica un evento NO confiable, y un evento no confiable **nunca
    // ejecuta la accion por default** — con lo que "la pagina no scrolleo" seria cierto
    // aunque `preventDefault` no existiera. Es exactamente el modo de falla que este repo
    // persigue, una afirmacion verde que no puede ponerse en rojo. `Board.browser.test.tsx`
    // ya verifica el `preventDefault` con eventos sinteticos, que ahi si es el oraculo
    // correcto porque lo que afirma es lo que hace el HANDLER; lo que se afirma aca es lo
    // que hace el NAVEGADOR, y para eso la tecla tiene que ser real.
    const { container } = await render(<App />);
    aLaVista(container);
    const origen = celda(container, 4, 2);
    origen.focus();

    // **El oraculo cambio de forma, y hacia arriba.** Antes la pagina
    // TENIA de donde scrollear —la app medía mas que el viewport— y lo que se afirmaba era
    // que las cuatro flechas no le hicieran perder esa posicion; sin esa premisa el par del
    // final habria sido trivialmente cierto. Hoy el contenedor raiz mide exactamente
    // `100dvh` y es `overflow-hidden`, asi que la pagina **no tiene scroll que perder**: es
    // AC1, y es una propiedad mas fuerte que la que este test verificaba.
    //
    // Lo que se sigue verificando con teclas de VERDAD es lo de arriba —que las flechas
    // muevan el foco— y que no aparezca scroll de pagina en el intento. El
    // `preventDefault` en si lo verifica `Board.browser.test.tsx` con eventos sinteticos,
    // que ahi es el oraculo correcto porque afirma lo que hace el HANDLER.
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

    // El default de las cuatro es scrollear, y el tablero mide seis filas: cuatro flechas
    // sin frenar se lo llevan de la pantalla mientras el foco sigue adentro.
    expect([document.documentElement.scrollTop, document.documentElement.scrollLeft])
      .toEqual(antes);
  });

  it('`Home` y `End` van a los extremos de SU fila, sin salirse de ella', async () => {
    const { container } = await render(<App />);
    aLaVista(container);
    const media = celda(container, 5, 3);
    media.focus();

    expect(tecla(media, 'End').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(celda(container, anchoDe(container) - 1, 3));
    tecla(celda(container, anchoDe(container) - 1, 3), 'Home');
    expect(document.activeElement).toBe(celda(container, 0, 3));
    // Y en el extremo se queda: `Home` no salta a la fila de arriba, que es lo que haria
    // si el par mirara el tablero entero en vez de la fila.
    tecla(celda(container, 0, 3), 'Home');
    expect(document.activeElement).toBe(celda(container, 0, 3));
  });

  it('AC-ACC-020 — `Enter` coloca, `Enter` sobre la pieza propia la quita, `Alt`+`Enter` mutea — y la region lo dice', async () => {
    // Las cuatro entran por el MISMO `onCellClick` que el click, o sea por `accionDeClick`:
    // lo que se verifica aca es que el shell las reciba iguales y que la region `aria-live`
    // cuente la edicion que el tablero acaba de aplicar y no la que se pidio.
    //
    // El oraculo del tablero es el NOMBRE ACCESIBLE de la celda y no cuantas tienen texto:
    // con el foco puesto, la celda enfocada ES `hover`, asi que el fantasma pinta cinco
    // celdas con texto tambien sobre el tablero vacio. `cellNameFor` no las confunde —una
    // celda con fantasma se llama "libre", igual que una sin nada.
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

    // `Alt` significa "muteado" en los dos lados del gesto, tambien con el teclado.
    const [mx, my] = donde('F', 3, 2)[0];
    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(baldosa(celda(container, mx, my)).className).toContain('bg-white'));
    expect(conPieza()).toBe(SHAPES.F.length);
    expect(dicho()).toBe('pieza F colocada muteada en fila 3, columna 4');

    // Y sobre una pieza YA muteada la devuelve al sonido: el anuncio dice el estado en el
    // que la pieza QUEDA, no que tecla se apreto.
    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(dicho()).toBe('pieza F con sonido en fila 3, columna 4'));
    expect(baldosa(celda(container, mx, my)).style.background).not.toBe('');

    tecla(c, 'Enter', { altKey: true });
    await vi.waitFor(() => expect(dicho()).toBe('pieza F muteada en fila 3, columna 4'));
  });

  it('AC-BRD-031 — con una celda enfocada la barra NO alterna el transporte; con el foco en el `body`, si', async () => {
    // El oraculo es el TRANSPORTE —el motor y el nombre del boton— y no "se llamo
    // `preventDefault`": la barra frena el default tambien con la celda enfocada, porque su
    // default es scrollear y eso hay que frenarlo lo maneje quien lo maneje. Usar el
    // `preventDefault` de oraculo daria verde con el bug puesto.
    const { container } = await render(<App />);
    const c = celda(container, 3, 2);
    c.focus();

    tecla(c, ' ');
    // El mismo golpe SI edito: sin la guarda, un solo `Espacio` colocaria la pieza Y
    // arrancaria el transporte.
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    expect(motor.startClock).not.toHaveBeenCalled();
    await expect.element(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();

    // Con un `<button>` enfocado tampoco, y por la otra guarda: ahi el navegador tiene que
    // quedarse el evento ENTERO para activar el control, sin un `blur()` a mano.
    const play = [...container.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') ?? b.textContent) === 'Reproducir')!;
    play.focus();
    tecla(play, ' ');
    expect(motor.startClock).not.toHaveBeenCalled();

    // Y con el foco en ningun lado, la barra sigue siendo del transporte: la celda le
    // saca UNA tecla en UN lugar, no la apaga.
    play.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(motor.startClock).toHaveBeenCalled());
    await expect.element(page.getByRole('button', { name: 'Pausa' })).toBeVisible();
  });

  it('AC-BRD-032 — con una celda enfocada, `Shift` SI rota y `Ctrl` SI refleja', async () => {
    // Va separado del test de la barra a proposito: uno verifica que se apago, este que NO
    // se apago de mas. Ensanchar la guarda del listener global para que matchee la celda es
    // lo tentador —es una linea— y apagaria los tres atajos para arreglar uno.
    const { container } = await render(<App />);
    const c = celda(container, 4, 3);
    c.focus();
    // La celda enfocada ES el cursor: el fantasma aparece sin que el mouse toque nada.
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const antes = notaDelFantasma(container);

    tapDeModificador(c, 'Shift');
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(antes));

    // La reflexion no cambia la NOTA de una celda, cambia el orden: lo que se mueve es el
    // `#N`, y por eso el oraculo es el `title` entero y no la nota sola.
    const conRotacion = notaDelFantasma(container);
    tapDeModificador(c, 'Control');
    await vi.waitFor(() => expect(notaDelFantasma(container)).not.toBe(conRotacion));
  });

  it('AC-BRD-021 AC-BRD-032 — con una celda enfocada, la letra IGUAL elige la pieza', async () => {
    // AC13: `targetEsCelda` apaga la barra y solo la barra. El `switch` del `onKeyDown` de
    // la celda cierra con `default: return`, asi que una letra no la maneja nadie mas y no
    // hay doble disparo que evitar — vetarla ahi apagaria el atajo justo donde mas sirve.
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
    // Y el transporte sigue parado: la letra elige y no hace nada ademas.
    expect(motor.startClock).not.toHaveBeenCalled();
  });

  it('AC-ACC-022 — con el foco en una celda, sacar el mouse de la grilla no apaga el fantasma', async () => {
    // LA regla de desempate: mientras el foco del DOM este adentro del tablero, el foco
    // manda sobre el mouse. Sin ella el mouse apagaria el fantasma de la celda enfocada y
    // el roving tabindex se quedaria sin ancla — o sea que "la celda enfocada es el hover"
    // seria una promesa que el mouse rompe.
    const { container } = await render(<App />);
    celda(container, 4, 3).focus();
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    const conFoco = notaDelFantasma(container);

    container.querySelector('[role="grid"]')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    // Se espera de verdad: el mismo gesto con el foco AFUERA lo apaga en el mismo tick, asi
    // que sin la espera esta afirmacion pasaria por llegar antes que el re-render.
    await new Promise(r => setTimeout(r, 30));
    expect(conNota(container)).toBe(SHAPES.F.length);
    expect(notaDelFantasma(container)).toBe(conFoco);
  });

  it('AC-ACC-023 — un click del mouse NO le saca el mando al mouse: el fantasma sigue al cursor', async () => {
    // La otra dirección de la misma regla, y el bug que costó el review: un `div` con
    // `tabIndex` es enfocable POR CLICK, así que sin el `preventDefault` del `mousedown`
    // el primer click prendía `focoEnTablero` y desde ahí el mouse quedaba inerte — el
    // fantasma congelado en la celda clickeada hasta salir del tablero con `Tab`. Es el
    // gesto primario del producto, roto al primer click.
    //
    // Click y hover de VERDAD, por Playwright, y ahí está toda la razón de ser del test:
    // un `dispatchEvent('click')` no dispara `mousedown` y por lo tanto **no mueve el
    // foco**, así que con eventos sintéticos esta afirmación sería verde con el bug
    // puesto. Es el mismo modo de falla que el de las flechas, unas líneas más arriba.
    const { container } = await render(<App />);
    aLaVista(container);

    await userEvent.click(celda(container, 2, 1));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length));
    // Y el foco no se quedó en el tablero, que es lo que la guarda garantiza.
    expect(celdas(container)).not.toContain(document.activeElement);

    // Cinco celdas de la pieza colocada más las cinco del fantasma nuevo: si el mouse
    // hubiera quedado inerte, seguirían siendo cinco.
    await userEvent.hover(celda(container, 7, 4));
    await vi.waitFor(() => expect(conNota(container)).toBe(SHAPES.F.length * 2));
  });
});

describe('App — el fondo, un solo valor', () => {
  // Hasta este spec NINGUN test miraba el fondo, asi que AC6 y AC9 se firmaban a ojo: el
  // color vivia dos veces —el hex a mano en el `body` y la clase de Tailwind que resuelve
  // al mismo hex en el `div` raiz— y nada ataba las dos copias. Un grep del hex tampoco lo
  // delataba, porque la segunda copia estaba escrita como nombre de clase y no como color.
  // El hex no se escribe aca por eso mismo: su unica aparicion en `src/` es el token.
  it('AC-PNL-030 — el div raiz pinta lo mismo que el body, y ninguno de los dos es transparente', async () => {
    const { container } = await render(<App />);
    // El primer hijo del contenedor y no `div.min-h-screen`: esa clase paso a ser
    // `h-[100dvh] overflow-hidden`. Buscarlo por posicion en vez de por una clase de
    // layout es lo que hace que este test siga midiendo el FONDO cuando el layout cambie.
    const raiz = container.firstElementChild!;
    const delDiv = getComputedStyle(raiz).backgroundColor;
    const delBody = getComputedStyle(document.body).backgroundColor;

    // La asercion es que COINCIDAN, no que valgan una cadena fija: comparar cada uno
    // contra `rgb(248, 250, 252)` deja que manana alguien cambie uno y no el otro, que es
    // exactamente la duplicacion que el token vino a borrar.
    expect(delDiv).toBe(delBody);

    // Y que ninguno sea transparente, porque si el token desapareciera de los dos lados
    // los dos computarian `rgba(0, 0, 0, 0)` y la igualdad de arriba se cumpliria vacia.
    // Ese es el modo de falla que hay que cerrar: verde sin fondo.
    expect(delDiv).not.toBe('rgba(0, 0, 0, 0)');
    expect(delBody).not.toBe('rgba(0, 0, 0, 0)');
  });
});

describe('App — el tablero crece hasta la pantalla', () => {
  it('AC-FIT-008 — no scrollea ninguno de los dos ejes, en escritorio ni en telefono', async () => {
    // La mitad del AC1 que solo se puede ver montando la app entera: el tablero mide lo que
    // el contenedor mide, y los dos flotantes van encima sin empujarlo. Se prueban los dos
    // extremos de la tabla del spec — el escritorio grande y el telefono en vertical, que
    // es el caso donde antes del 031 el tablero scrolleaba a lo ancho.
    for (const [w, h] of [[1440, 900], [375, 667]] as const) {
      await page.viewport(w, h);
      const { container, unmount } = await render(<App />);
      const raiz = document.documentElement;
      expect(raiz.scrollWidth, `${w}x${h} ancho`).toBeLessThanOrEqual(raiz.clientWidth);
      expect(raiz.scrollHeight, `${w}x${h} alto`).toBe(raiz.clientHeight);

      // Y el tablero tampoco: es el nodo que hasta el 031 tenia `overflow-x-auto`.
      const tablero = container.querySelector('div.relative')!;
      expect(tablero.scrollWidth, `${w}x${h} tablero`).toBeLessThanOrEqual(tablero.clientWidth + 1);
      await unmount();
    }
  });

  it('AC-FIT-010 — la grilla que se dibuja es la que sale del viewport', async () => {
    // El extremo chico de la tabla: 5 columnas por 9 filas en un telefono en vertical,
    // contra las 26 x 15 de un escritorio. Es el numero que hasta el 031 era 10 x 6 en los
    // dos.
    await page.viewport(375, 667);
    const { container } = await render(<App />);
    const grilla = container.querySelector('[role="grid"]')!;
    const esperado = grillaPara(375, 667).dims;
    expect(Number(grilla.getAttribute('aria-colcount'))).toBe(esperado.w);
    expect(Number(grilla.getAttribute('aria-rowcount'))).toBe(esperado.h);
    expect(celdas(container).length).toBe(esperado.w * esperado.h);
  });

  it('AC-ACC-028 AC-BRD-004 — la pieza 13 no entra, y se dice', async () => {
    // El tope que hasta el 031 lo garantizaba el area: con 154 celdas entrarian 30 piezas y
    // el circuito exacto es `O(n^2 * 2^n)`. Es el unico rechazo que no se explica solo —una
    // jugada invalida se ve, porque el fantasma sale rosa— asi que se anuncia.
    const { container } = await render(<App />);
    const dicho = () => container.querySelector('[aria-live="polite"]')!.textContent;
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;

    // Doce `I` acostadas, dos por fila: la `I` mide 5 x 1 y el tablero de 1024 x 768 tiene
    // 14 columnas y 11 filas, asi que entran dos por fila y sobra lugar. La letra se aprieta
    // UNA vez —seleccionar es estado del shell, no del gesto de colocar— y recien cuando el
    // fantasma dice `I` se empieza a colocar.
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
    // El tablero no cambio…
    await vi.waitFor(() => expect(dicho()).toContain(`acepta ${MAX_PIEZAS} piezas`));
    expect(conPieza()).toBe(SHAPES.I.length * MAX_PIEZAS);
  });

  it('AC-FIT-021 — achicar la ventana no borra piezas: vuelven enteras al agrandarla', async () => {
    // El repo no tiene deshacer y arrastrar el borde de una ventana no es
    // un gesto de edicion. La pieza que deja de entrar se guarda: no se dibuja, no suena, y
    // vuelve identica cuando hay lugar.
    const { container } = await render(<App />);
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;
    const nombres = () => celdas(container)
      .map(e => e.getAttribute('aria-label')!)
      .filter(n => n.includes('pieza'));

    // Una `I` acostada bien a la derecha: con el ancla en (11,4) ocupa de (9,4) a (13,4),
    // asi que en 14 columnas entra y en 5 no.
    //
    // Se ESPERA la seleccion antes del `Enter`, como en el test del tope: la letra es
    // estado del shell y hasta que no re-renderiza, `Enter` coloca la pieza anterior. Sin
    // la espera este test colocaba una `F` —que tambien mide cinco celdas, asi que la
    // cuenta pasaba igual— y no verificaba lo que su comentario dice.
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

  it('AC-BRD-016 AC-FIT-022 — la pieza que queda a medias tampoco recibe clicks: la celda vacia se comporta como vacia', async () => {
    // El caso que el AC8 de arriba no toca: ahi la ventana deja la pieza ENTERA afuera, y
    // aca la deja **a medias** —dos celdas adentro de la grilla nueva y tres afuera—, que
    // es el unico estado donde el modelo y lo que se ve pueden discrepar. La pieza no se
    // dibuja (el criterio es la pieza entera), asi que sus celdas de adentro se ven vacias;
    // y si el shell consultara el ocupante sobre `placed` en vez de sobre lo visible, un
    // click ahi quitaria una pieza que no esta en pantalla y lo anunciaria.
    //
    // No hay deshacer: borrar por accidente lo que no se ve es
    // exactamente el gesto que guardar la pieza entera hace imposible.
    const { container } = await render(<App />);
    const conPieza = () => celdas(container).filter(e => e.getAttribute('aria-label')!.includes('pieza')).length;
    const dicho = () => container.querySelector('[aria-live="polite"]')!.textContent;

    // La misma `I` acostada del test de arriba: ancla en (11,4), o sea las celdas 9 a 13.
    const c = celda(container, 11, 4);
    c.focus();
    tecla(c, 'i');
    await vi.waitFor(() => expect(page.getByRole('button', { name: /^I, / }).element().getAttribute('aria-pressed')).toBe('true'));
    tecla(c, 'Enter');
    await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.I.length));

    // 800 x 600 da 11 columnas: quedan adentro (9,4) y (10,4), y afuera las otras tres.
    const chico = grillaPara(800, 600).dims;
    expect(chico.w).toBe(11);
    await page.viewport(800, 600);
    await vi.waitFor(() => expect(celdas(container).length).toBe(chico.w * chico.h));
    expect(conPieza()).toBe(0);

    // El click sobre (9,4) —que el modelo sigue teniendo ocupada— no quita nada y no
    // anuncia nada. Con la `I` en la mano, que es el unico gesto que podria quitarla.
    const tapada = celda(container, 9, 4);
    tapada.focus();
    // Enfocarla ya escribe el cursor, asi que acá se ve la OTRA mitad de la misma consulta:
    // el fantasma se dibuja, o sea que el gesto que la celda promete es colocar —invalido,
    // porque la pieza guardada la sigue ocupando— y no editar. Si `hoverEdita` mirara
    // `placed`, el fantasma se apagaria y el cursor prometeria una edicion sobre una celda
    // que se ve vacia.
    await vi.waitFor(() => expect(conNota(container)).toBeGreaterThan(0));

    tecla(tapada, 'Enter');
    // Se espera de verdad y no se afirma en el mismo tick: sin la espera, este `expect`
    // pasaria por llegar antes del re-render y no por que no haya pasado nada.
    await new Promise(r => setTimeout(r, 30));
    expect(conPieza()).toBe(0);
    expect(dicho()).not.toContain('quitada');

    // Y no la quito de verdad: al agrandar vuelve entera.
    await page.viewport(...VIEWPORT);
    await vi.waitFor(() => expect(conPieza()).toBe(SHAPES.I.length));
  });

  it('AC-ACC-014 AC-FIT-024 — achicar la ventana no deja al tablero sin ancla de tabulacion', async () => {
    // El OTRO estado que la grilla nueva puede dejar apuntando afuera, y que no es una
    // pieza: el cursor. Lo escriben el mouse y el foco y ninguno de los dos se
    // entera de un `resize`, asi que el par guardado puede caer fuera de `dims`.
    //
    // `Board` ancla el roving tabindex en esa celda, o sea que si no se acota, NINGUNA
    // celda se queda con `tabIndex={0}` y el tablero entero sale del orden de tabulacion —
    // para quien navega con teclado, que es de quien es el 026, la app se vuelve
    // inalcanzable hasta que un mouse toque el tablero.
    //
    // Se fija el cursor con el MOUSE y no con el foco a proposito: al achicar, la celda
    // enfocada se DESMONTA, y si el navegador emite el `focusout` de ese desmonte el cursor
    // se apaga por otro camino y el test pasaria sin verificar nada. El `mouseover` no tiene
    // esa segunda via — nadie movio el puntero, asi que no hay `mouseout` que lo limpie.
    const { container } = await render(<App />);
    const anclas = () => celdas(container).filter(e => e.getAttribute('tabindex') === '0');

    // Una celda de la derecha del todo, que en el tablero chico no existe.
    hover(celda(container, anchoDe(container) - 1, 4));
    await vi.waitFor(() => expect(anclas()).toEqual([celda(container, anchoDe(container) - 1, 4)]));

    const chico = grillaPara(375, 667).dims;
    await page.viewport(375, 667);
    await vi.waitFor(() => expect(celdas(container).length).toBe(chico.w * chico.h));

    // Sigue habiendo exactamente UNA parada de tabulacion, y es la (0,0): el destino del
    // `?? [0, 0]` de `Board`, que es lo que el cursor apagado le devuelve.
    expect(anclas()).toEqual([celda(container, 0, 0)]);

    // Y la otra mitad del mismo cursor colgado: con `hover` puesto fuera del tablero,
    // `previewValid` da `false` y pintaba las 45 celdas de `cursor-not-allowed`, diciendo
    // "aca no entra" justo donde la jugada entra.
    expect(celdas(container).filter(e => e.className.includes('cursor-not-allowed'))).toEqual([]);
  });
});
