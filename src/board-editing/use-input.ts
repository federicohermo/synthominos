import { useEffect } from 'react';
import type { RefObject } from 'react';
import { accionDeTecla, frenaElDefault, abreTapLimpio, piezaDeTecla } from './input.ts';
import { ACCION } from './input.constants.ts';
import type { PieceKey } from '../pieces/pieces.types.ts';

/**
 * Los dos efectos de entrada directa: el teclado sobre `window` y la rueda
 * sobre el nodo del tablero.
 *
 * Van en un archivo y como dos funciones: comparten `tapLimpio`, pero siguen sin
 * compartir target ni dependencias. Estaban en `App.tsx`.
 *
 * Los gestos que gobiernan la pieza POR COLOCAR se atan a la mano que ya está sobre el
 * tablero, para no pagar un viaje al panel por cada cambio de orientación — ni por cada
 * cambio de PIEZA, que era el último control que obligaba a
 * soltar el tablero. La DECISIÓN
 * de cada uno sigue viviendo en `board-editing/input.ts` —donde se puede testear sin jsdom—
 * y acá queda solo el cableado: estos dos hooks no toman ninguna decisión propia.
 *
 * **Los dos reciben CALLBACKS y no setters.** No es preferencia de estilo: el día en que
 * `rotation` y `mirror` dejen de ser dos `useState` y pasen a ser una ranura de un
 * `Record` por pieza, ese cambio cae en el shell y estos dos hooks no se enteran. Con
 * setters en la firma, el cambio entraría acá adentro.
 *
 * **`tapLimpio` NO vive acá: entra por parámetro a los DOS.** El ref lo lee el teclado y
 * lo escriben los dos —el teclado en cada `keydown` con `abreTapLimpio`, la rueda a
 * `false`—, así que no es un productor y un consumidor sino estado mutable compartido en
 * las dos direcciones. Meterlo adentro de `useAtajosDeTeclado` —que es lo que parece
 * natural, porque ahí se lo lee dos veces contra una— dejaría a la rueda sin forma de
 * ensuciarlo, y ahí vuelve el bug que el comentario de `useRuedaRota` documenta:
 * `Ctrl`+rueda hace zoom Y ADEMÁS refleja la pieza al soltar el `Ctrl`, que es el gesto
 * que D10 del 013 nombra por su nombre. Ningún test lo atrapa. Lo sostiene un parámetro
 * con nombre en las dos firmas y no un cierre léxico en un mismo cuerpo de función, que es
 * la mitad buena de la mudanza.
 */

/** Los cuatro gestos del teclado, ya resueltos por el shell. */
interface Acciones {
  rotar: () => void;
  reflejar: () => void;
  transporte: () => void;
  /**
   * La letra elige la pieza. Recibe la pieza y no la tecla: traducir de una a
   * otra es una decisión, y las decisiones viven en `input.ts`, donde tienen test.
   */
  seleccionar: (pieza: PieceKey) => void;
}

/**
 * `Shift` rota, `Ctrl` refleja, la barra espaciadora es el transporte, la letra elige.
 *
 * Las dependencias son las REALES —las identidades de los cuatro callbacks: tres dependen
 * del lado del shell de `rotation`, `mirror` y `playing`, y `seleccionar` no depende de
 * nada porque envuelve un setter— y el efecto se re-suscribe cuando cambian. Que uno de
 * los cuatro sea estable no lo saca del array: sacarlo escondería que su identidad importa
 * igual, y el día que deje de serlo el efecto se quedaría con el callback viejo.
 * La alternativa es un ref con el estado para suscribir una sola vez, que
 * es la optimización que este repo no necesita: son dos `addEventListener` sobre
 * `window`, no un costo, y el ref escondería de dónde sale cada valor.
 *
 * Las teclas del tablero enfocado —las flechas, `Home`/`End` y el `Enter`— NO pasan por
 * acá: las maneja el `onKeyDown` de la propia celda, porque necesitan saber CUÁL celda
 * tiene el foco y este listener de `window` no lo sabe. Lo único que se le pide a
 * este hook es que se corra: `targetEsCelda` le devuelve la barra al tablero sin tocar
 * `Shift` ni `Ctrl`, que con una celda enfocada siguen rotando y reflejando.
 *
 * Los cuatro campos van a las dependencias por SEPARADO y el objeto `acciones` NO entra
 * crudo: un literal `{ rotar, reflejar, transporte, seleccionar }` armado en el shell tiene
 * identidad nueva en cada render, así que con el objeto en el array el efecto se
 * re-suscribiría por render en vez de por cambio de la orientación — peor que hoy, y sin
 * que nada falle.
 */
export function useAtajosDeTeclado(acciones: Acciones, tapLimpio: RefObject<boolean>): void {
  const { rotar, reflejar, transporte, seleccionar } = acciones;

  useEffect(()=>{
    // El `target` interactivo se mira acá y no en la pura: `HTMLButtonElement` es un
    // tipo del DOM, y `input.ts` tiene que poder cargarse en `environment: 'node'`.
    const esControl = (t: EventTarget | null) =>
      t instanceof HTMLButtonElement || t instanceof HTMLInputElement;

    // Y la celda del tablero por el MISMO motivo: `closest` es del DOM. Se pregunta por el
    // `role="gridcell"` y no por una clase ni por un `data-*` porque el rol es lo que la
    // celda le promete al lector de pantalla, así que es el atributo que nadie va a sacar
    // en un refactor de estilos. El `closest` y no una comparación directa: el foco puede
    // caer sobre un nodo que la celda tenga adentro, y desde ahí la barra sigue siendo del
    // tablero. El `instanceof Element` no es defensivo: los eventos de `window` llegan con
    // `e.target === window`, que no tiene `closest`.
    const esCelda = (t: EventTarget | null) =>
      t instanceof Element && t.closest('[role="gridcell"]') !== null;

    const despachar = (e: KeyboardEvent, tipo: 'keydown' | 'keyup') => {
      const evento = {
        key: e.key, tipo, repeat: e.repeat,
        // Los tres modificadores salen del `KeyboardEvent` que los dos handlers ya
        // reciben: no hay información nueva que sacar del DOM, sólo campos que antes
        // nadie miraba.
        ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        targetEsControl: esControl(e.target),
        targetEsCelda: esCelda(e.target),
        tapLimpio: tapLimpio.current,
      };
      // El `preventDefault` va por su PROPIA pregunta y no por «hay acción»: la barra
      // con auto-repeat no alterna el transporte pero su default sigue siendo scrollear,
      // y cada `keydown` repetido trae el suyo. Cuando el evento no es nuestro, en
      // cambio, el navegador tiene que quedárselo entero — es lo que deja que la barra
      // active el botón que tiene el foco en vez de alternar el transporte dos veces.
      if (frenaElDefault(evento)) e.preventDefault();
      const accion = accionDeTecla(evento);
      if (accion === null) return;
      // La pieza se vuelve a pedir en vez de venir dentro de la acción: `Accion` es una
      // union de strings y meterle una carga la volvería un objeto, que es un cambio de
      // forma para las cuatro por culpa de una. Preguntar de nuevo cuesta un `in`.
      const pieza = piezaDeTecla(e.key);
      if (accion === ACCION.rotar) rotar();
      else if (accion === ACCION.reflejar) reflejar();
      // La rama de la letra va ANTES del `else transporte()` y no como un `if` suelto
      // después de la cadena: ahí la letra ademas arrancaría el transporte, y eso pasa
      // typecheck y lint sin que nada se queje. El discriminante es `pieza` y no
      // `accion === ACCION.seleccionar` porque son la misma pregunta —la pura devuelve
      // `seleccionar` exactamente cuando la tecla nombra un pentominó— y preguntando por
      // la pieza el `else` queda alcanzable, así que no hace falta ni un `!` ni una rama
      // muerta que ningún test pueda ejercer.
      else if (pieza !== null) seleccionar(pieza);
      // El transporte pasa por el callback del shell y no por `startClock`/`stopClock`
      // sueltos: ahí vive la consulta a `clockRunning()` que `.claude/rules/audio.md`
      // obliga a hacer en todo llamador, y abrir una segunda puerta la saltearía.
      else transporte();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Un modificador ABRE un tap limpio; cualquier otra tecla ENSUCIA el que hubiera.
      // Con esto `Ctrl`+C no da vuelta la reflexión, que es el uso normal de un
      // navegador y no el caso raro de apretar la tecla sin querer.
      tapLimpio.current = abreTapLimpio(e);
      despachar(e, 'keydown');
    };
    const onKeyUp = (e: KeyboardEvent) => despachar(e, 'keyup');

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return ()=>{
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [rotar, reflejar, transporte, seleccionar, tapLimpio]);
}

/**
 * La rueda sobre el tablero rota la pieza en la mano.
 *
 * Va por `addEventListener` no pasivo y no por una prop `onWheel`: React registra `wheel`
 * PASIVO en su contenedor raíz (react-dom 19.1.1), y adentro de un listener pasivo
 * `preventDefault()` es un no-op que el navegador solo avisa por consola. Con la prop, la
 * rueda rotaría y la página scrollearía igual — o sea que parecería andar. Ver el
 * comentario del contenedor en `Board.tsx`.
 *
 * Este efecto se suscribe UNA SOLA VEZ por montaje, que es lo contrario del efecto del
 * teclado y por un motivo concreto: acá no hay ningún valor que el handler tenga que
 * leer. Del lado del shell eso obliga a que `alRotar` vaya envuelto en un `useCallback`
 * de dependencias vacías —posible justamente porque su cuerpo usa el setter funcional—;
 * si algún día `alRotar` gana una dependencia, este listener pasa a re-suscribirse por
 * cambio de ella y la cardinalidad que AC16 del 022 protege se rompe.
 */
export function useRuedaRota(
  nodo: RefObject<HTMLDivElement | null>,
  alRotar: (deltaY: number) => void,
  tapLimpio: RefObject<boolean>,
): void {
  useEffect(()=>{
    const elemento = nodo.current;
    if (!elemento) return;
    const onWheel = (e: WheelEvent) => {
      // La rueda ensucia el tap SIEMPRE, y va ANTES de las dos guardas de abajo a
      // propósito: la rueda que tiene que ensuciarlo es justamente la que sale por la
      // primera. Con esta línea después del `return` por `ctrlKey`, el `keyup` del
      // `Ctrl` encontraba el tap limpio y reflejaba la pieza al soltar — o sea que el
      // gesto que D10 nombra por su nombre («`Ctrl`+rueda hace zoom y no refleja») era
      // el único que se le escapaba.
      tapLimpio.current = false;
      // `Ctrl`+rueda es el zoom del navegador, que es una afordancia de accesibilidad y
      // no un atajo de conveniencia: el evento se saltea ENTERO, `preventDefault`
      // incluido, y el navegador hace lo suyo. Un gesto del sistema le gana a uno nuestro.
      if (e.ctrlKey) return;
      // Un `deltaY` de 0 es un scroll horizontal puro, que no rota (lo dice también
      // `rotacionPorRueda`). Sale antes del `preventDefault` porque no hay nada nuestro que
      // hacer con ese gesto, así que el navegador se lo queda entero. Este nodo no
      // scrollea, así que el motivo es sólo ése: tragarse un default que no se usa no
      // tiene nada a favor. El motivo más concreto que tuvo mientras era el
      // `overflow-x-auto` de la grilla está en el spec 031 (issue #93).
      if (e.deltaY === 0) return;
      e.preventDefault();
      alRotar(e.deltaY);
    };
    // `{ passive: false }` explícito: Chrome asume `passive: true` para `wheel` sobre
    // window y document, y aunque sobre un elemento el default sigue siendo false,
    // escribirlo es lo que deja el trato a la vista.
    elemento.addEventListener('wheel', onWheel, { passive: false });
    return ()=> elemento.removeEventListener('wheel', onWheel);
  }, [nodo, alRotar, tapLimpio]);
}
