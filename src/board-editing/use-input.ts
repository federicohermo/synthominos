import { useEffect } from 'react';
import type { RefObject } from 'react';
import { accionDeTecla, frenaElDefault, abreTapLimpio, piezaDeTecla, ACCION } from './input.ts';
import type { PieceKey } from '../pieces/pieces.ts';

/**
 * The two effects of direct input: the keyboard on `window` and the wheel on the node of
 * the board.
 *
 * They are in one file and as two functions: they share `tapLimpio`, but they share no
 * target and no dependencies.
 *
 * The gestures that govern the piece in hand are bound to the hand that is already on the
 * board. The user pays no trip to the panel for a change of orientation, and none for a
 * change of PIECE. The DECISION of each gesture lives in `board-editing/input.ts`, where it
 * is tested without jsdom. Only the wiring stays here: these two hooks take no decision of
 * their own.
 *
 * **The two receive CALLBACKS and not setters.** It is not a style preference: when the
 * state of `rotation` and `mirror` changes its shape, that change lands in the shell and
 * these two hooks do not see it. With setters in the signature, the change would come in
 * here.
 *
 * **`tapLimpio` does NOT live here: it comes in as a parameter to BOTH.** The keyboard
 * reads the ref and both write it: the keyboard on each `keydown` with `abreTapLimpio`, the
 * wheel to `false`. So it is not a producer and a consumer. It is mutable state shared in
 * both directions. Inside `useAtajosDeTeclado`, which looks natural because that hook reads
 * it twice against once, the wheel would have no way to break it. Then the bug that the
 * comment in `useRuedaRota` documents comes back: `Ctrl` and the wheel zoom AND ALSO reflect
 * the piece when `Ctrl` is released. A named parameter in the two signatures holds it, and
 * not a lexical closure in one function body.
 */

/** The four keyboard gestures, already resolved by the shell. */
interface Acciones {
  rotar: () => void;
  reflejar: () => void;
  transporte: () => void;
  /**
   * The letter selects the piece. It receives the piece and not the key: to translate one
   * into the other is a decision, and decisions live in `input.ts`, where they have a test.
   */
  seleccionar: (pieza: PieceKey) => void;
}

/**
 * `Shift` rotates, `Ctrl` reflects, the space bar is the transport, the letter selects.
 *
 * The dependencies are the REAL ones, the identities of the four callbacks, and the effect
 * subscribes again when they change. The shell decides when each identity changes. A stable
 * callback stays in the array: to remove it would hide that its identity matters, and if it
 * stops being stable the effect would keep the old callback. The alternative is a ref with
 * the state, to subscribe only once. This repo does not need that optimization: two
 * `addEventListener` on `window` are not a cost, and the ref would hide where each value
 * comes from.
 *
 * The keys of the focused board, the arrows, `Home`/`End` and `Enter`, do NOT come through
 * here. The `onKeyDown` of the cell handles them, because they need to know WHICH cell has
 * the focus and this `window` listener does not know. This hook only steps aside:
 * `targetEsCelda` gives the space bar back to the board and leaves `Shift` and `Ctrl`
 * alone. With a focused cell they still rotate and reflect.
 *
 * The four fields go to the dependencies ONE BY ONE and the `acciones` object does NOT go
 * in raw. A literal `{ rotar, reflejar, transporte, seleccionar }` built in the shell has a
 * new identity on each render. With the object in the array, the effect would subscribe
 * again on each render and not on each change of a callback, and nothing would fail.
 */
export function useAtajosDeTeclado(acciones: Acciones, tapLimpio: RefObject<boolean>): void {
  const { rotar, reflejar, transporte, seleccionar } = acciones;

  useEffect(()=>{
    // The interactive `target` is checked here and not in the pure function:
    // `HTMLButtonElement` is a DOM type, and `input.ts` must load in `environment: 'node'`.
    const esControl = (t: EventTarget | null) =>
      t instanceof HTMLButtonElement || t instanceof HTMLInputElement;

    // The board cell is checked here for the SAME reason: `closest` belongs to the DOM. The
    // question is the `role="gridcell"` and not a class or a `data-*`, because the role is
    // what the cell promises to the screen reader, so nobody removes it in a style
    // refactor. `closest` and not a direct comparison: the focus can land on a node inside
    // the cell, and from there the space bar still belongs to the board. The
    // `instanceof Element` is not defensive: the events of `window` arrive with
    // `e.target === window`, which has no `closest`.
    const esCelda = (t: EventTarget | null) =>
      t instanceof Element && t.closest('[role="gridcell"]') !== null;

    const despachar = (e: KeyboardEvent, tipo: 'keydown' | 'keyup') => {
      const evento = {
        key: e.key, tipo, repeat: e.repeat,
        // The three modifiers come from the `KeyboardEvent` that the two handlers already
        // receive: nothing new is read from the DOM.
        ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        targetEsControl: esControl(e.target),
        targetEsCelda: esCelda(e.target),
        tapLimpio: tapLimpio.current,
      };
      // `preventDefault` has its OWN question, which is not "is there an action": the space
      // bar with auto-repeat does not toggle the transport, but its default is still to
      // scroll, and each repeated `keydown` brings its own. When the event is not ours, the
      // browser must keep all of it. That lets the space bar activate the button that has
      // the focus, and not toggle the transport twice.
      if (frenaElDefault(evento)) e.preventDefault();
      const accion = accionDeTecla(evento);
      if (accion === null) return;
      // The piece is asked for again and does not come inside the action: `Accion` is a
      // union of strings, and a payload would turn it into an object, a change of shape for
      // the four because of one. To ask again costs one `in`.
      const pieza = piezaDeTecla(e.key);
      if (accion === ACCION.rotar) rotar();
      else if (accion === ACCION.reflejar) reflejar();
      // The branch of the letter goes BEFORE the `else transporte()` and not as a loose
      // `if` after the chain: there the letter would also start the transport, and
      // typecheck and lint would pass. The discriminant is `pieza` and not
      // `accion === ACCION.seleccionar` because they are the same question: the pure
      // function returns `seleccionar` exactly when the key names a pentomino. With the
      // question on the piece the `else` stays reachable, so it needs no `!` and no dead
      // branch that no test can exercise.
      else if (pieza !== null) seleccionar(pieza);
      // The transport goes through the callback of the shell and not through loose
      // `startClock`/`stopClock`: the query to `clockRunning()` lives there, which
      // `.agents/rules/audio.md` requires of every caller, and a second door would skip it.
      else transporte();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // A modifier STARTS a clean tap. Any other key BREAKS the one that was open. So
      // `Ctrl`+C does not toggle the reflection, and that is the normal use of a browser,
      // not the rare case of a key pressed by accident.
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
 * The wheel over the board rotates the piece in hand.
 *
 * It goes through a non-passive `addEventListener` and not through an `onWheel` prop: React
 * registers `wheel` as PASSIVE on its root container (react-dom 19.1.1), and inside a
 * passive listener `preventDefault()` is a no-op that the browser only reports in the
 * console. With the prop, the wheel would rotate and the page would scroll all the same, so
 * it would look like it works. See the comment of the container in `Board.tsx`.
 *
 * This effect subscribes ONLY ONCE for each mount, the opposite of the keyboard effect, and
 * for a concrete reason: the handler has no value to read here. On the side of the shell,
 * `alRotar` must keep one identity for the whole mount. If the identity of `alRotar`
 * changes, this listener subscribes again on each change, and the one subscription for
 * each mount breaks.
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
      // The wheel ALWAYS breaks the clean tap, and it goes BEFORE the two guards below on
      // purpose: the wheel that must break it is the one that leaves through the first
      // guard. With this line after the `return` on `ctrlKey`, the `keyup` of `Ctrl` would
      // find the tap clean and reflect the piece on release. `Ctrl` and the wheel must
      // zoom and not reflect, and that is the one gesture that would escape.
      tapLimpio.current = false;
      // `Ctrl` and the wheel are the browser zoom, an accessibility affordance and not a
      // shortcut of convenience: the handler skips the WHOLE event, `preventDefault`
      // included, and the browser does its part. A system gesture wins over one of ours.
      if (e.ctrlKey) return;
      // A `deltaY` of 0 is a pure horizontal scroll, which does not rotate
      // (`rotacionPorRueda` says it too). It returns before `preventDefault` because that
      // gesture has nothing for us, so the browser keeps all of it. This node does not
      // scroll, so that is the only reason: to swallow a default that nothing uses has no
      // benefit.
      if (e.deltaY === 0) return;
      e.preventDefault();
      alRotar(e.deltaY);
    };
    // `{ passive: false }` is explicit: Chrome assumes `passive: true` for `wheel` on
    // window and document. On an element the default is false, but to write it shows the
    // deal.
    elemento.addEventListener('wheel', onWheel, { passive: false });
    return ()=> elemento.removeEventListener('wheel', onWheel);
  }, [nodo, alRotar, tapLimpio]);
}
