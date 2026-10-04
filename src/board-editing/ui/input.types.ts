import type { ACCION, EDICION } from './input.constants.ts';

/** Las cuatro acciones de entrada: ver `ACCION` en `input.constants.ts`. */
export type Accion = (typeof ACCION)[keyof typeof ACCION];

/** Lo que pide un click sobre una celda: ver `EDICION` en `input.constants.ts`. */
export type Edicion = (typeof EDICION)[keyof typeof EDICION];

/**
 * Los campos de un evento de teclado que la decisión necesita — y ninguno más.
 *
 * No es el `KeyboardEvent` del DOM a propósito: los tests de `src/` corren en
 * `environment: 'node'` y no hay jsdom, así que una pura que reciba el evento no se
 * puede testear sin fabricar uno. Recibiendo campos, las siete guardas quedan cubiertas
 * en `environment: 'node'` y lo único que queda sin test es el cableado.
 *
 * Los dos `target*` y `tapLimpio` los calcula el llamador porque salen de afuera del
 * evento: los primeros miran el `e.target` contra `HTMLButtonElement`/`HTMLInputElement`
 * y contra el `role="gridcell"` más cercano —DOM que la pura no puede ver— y el último es
 * estado entre eventos, que una pura por definición no tiene.
 */
export interface EventoDeTecla {
  /**
   * El `key` del DOM: `'Shift'`, `'Control'`, `' '` para la barra espaciadora y
   * cualquiera de las doce letras de pentominó, en minúscula o en mayúscula.
   */
  key: string;
  tipo: 'keydown' | 'keyup';
  /** El auto-repeat del sistema. Solo lo ejerce la barra, que es la única en `keydown`. */
  repeat: boolean;
  /**
   * Los tres modificadores que le devuelven el evento entero al navegador o al sistema.
   *
   * Obligatorios y sin `?`: un campo opcional deja que un llamador nuevo se olvide de
   * llenarlo y la guarda se apague sola, en silencio — el mismo criterio con el que el
   * régimen se quedó sin default de parámetro.
   *
   * `shiftKey` **no** entra, y no es un olvido: ninguna decisión de estas puras lo mira.
   * `Shift`+`f` selecciona igual (AC3 del 018) porque la letra ensucia el tap y de eso ya
   * se ocupa `abreTapLimpio`, que recibe su propio evento con los cuatro modificadores.
   */
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /**
   * El foco está sobre un `<button>` o un `<input>`: el navegador se queda **todo**.
   *
   * Todas las teclas, sin excepción: escribir en el slider de tempo no rota la pieza y la
   * barra activa el control armado por la vía nativa, sin un `blur()` a mano.
   */
  targetEsControl: boolean;
  /**
   * El foco está sobre una celda del tablero: el tablero se queda **la barra, el `Enter` y
   * las flechas**, y nada más.
   *
   * Es una pregunta DISTINTA de `targetEsControl`, no una versión más ancha de la misma, y
   * ahí está la decisión: `targetEsControl` apaga todas las teclas porque el
   * evento entero es del navegador; esta apaga las que el tablero enfocado maneja por su
   * cuenta y **deja pasar el resto**. Con una celda enfocada, `Shift` tiene que seguir
   * rotando y `Ctrl` reflejando — que es exactamente el gesto que la entrada directa fue a
   * buscar: tocar sin ir al panel. Ensanchar `targetEsControl` para que también matcheara la celda
   * arreglaba el doble disparo de la barra apagando los dos atajos por los que existe.
   *
   * De las tres teclas que nombra, esta pura sólo puede vetar la barra: el `Enter` y las
   * flechas nunca fueron suyas y las maneja el `onKeyDown` de la celda, que es el único que
   * sabe CUÁL celda tiene el foco.
   */
  targetEsCelda: boolean;
  /** Mientras el modificador estuvo abajo no llegó otra tecla ni la rueda (D10). */
  tapLimpio: boolean;
}

/**
 * Los cuatro modificadores que un `keydown` reporta, más la tecla que lo produjo.
 *
 * Es lo único que hace falta para saber si el `keydown` ABRE un tap o lo ensucia, y va
 * separado de `EventoDeTecla` porque esa pregunta se contesta antes: el tap es lo que
 * `EventoDeTecla` recibe ya resuelto.
 */
export interface EventoDeModificador {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}
