import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent as EventoDeTecla, PointerEvent as EventoDePuntero, RefObject } from 'react';
import { moverPanel, pasoDeTecla } from './drag.ts';
import type { Caja, Posicion } from './types/panel.types.ts';

/**
 * El cableado del arrastre de un flotante: los listeners, la captura del puntero y la
 * escritura de la posición en el DOM.
 *
 * **No decide nada** — las dos decisiones son `moverPanel` y `pasoDeTecla`, que viven en
 * `drag.ts` y se testean en `node`.
 *
 * Es el cuarto hook de entrada de `components/`, junto a los dos de `use-input.ts` y el de
 * `use-grid.ts`, y está acá por la misma regla: **el listener global vive en un hook de
 * `components/`, en un efecto propio**. `App.tsx` no declara un solo `useEffect` desde el
 * 022 y este spec no lo cambia. Lo que NO comparte con aquellos es quién lo monta: no el
 * shell sino el chasis, `FloatingPanel.tsx`, que crea el `ref` de su propio nodo —lo usan
 * dos flotantes, y montarlo en el shell sería cablear el mismo hook dos veces—. La
 * posición sigue en el shell y entra por callback.
 *
 * ## La posición va por custom property, no por `transform` directo
 *
 * Y es exactamente el reparto de `use-grid.ts` con `--cell`, por el mismo motivo medido.
 * React renderiza un `transform: translate3d(var(--panel-x), var(--panel-y), 0)` que **no
 * cambia nunca**, y este hook escribe las dos custom properties. Así:
 *
 * - **Arrastrar no re-renderiza nada.** La posición vive en un `useState` del shell
 *   (`App.tsx`), y `Board` no tiene `memo`: un `setState` por `pointermove` reconciliaría
 *   las hasta 390 celdas del tablero. El número ya está medido para el gesto de la misma
 *   forma —el `hover`, que también vive en el shell, cuesta 1,9 ms de commit por celda
 *   cruzada **después** del `memo` de `OrientationPanel`— y `pointermove` llega más seguido
 *   que el cruce de una celda. Recién el `pointerup` commitea, que es lo que hace que AC3
 *   —«sigue ahí tras un re-render»— siga siendo verdad sin pagar un render por píxel.
 * - **React y el gesto escriben propiedades distintas del mismo nodo**, que es lo que
 *   `.claude/rules/ui.md` pide cuando dice «el loop no toca nodos que renderiza React». Con
 *   el `transform` escrito por los dos, cualquier re-render del shell durante el arrastre
 *   —el tablero, el transporte— pisaría la posición del gesto con la última committeada y
 *   el panel saltaría hacia atrás. Con la indirección de la custom property no hay nada que
 *   pisar: el string que React escribe es el mismo antes, durante y después.
 *
 * **Con la unidad**, igual que `--cell` y por el mismo motivo: un `--panel-x` que valga
 * `600` a secas deja inválido el `translate3d` entero y el panel se va a la esquina sin un
 * solo error en consola.
 *
 * ## Por qué acá sí vale `window.innerWidth`
 *
 * `use-grid.ts` lo descarta a propósito —mide la caja del contenedor raíz porque su alto es
 * `100dvh` y en iOS `innerHeight` incluye la barra del navegador—. Acá la pregunta es otra:
 * el flotante es `fixed`, o sea que se posiciona contra el viewport visual, que es
 * literalmente lo que `innerWidth`/`innerHeight` miden. Medirlo contra la caja del raíz
 * daría el acotado correcto para un elemento que no es éste.
 */

/** Lo que hay que recordar del comienzo de un arrastre para poder resolver cada `pointermove`. */
interface Origen {
  puntero: Posicion;
  posicion: Posicion;
  caja: Caja;
}

const viewport = (): Caja => ({ ancho: window.innerWidth, alto: window.innerHeight });

const cajaDe = (nodo: HTMLElement): Caja => {
  const r = nodo.getBoundingClientRect();
  return { ancho: r.width, alto: r.height };
};

const escribir = (nodo: HTMLElement, p: Posicion) => {
  nodo.style.setProperty('--panel-x', `${p.x}px`);
  nodo.style.setProperty('--panel-y', `${p.y}px`);
};

/**
 * El hook, con los tres argumentos que lo separan de todo lo que es una decisión.
 *
 * @param panelRef  el nodo del chasis: de él salen la caja para el acotado y las dos custom
 *                  properties donde se escribe la posición.
 * @param posicion  la posición committeada, que vive en el shell.
 * @param onMover   **un callback y no un setter**, como los dos hooks de `use-input.ts` y
 *                  por el motivo escrito ahí: así cambiar la forma del estado es cambiar el
 *                  shell y no el hook. Se llama una vez por gesto, no una por píxel.
 * @returns los dos handlers que el asa monta como props de JSX. El `pointerdown` y el
 *          `keydown` **no** van por `addEventListener` porque no son globales: nacen en un
 *          nodo que React ya renderiza, y ninguno de los dos necesita `{ passive: false }`
 *          —React sólo registra pasivos `wheel`, `touchstart` y `touchmove`—.
 */
export function useArrastre(
  panelRef: RefObject<HTMLElement | null>,
  posicion: Posicion,
  onMover: (p: Posicion) => void,
) {
  // Fuera de React a propósito: lo escribe el `pointerdown` y lo leen los tres listeners de
  // `window`, o sea que un `useState` acá sería un re-render por gesto para un dato que no
  // dibuja nadie. Es la misma decisión que `tapLimpio` en el shell.
  const origen = useRef<Origen | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return;

    // La posición committeada, escrita en cuanto cambia. En el primer montaje es lo que
    // pone al panel donde arranca; después del `pointerup` reescribe el mismo valor que el
    // gesto ya había dejado, así que no hay salto.
    escribir(panel, posicion);

    const destinoDe = (e: PointerEvent, o: Origen) => moverPanel(
      o.posicion,
      { dx: e.clientX - o.puntero.x, dy: e.clientY - o.puntero.y },
      viewport(),
      o.caja,
    );

    const alMover = (e: PointerEvent) => {
      const o = origen.current;
      if (o === null) return;
      escribir(panel, destinoDe(e, o));
    };

    // `pointerup` y `pointercancel` comparten handler. El segundo no es defensivo: el
    // navegador cancela el puntero cuando le arrebata el gesto —un gesto del sistema, una
    // pestaña que pierde el foco— y sin escucharlo el arrastre no termina nunca: `origen`
    // se queda puesto y el panel sigue al puntero sin que nadie lo esté arrastrando.
    const alTerminar = (e: PointerEvent) => {
      const o = origen.current;
      if (o === null) return;
      origen.current = null;
      onMover(destinoDe(e, o));
    };

    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alTerminar);
    window.addEventListener('pointercancel', alTerminar);
    return () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alTerminar);
      window.removeEventListener('pointercancel', alTerminar);
    };
  }, [panelRef, posicion, onMover]);

  const alBajarEnElAsa = useCallback((e: EventoDePuntero<HTMLElement>) => {
    // Solo el boton primario de un puntero primario. Donde el menu contextual se queda el
    // `pointerup` —macOS lo abre al apretar—, un gesto del secundario no termina nunca y el
    // panel sigue al puntero sin boton apretado.
    if (e.button !== 0 || !e.isPrimary) return;
    const panel = panelRef.current;
    if (panel === null) return;
    origen.current = {
      puntero: { x: e.clientX, y: e.clientY },
      posicion,
      // Se mide UNA vez, al empezar: la caja del panel no cambia durante el gesto, y
      // volver a medirla en cada `pointermove` sería un layout forzado por evento.
      caja: cajaDe(panel),
    };
    // La captura es lo que hace que el gesto sobreviva a salirse del asa —y de la ventana—:
    // sin ella, arrastrar rápido deja al puntero fuera del nodo y los eventos dejan de
    // llegar con el panel a mitad de camino.
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [panelRef, posicion]);

  const alTeclearEnElAsa = useCallback((e: EventoDeTecla<HTMLElement>) => {
    const panel = panelRef.current;
    if (panel === null) return;
    const paso = pasoDeTecla(e.key);
    if (paso === null) return;
    // Sólo cuando la tecla es nuestra: si no, el navegador tiene que quedarse el evento
    // entero. Es la misma regla que `frenaElDefault` en `use-input.ts`.
    e.preventDefault();
    onMover(moverPanel(posicion, paso, viewport(), cajaDe(panel)));
  }, [panelRef, posicion, onMover]);

  return { alBajarEnElAsa, alTeclearEnElAsa };
}
