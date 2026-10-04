import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useAtajosDeTeclado, useRuedaRota } from '../use-input.ts';
import type { RefObject } from 'react';

/**
 * Los dos efectos de entrada, con eventos de VERDAD.
 *
 * Es el archivo que mas necesitaba un navegador y el que peor lo tenia: sus decisiones
 * viven en `components/input.ts` —puras, testeadas en node— pero el CABLEADO no, y el
 * cableado es donde estan los dos bugs que sus docblocks describen y que «ningun test
 * atrapa»:
 *
 * 1. **El listener pasivo.** React registra `wheel` pasivo en su contenedor raiz, asi
 *    que con una prop `onWheel` el `preventDefault()` seria un no-op que el navegador
 *    solo avisa por consola: la rueda rotaria y la pagina scrollearia igual, o sea que
 *    **pareceria andar**. Solo un navegador de verdad distingue las dos cosas — jsdom
 *    no modela `passive` en absoluto.
 * 2. **`Ctrl`+rueda reflejando al soltar.** El tap limpio lo escriben los dos hooks, y
 *    si la rueda no lo ensucia ANTES de su propia guarda por `ctrlKey`, el `keyup` del
 *    `Ctrl` lo encuentra limpio y da vuelta la reflexion. Es el gesto que D10 nombra
 *    por su nombre.
 */
const acciones = () => ({ rotar: vi.fn(), reflejar: vi.fn(), transporte: vi.fn(), seleccionar: vi.fn() });

/** El ref del tap limpio, que los dos hooks comparten y escriben en las dos direcciones. */
const tap = (v = false): RefObject<boolean> => ({ current: v });

/** Nodos sueltos que hay que sacar del documento al terminar. */
const basura: HTMLElement[] = [];
const enElDocumento = <T extends HTMLElement>(el: T): T => {
  document.body.appendChild(el);
  basura.push(el);
  return el;
};

beforeEach(() => { basura.splice(0).forEach(el => el.remove()); });
afterEach(() => { basura.splice(0).forEach(el => el.remove()); });

/**
 * Un `keydown` + `keyup` del mismo modificador: el gesto completo, que es el que actua.
 *
 * Es **sincronica** y no `async`: los dos `dispatchEvent` corren sus listeners en el acto y
 * lo que se afirma despues son contadores de mocks, no estado de React. El `async` de antes
 * no era gratis: el `await` del llamador metia un microtask entre el gesto y la asercion,
 * que es justo el tipo de espera que hace pasar un test por la razon equivocada.
 */
function tap_(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
}

describe('useAtajosDeTeclado', () => {
  it('AC-BRD-024 — Shift rota y Ctrl refleja, al SOLTAR y con el tap limpio', async () => {
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    tap_(window, 'Shift');
    expect(a.rotar).toHaveBeenCalledTimes(1);
    expect(a.reflejar).not.toHaveBeenCalled();

    tap_(window, 'Control');
    expect(a.reflejar).toHaveBeenCalledTimes(1);
    expect(a.transporte).not.toHaveBeenCalled();
  });

  it('AC-BRD-028 — la barra alterna el transporte y le frena el default (que es scrollear)', async () => {
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(a.transporte).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('AC-BRD-028 — la barra con auto-repeat frena el default pero NO alterna dos veces', async () => {
    // Las dos preguntas son distintas a proposito: no hay accion, pero cada `keydown`
    // repetido trae su propio default de scrollear.
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    const e = new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(a.transporte).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it('AC-BRD-029 — sobre un boton o un input, el evento es del navegador y no nuestro', async () => {
    // Es lo que deja que la barra active el boton que tiene el foco en vez de alternar
    // el transporte dos veces. Las dos ramas de `esControl`, por separado.
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    for (const el of [document.createElement('button'), document.createElement('input')]) {
      enElDocumento(el);
      const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      expect(e.defaultPrevented, el.tagName).toBe(false);
    }
    expect(a.transporte).not.toHaveBeenCalled();
  });

  it('AC-BRD-024 — una tecla cualquiera ensucia el tap: Ctrl+C no da vuelta la reflexion', async () => {
    const a = acciones();
    const t = tap(true);
    await renderHook(() => useAtajosDeTeclado(a, t));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true, bubbles: true }));
    expect(t.current).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(t.current).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));
    expect(a.reflejar).not.toHaveBeenCalled();
  });

  it('una tecla sin accion no llama a nadie', async () => {
    // `'q'` no es un pentominó, y eso es load-bearing: si lo fuera,
    // este test dejaria de medir "sin accion". Lo mismo vale para la `'c'` del test de
    // `Ctrl`+C de mas arriba.
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));
    tap_(window, 'q');
    expect(a.rotar).not.toHaveBeenCalled();
    expect(a.reflejar).not.toHaveBeenCalled();
    expect(a.transporte).not.toHaveBeenCalled();
    expect(a.seleccionar).not.toHaveBeenCalled();
  });

  it('AC-BRD-017 — la letra elige la pieza y NO arranca el transporte', async () => {
    // El segundo `expect` es el que importa: la rama de la letra puesta como un `if`
    // suelto DESPUES de la cadena de `despachar` —en vez de antes del `else transporte()`—
    // selecciona la pieza y ademas arranca el instrumento, y eso pasa typecheck y lint sin
    // que nada se queje. Ningun test de la pura lo puede ver: el bug vive en el cableado.
    const a = acciones();
    await renderHook(() => useAtajosDeTeclado(a, tap()));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true }));
    expect(a.seleccionar).toHaveBeenCalledWith('L');
    expect(a.transporte).not.toHaveBeenCalled();

    // Y con `Ctrl` abajo el atajo es del navegador entero: ni seleccion ni transporte.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(a.seleccionar).toHaveBeenCalledTimes(1);
    expect(a.transporte).not.toHaveBeenCalled();
  });

  it('al desmontar suelta window: nada queda escuchando', async () => {
    const a = acciones();
    const { unmount } = await renderHook(() => useAtajosDeTeclado(a, tap()));
    await unmount();

    tap_(window, 'Shift');
    expect(a.rotar).not.toHaveBeenCalled();
  });
});

describe('useRuedaRota', () => {
  const tablero = () => enElDocumento(document.createElement('div'));

  const rueda = (el: HTMLElement, init: WheelEventInit) => {
    const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(e);
    return e;
  };

  it('AC-BRD-023 — la rueda rota Y FRENA EL SCROLL — el listener no es pasivo', async () => {
    const el = tablero();
    const alRotar = vi.fn();
    await renderHook(() => useRuedaRota({ current: el }, alRotar, tap()));

    const e = rueda(el, { deltaY: 120 });
    expect(alRotar).toHaveBeenCalledWith(120);
    // La linea que separa "anda" de "parece que anda", y que **si** distingue las dos:
    // verificado con un pase de mutacion —cambiar el registro a `{ passive: true }`
    // pone este `expect` en rojo—, porque Chromium respeta la semantica `passive`
    // tambien para un evento sintetico. Con `wheel` registrado por una prop de JSX el
    // listener seria pasivo, `preventDefault()` un no-op, y la pagina scrollearia
    // debajo de la pieza que rota.
    expect(e.defaultPrevented).toBe(true);
  });

  it('y el registro lo dice explicito, que es lo que hace el trato visible', async () => {
    // La afirmacion de arriba es la del COMPORTAMIENTO; esta es la de la FORMA, y las
    // dos valen la pena porque fallan por motivos distintos: si algun dia alguien mueve
    // la rueda a una prop `onWheel`, la de arriba falla con un `defaultPrevented` en
    // false —que no dice por que— y esta falla diciendo que falta el `addEventListener`.
    const el = tablero();
    const registro = vi.spyOn(el, 'addEventListener');
    await renderHook(() => useRuedaRota({ current: el }, vi.fn(), tap()));

    const wheel = registro.mock.calls.find(([tipo]) => tipo === 'wheel');
    expect(wheel, 'la rueda tiene que ir por addEventListener y no por una prop').toBeDefined();
    expect(wheel![2]).toEqual({ passive: false });
    registro.mockRestore();
  });

  it('AC-BRD-023 — Ctrl+rueda es el zoom del navegador: no rota, no frena el default', async () => {
    const el = tablero();
    const alRotar = vi.fn();
    const t = tap(true);
    await renderHook(() => useRuedaRota({ current: el }, alRotar, t));

    const e = rueda(el, { deltaY: 120, ctrlKey: true });
    expect(alRotar).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    // Y AUN ASI ensucia el tap, que es todo el punto: si no lo hiciera, el `keyup` del
    // `Ctrl` encontraria el tap limpio y reflejaria la pieza al soltar.
    expect(t.current).toBe(false);
  });

  it('AC-BRD-023 — un scroll horizontal puro no rota ni le saca el scroll al tablero', async () => {
    // Este nodo es el `overflow-x-auto` con el que se recorre la grilla debajo de `md`:
    // frenarle el default seria dejar sin scroll horizontal al unico que lo tiene.
    const el = tablero();
    const alRotar = vi.fn();
    await renderHook(() => useRuedaRota({ current: el }, alRotar, tap()));

    const e = rueda(el, { deltaX: 80, deltaY: 0 });
    expect(alRotar).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('sin nodo todavia, no se suscribe a nada y no falla', async () => {
    const alRotar = vi.fn();
    const ref: RefObject<HTMLDivElement | null> = { current: null };
    await renderHook(() => useRuedaRota(ref, alRotar, tap()));
    // El ref se llena despues del primer render en un montaje real; lo que se afirma es
    // que ese primer paso no explota ni deja un listener colgado de `null`.
    expect(alRotar).not.toHaveBeenCalled();
  });

  it('al desmontar suelta el nodo', async () => {
    const el = tablero();
    const alRotar = vi.fn();
    const { unmount } = await renderHook(() => useRuedaRota({ current: el }, alRotar, tap()));
    await unmount();

    const e = rueda(el, { deltaY: 120 });
    expect(alRotar).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});
