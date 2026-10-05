import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { render } from 'vitest-browser-react';
import FloatingPanel from '../FloatingPanel.tsx';
import { useArrastre } from '../use-drag.ts';
import { MARGEN_VISIBLE_PX, PASO_TECLADO_PX } from '../constants/layout.constants.ts';
import type { Posicion } from '../types/panel.types.ts';
import { eventoDePuntero, stubearCaptura } from './gesto-de-puntero.ts';

/**
 * El CABLEADO del chasis, con un nodo de verdad y eventos de puntero de verdad.
 *
 * `drag.test.ts` cubre las dos decisiones —el acotado y el paso de tecla— sin tocar el DOM;
 * acá está lo otro, que es donde están los bugs que ninguna pura puede ver:
 *
 * 1. que la posición se escriba en las custom properties **con unidad**, o el `translate3d`
 *    entero queda inválido y el panel se va a la esquina sin un error en consola;
 * 2. que el arrastre sobreviva al re-render que dispara su propio `pointerup` (AC3);
 * 3. que las cuatro flechas muevan el panel con el asa enfocada (AC4);
 * 4. que soltarlo fuera de la pantalla lo deje alcanzable (AC5);
 * 5. que un arrastre sobre el asa **no** cambie `aria-expanded` (AC12), incluido el `click`
 *    sintético que el navegador manda después del `pointerup`; y
 * 6. que la limpieza saque los tres listeners de `window` — StrictMode monta dos veces.
 */

/** Un cuadro de gracia: el `pointerup` commitea al estado y React pinta en el siguiente. */
const unCuadro = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * El arnés: un shell mínimo que guarda la posición y el plegado, como hace `App.tsx`.
 *
 * El botón `tic` no es decorativo: fuerza un re-render del padre sin tocar la posición, que
 * es la mitad de AC3 que no se ve arrastrando —«y sigue ahí tras un re-render»—.
 */
function Arnes({ abierto, caja }: { abierto: boolean; caja?: CSSProperties }) {
  const [posicion, setPosicion] = useState<Posicion>({ x: 100, y: 100 });
  const [desplegado, setDesplegado] = useState<boolean>(abierto);
  const [tic, setTic] = useState<number>(0);
  return (
    <div>
      <button type="button" onClick={() => setTic(t => t + 1)}>tic {tic}</button>
      <FloatingPanel
        titulo="Piezas"
        idRegion="dock-piezas"
        abierto={desplegado}
        onToggle={() => setDesplegado(v => !v)}
        posicion={posicion}
        onMover={setPosicion}
        caja={caja}
      >
        <p>contenido</p>
      </FloatingPanel>
    </div>
  );
}

/**
 * Una sonda que monta el hook con un ref VACÍO y le cuelga los dos handlers a un botón real.
 *
 * Es lo que vuelve alcanzable la guarda de nodo nulo sin fabricar un evento sintético a
 * mano: el ref arranca en `null` durante el primer render de cualquier componente que lo
 * cree, así que la guarda no es defensiva. Es el mismo arnés que usa
 * `use-grid.browser.test.tsx` para su propio caso.
 */
function SondaSinNodo({ onMover }: { onMover: (p: Posicion) => void }) {
  const vacio: RefObject<HTMLElement | null> = { current: null };
  const { alBajarEnElAsa, alTeclearEnElAsa } = useArrastre(vacio, { x: 0, y: 0 }, onMover);
  return (
    <button type="button" onPointerDown={alBajarEnElAsa} onKeyDown={alTeclearEnElAsa}>sonda</button>
  );
}

const piezas = (contenedor: HTMLElement) => {
  const panel = contenedor.querySelector('aside');
  const botones = [...contenedor.querySelectorAll('aside button')];
  return {
    panel: panel as HTMLElement,
    asa: stubearCaptura(botones[0] as HTMLElement),
    plegar: botones[1] as HTMLElement,
  };
};

afterEach(() => { document.body.style.removeProperty('margin'); });

describe('052 AC3 — el panel se mueve y se queda donde lo soltaron', () => {
  it('la posición se escribe en las custom properties, con unidad', async () => {
    const { container } = await render(<Arnes abierto />);
    const { panel } = piezas(container);
    // Sin el `px` el `translate3d` entero es una declaración inválida y el panel se va a la
    // esquina, sin un solo error en consola. Es el mismo modo de falla que `--cell`.
    expect(panel.style.getPropertyValue('--panel-x')).toBe('100px');
    expect(panel.style.getPropertyValue('--panel-y')).toBe('100px');
    // Y el `transform` que React escribe es una CONSTANTE: es lo que impide que un
    // re-render del shell durante el arrastre pise la posición del gesto.
    expect(panel.style.transform).toBe('translate3d(var(--panel-x), var(--panel-y), 0)');
  });

  it('un arrastre de (dx, dy) desplaza el rect en (dx, dy)', async () => {
    const { container } = await render(<Arnes abierto />);
    const { panel, asa } = piezas(container);
    const antes = panel.getBoundingClientRect();
    const r = asa.getBoundingClientRect();
    const x0 = r.x + r.width / 2;
    const y0 = r.y + r.height / 2;

    asa.dispatchEvent(eventoDePuntero('pointerdown', x0, y0));
    window.dispatchEvent(eventoDePuntero('pointermove', x0 + 120, y0 + 60));
    // Durante el gesto la posición la escribe el hook sobre el nodo, sin pasar por React:
    // el desplazamiento ya se ve antes del `pointerup`.
    const enVuelo = panel.getBoundingClientRect();
    expect(enVuelo.x - antes.x).toBeCloseTo(120, 0);
    expect(enVuelo.y - antes.y).toBeCloseTo(60, 0);

    window.dispatchEvent(eventoDePuntero('pointerup', x0 + 120, y0 + 60));
    await unCuadro();
    const despues = panel.getBoundingClientRect();
    expect(despues.x - antes.x).toBeCloseTo(120, 0);
    expect(despues.y - antes.y).toBeCloseTo(60, 0);
  });

  it('y sigue ahí tras un re-render que no lo toca', async () => {
    const { container } = await render(<Arnes abierto />);
    const { panel, asa } = piezas(container);
    const antes = panel.getBoundingClientRect();
    const r = asa.getBoundingClientRect();
    asa.dispatchEvent(eventoDePuntero('pointerdown', r.x, r.y));
    window.dispatchEvent(eventoDePuntero('pointermove', r.x + 90, r.y + 45));
    window.dispatchEvent(eventoDePuntero('pointerup', r.x + 90, r.y + 45));
    await unCuadro();

    // El re-render del padre que no toca la posición: es la mitad de AC3 que el arrastre
    // solo no prueba, y la que se rompería si la posición viviera únicamente en el nodo.
    const tic = container.querySelector('button');
    if (tic !== null) tic.click();
    await unCuadro();

    const despues = panel.getBoundingClientRect();
    expect(despues.x - antes.x).toBeCloseTo(90, 0);
    expect(despues.y - antes.y).toBeCloseTo(45, 0);
  });
});

describe('052 AC4 — el arrastre existe para el teclado', () => {
  it('las cuatro flechas mueven el panel un paso medible', async () => {
    const { container } = await render(<Arnes abierto />);
    const { panel, asa } = piezas(container);
    asa.focus();
    expect(document.activeElement).toBe(asa);

    const pasos: [tecla: string, dx: number, dy: number][] = [
      ['ArrowRight', PASO_TECLADO_PX, 0],
      ['ArrowDown', 0, PASO_TECLADO_PX],
      ['ArrowLeft', -PASO_TECLADO_PX, 0],
      ['ArrowUp', 0, -PASO_TECLADO_PX],
    ];
    for (const [tecla, dx, dy] of pasos) {
      const antes = panel.getBoundingClientRect();
      // Nace en el elemento enfocado y burbujea, que es como llega una tecla de verdad.
      asa.dispatchEvent(new KeyboardEvent('keydown', { key: tecla, bubbles: true, cancelable: true }));
      await unCuadro();
      const despues = panel.getBoundingClientRect();
      expect(despues.x - antes.x, tecla).toBeCloseTo(dx, 0);
      expect(despues.y - antes.y, tecla).toBeCloseTo(dy, 0);
    }
  });

  it('una tecla ajena no mueve nada y conserva su default', async () => {
    const { container } = await render(<Arnes abierto />);
    const { panel, asa } = piezas(container);
    asa.focus();
    const antes = panel.getBoundingClientRect();
    const ajena = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true });
    asa.dispatchEvent(ajena);
    await unCuadro();
    expect(panel.getBoundingClientRect().x).toBeCloseTo(antes.x, 0);
    // Y el navegador se queda el evento entero: frenarle el default a una tecla que no es
    // nuestra es lo que rompería la barra sobre un botón enfocado.
    expect(ajena.defaultPrevented).toBe(false);
  });
});

describe('052 AC5 — el panel no se puede perder fuera de la pantalla', () => {
  it('soltarlo en la esquina imposible lo deja alcanzable', async () => {
    const { container } = await render(<Arnes abierto />);
    const { panel, asa } = piezas(container);
    const r = asa.getBoundingClientRect();
    asa.dispatchEvent(eventoDePuntero('pointerdown', r.x, r.y));
    window.dispatchEvent(eventoDePuntero('pointermove', -9999, -9999));
    window.dispatchEvent(eventoDePuntero('pointerup', -9999, -9999));
    await unCuadro();

    const perdido = panel.getBoundingClientRect();
    // «Alcanzable» = su rect intersecta el viewport.
    expect(perdido.right).toBeGreaterThan(0);
    expect(perdido.bottom).toBeGreaterThan(0);
    expect(perdido.x).toBeLessThan(window.innerWidth);
    expect(perdido.y).toBeLessThan(window.innerHeight);
    // Y queda al menos el margen adentro, por el lado por el que se fue.
    expect(perdido.right).toBeGreaterThanOrEqual(MARGEN_VISIBLE_PX);
    // Arriba el tope es CERO y no el margen negativo: el asa vive en el borde superior, así
    // que dejarla salir dejaría un panel visible e inmóvil.
    expect(perdido.y).toBeCloseTo(0, 0);
  });
});

describe('052 AC12 — arrastrar el panel no lo pliega', () => {
  it('un arrastre que empieza y termina sobre el asa deja `aria-expanded` como estaba', async () => {
    const { container } = await render(<Arnes abierto />);
    const { asa, plegar } = piezas(container);
    expect(plegar.getAttribute('aria-expanded')).toBe('true');

    const r = asa.getBoundingClientRect();
    const x0 = r.x + r.width / 2;
    const y0 = r.y + r.height / 2;
    asa.dispatchEvent(eventoDePuntero('pointerdown', x0, y0));
    window.dispatchEvent(eventoDePuntero('pointermove', x0 + 40, y0 + 40));
    window.dispatchEvent(eventoDePuntero('pointerup', x0, y0));
    // El `click` que el navegador sintetiza después de un `pointerup` sobre el mismo nodo, y
    // que es exactamente lo que cerraría el panel si el asa fuera el mismo botón que pliega.
    asa.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await unCuadro();

    expect(plegar.getAttribute('aria-expanded')).toBe('true');
  });

  it('el disclosure sí pliega, y es un botón aparte del asa', async () => {
    const { container } = await render(<Arnes abierto />);
    const { asa, plegar } = piezas(container);
    expect(asa).not.toBe(plegar);
    plegar.click();
    await unCuadro();

    expect(plegar.getAttribute('aria-expanded')).toBe('false');
    // Plegado, la región se esconde con `hidden` y no se desmonta: de eso depende el
    // `ResizeObserver` del espectro en el otro flotante.
    const region = container.querySelector('#dock-piezas');
    expect(region).not.toBeNull();
    expect((region as HTMLElement).hidden).toBe(true);
    // Y el nombre del disclosure dice QUÉ hace, no en qué estado está.
    expect(plegar.getAttribute('aria-label')).toBe('Desplegar Piezas');
    expect(plegar.getAttribute('title')).toBe('Desplegar Piezas');
  });
});

describe('El chasis, lo que no es el arrastre', () => {
  it('el asa se llama con el título y con el gesto, y no lleva `title`', async () => {
    const { container } = await render(<Arnes abierto />);
    const { asa } = piezas(container);
    // WCAG 2.5.3 pide que el nombre CONTENGA el texto visible: quien dicta «Piezas» tiene
    // que poder activar este botón.
    expect(asa.textContent).toBe('Piezas');
    expect(asa.getAttribute('aria-label')).toContain('Piezas');
    expect(asa.getAttribute('aria-label')).toMatch(/flechas/);
    // Sin `title`: el título ya se lee en pantalla, así que un tooltip repetiría lo que se
    // ve. Es la mitad de AC9 que dice sobre QUÉ va el `title`.
    expect(asa.getAttribute('title')).toBeNull();
  });

  it('la caja la decide cada flotante, y el dock no pasa ninguna', async () => {
    const { container } = await render(<Arnes abierto caja={{ width: '333px', height: '111px' }} />);
    const { panel } = piezas(container);
    expect(panel.style.width).toBe('333px');
    expect(panel.style.height).toBe('111px');

    const solo = await render(<Arnes abierto />);
    const sinCaja = solo.container.querySelector('aside');
    expect(sinCaja).not.toBeNull();
    // El dock se mide por su contenido: sin caja impuesta, el ancho lo pone lo que hay
    // adentro y no una cuenta en celdas.
    expect((sinCaja as HTMLElement).style.width).toBe('');
  });

  it('arranca plegado si el shell lo dice', async () => {
    const { container } = await render(<Arnes abierto={false} />);
    const { plegar } = piezas(container);
    expect(plegar.getAttribute('aria-expanded')).toBe('false');
    expect(plegar.getAttribute('aria-label')).toBe('Desplegar Piezas');
  });
});

describe('use-drag — el cableado y sus guardas', () => {
  it('un `pointermove` sin `pointerdown` previo no mueve nada', async () => {
    const { container } = await render(<Arnes abierto />);
    const { panel } = piezas(container);
    const antes = panel.getBoundingClientRect();
    // Los tres listeners viven sobre `window` todo el tiempo, así que tienen que saber
    // distinguir un gesto propio de uno ajeno: el puntero se mueve por la pantalla siempre.
    window.dispatchEvent(eventoDePuntero('pointermove', 500, 500));
    window.dispatchEvent(eventoDePuntero('pointerup', 500, 500));
    await unCuadro();
    expect(panel.getBoundingClientRect().x).toBeCloseTo(antes.x, 0);
  });

  it('solo el boton primario de un puntero primario arrastra el panel', async () => {
    // Donde el menu contextual se queda el `pointerup` —macOS lo abre al apretar—, un gesto
    // nacido del boton secundario no termina nunca y el panel sigue al puntero sin boton
    // apretado. Por eso se mide ANTES del `pointerup`, que es el estado en que queda pegado.
    const { container } = await render(<Arnes abierto />);
    const { panel, asa } = piezas(container);
    const antes = panel.getBoundingClientRect();
    const r = asa.getBoundingClientRect();
    const casos: [caso: string, init: PointerEventInit][] = [
      ['boton secundario', { button: 2, isPrimary: true }],
      ['puntero no primario', { button: 0, isPrimary: false }],
    ];
    for (const [caso, init] of casos) {
      asa.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1, bubbles: true, cancelable: true, clientX: r.x, clientY: r.y, ...init,
      }));
      window.dispatchEvent(eventoDePuntero('pointermove', r.x + 80, r.y + 40));
      await unCuadro();
      expect(panel.getBoundingClientRect().x, caso).toBeCloseTo(antes.x, 0);
      expect(panel.getBoundingClientRect().y, caso).toBeCloseTo(antes.y, 0);
      window.dispatchEvent(eventoDePuntero('pointerup', r.x + 80, r.y + 40));
      await unCuadro();
      expect(panel.getBoundingClientRect().x, `${caso}, soltado`).toBeCloseTo(antes.x, 0);
    }
  });

  it('`pointercancel` termina el gesto, igual que `pointerup`', async () => {
    const { container } = await render(<Arnes abierto />);
    const { panel, asa } = piezas(container);
    const antes = panel.getBoundingClientRect();
    const r = asa.getBoundingClientRect();
    asa.dispatchEvent(eventoDePuntero('pointerdown', r.x, r.y));
    window.dispatchEvent(eventoDePuntero('pointermove', r.x + 70, r.y));
    window.dispatchEvent(eventoDePuntero('pointercancel', r.x + 70, r.y));
    await unCuadro();
    expect(panel.getBoundingClientRect().x - antes.x).toBeCloseTo(70, 0);

    // Y el gesto quedó cerrado: sin escuchar `pointercancel` el ancla seguiría puesta y el
    // panel seguiría al puntero sin que nadie lo esté arrastrando.
    const quieto = panel.getBoundingClientRect();
    window.dispatchEvent(eventoDePuntero('pointermove', r.x + 400, r.y + 400));
    await unCuadro();
    expect(panel.getBoundingClientRect().x).toBeCloseTo(quieto.x, 0);
  });

  it('sin nodo, los dos handlers no hacen nada', async () => {
    // El ref arranca en `null` durante el primer render de cualquier componente que lo cree,
    // así que la guarda no es defensiva: es el caso normal de un montaje abortado.
    const onMover = vi.fn();
    const { container } = await render(<SondaSinNodo onMover={onMover} />);
    const sonda = container.querySelector('button');
    expect(sonda).not.toBeNull();
    const el = stubearCaptura(sonda as HTMLElement);
    el.dispatchEvent(eventoDePuntero('pointerdown', 10, 10));
    window.dispatchEvent(eventoDePuntero('pointermove', 90, 90));
    window.dispatchEvent(eventoDePuntero('pointerup', 90, 90));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await unCuadro();
    expect(onMover).not.toHaveBeenCalled();
  });

  it('al desmontar saca los tres listeners de `window`', async () => {
    const quitar = vi.spyOn(window, 'removeEventListener');
    const { unmount } = await render(<Arnes abierto />);
    // El espía se limpia JUSTO antes de desmontar, y no es cosmética: React ya llamó a
    // `removeEventListener` durante el montaje —StrictMode monta dos veces y limpia entre
    // medio— así que sin esto la aserción de abajo pasaría aunque el retorno del efecto no
    // existiera. Es la familia de bug «fallar en verde».
    quitar.mockClear();
    await unmount();
    const tipos = quitar.mock.calls.map(c => c[0]);
    // StrictMode monta dos veces: sin la limpieza quedan dos juegos de listeners y cada
    // `pointermove` mueve el panel dos veces.
    for (const tipo of ['pointermove', 'pointerup', 'pointercancel']) {
      expect(tipos, tipo).toContain(tipo);
    }
    quitar.mockRestore();
  });
});
