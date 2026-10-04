import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { GRID_DEFAULT } from '../board-editing/placement.ts';
import type { Dims } from '../board-editing/placement.ts';
import { grillaPara } from './grid-fit.ts';

/**
 * Mide el contenedor raíz y contesta **cuánto mide el tablero**, escribiendo de paso el
 * tamaño de celda en la custom property `--cell`.
 *
 * Es el tercer hook de entrada de `ui/`, junto a los dos, y está acá
 * por la misma regla: **el listener global vive en un hook de `ui/`, en un efecto
 * propio**, con el `ref` creado en el shell. `App.tsx` no declara un solo `useEffect` desde
 * el 022 y este spec no lo cambia — lo único que agrega al shell es un `ref` y una llamada.
 *
 * ## Por qué la celda va por custom property y las dimensiones por estado
 *
 * Porque son dos frecuencias distintas, y ésa es la única razón por la que este hook
 * escribe en dos lugares:
 *
 * - **El tamaño de celda lo leen todas las celdas, todas las filas, el velo y la cabeza
 *   lectora**, y cambia en cada píxel que se arrastra el borde de la ventana. Con el número
 *   en el estado de React, un arrastre son decenas de re-renders del árbol por segundo. Con
 *   `--cell`, redimensionar reposiciona todo eso sin que React se entere: la custom property
 *   hereda hacia abajo y el navegador resuelve los `calc()` solo.
 * - **Las dimensiones no las puede resolver el CSS**: `cols × rows` decide cuántos nodos
 *   existen, o sea que es estado de React y no hay vuelta. Pero cambia mucho menos —una o
 *   dos veces en todo un arrastre, cuando entra o sale una fila— y el setter funcional de
 *   abajo devuelve **el objeto anterior** cuando los dos números coinciden, así que un
 *   `resize` que no agrega ni saca una celda no re-renderiza nada.
 *
 * Esa herencia es también lo que decide **sobre qué nodo** se escribe `--cell`: el
 * contenedor raíz y no el del tablero. Los dos flotantes son `fixed` y viven
 * fuera de `Board`, así que sus cajas —medidas en celdas— no resolverían `var(--cell)` si
 * colgara de ahí.
 *
 * ## Por qué se mide la CAJA y no `window.innerWidth`
 *
 * Porque tienen que ser el mismo número. El contenedor raíz mide `100dvh` de alto, y
 * `innerHeight` en iOS incluye la barra del navegador: si la fórmula recibe uno y la caja
 * tiene el otro, la grilla se calcula contra un alto que el contenedor no tiene y desborda
 * unos píxeles sin que nada falle — y desbordar no tiene red, porque el
 * `overflow-x-auto` de `Board` se fue. Leyendo `clientWidth`/`clientHeight` del propio
 * nodo, el número que entra a la fórmula **es** el que la caja mide.
 *
 * ## `useLayoutEffect` y no `useEffect`
 *
 * Por dos cosas, y la segunda es del 031. Con `--cell` sin definir,
 * `repeat(cols, var(--cell))` es una declaración inválida y la grilla colapsa a una
 * columna; y hasta que el efecto no corre, las dimensiones son `GRID_DEFAULT` —10 × 6, el
 * tablero de siempre— que casi nunca es el que va. Un `useEffect` corre DESPUÉS del primer
 * paint, así que las dos cosas se verían durante un cuadro. Con `useLayoutEffect`, el
 * `setDims` de adentro se procesa **antes** de pintar.
 *
 * ## Sin debounce
 *
 * El handler hace una lectura de layout y una escritura de custom property, y el navegador
 * ya agrupa los `resize` por cuadro. Un debounce agregaría el único artefacto que este
 * spec no quiere: el tablero quedándose atrás de la ventana mientras se arrastra.
 */
export function useGrilla(raizRef: RefObject<HTMLElement | null>): Dims {
  const [dims, setDims] = useState<Dims>(GRID_DEFAULT);

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    if (raiz === null) return;

    // `setProperty` sobre el nodo y no `style={{ '--cell': … }}` en el JSX: React tipa
    // `style` como `CSSProperties`, que no admite propiedades custom, así que la vía del
    // JSX pide un `as React.CSSProperties` — una aserción para escribir un string.
    //
    // **Con la unidad.** Un `--cell` que valga `72` a secas deja inválidos a todos los
    // `calc(var(--cell) * n)` y la grilla colapsa sin un solo error en consola.
    const escribir = () => {
      const { dims: medido, cell } = grillaPara(raiz.clientWidth, raiz.clientHeight);
      raiz.style.setProperty('--cell', `${cell}px`);
      // El objeto ANTERIOR cuando los números no cambiaron: React compara por identidad,
      // así que devolver uno nuevo con los mismos valores re-renderizaría el árbol entero
      // en cada píxel del arrastre — que es justo lo que `--cell` existe para evitar.
      setDims(previo => previo.w === medido.w && previo.h === medido.h ? previo : medido);
    };

    escribir();
    window.addEventListener('resize', escribir);
    return () => window.removeEventListener('resize', escribir);
  }, [raizRef]);

  return dims;
}
