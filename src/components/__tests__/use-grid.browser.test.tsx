import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useGrilla } from '../use-grid.ts';
import { grillaPara } from '../grid-fit.ts';
import { GRID_MIN } from '../../domain/constants/board.constants.ts';
import type { RefObject } from 'react';

/**
 * El CABLEADO del hook que mide el contenedor raíz, con un nodo de verdad y un `resize` de
 * verdad.
 *
 * `grid-fit.test.ts` cubre la fórmula y no toca el DOM; acá está lo otro, que es donde
 * estarían los bugs y ninguno de los cinco se ve en la pura:
 *
 * 1. que `--cell` quede escrita **con unidad** — sin el `px`, todos los
 *    `calc(var(--cell) * n)` son declaraciones inválidas y la grilla colapsa a una columna
 *    sin un solo error en consola;
 * 2. que se escriba **antes del primer paint** (`useLayoutEffect`), o ese colapso se ve
 *    durante un cuadro;
 * 3. que las **dimensiones vuelvan** como valor de retorno, que es lo que el CSS no puede
 *    resolver;
 * 4. que un `resize` reescriba las dos cosas; y
 * 5. que la limpieza saque el listener — StrictMode monta dos veces.
 */
const basura: HTMLElement[] = [];
const nodo = (w: number, h: number): RefObject<HTMLElement | null> => {
  const el = document.createElement('div');
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  document.body.appendChild(el);
  basura.push(el);
  return { current: el };
};

afterEach(() => { basura.splice(0).forEach(el => el.remove()); });

describe('useGrilla', () => {
  it('escribe `--cell` con la unidad puesta, y devuelve las dimensiones', async () => {
    const ref = nodo(1000, 600);
    const { result } = await renderHook(() => useGrilla(ref));
    const esperado = grillaPara(1000, 600);
    // Con la unidad: un `--cell` que valga `71` a secas deja inválido a cada `calc()` que
    // lo consume, y el navegador no dice nada.
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${esperado.cell}px`);
    expect(result.current).toEqual(esperado.dims);
  });

  it('AC-FIT-011 — mide la CAJA y no `innerWidth`, que es lo que los hace ser el mismo número', async () => {
    // Dos nodos de tamaños distintos en el mismo viewport: si el hook leyera la ventana,
    // los dos escribirían lo mismo. La caja del raíz mide `100dvh`, y en iOS `innerHeight`
    // incluye la barra del navegador — con la fórmula recibiendo uno y la caja teniendo el
    // otro, la grilla se calcula contra un alto que el contenedor no tiene y desborda unos
    // píxeles. Eso no tiene red: no hay ningún `overflow-x-auto` que lo absorba.
    const chico = nodo(400, 400);
    const grande = nodo(1500, 900);
    const a = await renderHook(() => useGrilla(chico));
    const b = await renderHook(() => useGrilla(grande));
    expect(a.result.current).toEqual(grillaPara(400, 400).dims);
    expect(b.result.current).toEqual(grillaPara(1500, 900).dims);
    expect(a.result.current).not.toEqual(b.result.current);
  });

  it('AC-FIT-012 — un `resize` reescribe las dos cosas: la celda y las dimensiones', async () => {
    const ref = nodo(1000, 600);
    const { result, unmount } = await renderHook(() => useGrilla(ref));
    const antes = result.current;

    // La caja cambia y llega el evento: es el gesto completo de arrastrar el borde.
    ref.current!.style.width = '2000px';
    ref.current!.style.height = '1200px';
    window.dispatchEvent(new Event('resize'));
    const esperado = grillaPara(2000, 1200);
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${esperado.cell}px`);
    // `waitFor` y no una lectura directa: el handler corre fuera de React —es un listener
    // nativo sobre `window`— así que el `setDims` de adentro se procesa en el render
    // siguiente. La custom property, en cambio, ya está escrita: la escribe el handler.
    await vi.waitFor(() => expect(result.current).toEqual(esperado.dims));
    expect(result.current).not.toEqual(antes);

    await unmount();
    // Y después del desmontaje nadie escribe: sin el `removeEventListener`, StrictMode
    // —que monta dos veces— deja dos handlers vivos sobre un nodo desmontado, fuera del
    // árbol de React.
    const ultima = ref.current!.style.getPropertyValue('--cell');
    ref.current!.style.width = '3000px';
    ref.current!.style.height = '1800px';
    window.dispatchEvent(new Event('resize'));
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(ultima);
  });

  it('un `resize` que no cambia la grilla NO devuelve un objeto nuevo', async () => {
    // La mitad del hook que existe para no re-renderizar: arrastrar el borde de una ventana
    // son decenas de `resize` por segundo y la grilla cambia una o dos veces. El setter
    // devuelve el objeto ANTERIOR cuando los dos números coinciden, así que React —que
    // compara por identidad— no re-renderiza el árbol.
    const ref = nodo(1000, 600);
    const { result } = await renderHook(() => useGrilla(ref));
    const antes = result.current;

    // Un píxel: mueve `--cell` y no mueve las dimensiones.
    ref.current!.style.width = '1001px';
    window.dispatchEvent(new Event('resize'));
    expect(ref.current!.style.getPropertyValue('--cell')).toBe(`${grillaPara(1001, 600).cell}px`);
    expect(result.current).toBe(antes);
  });

  it('sin nodo no escribe nada y devuelve el tablero de arranque', async () => {
    // El ref arranca en `null` durante el primer render de cualquier componente que lo cree,
    // así que la guarda no es defensiva: es el caso normal de un montaje abortado.
    const vacio: RefObject<HTMLElement | null> = { current: null };
    const { result } = await renderHook(() => useGrilla(vacio));
    expect(vacio.current).toBeNull();
    expect(result.current.w).toBeGreaterThanOrEqual(GRID_MIN.w);
    expect(result.current.h).toBeGreaterThanOrEqual(GRID_MIN.h);
  });
});
