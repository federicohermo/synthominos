import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { Rotacion } from '../pieces/orientation.ts';
import type { PlacedPiece } from './placement.ts';

/**
 * La DECISIÓN de cada gesto de entrada, separada del cableado que la ejecuta.
 *
 * ## Por qué estas puras reciben campos y no el evento
 *
 * Los tests de `src/` corren con Vitest en `environment: 'node'` y el repo no tiene
 * jsdom: no hay `KeyboardEvent` ni `MouseEvent` que fabricar, y tampoco hay forma de
 * montar un componente para dispararlos. Recibiendo los campos que importan, las
 * guardas quedan testeadas de verdad y lo único que queda sin red es que el cableado de
 * `use-input.ts` los llene bien — que es lo único que hay que verificar a mano en el
 * navegador.
 *
 * ## Por qué viven acá y no en `App.tsx`
 *
 * `react-refresh/only-export-components` prohíbe que un `.tsx` exporte algo que no sea
 * el componente, así que una pura escrita adentro de `App.tsx` no se puede exportar y
 * por lo tanto no se puede testear. Es el mismo movimiento con el que `cell-text.ts`
 * salió de `Board.tsx`, y por el mismo motivo: ahí vivía el bug.
 *
 * De los seis criterios que estas puras cubren, el que justifica el archivo es
 * AC6: en macOS `Ctrl`+click ES el click derecho, y este repo se desarrolla en Windows,
 * donde ese cruce no se puede ver a ojo. El test es la única forma de atraparlo.
 */

/** Las cuatro acciones de entrada: ver `ACCION` en `input.ts`. */
export type Accion = (typeof ACCION)[keyof typeof ACCION];

/** Lo que pide un click sobre una celda: ver `EDICION` en `input.ts`. */
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

/**
 * Las cuatro acciones que un gesto de entrada puede pedirle al shell: rotar la pieza por
 * colocar, alternar su reflexión, alternar el transporte o **seleccionar** otra pieza.
 *
 * `seleccionar` es la unica que no sale de un modificador: las
 * doce letras eligen su pentominó. Va acá adentro y no como una cuarta rama suelta del
 * cableado porque la decisión de QUÉ gesto es sigue siendo una sola pregunta —la que
 * contesta `accionDeTecla`—, y sacarla de esta tabla la partiría en dos lugares.
 *
 * Const-object y no `enum` — el `erasableSyntaxOnly` del tsconfig los rechaza, y es la
 * misma opción que permite que node cargue `src/` sin compilar. El precedente exacto
 * es `MARCA` en `route-source.ts`.
 *
 * No hay una quinta acción `no-hacer-nada`: la ausencia de acción es `null`, y eso deja
 * que el llamador use el mismo valor para decidir si hace `preventDefault` — si el
 * handler se saltea el evento, el navegador tiene que quedárselo entero.
 */
export const ACCION = {
  rotar: 'rotar',
  reflejar: 'reflejar',
  transporte: 'transporte',
  seleccionar: 'seleccionar',
} as const;

/**
 * Lo que un click sobre una celda le puede pedir al tablero.
 *
 * Cuatro y no dos: colocar y colocar-muteada son la misma edición del tablero pero
 * distinto gesto de escucha —la muteada **no** dispara el arpegio de cortesía, porque se
 * está poniendo justamente para que no suene— y separarlas acá es lo que evita que esa
 * condición viva como un `if` suelto en el shell.
 *
 * La ausencia de acción sigue siendo `null`, igual que en `ACCION`: es el click sobre una
 * pieza que **no** es la que está en la mano, que no hace nada — como antes de este spec.
 */
export const EDICION = {
  quitar: 'quitar',
  mutear: 'mutear',
  colocar: 'colocar',
  colocarMuteada: 'colocar-muteada',
} as const;

/**
 * La rotación que deja la rueda: abajo (`deltaY > 0`) suma 90°, arriba resta 90°.
 *
 * El `+ 4` no es decorativo: en JS `-1 % 4` es `-1`, así que sin él la rueda hacia
 * arriba desde `0` devolvería `-1` y `rotateN` recibiría un índice que no existe.
 *
 * Un `deltaY` de 0 no rota. Llega de verdad —un scroll horizontal puro con `deltaX`
 * deja `deltaY` en 0— y girar ahí sería rotar sin que nadie lo haya pedido. El cableado
 * de `use-input.ts` además **sale antes** en ese caso, o sea sin `preventDefault`: no hay
 * nada nuestro que hacer con un gesto horizontal, así que el navegador se lo queda entero.
 * El nodo que escucha la rueda no scrollea, así que el motivo es sólo ése: tragarse un
 * default que no se usa no tiene nada a favor. El motivo más fuerte que tuvo mientras ese
 * nodo era el `overflow-x-auto` de la grilla está en el spec 031 (issue #93).
 */
export function rotacionPorRueda(rotation: Rotacion, deltaY: number): Rotacion {
  const delta = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
  // La ASERCION a `Rotacion` va aca y una sola vez en todo el repo, porque este es el
  // unico lugar donde una rotacion se calcula en vez de recibirse: la aritmetica modulo 4
  // sobre un entero no negativo produce exactamente `0 | 1 | 2 | 3`, y el `+ 4` de arriba
  // es lo que asegura el "no negativo". TypeScript no estrecha `%`: el tipo de `x % 4` es
  // `number` sin importar lo que sepa de `x`. Es de la misma familia que el
  // `Object.keys(SHAPES) as PieceKey[]` que el repo ya usa —el cuerpo garantiza lo que el
  // tipo dice y el compilador no lo puede ver—, y como esa, viene con el motivo al lado.
  return ((rotation + 4 + delta) % 4) as Rotacion;
}

/**
 * El cuarto de vuelta siguiente: el gesto de `Shift`.
 *
 * Delega en `rotacionPorRueda` con un `deltaY` positivo en vez de repetir el `+ 4` y el
 * `% 4`, y no es un rodeo: el shell llegó a escribir `(rotation + 1) % 4`
 * inline, o sea que la misma aritmética modular vivía en dos lugares con **una sola** de
 * las dos copias protegida contra el resto negativo. Acá el `Shift` es literalmente la
 * rueda hacia abajo —que es lo que hace, y lo que los dos gestos del 013 prometen—, así
 * que la aserción a `Rotacion` sigue existiendo una sola vez, en la función de al lado.
 */
export function siguienteRotacion(rotation: Rotacion): Rotacion {
  return rotacionPorRueda(rotation, 1);
}

/**
 * Si este `keydown` ABRE un tap limpio. Si no, ensucia el que hubiera abierto.
 *
 * La regla se suele describir como «arranca en `true` con el `keydown` del
 * modificador», y así escrita tiene un agujero que el código destapa: `Ctrl`+`Shift`
 * son DOS keydown de modificador seguidos, así que los dos abrirían tap y al soltarlos
 * la pieza rotaría y se reflejaría sola. No es un caso inventado — `Ctrl`+`Shift` es el
 * atajo con el que Windows cambia de distribución de teclado, y a diferencia de
 * `Ctrl`+`Shift`+`I` no trae una tercera tecla que ensucie el tap.
 *
 * De ahí la condición completa: un modificador abre tap solo si **ningún otro**
 * modificador estaba abajo. `Alt` y `Meta` cuentan aunque no sean nuestros — `Alt` lo
 * reserva el muteo, y `Meta` es el modificador de los atajos de macOS.
 */
export function abreTapLimpio(e: EventoDeModificador): boolean {
  const otroAbajo = (e.key !== 'Shift' && e.shiftKey)
    || (e.key !== 'Control' && e.ctrlKey)
    || e.altKey || e.metaKey;
  return (e.key === 'Shift' || e.key === 'Control') && !otroAbajo;
}

/**
 * Si una letra ya en mayúscula nombra un pentominó.
 *
 * Es un type predicate y no un `in` a secas porque el `in` **no estrecha el lado
 * izquierdo**: narra sobre el objeto, no sobre la clave, así que `k in SHAPES` deja a `k`
 * en `string` y el `return` no compila (medido en `research.md` §8). La alternativa era un
 * `as PieceKey`, que es la aserción que este repo no escribe: el predicado dice la misma
 * cosa pero deja la comprobación adentro, donde el compilador la puede ver.
 */
function esPieza(k: string): k is PieceKey {
  return k in SHAPES;
}

/**
 * La pieza que nombra una tecla, o `null` si esa tecla no nombra ninguna.
 *
 * `toUpperCase` y no dos listas: `f` y `F` son la misma pieza (AC2), y con `Shift` abajo el
 * navegador entrega la mayúscula.
 *
 * Valida contra `SHAPES` y no contra una lista propia de doce letras a propósito: una lista
 * acá sería una segunda fuente de verdad sobre cuáles son las piezas, y el día que
 * `SHAPES` gane o pierda una entrada las dos discreparían sin que nada falle. `SHAPES` ya
 * ES la tabla de las doce, y `PieceKey` se deriva de sus claves.
 */
export function piezaDeTecla(key: string): PieceKey | null {
  const letra = key.toUpperCase();
  return esPieza(letra) ? letra : null;
}

/**
 * Qué acción pide una tecla, o `null` si el evento no es nuestro.
 *
 * Las seis guardas, en orden y con su motivo:
 *
 * 1. **`targetEsControl`** — con el foco sobre un `<button>` o un `<input>` el navegador
 *    ya tiene un significado para la barra: activar el control. Si además contestáramos
 *    nosotros, apretar Play con el mouse y después la barra alternaría el transporte dos
 *    veces (el handler global más la activación nativa) y el instrumento no arrancaría.
 *    Devolver `null` acá deja pasar la vía nativa entera, sin un `blur()` a mano.
 * 2. **`repeat`** — mantener una tecla apretada dispara `keydown` a la cadencia de
 *    repetición del sistema. La ejerce la barra, que es la única que sigue en `keydown`;
 *    los modificadores actúan en `keyup`, que no se auto-repite.
 * 3. **Los modificadores actúan al SOLTAR y solo si el tap fue limpio** — `Ctrl`+C,
 *    `Ctrl`+V, `Ctrl`+R y cualquier mayúscula empiezan con el `keydown` del modificador.
 *    Atado al `keydown`, copiar un texto daría vuelta la reflexión sin que nadie lo pida
 *    y sin que se vea. El `tapLimpio` lo ensucian otra tecla y la rueda; el mouse no,
 *    porque el `Ctrl`+click de macOS necesita que el `keyup` sea el que alterna (D2).
 * 4. **La barra sigue en `keydown`** — es donde el navegador scrollea, así que es el
 *    único momento en que un `preventDefault` sirve de algo.
 * 5. **`targetEsCelda` veta a la barra, y sólo a la barra** — el tablero
 *    es una parada de tabulación y la barra sobre una celda enfocada coloca o quita la
 *    pieza. Sin esta guarda, un solo golpe haría las dos cosas: alternar el transporte por
 *    acá y editar por el `onKeyDown` de la celda. Que viva adentro de la rama de la barra
 *    y no arriba de todo, al lado de la guarda 1, ES la decisión del spec (D4): la 1 apaga
 *    todas las teclas y ésta apaga una sola, porque con una celda enfocada `Shift` y
 *    `Ctrl` tienen que seguir rotando y reflejando. Ensanchar la guarda 1 para que
 *    matcheara la celda —que es lo tentador, porque es una línea— apagaría los tres
 *    atajos del 013 para arreglar uno.
 * 6. **`Ctrl`, `Meta` o `Alt` vetan la letra, y sólo la letra** — `Ctrl`+`F` no es una
 *    selección que haya que rechazar: es un evento que nunca fue nuestro, y el navegador
 *    se queda el atajo entero. La guarda vive ADENTRO de la rama de las letras y no como
 *    un `return` al tope de la función, que es donde parece que va: ahí también alcanzaría
 *    a la barra, que hoy alterna el transporte con cualquier modificador abajo (AC11 del
 *    018), y a los dos modificadores. Ningún AC pide ese cambio y ningún test lo pediría
 *    de vuelta.
 *
 * Lo que esta función NO contesta es si hay que hacer `preventDefault`: son dos
 * preguntas distintas, y ahora las separan TRES casos —el auto-repeat de la guarda 2, la
 * celda enfocada de la 5 y las doce letras, que sí son una acción y no tienen ningún
 * default que frenar—. Ver `frenaElDefault`.
 */
export function accionDeTecla(e: EventoDeTecla): Accion | null {
  if (e.targetEsControl) return null;
  if (e.repeat) return null;

  if (e.key === 'Shift') return e.tipo === 'keyup' && e.tapLimpio ? ACCION.rotar : null;
  if (e.key === 'Control') return e.tipo === 'keyup' && e.tapLimpio ? ACCION.reflejar : null;
  if (e.key === ' ') return e.tipo === 'keydown' && !e.targetEsCelda ? ACCION.transporte : null;

  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // La decisión es del `keydown` y no del `keyup`, y eso cierra el agujero de AC4: en un
  // `Ctrl`+`V` que suelte el `Ctrl` primero, el `keyup` de la `V` llega con
  // `ctrlKey: false` y pasaría la guarda de arriba. `despachar` llama a esta pura en los
  // dos eventos, así que sin esta línea pegar un texto dejaría la pieza `V` en la mano.
  //
  // `targetEsCelda` NO aparece: es la guarda 5 y apaga la barra y sólo la barra. Con una
  // celda enfocada la letra sigue seleccionando (AC13) — el `switch` del `onKeyDown` de la
  // celda cierra con `default: return`, así que no hay doble disparo que evitar, y vetarla
  // ahí apagaría el atajo justo donde más sirve: con la mano puesta en el tablero.
  if (e.tipo !== 'keydown') return null;
  return piezaDeTecla(e.key) === null ? null : ACCION.seleccionar;
}

/**
 * Si el navegador **no** puede quedarse el evento entero.
 *
 * Es una pregunta distinta de la de `accionDeTecla` aunque parezca la misma, y hoy las
 * separan los TRES casos que enumera el docblock de aquélla. El que la hizo nacer es la
 * barra con auto-repeat. Ahí `accionDeTecla` devuelve `null`
 * —mantenerla apretada no tiene que alternar el transporte treinta veces por segundo—
 * pero el default sigue vivo, porque **cada `keydown` repetido trae el suyo** y el de
 * la barra es scrollear. Fundidas en una sola pregunta, un tap un poco largo arrancaba
 * el transporte una vez y después scrolleaba la página a la cadencia de repetición del
 * sistema, que es justo lo que AC7 dice que no pasa.
 *
 * `targetEsControl` la veta igual que a la acción, y por el mismo motivo de D4: si el
 * foco está sobre un `<button>` o un `<input>`, el evento es del navegador entero y no
 * a medias — es lo que deja que la barra active el control armado sin un `blur()` a
 * mano.
 *
 * `targetEsCelda`, en cambio, **no** la veta, y esa asimetría con `accionDeTecla` es
 * deliberada: el default de la barra es scrollear la página, y eso hay que frenarlo lo
 * maneje quien lo maneje. Con una celda enfocada la barra deja de alternar el transporte
 * para pasar a colocar la pieza, pero si además la página scrolleara, el mismo golpe que
 * coloca se llevaría el tablero fuera de la pantalla. No es lo mismo que la guarda de
 * `targetEsControl`: ahí el default es la acción que uno quiere —activar el control— y acá
 * es un efecto que nadie pidió.
 *
 * Los modificadores no aparecen acá: `Shift` y `Control` sueltos no tienen ningún
 * default que frenar, ni al bajar ni al soltar. Y las doce letras tampoco: son
 * el tercer caso y el primero del lado inverso —hay acción y NO hay que frenar nada—, que
 * es todo AC6 del 018: una letra suelta no tiene default que frenar, y frenarlo igual sería
 * quitarle al navegador un evento que no es nuestro.
 */
export function frenaElDefault(e: EventoDeTecla): boolean {
  return !e.targetEsControl && e.key === ' ' && e.tipo === 'keydown';
}

/**
 * Si un `contextmenu` sobre el tablero tiene que alternar la reflexión.
 *
 * `ctrlKey` lo veta, y esa línea es todo el AC6: en macOS `Ctrl`+click es la forma de
 * emitir el click secundario sin mouse, y el sistema lo entrega como `contextmenu` con
 * `ctrlKey: true`. Sin la guarda, el `keyup` de `Ctrl` alterna una vez y este handler
 * la deshace — neto cero, o sea que en una laptop de Apple sin mouse la reflexión no
 * respondería nunca. En Windows un click derecho de verdad llega con `ctrlKey: false`,
 * así que la guarda no le saca nada.
 *
 * Quien quiera reflejar con el trackpad usa el click secundario de dos dedos, que llega
 * sin `ctrlKey`; quien quiera hacerlo con el teclado usa `Ctrl` solo.
 */
export function reflejaElContextMenu(e: { ctrlKey: boolean }): boolean {
  return !e.ctrlKey;
}

/**
 * Si la celda clickeada está ocupada por una pieza **del mismo tipo que el seleccionado**.
 *
 * Es la llave de toda la edición en el tablero, y está escrita una sola
 * vez porque la usan dos: el handler del click y la derivación del hover, que decide el
 * cursor y si se pinta el fantasma. Dos copias de esta condición serían dos formas de
 * discrepar sobre si un click va a borrar — con el cursor prometiendo una cosa y el click
 * haciendo otra.
 *
 * **No** es «la jugada es inválida»: eso también es cierto al chocar contra una pieza
 * distinta, y ahí no tiene que pasar nada. Y **no** es «hay alguna pieza de ese tipo en el
 * tablero»: se mide sobre la celda clickeada, así que con dos `N` colocadas se edita la
 * que se tocó y no la otra.
 *
 * Que haya que tener la pieza en la mano para tocarla es lo que evita que editar sea un
 * accidente: sin esa condición, cualquier click mal apuntado sobre el tablero borraría.
 */
export function esLaPiezaEnLaMano(ocupante: PlacedPiece | null, selected: PieceKey): boolean {
  return ocupante !== null && ocupante.piece === selected;
}

/**
 * Qué le pide al tablero un click sobre la celda `(x, y)`, o `null` si no pide nada.
 *
 * Las cuatro ramas de la tabla, con `Alt` significando "muteado" en los dos
 * lados del gesto:
 *
 * ```
 * celda ocupada por la pieza que está en la mano
 *   ├─ sin Alt → quitar esa pieza
 *   └─ con Alt → alternar su muteo
 * celda ocupada por OTRA pieza → nada (como antes de este spec)
 * celda libre
 *   ├─ sin Alt → colocar
 *   └─ con Alt → colocar ya muteada
 * ```
 *
 * El reparto —click quita, `Alt`+click mutea— y no al revés: con el contrario, **quitar**
 * quedaría alcanzable únicamente a través de mutear, o sea que para borrar una pieza que
 * nadie quiso mutear habría que mutearla primero. Así las dos operaciones cuestan un
 * gesto, y la destructiva es casi reversible: con la misma pieza y la misma orientación
 * en la mano, volver a clickear la repone en el mismo lugar.
 *
 * `colocar` no promete que la jugada entre: la validez la sigue decidiendo `isValid` del
 * dominio, en el llamador, porque depende de las otras cuatro celdas de la pieza y no de
 * la que se clickeó. Esta pura contesta QUÉ gesto es, no si es posible.
 */
export function accionDeClick(ocupante: PlacedPiece | null, selected: PieceKey, altKey: boolean): Edicion | null {
  if (esLaPiezaEnLaMano(ocupante, selected)) return altKey ? EDICION.mutear : EDICION.quitar;
  if (ocupante !== null) return null;
  return altKey ? EDICION.colocarMuteada : EDICION.colocar;
}
