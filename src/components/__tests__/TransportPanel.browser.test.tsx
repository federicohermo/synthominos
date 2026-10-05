import { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import TransportPanel from '../TransportPanel.tsx';
import { useAtajosDeTeclado } from '../use-input.ts';
import { ARRASTRE_PX_POR_BPM, TEMPO_MAX, TEMPO_MIN } from '../constants/layout.constants.ts';
import type { PieceKey } from '../../domain/types/pieces.types.ts';
import type { PropsDeTransporte } from '../types/panel.types.ts';

/**
 * El transporte es presentacional y de cuatro controles, asi que lo que se verifica no es
 * que renderice sino las tres cosas que su docblock ARGUMENTA:
 *
 * 1. **el icono ES el estado** — lo que se ve es lo que pasa al apretar, y el color
 *    lo repite;
 * 2. el boton se queda sin nombre accesible al sacarle el texto, asi que el
 *    `aria-label` no es decoracion: es el unico nombre que tiene; y
 * 3. el reloj es un `<button>` y **nunca** un `<div role="spinbutton">`, que es la
 *    decision D5 del spec 052 y el motivo entero de AC8.
 *
 * **Todo se consulta por rol y nombre accesible**, que es lo que sobrevive a un panel sin
 * texto visible: el reloj muestra `110` y nada mas, asi que preguntarle al DOM por la
 * palabra `Tempo` o por `bpm` no encontraria nada aunque el control estuviera perfecto.
 * Los nombres van anclados con regex porque `getByRole` empareja por SUBCADENA.
 *
 * **La aritmetica gesto → bpm no se repite aca**: vive en `tempo.ts` y su test agota los
 * casos en el proyecto `node`, sin navegador. Lo que estos tests verifican es el CABLEADO
 * —que cada gesto llegue a la pura y su resultado a `onTempo`— y los limites, que son un
 * AC y no un detalle de implementacion.
 */
const transporte = (over: Partial<PropsDeTransporte> = {}): PropsDeTransporte => ({
  tempo: 110,
  playing: false,
  // `clicks` y `onToggleClicks` SI los lee este componente: el
  // interruptor del recorrido dejo de vivir en la tarjeta y bajo a esta fila, como
  // metronomo solo-icono. Hasta entonces eran dos campos que llegaban y se descartaban.
  clicks: false,
  onToggleClicks: vi.fn(),
  onTempo: vi.fn(),
  onTogglePlay: vi.fn(),
  onReset: vi.fn(),
  ...over,
});

/**
 * El reloj, por su nombre accesible completo.
 *
 * El nombre lleva el numero adentro —`Tempo: 110 bpm`— asi que pedirlo por el bpm que se
 * le paso al componente verifica de paso que el nombre siga al valor: si el `aria-label`
 * quedara clavado en un numero, la consulta no encuentra el boton y el test se cae solo.
 */
const reloj = (bpm: number) =>
  page.getByRole('button', { name: new RegExp(`^Tempo: ${bpm} bpm$`) });

/**
 * Un evento sintetico despachado sobre el nodo, y siempre con `bubbles`.
 *
 * React no registra sus handlers en el nodo sino en el contenedor raiz, asi que un evento
 * que no burbujea no llega a ninguna prop `on*` y el test daria verde sin haber ejercido
 * nada. Y para el teclado hay un segundo motivo, que es lo que AC8 mide. Una tecla real
 * nace en el elemento enfocado y sube; despachada sobre `window` llega con
 * `e.target === window`, que no es un `<button>`, asi que la guarda de `accionDeTecla` que
 * se quiere verificar ni se consulta y el test da un falso rojo.
 */
const rueda = (nodo: Element, deltaY: number) => {
  nodo.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
};

/** Devuelve el evento para poder preguntarle si alguien se quedo con su default. */
const tecla = (nodo: Element, key: string): KeyboardEvent => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  nodo.dispatchEvent(evento);
  return evento;
};

const puntero = (nodo: Element, tipo: string, clientY: number, init: PointerEventInit = {}) => {
  nodo.dispatchEvent(new PointerEvent(tipo, {
    clientY, pointerId: 7, bubbles: true, isPrimary: true, ...init,
  }));
};

/** Los tres gestos del teclado que este panel no toca, para que el harness de AC8 compile. */
const ajenos = { rotar: vi.fn(), reflejar: vi.fn(), transporte: vi.fn() };

/**
 * El transporte con el listener de teclado GLOBAL puesto encima, que es el unico contexto
 * donde AC8 se puede medir.
 *
 * `selected` vive en el shell y este componente no lo conoce, asi que lo que hay que
 * verificar no es el estado sino quien lo escribe: el `seleccionar` que `useAtajosDeTeclado`
 * llama cuando la tecla nombra un pentomino. Montando el hook de verdad —y no una
 * reimplementacion de su guarda— el test falla si `esControl` deja de reconocer al reloj,
 * que es exactamente lo que pasaria con un `<div role="spinbutton">`.
 */
function ConAtajos({ seleccionar }: { seleccionar: (pieza: PieceKey) => void }) {
  const tapLimpio = useRef(false);
  useAtajosDeTeclado({ ...ajenos, seleccionar }, tapLimpio);
  return <TransportPanel transporte={transporte()} />;
}

describe('TransportPanel', () => {
  it('en pausa: el boton ofrece reproducir, y lo dice con el glifo y con el nombre', async () => {
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onTogglePlay })} />);

    const boton = page.getByRole('button', { name: 'Reproducir' });
    await expect.element(boton).toHaveTextContent('▶');
    // El verde es lo que un transporte pide leer como "apreta esto para que suene", y
    // NO el `bg-slate-100` de lo apagado: al lado tiene a Reset y quedarian
    // indistinguibles.
    await expect.element(boton).toHaveClass(/bg-emerald-600/);

    await boton.click();
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('corriendo: el mismo boton ofrece pausar, con el idioma de lo activo', async () => {
    await render(<TransportPanel transporte={transporte({ playing: true })} />);

    const boton = page.getByRole('button', { name: 'Pausa' });
    await expect.element(boton).toHaveTextContent('⏸');
    // `bg-slate-900 text-white` es el mismo idioma con el que el dock marca lo activo
    // —la casilla de la pieza en la mano, el regimen elegido—, aplicado al mismo concepto.
    await expect.element(boton).toHaveClass(/bg-slate-900/);

    // Y el `title` dice lo mismo que el nombre accesible: el puntero y el lector no
    // pueden contar dos historias distintas del mismo boton.
    expect(boton.element().getAttribute('title')).toBe('Pausa');
  });

  it('AC7: el tempo se lee como numero solo, y su unidad vive en el nombre accesible', async () => {
    const { container } = await render(<TransportPanel transporte={transporte({ tempo: 96 })} />);

    // La mitad falsable del AC: ni un `input[type=range]`, ni un `input` de ningun tipo.
    // Se pregunta por el rol Y por la etiqueta, porque son dos formas de reintroducirlo:
    // un `range` con `role` cambiado seguiria siendo un slider.
    expect(page.getByRole('slider').elements()).toHaveLength(0);
    expect(container.querySelectorAll('input')).toHaveLength(0);

    const nodo = reloj(96).element();
    // Lo visible es el numero pelado. La unidad y la palabra `Tempo` no desaparecieron:
    // se mudaron al nombre accesible, que es lo que la consulta de arriba ya exigio.
    expect(nodo.textContent).toBe('96');
    expect(container.textContent).not.toContain('bpm');
    expect(container.textContent).not.toContain('Tempo');
    // `title` con el MISMO texto que el nombre: el puntero y el lector no pueden contar
    // dos historias distintas del mismo boton.
    expect(nodo.getAttribute('title')).toBe('Tempo: 96 bpm');
    // Y `tabular-nums`, que es lo que hace que el numero no baile de ancho al cambiar de
    // digito — un reloj que se mueve solo al pasar de 99 a 100 no se lee de un vistazo.
    expect(getComputedStyle(nodo).fontVariantNumeric).toContain('tabular-nums');
  });

  it('AC7: la rueda mueve el tempo de a un bpm y el techo lo detiene', async () => {
    const onTempo = vi.fn<(bpm: number) => void>();
    const enMedio = await render(
      <TransportPanel transporte={transporte({ tempo: 110, onTempo })} />,
    );

    rueda(reloj(110).element(), -100);
    expect(onTempo).toHaveBeenLastCalledWith(111);
    // Lo que importa del numero: un `'111'` que llegara como string se propagaria a
    // `setBpm` y de ahi a la aritmetica del scheduler.
    expect(typeof onTempo.mock.calls[0][0]).toBe('number');
    rueda(reloj(110).element(), 100);
    expect(onTempo).toHaveBeenLastCalledWith(109);
    await enMedio.unmount();

    // El componente es presentacional: el tempo no cambia solo entre gestos, asi que el
    // extremo se ejerce montandolo AHI y empujando hacia afuera.
    const enElTecho = vi.fn();
    const arriba = await render(
      <TransportPanel transporte={transporte({ tempo: TEMPO_MAX, onTempo: enElTecho })} />,
    );
    rueda(reloj(TEMPO_MAX).element(), -100);
    expect(enElTecho).toHaveBeenCalledWith(TEMPO_MAX);
    await arriba.unmount();

    const enElPiso = vi.fn();
    await render(
      <TransportPanel transporte={transporte({ tempo: TEMPO_MIN, onTempo: enElPiso })} />,
    );
    rueda(reloj(TEMPO_MIN).element(), 100);
    expect(enElPiso).toHaveBeenCalledWith(TEMPO_MIN);
  });

  it('AC7: las cuatro flechas mueven el tempo, y en los extremos no lo sacan del rango', async () => {
    const onTempo = vi.fn<(bpm: number) => void>();
    const enMedio = await render(
      <TransportPanel transporte={transporte({ tempo: 110, onTempo })} />,
    );

    const nodo = reloj(110).element();
    // Las cuatro y no dos: arriba y derecha suben, abajo e izquierda bajan. Es el modelo
    // de un `spinbutton` de ARIA, que es el que un `input[type=range]` tambien tiene.
    expect(tecla(nodo, 'ArrowUp').defaultPrevented).toBe(true);
    expect(onTempo).toHaveBeenLastCalledWith(111);
    tecla(nodo, 'ArrowRight');
    expect(onTempo).toHaveBeenLastCalledWith(111);
    tecla(nodo, 'ArrowDown');
    expect(onTempo).toHaveBeenLastCalledWith(109);
    tecla(nodo, 'ArrowLeft');
    expect(onTempo).toHaveBeenLastCalledWith(109);

    // Una tecla que no es nuestra sale sin tocar el tempo Y sin frenar su default: si el
    // evento no es nuestro, el navegador tiene que quedarselo entero.
    expect(tecla(nodo, 'f').defaultPrevented).toBe(false);
    expect(onTempo).toHaveBeenCalledTimes(4);
    await enMedio.unmount();

    const enElTecho = vi.fn();
    const arriba = await render(
      <TransportPanel transporte={transporte({ tempo: TEMPO_MAX, onTempo: enElTecho })} />,
    );
    tecla(reloj(TEMPO_MAX).element(), 'ArrowUp');
    expect(enElTecho).toHaveBeenCalledWith(TEMPO_MAX);
    await arriba.unmount();

    const enElPiso = vi.fn();
    await render(
      <TransportPanel transporte={transporte({ tempo: TEMPO_MIN, onTempo: enElPiso })} />,
    );
    tecla(reloj(TEMPO_MIN).element(), 'ArrowDown');
    expect(enElPiso).toHaveBeenCalledWith(TEMPO_MIN);
  });

  it('AC8: con el reloj enfocado, la letra no elige pieza', async () => {
    const seleccionar = vi.fn();
    await render(<ConAtajos seleccionar={seleccionar} />);

    const nodo = reloj(110).element();
    expect(nodo).toBeInstanceOf(HTMLButtonElement);
    tecla(nodo, 'f');
    expect(seleccionar).not.toHaveBeenCalled();

    // La contraparte que impide que este test pase por no estar cableado: la MISMA tecla
    // sobre un nodo que no es un control si elige la pieza. Sin esta mitad, un harness
    // que no montara el hook daria verde igual.
    tecla(document.body, 'f');
    expect(seleccionar).toHaveBeenCalledWith('F');
  });

  it('el arrastre vertical mueve el tempo, se ancla en el comienzo y termina al soltar', async () => {
    const onTempo = vi.fn<(bpm: number) => void>();
    await render(<TransportPanel transporte={transporte({ tempo: 110, onTempo })} />);

    const nodo = reloj(110).element();
    // `setPointerCapture` con un `pointerId` sintetico tira en un navegador de verdad
    // —no hay ningun puntero activo con ese id—, asi que se lo reemplaza por un registro
    // de lo que se le pidio. Que se lo pida es parte de lo verificado: la captura es lo
    // que deja que los `pointermove` sigan llegando a ESTE boton cuando el puntero se va
    // del nodo, y es lo que evita un listener sobre `window`, o sea un efecto.
    const capturas: number[] = [];
    vi.spyOn(nodo, 'setPointerCapture').mockImplementation(id => { capturas.push(id); });

    puntero(nodo, 'pointerdown', 300);
    expect(capturas).toEqual([7]);

    // Hacia arriba SUBE: `clientY` crece hacia abajo, asi que restar pixeles suma bpm.
    // Los pixeles se derivan de los bpm y no al reves para que el test no reescriba la
    // constante: si `ARRASTRE_PX_POR_BPM` cambia, el gesto cambia y el numero no.
    puntero(nodo, 'pointermove', 300 - 20 * ARRASTRE_PX_POR_BPM);
    // Volver el puntero al otro lado del ancla da el reflejo exacto, que es lo que
    // significa anclar en el comienzo del gesto y no acumular paso a paso.
    puntero(nodo, 'pointermove', 300 + 20 * ARRASTRE_PX_POR_BPM);
    // Y volver a donde empezo devuelve el tempo donde estaba: el gesto es reversible.
    puntero(nodo, 'pointermove', 300);
    // Un arrastre que se pasa de largo queda en el techo y no lo cruza.
    puntero(nodo, 'pointermove', -100);
    expect(onTempo.mock.calls.map(c => c[0])).toEqual([130, 90, 110, TEMPO_MAX]);

    // Soltar suelta el ancla: lo que se mueva despues no es este gesto.
    puntero(nodo, 'pointerup', 300);
    puntero(nodo, 'pointermove', 200);
    expect(onTempo).toHaveBeenCalledTimes(4);
  });

  it('un gesto que el navegador cancela suelta el ancla igual que soltar el boton', async () => {
    // Sin el handler de `pointercancel` el ancla quedaria puesta y el reloj seguiria al
    // puntero sin que nadie lo este arrastrando, que es la clase de bug que no falla:
    // pasa el typecheck, pasa el lint y solo se ve moviendose solo.
    const onTempo = vi.fn<(bpm: number) => void>();
    await render(<TransportPanel transporte={transporte({ tempo: 110, onTempo })} />);

    const nodo = reloj(110).element();
    vi.spyOn(nodo, 'setPointerCapture').mockImplementation(() => undefined);

    puntero(nodo, 'pointerdown', 300);
    puntero(nodo, 'pointermove', 280);
    expect(onTempo).toHaveBeenCalledExactlyOnceWith(120);

    puntero(nodo, 'pointercancel', 280);
    puntero(nodo, 'pointermove', 200);
    expect(onTempo).toHaveBeenCalledTimes(1);
  });

  it('solo el boton primario de un puntero primario arrastra el reloj', async () => {
    // Por lo mismo que el asa del chasis: donde el menu contextual se queda el `pointerup`,
    // un gesto del boton secundario dejaria el ancla puesta y el tempo seguiria al puntero
    // sin boton apretado. Se mira ANTES del `pointerup`, que es el estado en que queda pegado.
    const onTempo = vi.fn<(bpm: number) => void>();
    await render(<TransportPanel transporte={transporte({ tempo: 110, onTempo })} />);

    const nodo = reloj(110).element();
    const capturas: number[] = [];
    vi.spyOn(nodo, 'setPointerCapture').mockImplementation(id => { capturas.push(id); });

    const casos: PointerEventInit[] = [{ button: 2 }, { isPrimary: false }];
    for (const init of casos) {
      puntero(nodo, 'pointerdown', 300, init);
      puntero(nodo, 'pointermove', 300 - 20 * ARRASTRE_PX_POR_BPM);
      expect(onTempo, JSON.stringify(init)).not.toHaveBeenCalled();
      puntero(nodo, 'pointerup', 300 - 20 * ARRASTRE_PX_POR_BPM);
    }
    // Y ninguno de los dos se quedo con el puntero: la captura es del gesto, y no lo hubo.
    expect(capturas).toEqual([]);
  });

  it('el reset dice `↺` y su nombre accesible dice las DOS cosas que hace', async () => {
    // El boton perdio la palabra `Reset`, que era todo su nombre
    // accesible: un glifo no lo es. El nombre nuevo nombra las dos mitades porque las dos
    // pasan —vacia el tablero y frena el transporte—, y el `title` dice exactamente lo
    // mismo: el puntero y el lector no pueden contar dos historias del mismo boton.
    const onReset = vi.fn();
    const onTogglePlay = vi.fn();
    await render(<TransportPanel transporte={transporte({ onReset, onTogglePlay })} />);

    const boton = page.getByRole('button', { name: /^Vaciar el tablero y frenar el transporte$/ });
    await expect.element(boton).toHaveTextContent('↺');
    expect(boton.element().getAttribute('title')).toBe('Vaciar el tablero y frenar el transporte');
    // Y ningun boton se llama `Reset`: es la contraparte falsable del renombre.
    expect(page.getByRole('button', { name: /^Reset$/ }).elements()).toHaveLength(0);

    await boton.click();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onTogglePlay).not.toHaveBeenCalled();
  });

  it('el metronomo es solo-icono, se llama por lo que alterna y lo anuncia con aria-pressed', async () => {
    // La asercion que el 019 le saca a `PiecePalette` y que llega ACA en vez de
    // desaparecer. El componente es presentacional, asi que `aria-pressed` sigue a la
    // prop: se compara entre dos renders y no clickeando y esperando que se actualice
    // solo, que pasaria siempre.
    const onToggleClicks = vi.fn();
    const apagado = await render(
      <TransportPanel transporte={transporte({ clicks: false, onToggleClicks })} />,
    );
    const boton = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: false });
    await expect.element(boton).toBeInTheDocument();
    // Explicito, y no solo por `pressed: false`: un boton SIN `aria-pressed` tambien
    // empareja con `pressed: false`, asi que esa consulta sola pasaria con el atributo
    // borrado — y el estado quedaria dicho por el color y por nada mas.
    expect(boton.element().getAttribute('aria-pressed')).toBe('false');
    expect(boton.element().getAttribute('title')).toBe('Recorrido en el vacío');
    // Solo-icono de verdad: el nombre sale del `aria-label` porque el boton no tiene
    // texto, y el SVG esta oculto al arbol para que no se anuncie ademas de la etiqueta.
    expect(boton.element().textContent).toBe('');
    expect(boton.element().querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');

    await boton.click();
    expect(onToggleClicks).toHaveBeenCalledTimes(1);
    await apagado.unmount();

    await render(<TransportPanel transporte={transporte({ clicks: true })} />);
    const encendido = page.getByRole('button', { name: /^Recorrido en el vacío$/, pressed: true });
    await expect.element(encendido).toBeInTheDocument();
    // Encendido usa el `bg-slate-900` con el que la tarjeta marca lo activo: es el mismo
    // idioma que usaban las dos filas que este spec borro.
    await expect.element(encendido).toHaveClass(/bg-slate-900/);
  });
});
