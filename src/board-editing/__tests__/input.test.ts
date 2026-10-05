import { describe, it, expect } from 'vitest';
import {
  rotacionPorRueda,
  siguienteRotacion,
  accionDeTecla,
  frenaElDefault,
  abreTapLimpio,
  reflejaElContextMenu,
  accionDeClick,
  esLaPiezaEnLaMano,
  piezaDeTecla,
  ACCION,
  EDICION,
} from '../input.ts';
import { ROTACION } from '../../pieces/orientation.ts';
import type { Rotacion } from '../../pieces/orientation.ts';
import { SHAPES } from '../../pieces/pieces.ts';
import type { EventoDeTecla } from '../input.ts';
import type { PieceKey } from '../../pieces/pieces.ts';
import type { PlacedPiece } from '../placement.ts';

/**
 * The decisions of the gestures, the letter that selects the piece included.
 *
 * What is NOT here is the wiring: that `board-editing/use-input.ts` reads `e.target`
 * correctly, that the `preventDefault` really blocks the scroll.
 * `use-input.browser.test.tsx` covers that, in a real browser.
 */

/** A key event with everything off: each test turns on only what it measures. */
const tecla = (p: Partial<EventoDeTecla> & Pick<EventoDeTecla, 'key' | 'tipo'>): EventoDeTecla => ({
  repeat: false, targetEsControl: false, targetEsCelda: false, tapLimpio: true,
  ctrlKey: false, metaKey: false, altKey: false, ...p,
});

/** The twelve letters, taken from `SHAPES` and not written by hand: the same source as the pure function. */
const LETRAS = Object.keys(SHAPES) as PieceKey[];

describe('the wheel rotates in both directions, cyclically', () => {
  it('AC-BRD-022 — down adds 90° and up subtracts 90°', () => {
    expect(rotacionPorRueda(0, 120)).toBe(1);
    expect(rotacionPorRueda(1, -120)).toBe(0);
  });

  it('AC-BRD-022 AC-PCS-011 — it wraps at both ends', () => {
    expect(rotacionPorRueda(3, 120)).toBe(0);
    // The case that the `+ 4` exists to catch: in JS `-1 % 4` is `-1`, and `rotateN` has
    // no rotation -1.
    expect(rotacionPorRueda(0, -120)).toBe(3);
  });

  it('AC-BRD-022 — a deltaY of 0 does not rotate', () => {
    // It does arrive: a pure horizontal scroll leaves `deltaY` at 0, and a turn there
    // would be a rotation that nobody asked for.
    expect(rotacionPorRueda(2, 0)).toBe(2);
  });

  it('goes through the cycle of four and returns to the start', () => {
    // The accumulator has the type `Rotacion`: if the pure function stops guaranteeing
    // the range, this line stops compiling before the test runs.
    let r: Rotacion = ROTACION.cero;
    for (let i = 0; i < 4; i++) r = rotacionPorRueda(r, 120);
    expect(r).toBe(ROTACION.cero);
  });

  it('AC-PCS-012 — `siguienteRotacion` is the wheel down, and it wraps at the end', () => {
    // The `Shift` gesture. It delegates to `rotacionPorRueda` and does not repeat the
    // `% 4`: a second copy of that arithmetic can lose the `+ 4` that prevents the
    // negative remainder.
    expect([0, 1, 2, 3].map(r => siguienteRotacion(r as Rotacion))).toEqual([1, 2, 3, 0]);
  });
});

describe('the auto-repeat does not accumulate', () => {
  it('with `repeat: true` no key gives an action', () => {
    // Without this guard, a little finger held on Shift, which is how a person types,
    // would turn the piece at the repeat rate of the system.
    for (const key of ['Shift', 'Control', ' ']) {
      expect(accionDeTecla(tecla({ key, tipo: 'keydown', repeat: true }))).toBeNull();
      expect(accionDeTecla(tecla({ key, tipo: 'keyup', repeat: true }))).toBeNull();
    }
  });
});

describe('the modifiers act on release, and only at the end of a clean tap', () => {
  it('AC-BRD-024 — the `keydown` of the modifier gives no action', () => {
    // This is half of the guard that prevents `Ctrl`+C from toggling the reflection:
    // every browser shortcut starts with the `keydown` of the modifier.
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keydown' }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keydown' }))).toBeNull();
  });

  it('AC-BRD-024 — the `keyup` at the end of a clean tap does', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup' }))).toBe(ACCION.rotar);
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup' }))).toBe(ACCION.reflejar);
  });

  it('AC-BRD-024 — the `keyup` after a broken tap does not', () => {
    // Another key (`Ctrl`+C) and the wheel (`Ctrl`+wheel, which is the zoom) break the
    // tap. The wiring records the break, so this test is the only thing that fixes the
    // rule of what to do with it.
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup', tapLimpio: false }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup', tapLimpio: false }))).toBeNull();
  });
});

describe('the space bar', () => {
  it('AC-BRD-028 — it toggles the transport on `keydown` and not on `keyup`', () => {
    // On `keydown` and not on `keyup` because that is where the browser scrolls: it is
    // the only moment when the `preventDefault` has an effect.
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown' }))).toBe(ACCION.transporte);
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keyup' }))).toBeNull();
  });

  it('AC-BRD-029 — with the focus on a control it gives no action', () => {
    // With Play focused, the space bar activates it by the native path. If the global
    // handler also answered, the transport would toggle twice in the same gesture and
    // the instrument would not start.
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', targetEsControl: true }))).toBeNull();
  });

  it('AC-BRD-029 — the control guard also turns off the modifiers', () => {
    // Shift on the tempo control has no reason to rotate the piece.
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup', targetEsControl: true }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup', targetEsControl: true }))).toBeNull();
  });
});

describe('the focus on a cell turns off the space bar and NOTHING ELSE', () => {
  /*
   * THE SIX ROWS OF THIS TABLE ARE THE CRITERION, TOGETHER. Apart they say nothing: the
   * decision is not "the cell turns off the space bar" but "the cell turns off the space
   * bar and nothing else". As separate tests, the removal of the `Shift` test as
   * redundant would leave the file green while the app loses the `Shift` and `Ctrl`
   * shortcuts. That is exactly the bug of a wider `targetEsControl` in place of a new
   * `targetEsCelda`: a shorter line that turns off three shortcuts to fix one.
   *
   * The whole asymmetry, in one view:
   *
   * | key                   | targetEsControl | targetEsCelda | expected          |
   * |-----------------------|-----------------|---------------|-------------------|
   * | `' '` (keydown)       | false           | false         | ACCION.transporte |
   * | `' '` (keydown)       | false           | TRUE          | null              |
   * | `' '` (keydown)       | true            | false         | null              |
   * | `'Shift'` (keyup)     | false           | TRUE          | ACCION.rotar      |
   * | `'Control'` (keyup)   | false           | TRUE          | ACCION.reflejar   |
   * | the twelve letters    | false           | TRUE          | the same as with the focus outside |
   */
  const tabla = [
    ['the space bar with the focus outside the board toggles the transport',
      tecla({ key: ' ', tipo: 'keydown' }), ACCION.transporte],
    ['with a CELL focused, the space bar does not toggle the transport',
      tecla({ key: ' ', tipo: 'keydown', targetEsCelda: true }), null],
    ['with a CONTROL focused it does not toggle it either',
      tecla({ key: ' ', tipo: 'keydown', targetEsControl: true }), null],
    ['with a cell focused, `Shift` STILL rotates',
      tecla({ key: 'Shift', tipo: 'keyup', targetEsCelda: true }), ACCION.rotar],
    ['with a cell focused, `Ctrl` STILL reflects',
      tecla({ key: 'Control', tipo: 'keyup', targetEsCelda: true }), ACCION.reflejar],
  ] as const;

  it('the table of the asymmetry, which is the whole criterion', () => {
    for (const [que, evento, esperado] of tabla) expect(accionDeTecla(evento), que).toBe(esperado);
  });

  it('the twelve letters still reach the shell with a cell focused', () => {
    // What the test asserts is NOT the value of the action. That would repeat the tests
    // of the letters, below. It asserts that `targetEsCelda` IS NOT THE REASON: the
    // focused cell gives the same result as the focus outside. `targetEsCelda` turns off
    // the space bar, and nothing else. That is why the test compares the two columns and
    // not a fixed value: when a letter changes what it does, this row still tells the
    // truth with no edit.
    for (const letra of Object.keys(SHAPES) as PieceKey[]) {
      for (const key of [letra, letra.toLowerCase()]) {
        const enElTablero = accionDeTecla(tecla({ key, tipo: 'keydown', targetEsCelda: true }));
        const afuera = accionDeTecla(tecla({ key, tipo: 'keydown' }));
        expect(enElTablero, key).toBe(afuera);
      }
    }
  });
});

describe('blocking the default is a different question from giving an action', () => {
  it('AC-BRD-028 — the repeated space bar does NOT toggle the transport but DOES block the scroll', () => {
    // This is the case that separates the two functions. With `preventDefault` tied to
    // "there is an action", a slightly long press of the space bar starts the transport
    // once and then scrolls the page at the repeat rate of the system, because each
    // repeated `keydown` brings its own default.
    const repetida = tecla({ key: ' ', tipo: 'keydown', repeat: true });
    expect(accionDeTecla(repetida)).toBeNull();
    expect(frenaElDefault(repetida)).toBe(true);
  });

  it('AC-BRD-028 — the space bar of the first `keydown` blocks the default', () => {
    expect(frenaElDefault(tecla({ key: ' ', tipo: 'keydown' }))).toBe(true);
  });

  it('with a CELL focused the space bar still blocks the default, although it gives no action', () => {
    // The other half of the asymmetry of the focused cell, and the one that is easy to
    // lose in a copy of the `targetEsControl` guard. The space bar does not toggle the
    // transport there, because the board handles it. But its default is still to scroll
    // the page, and that must be blocked whoever handles the key. Without this line, the
    // same press that places the piece moves the board off the screen.
    const enLaCelda = tecla({ key: ' ', tipo: 'keydown', targetEsCelda: true });
    expect(accionDeTecla(enLaCelda)).toBeNull();
    expect(frenaElDefault(enLaCelda)).toBe(true);
  });

  it('AC-BRD-029 — with the focus on a control it blocks nothing', () => {
    // The WHOLE event belongs to the browser, not half of it, or the space bar would not
    // activate the button that has the focus.
    expect(frenaElDefault(tecla({ key: ' ', tipo: 'keydown', targetEsControl: true }))).toBe(false);
  });

  it('the `keyup` of the space bar and the modifiers block nothing', () => {
    // None of the three has a default worth blocking: the space bar scrolls on
    // `keydown`, and `Shift` and `Control` alone do nothing in the browser.
    expect(frenaElDefault(tecla({ key: ' ', tipo: 'keyup' }))).toBe(false);
    for (const key of ['Shift', 'Control']) {
      expect(frenaElDefault(tecla({ key, tipo: 'keydown' })), key).toBe(false);
      expect(frenaElDefault(tecla({ key, tipo: 'keyup' })), key).toBe(false);
    }
  });

  it('a key that is not ours blocks nothing either', () => {
    for (const key of ['a', 'Enter', 'Alt', 'ArrowDown', 'PageDown']) {
      expect(frenaElDefault(tecla({ key, tipo: 'keydown' })), key).toBe(false);
    }
  });
});

describe('which keydown starts a clean tap', () => {
  /** A `keydown` with no modifier on except the ones the test asks for. */
  const bajar = (key: string, mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
    abreTapLimpio({
      key,
      shiftKey: key === 'Shift', ctrlKey: key === 'Control',
      altKey: false, metaKey: false,
      ...mods,
    });

  it('AC-BRD-025 — a modifier alone starts it', () => {
    expect(bajar('Shift')).toBe(true);
    expect(bajar('Control')).toBe(true);
  });

  it('AC-BRD-025 — any other key breaks it', () => {
    for (const key of ['a', ' ', 'Alt', 'Enter']) expect(bajar(key), key).toBe(false);
  });

  it('AC-BRD-025 — a modifier with ANOTHER one already down does not start it', () => {
    // The hole that the rule "the tap starts on the keydown of the modifier" leaves
    // open: `Ctrl`+`Shift` is two modifier keydowns in a row and no third key that breaks
    // the tap. It is the shortcut with which Windows changes the keyboard layout, so
    // without this the piece would rotate and reflect by itself on release.
    expect(bajar('Shift', { ctrlKey: true })).toBe(false);
    expect(bajar('Control', { shiftKey: true })).toBe(false);
  });

  it('AC-BRD-025 — `Alt` and `Meta` down also break it', () => {
    // The mute reserves `Alt`, and `Meta` is the modifier of the macOS shortcuts: the
    // two are gestures of another owner.
    expect(bajar('Control', { altKey: true })).toBe(false);
    expect(bajar('Shift', { metaKey: true })).toBe(false);
  });
});

describe('the keys that are not ours', () => {
  it('AC-BRD-020 — they give no action', () => {
    // This sweep is load-bearing and not an arbitrary list: the `'a'` says that `A` is
    // NOT a pentomino, so if `SHAPES` ever gets an `A` entry, this test is the one that
    // fails.
    for (const key of ['a', 'Enter', 'Alt', 'ArrowUp', 'Escape']) {
      expect(accionDeTecla(tecla({ key, tipo: 'keydown' })), key).toBeNull();
      expect(accionDeTecla(tecla({ key, tipo: 'keyup' })), key).toBeNull();
    }
    // `Alt` is in the list on purpose: it is the modifier of the CLICK, not a key with an
    // action of its own. If it ever does something by itself, this test says so.
  });
});

describe('`Ctrl`+click on macOS is the secondary click', () => {
  /*
   * This is the only criterion that a person CANNOT see by eye on Windows, where the
   * repo is developed: there `Ctrl`+click is a normal click and the two gestures never
   * meet. On macOS the system translates it to `contextmenu` with `ctrlKey: true`.
   * Without the guard, the `keyup` of `Ctrl` toggles the reflection and this handler
   * undoes it: net zero, so the reflection would never respond there.
   *
   * If someone deletes this test as "redundant", the bug returns, and it returns silent.
   */
  it('AC-BRD-026 — a `contextmenu` with `ctrlKey: true` does not reflect', () => {
    expect(reflejaElContextMenu({ ctrlKey: true })).toBe(false);
  });

  it('AC-BRD-026 — a real secondary click does', () => {
    expect(reflejaElContextMenu({ ctrlKey: false })).toBe(true);
  });
});

/**
 * The click on a cell.
 *
 * The key of every edit is that the piece in hand is of the same type as the placed
 * piece: without that condition, any badly aimed click would remove a piece.
 */
const pieza = (id: string, piece: PieceKey, muted = false): PlacedPiece =>
  ({ id, piece, rotation: 0, mirror: false, cells: [], muted });

describe('a click on an own piece removes it', () => {
  it('with the same piece in hand, remove', () => {
    expect(accionDeClick(pieza('1', 'N'), 'N', false)).toBe(EDICION.quitar);
  });

  it('AC-BRD-007 — the decision is taken on the CLICKED cell, so with two `N` pieces the clicked one is edited', () => {
    // `occupantAt` returns the piece that covers that cell, and this pure function
    // receives that piece. The rule is not "some N is on the board", and that is why,
    // with two placed, the clicked one is edited: the id travels in the occupant and the
    // caller filters by it.
    const primera = pieza('1', 'N');
    const segunda = pieza('2', 'N');
    expect(accionDeClick(primera, 'N', false)).toBe(EDICION.quitar);
    expect(accionDeClick(segunda, 'N', false)).toBe(EDICION.quitar);
    expect(primera.id).not.toBe(segunda.id);
  });
});

describe('a click on ANOTHER piece does nothing', () => {
  it('AC-BRD-009 — without Alt and with Alt, neither one edits', () => {
    // The rule for an edit CANNOT be "the placement is illegal": that is also true here,
    // and here nothing must occur.
    expect(accionDeClick(pieza('1', 'L'), 'N', false)).toBeNull();
    expect(accionDeClick(pieza('1', 'L'), 'N', true)).toBeNull();
  });
});

describe('`Alt`+click on an own piece toggles the mute', () => {
  it('AC-BRD-010 — it mutes the piece that sounds and unmutes the muted piece: a toggle, not a set', () => {
    // The pure function returns the same action in the two cases because the toggle
    // belongs to the caller: the decision is "toggle this one", and the piece knows the
    // new value.
    expect(accionDeClick(pieza('1', 'N'), 'N', true)).toBe(EDICION.mutear);
    expect(accionDeClick(pieza('1', 'N', true), 'N', true)).toBe(EDICION.mutear);
  });
});

describe('`Alt`+click on a free cell places the piece muted', () => {
  it('AC-BRD-006 — without Alt it places, with Alt it places muted', () => {
    expect(accionDeClick(null, 'N', false)).toBe(EDICION.colocar);
    expect(accionDeClick(null, 'N', true)).toBe(EDICION.colocarMuteada);
  });

  it('AC-BRD-006 — the two are different actions, for one reason only: the courtesy arpeggio', () => {
    // They edit the board in the same way. What changes is the courtesy arpeggio, which
    // the muted placement does not play. If they were the same action, that condition
    // would have to live as a separate `if` in the shell that reads `altKey` a second
    // time.
    expect(EDICION.colocar).not.toBe(EDICION.colocarMuteada);
  });
});

describe('the key of the edit, alone', () => {
  it('`esLaPiezaEnLaMano` is false with no occupant and with an occupant of another type', () => {
    expect(esLaPiezaEnLaMano(null, 'N')).toBe(false);
    expect(esLaPiezaEnLaMano(pieza('1', 'L'), 'N')).toBe(false);
    expect(esLaPiezaEnLaMano(pieza('1', 'N'), 'N')).toBe(true);
  });

  it('AC-BRD-008 — it does not read the mute: a muted piece is removable in the same way', () => {
    expect(esLaPiezaEnLaMano(pieza('1', 'N', true), 'N')).toBe(true);
    expect(accionDeClick(pieza('1', 'N', true), 'N', false)).toBe(EDICION.quitar);
  });
});

describe('the letter selects its piece, in lower and upper case', () => {
  it('AC-BRD-017 — the twelve letters select, in both cases', () => {
    expect(LETRAS.length).toBe(12);
    for (const letra of LETRAS) {
      for (const key of [letra.toLowerCase(), letra]) {
        expect(accionDeTecla(tecla({ key, tipo: 'keydown' })), key).toBe(ACCION.seleccionar);
        expect(piezaDeTecla(key), key).toBe(letra);
      }
    }
  });

  it('AC-BRD-020 — `piezaDeTecla` returns `null` for a key that names no pentomino', () => {
    for (const key of ['A', 'a', '1', 'Enter', 'ArrowUp', '']) {
      expect(piezaDeTecla(key), key).toBeNull();
    }
    // `in` reads the prototype chain, so against an object literal it answers `true` for
    // the keys of `Object.prototype`. None arrives here because the `toUpperCase` goes
    // first and `'TOSTRING'` is not one of them. But if the narrowing is ever written in
    // another way, this line is the one that says so.
    for (const key of ['toString', 'constructor', 'valueOf']) {
      expect(piezaDeTecla(key), key).toBeNull();
    }
  });
});

describe('a modifier gives the letter back to the browser', () => {
  it('AC-BRD-018 — with `ctrlKey`, `metaKey` or `altKey` the letter does not select', () => {
    // `Ctrl`+`F` (find), `Ctrl`+`P` (print) and `Ctrl`+`V` (paste) are three shortcuts
    // that the browser keeps whole, and the three letters are pentominoes.
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', [mod]: true })), mod).toBeNull();
    }
  });

  it('AC-BRD-018 — the `keyup` of a letter does not select either, even when it arrives with no modifier', () => {
    // The `Ctrl`+`V` that releases `Ctrl` first: the `keyup` of the `V` arrives with
    // `ctrlKey: false` and would pass the guard above. The decision belongs to the
    // `keydown`.
    expect(accionDeTecla(tecla({ key: 'v', tipo: 'keyup' }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'V', tipo: 'keyup', ctrlKey: true }))).toBeNull();
  });
});

describe('AC-BRD-019 — what the letter does NOT do', () => {
  it('with the focus on a control of a panel it does not select', () => {
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', targetEsControl: true }))).toBeNull();
  });

  it('with auto-repeat it does not select', () => {
    // A held letter must not repeat the selection: it is idempotent, but an early return
    // keeps the gesture where the contract puts it, in one `keydown`.
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', repeat: true }))).toBeNull();
  });

  it('no letter blocks the default', () => {
    // A letter alone has no default to block. To block it would take from the browser an
    // event that is not ours.
    for (const letra of LETRAS) {
      expect(frenaElDefault(tecla({ key: letra.toLowerCase(), tipo: 'keydown' })), letra).toBe(false);
      expect(frenaElDefault(tecla({ key: letra, tipo: 'keyup' })), letra).toBe(false);
    }
  });

  it('the same letter twice asks for the same action and nothing else', () => {
    const dos = [1, 2].map(() => accionDeTecla(tecla({ key: 'f', tipo: 'keydown' })));
    expect(dos).toEqual([ACCION.seleccionar, ACCION.seleccionar]);
  });
});

describe('the letter breaks the tap, so `Shift`+`f` does not rotate on release', () => {
  it('AC-BRD-025 — `abreTapLimpio` is false for a letter', () => {
    // Characterization: it comes for free, because only `Shift` and `Control` start a
    // tap, and the test exists so that it stays free.
    expect(abreTapLimpio({ key: 'f', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
    expect(abreTapLimpio({ key: 'F', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
  });
});

describe('with a cell focused the letter STILL selects', () => {
  it('AC-BRD-021 — `targetEsCelda` does not enter the branch of the letters, and it does enter the branch of the space bar', () => {
    // The same asymmetry, tested from the other side: that guard turns off the space bar
    // and only the space bar.
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', targetEsCelda: true }))).toBe(ACCION.seleccionar);
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', targetEsCelda: true }))).toBeNull();
  });
});

describe('the space bar, `Shift` and `Ctrl` keep their gestures', () => {
  it('AC-BRD-028 — the space bar still toggles the transport with `Ctrl`, `Alt` or `Meta` down', () => {
    // The modifier guard belongs to THE BRANCH OF THE LETTERS. At the top of the function
    // it would also reach the space bar, and no criterion asks for that.
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', [mod]: true })), mod).toBe(ACCION.transporte);
    }
  });

  it('AC-BRD-024 — `Shift` and `Control` still rotate and reflect at the end of a clean tap', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup' }))).toBe(ACCION.rotar);
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup' }))).toBe(ACCION.reflejar);
  });
});
