import { SHAPES } from '../pieces/pieces.ts';
import type { PieceKey } from '../pieces/pieces.ts';
import type { Rotacion } from '../pieces/orientation.ts';
import type { PlacedPiece } from './placement.ts';

/**
 * The DECISION of each input gesture, apart from the wiring that runs it.
 *
 * ## Why these pure functions receive fields and not the event
 *
 * The `node` tests of `src/` run with Vitest in `environment: 'node'`, with no jsdom: there
 * is no `KeyboardEvent` and no `MouseEvent` to build. With the fields that matter as
 * parameters, the guards are really tested there. What is left for a browser is that the
 * wiring of `use-input.ts` fills the fields correctly.
 *
 * ## Why they live here and not in `App.tsx`
 *
 * `react-refresh/only-export-components` forbids a `.tsx` to export anything that is not
 * the component, so a pure function written inside `App.tsx` cannot be exported, and so it
 * cannot be tested. `cell-text.ts` is outside `Board.tsx` for the same reason.
 *
 * Of the criteria these pure functions cover, the one that justifies the file is `Ctrl` and
 * click: on macOS `Ctrl`+click IS the secondary click, and this repo is developed on
 * Windows, where nobody can see that case by eye. The test is the only way to catch it.
 */

/** The four input actions: see `ACCION` in `input.ts`. */
export type Accion = (typeof ACCION)[keyof typeof ACCION];

/** What a click on a cell asks for: see `EDICION` in `input.ts`. */
export type Edicion = (typeof EDICION)[keyof typeof EDICION];

/**
 * The fields of a keyboard event that the decision needs, and no other.
 *
 * It is not the `KeyboardEvent` of the DOM, on purpose: the `node` tests of `src/` run in
 * `environment: 'node'` with no jsdom, so a pure function that receives the event cannot be
 * tested without building one. With fields, the guards are covered in `environment: 'node'`
 * and only the wiring is left.
 *
 * The caller computes the two `target*` and `tapLimpio` because they come from outside the
 * event. The first two check `e.target` against `HTMLButtonElement`/`HTMLInputElement` and
 * against the closest `role="gridcell"`, which is DOM that the pure function cannot see.
 * The last one is state between events, which a pure function does not have by definition.
 */
export interface EventoDeTecla {
  /**
   * The `key` of the DOM: `'Shift'`, `'Control'`, `' '` for the space bar, and any of the
   * twelve pentomino letters, in lower or upper case.
   */
  key: string;
  tipo: 'keydown' | 'keyup';
  /** The auto-repeat of the system. The keys that act on `keydown` exercise it: the space bar and the letters. */
  repeat: boolean;
  /**
   * The three modifiers that give the whole event back to the browser or to the system.
   *
   * Required, with no `?`: an optional field lets a new caller forget to fill it, and the
   * guard switches off alone, in silence. The regime has no parameter default for the same
   * reason.
   *
   * `shiftKey` is **not** here, and that is not an oversight: no decision of these pure
   * functions reads it. `Shift`+`f` selects all the same, because the letter breaks the
   * tap, and `abreTapLimpio` handles that with its own event and the four modifiers.
   */
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /**
   * The focus is on a `<button>` or an `<input>`: the browser keeps **everything**.
   *
   * Every key, with no exception: typing in the tempo clock does not rotate the piece, and
   * the space bar activates the focused control the native way, with no `blur()` by hand.
   */
  targetEsControl: boolean;
  /**
   * The focus is on a board cell: the board keeps **the space bar, `Enter` and the
   * arrows**, and nothing else.
   *
   * It is a DIFFERENT question from `targetEsControl`, not a wider version of it, and that
   * is the decision. `targetEsControl` switches off every key because the whole event
   * belongs to the browser. This one switches off the keys that the focused board handles
   * itself and **lets the rest through**. With a focused cell, `Shift` must still rotate
   * and `Ctrl` must still reflect: that is the gesture direct input exists for, to play
   * with no trip to the panel. A wider `targetEsControl` that also matched the cell would
   * fix the double fire of the space bar and switch off the two shortcuts it exists for.
   *
   * Of the three keys it names, this pure function can veto only the space bar: `Enter`
   * and the arrows are not its keys. The `onKeyDown` of the cell handles them, the only
   * place that knows WHICH cell has the focus.
   */
  targetEsCelda: boolean;
  /** While the modifier was down, no other key and no wheel event arrived. */
  tapLimpio: boolean;
}

/**
 * The four modifiers that a `keydown` reports, and the key that produced it.
 *
 * It is all that is necessary to know if the `keydown` STARTS a tap or breaks it. It is
 * apart from `EventoDeTecla` because that question is answered first: `EventoDeTecla`
 * receives the tap already resolved.
 */
export interface EventoDeModificador {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * The four actions that an input gesture can ask of the shell: rotate the piece in hand,
 * toggle its reflection, toggle the transport, or **select** another piece.
 *
 * `seleccionar` is the only one that does not come from a modifier: the twelve letters
 * select their pentomino. It is in this table and not a loose fourth branch of the wiring,
 * because WHICH gesture it is stays one question, the one `accionDeTecla` answers. Outside
 * this table the question would be split in two places.
 *
 * A const object and not an `enum`: the `erasableSyntaxOnly` of the tsconfig rejects an
 * `enum`, and it is the same option that lets node load `src/` with no build. The exact
 * precedent is `MARCA` in `route-source.ts`. It lives in this module because a constant
 * lives in the module that owns it.
 *
 * There is no fifth action for "do nothing": the absence of an action is `null`. Whether
 * the caller calls `preventDefault` is another question: see `frenaElDefault`.
 */
export const ACCION = {
  rotar: 'rotar',
  reflejar: 'reflejar',
  transporte: 'transporte',
  seleccionar: 'seleccionar',
} as const;

/**
 * What a click on a cell can ask of the board.
 *
 * Four and not two: place and place muted are the same edit of the board but a different
 * gesture for the ear. The muted one does **not** fire the courtesy arpeggio, because the
 * user places it so that it does not sound. The split here keeps that condition from
 * living as a loose `if` in the shell.
 *
 * The absence of an action is `null`, as in `ACCION`: it is the click on a placed piece
 * that is **not** an own piece, which does nothing.
 */
export const EDICION = {
  quitar: 'quitar',
  mutear: 'mutear',
  colocar: 'colocar',
  colocarMuteada: 'colocar-muteada',
} as const;

/**
 * The rotation that the wheel leaves: down (`deltaY > 0`) adds 90°, up subtracts 90°.
 *
 * The `+ 4` is not decoration: in JS `-1 % 4` is `-1`, so without it the wheel up from `0`
 * would return `-1`, and `rotateN` would receive an index that does not exist.
 *
 * A `deltaY` of 0 does not rotate. It really arrives: a pure horizontal scroll with
 * `deltaX` leaves `deltaY` at 0, and to turn there would be a rotation that nobody asked
 * for. The wiring of `use-input.ts` also **returns first** in that case, so with no
 * `preventDefault`: a horizontal gesture has nothing for us, so the browser keeps all of
 * it. The node that listens to the wheel does not scroll, so that is the only reason: to
 * swallow a default that nothing uses has no benefit.
 */
export function rotacionPorRueda(rotation: Rotacion, deltaY: number): Rotacion {
  const delta = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
  // The ASSERTION to `Rotacion` goes here, and only once in the whole repo, because this is
  // the only place where a rotation is computed and not received. Arithmetic modulo 4 on a
  // non-negative integer gives exactly `0 | 1 | 2 | 3`, and the `+ 4` above is what makes
  // it non-negative. TypeScript does not narrow `%`: the type of `x % 4` is `number`,
  // whatever it knows about `x`. It is of the same family as the
  // `Object.keys(SHAPES) as PieceKey[]` that the repo uses: the body guarantees what the
  // type says and the compiler cannot see it. Like that one, it has its reason next to it.
  return ((rotation + 4 + delta) % 4) as Rotacion;
}

/**
 * The next quarter turn: the gesture of `Shift`.
 *
 * It delegates to `rotacionPorRueda` with a positive `deltaY` and does not repeat the `+ 4`
 * and the `% 4`, and that is not a detour: an inline `(rotation + 1) % 4` in the shell
 * would put the same modular arithmetic in two places, with **only one** of the two copies
 * protected against the negative remainder. Here `Shift` is literally the wheel down, which
 * is what it does and what the two gestures promise. So the assertion to `Rotacion` exists
 * only once, in the function next to this one.
 */
export function siguienteRotacion(rotation: Rotacion): Rotacion {
  return rotacionPorRueda(rotation, 1);
}

/**
 * Whether this `keydown` STARTS a clean tap. If not, it breaks the one that was open.
 *
 * The rule is usually told as "it starts at `true` with the `keydown` of the modifier", and
 * written so it has a hole: `Ctrl`+`Shift` are TWO modifier keydowns in a row, so both
 * would start a tap, and on release the piece would rotate and reflect alone. It is not an
 * invented case: `Ctrl`+`Shift` is the shortcut that changes the keyboard layout on
 * Windows, and unlike `Ctrl`+`Shift`+`I` it brings no third key that breaks the tap.
 *
 * So the full condition: a modifier starts a tap only if **no other** modifier was down.
 * `Alt` and `Meta` count although they are not ours: the mute reserves `Alt`, and `Meta`
 * is the modifier of the macOS shortcuts.
 */
export function abreTapLimpio(e: EventoDeModificador): boolean {
  const otroAbajo = (e.key !== 'Shift' && e.shiftKey)
    || (e.key !== 'Control' && e.ctrlKey)
    || e.altKey || e.metaKey;
  return (e.key === 'Shift' || e.key === 'Control') && !otroAbajo;
}

/**
 * Whether a letter already in upper case names a pentomino.
 *
 * It is a type predicate and not a bare `in`, because `in` **does not narrow its left
 * side**: it narrows the object and not the key, so `k in SHAPES` leaves `k` as `string`
 * and the `return` does not compile (measured). The alternative was an `as PieceKey`, the
 * assertion this repo does not write: the predicate says the same thing and keeps the check
 * inside, where the compiler can see it.
 */
function esPieza(k: string): k is PieceKey {
  return k in SHAPES;
}

/**
 * The piece that a key names, or `null` if that key names none.
 *
 * `toUpperCase` and not two lists: `f` and `F` are the same piece, and with `Shift` down
 * the browser gives the upper case.
 *
 * It validates against `SHAPES` and not against its own list of twelve letters, on purpose:
 * a list here would be a second source of truth about which the pieces are, and when
 * `SHAPES` gains or loses an entry the two would disagree and nothing would fail. `SHAPES`
 * IS the table of the twelve, and `PieceKey` derives from its keys.
 */
export function piezaDeTecla(key: string): PieceKey | null {
  const letra = key.toUpperCase();
  return esPieza(letra) ? letra : null;
}

/**
 * Which action a key asks for, or `null` if the event is not ours.
 *
 * The six guards, in order and each with its reason:
 *
 * 1. **`targetEsControl`**: with the focus on a `<button>` or an `<input>` the browser
 *    already has a meaning for the space bar: activate the control. If this function also
 *    answered, a mouse press on Play and then the space bar would toggle the transport
 *    twice (the global handler and the native activation), and the instrument would not
 *    start. A `null` here lets the whole native path through, with no `blur()` by hand.
 * 2. **`repeat`**: a held key fires `keydown` at the repeat rate of the system. The space
 *    bar and the letters exercise it, because they act on `keydown`. The modifiers act on
 *    `keyup`, which does not repeat.
 * 3. **The modifiers act on RELEASE and only if the tap was clean**: `Ctrl`+C, `Ctrl`+V,
 *    `Ctrl`+R and any upper case start with the `keydown` of the modifier. Bound to
 *    `keydown`, a copy of a text would toggle the reflection with nobody asking for it and
 *    nobody seeing it. Another key and the wheel break `tapLimpio`. The mouse does not,
 *    because the `Ctrl`+click of macOS needs the `keyup` to be the one that toggles.
 * 4. **The space bar stays on `keydown`**: the browser scrolls there, so it is the only
 *    moment when a `preventDefault` is of any use.
 * 5. **`targetEsCelda` vetoes the space bar, and only the space bar**: the board is one tab
 *    stop, and the space bar on a focused cell places or removes the piece. Without this
 *    guard, one press would do both: toggle the transport here and edit through the
 *    `onKeyDown` of the cell. It lives inside the branch of the space bar, and not at the
 *    top next to guard 1, and that IS the decision: guard 1 switches off every key and
 *    this one switches off one, because with a focused cell `Shift` and `Ctrl` must still
 *    rotate and reflect. A wider guard 1 that matched the cell is tempting, because it is
 *    one line, but it would switch off every shortcut to fix one.
 * 6. **`Ctrl`, `Meta` or `Alt` veto the letter, and only the letter**: `Ctrl`+`F` is not a
 *    selection to reject. It is an event that was never ours, and the browser keeps the
 *    whole shortcut. The guard lives INSIDE the branch of the letters and not as a `return`
 *    at the top of the function, where it seems to belong: there it would also reach the
 *    space bar, which toggles the transport with any modifier down, and the two modifiers.
 *    No criterion asks for that change.
 *
 * This function does NOT answer whether to call `preventDefault`. They are two different
 * questions, and THREE cases separate them: the auto-repeat of guard 2, the focused cell of
 * guard 5, and the twelve letters, which are an action and have no default to block. See
 * `frenaElDefault`.
 */
export function accionDeTecla(e: EventoDeTecla): Accion | null {
  if (e.targetEsControl) return null;
  if (e.repeat) return null;

  if (e.key === 'Shift') return e.tipo === 'keyup' && e.tapLimpio ? ACCION.rotar : null;
  if (e.key === 'Control') return e.tipo === 'keyup' && e.tapLimpio ? ACCION.reflejar : null;
  if (e.key === ' ') return e.tipo === 'keydown' && !e.targetEsCelda ? ACCION.transporte : null;

  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // The decision belongs to `keydown` and not to `keyup`, and that closes a hole: in a
  // `Ctrl`+`V` that releases `Ctrl` first, the `keyup` of `V` arrives with `ctrlKey: false`
  // and would pass the guard above. `despachar` calls this pure function on both events, so
  // without this line a paste of text would leave the piece `V` in hand.
  //
  // `targetEsCelda` does NOT appear: it is guard 5, and it switches off the space bar and
  // only the space bar. With a focused cell the letter still selects. The `switch` of the
  // `onKeyDown` of the cell ends with `default: return`, so there is no double fire to
  // avoid, and a veto there would switch off the shortcut where it is most useful: with the
  // hand on the board.
  if (e.tipo !== 'keydown') return null;
  return piezaDeTecla(e.key) === null ? null : ACCION.seleccionar;
}

/**
 * Whether the browser can **not** keep the whole event.
 *
 * It is a different question from the one of `accionDeTecla`, although it looks the same,
 * and the THREE cases in the docblock of that function separate them. The first one is the
 * space bar with auto-repeat. There `accionDeTecla` returns `null`, because a held space
 * bar must not toggle the transport thirty times a second. But the default is still alive,
 * because **each repeated `keydown` brings its own**, and the default of the space bar is
 * to scroll. As one question, a tap that is a little long would start the transport once
 * and then scroll the page at the repeat rate of the system.
 *
 * `targetEsControl` vetoes it as it vetoes the action, and for the same reason: if the
 * focus is on a `<button>` or an `<input>`, the event belongs to the browser whole, and not
 * in part. That lets the space bar activate the focused control with no `blur()` by hand.
 *
 * `targetEsCelda` does **not** veto it, and that asymmetry with `accionDeTecla` is
 * deliberate: the default of the space bar is to scroll the page, and that must be blocked
 * whoever handles the key. With a focused cell the space bar does not toggle the transport:
 * it places the piece. If the page also scrolled, the same press that places would take the
 * board off the screen. It is not the same as the guard of `targetEsControl`: there the
 * default is the action the user wants, to activate the control, and here it is an effect
 * that nobody asked for.
 *
 * The modifiers do not appear here: `Shift` and `Control` alone have no default to block,
 * on press or on release. The twelve letters do not appear either: they are the third case
 * and the first on the reverse side, with an action and NOTHING to block. A letter alone
 * has no default to block, and to block it all the same would take from the browser an
 * event that is not ours.
 */
export function frenaElDefault(e: EventoDeTecla): boolean {
  return !e.targetEsControl && e.key === ' ' && e.tipo === 'keydown';
}

/**
 * Whether a `contextmenu` on the board must toggle the reflection.
 *
 * `ctrlKey` vetoes it, and that line is the whole rule of `Ctrl` and click: on macOS
 * `Ctrl`+click is the way to send the secondary click with no mouse, and the system
 * delivers it as `contextmenu` with `ctrlKey: true`. Without the guard, the `keyup` of
 * `Ctrl` toggles once and this handler undoes it: net zero, so on an Apple laptop with no
 * mouse the reflection would never respond. On Windows a real right click arrives with
 * `ctrlKey: false`, so the guard takes nothing from it.
 *
 * To reflect with the trackpad, use the secondary click of two fingers, which arrives with
 * no `ctrlKey`. To reflect with the keyboard, use `Ctrl` alone.
 */
export function reflejaElContextMenu(e: { ctrlKey: boolean }): boolean {
  return !e.ctrlKey;
}

/**
 * Whether an own piece occupies the clicked cell: a placed piece **of the same type as the
 * piece in hand**.
 *
 * It is the key of every edit on the board, and it is written only once because two use it:
 * the click handler and the derivation of the pointed cell, which decides the cursor and
 * whether the ghost is drawn. Two copies of this condition would be two ways to disagree on
 * whether a click removes, with the cursor promising one thing and the click doing another.
 *
 * It is **not** "the placement is illegal": that is also true on an overlap with a piece of
 * another type, and there nothing must happen. And it is **not** "some piece of that type
 * is on the board": it is measured on the clicked cell, so with two `N` placed the edit
 * goes to the one that was clicked and not to the other.
 *
 * That the user must hold the piece to edit it is what keeps an edit from being an
 * accident: without that condition, any badly aimed click on the board would remove a piece.
 */
export function esLaPiezaEnLaMano(ocupante: PlacedPiece | null, selected: PieceKey): boolean {
  return ocupante !== null && ocupante.piece === selected;
}

/**
 * What a click on cell `(x, y)` asks of the board, or `null` if it asks for nothing.
 *
 * The four branches of the table, with `Alt` meaning "muted" on both sides of the gesture:
 *
 * ```
 * cell occupied by an own piece
 *   ├─ no Alt   → remove that piece
 *   └─ with Alt → toggle its mute
 * cell occupied by a piece of ANOTHER type → nothing
 * free cell
 *   ├─ no Alt   → place
 *   └─ with Alt → place already muted
 * ```
 *
 * The split is click removes and `Alt`+click mutes, and not the reverse. With the reverse,
 * **remove** would be reachable only through mute: to remove a piece that nobody wanted to
 * mute, the user would have to mute it first. This way each operation costs one gesture,
 * and the destructive one is almost reversible: with the same piece and the same
 * orientation in hand, a second click puts it back in the same place.
 *
 * `colocar` does not promise that the placement is legal: `isValid` of the domain decides
 * that, in the caller, because it depends on the other four cells of the piece and not on
 * the clicked one. This pure function answers WHICH gesture it is, not whether it is
 * possible.
 */
export function accionDeClick(ocupante: PlacedPiece | null, selected: PieceKey, altKey: boolean): Edicion | null {
  if (esLaPiezaEnLaMano(ocupante, selected)) return altKey ? EDICION.mutear : EDICION.quitar;
  if (ocupante !== null) return null;
  return altKey ? EDICION.colocarMuteada : EDICION.colocar;
}
