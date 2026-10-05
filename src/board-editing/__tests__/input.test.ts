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

const tecla = (p: Partial<EventoDeTecla> & Pick<EventoDeTecla, 'key' | 'tipo'>): EventoDeTecla => ({
  repeat: false, targetEsControl: false, targetEsCelda: false, tapLimpio: true,
  ctrlKey: false, metaKey: false, altKey: false, ...p,
});

const LETRAS = Object.keys(SHAPES) as PieceKey[];

describe('the wheel rotates in both directions, cyclically', () => {
  it('AC-BRD-022 — down adds 90° and up subtracts 90°', () => {
    expect(rotacionPorRueda(0, 120)).toBe(1);
    expect(rotacionPorRueda(1, -120)).toBe(0);
  });

  it('AC-BRD-022 AC-PCS-011 — it wraps at both ends', () => {
    expect(rotacionPorRueda(3, 120)).toBe(0);
    expect(rotacionPorRueda(0, -120)).toBe(3);
  });

  it('AC-BRD-022 — a deltaY of 0 does not rotate', () => {
    expect(rotacionPorRueda(2, 0)).toBe(2);
  });

  it('goes through the cycle of four and returns to the start', () => {
    let r: Rotacion = ROTACION.cero;
    for (let i = 0; i < 4; i++) r = rotacionPorRueda(r, 120);
    expect(r).toBe(ROTACION.cero);
  });

  it('AC-PCS-012 — `siguienteRotacion` is the wheel down, and it wraps at the end', () => {
    expect([0, 1, 2, 3].map(r => siguienteRotacion(r as Rotacion))).toEqual([1, 2, 3, 0]);
  });
});

describe('the auto-repeat does not accumulate', () => {
  it('with `repeat: true` no key gives an action', () => {
    for (const key of ['Shift', 'Control', ' ']) {
      expect(accionDeTecla(tecla({ key, tipo: 'keydown', repeat: true }))).toBeNull();
      expect(accionDeTecla(tecla({ key, tipo: 'keyup', repeat: true }))).toBeNull();
    }
  });
});

describe('the modifiers act on release, and only at the end of a clean tap', () => {
  it('AC-BRD-024 — the `keydown` of the modifier gives no action', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keydown' }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keydown' }))).toBeNull();
  });

  it('AC-BRD-024 — the `keyup` at the end of a clean tap does', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup' }))).toBe(ACCION.rotar);
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup' }))).toBe(ACCION.reflejar);
  });

  it('AC-BRD-024 — the `keyup` after a broken tap does not', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup', tapLimpio: false }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup', tapLimpio: false }))).toBeNull();
  });
});

describe('the space bar', () => {
  it('AC-BRD-028 — it toggles the transport on `keydown` and not on `keyup`', () => {
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown' }))).toBe(ACCION.transporte);
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keyup' }))).toBeNull();
  });

  it('AC-BRD-029 — with the focus on a control it gives no action', () => {
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', targetEsControl: true }))).toBeNull();
  });

  it('AC-BRD-029 — the control guard also turns off the modifiers', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup', targetEsControl: true }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup', targetEsControl: true }))).toBeNull();
  });
});

describe('the focus on a cell turns off the space bar and NOTHING ELSE', () => {
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
    const repetida = tecla({ key: ' ', tipo: 'keydown', repeat: true });
    expect(accionDeTecla(repetida)).toBeNull();
    expect(frenaElDefault(repetida)).toBe(true);
  });

  it('AC-BRD-028 — the space bar of the first `keydown` blocks the default', () => {
    expect(frenaElDefault(tecla({ key: ' ', tipo: 'keydown' }))).toBe(true);
  });

  it('with a CELL focused the space bar still blocks the default, although it gives no action', () => {
    const enLaCelda = tecla({ key: ' ', tipo: 'keydown', targetEsCelda: true });
    expect(accionDeTecla(enLaCelda)).toBeNull();
    expect(frenaElDefault(enLaCelda)).toBe(true);
  });

  it('AC-BRD-029 — with the focus on a control it blocks nothing', () => {
    expect(frenaElDefault(tecla({ key: ' ', tipo: 'keydown', targetEsControl: true }))).toBe(false);
  });

  it('the `keyup` of the space bar and the modifiers block nothing', () => {
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
    expect(bajar('Shift', { ctrlKey: true })).toBe(false);
    expect(bajar('Control', { shiftKey: true })).toBe(false);
  });

  it('AC-BRD-025 — `Alt` and `Meta` down also break it', () => {
    expect(bajar('Control', { altKey: true })).toBe(false);
    expect(bajar('Shift', { metaKey: true })).toBe(false);
  });
});

describe('the keys that are not ours', () => {
  it('AC-BRD-020 — they give no action', () => {
    // `A` is not a pentomino.
    for (const key of ['a', 'Enter', 'Alt', 'ArrowUp', 'Escape']) {
      expect(accionDeTecla(tecla({ key, tipo: 'keydown' })), key).toBeNull();
      expect(accionDeTecla(tecla({ key, tipo: 'keyup' })), key).toBeNull();
    }
  });
});

describe('`Ctrl`+click on macOS is the secondary click', () => {
  it('AC-BRD-026 — a `contextmenu` with `ctrlKey: true` does not reflect', () => {
    expect(reflejaElContextMenu({ ctrlKey: true })).toBe(false);
  });

  it('AC-BRD-026 — a real secondary click does', () => {
    expect(reflejaElContextMenu({ ctrlKey: false })).toBe(true);
  });
});

const pieza = (id: string, piece: PieceKey, muted = false): PlacedPiece =>
  ({ id, piece, rotation: 0, mirror: false, cells: [], muted });

describe('a click on an own piece removes it', () => {
  it('with the same piece in hand, remove', () => {
    expect(accionDeClick(pieza('1', 'N'), 'N', false)).toBe(EDICION.quitar);
  });

  it('AC-BRD-007 — the decision is taken on the CLICKED cell, so with two `N` pieces the clicked one is edited', () => {
    const primera = pieza('1', 'N');
    const segunda = pieza('2', 'N');
    expect(accionDeClick(primera, 'N', false)).toBe(EDICION.quitar);
    expect(accionDeClick(segunda, 'N', false)).toBe(EDICION.quitar);
    expect(primera.id).not.toBe(segunda.id);
  });
});

describe('a click on ANOTHER piece does nothing', () => {
  it('AC-BRD-009 — without Alt and with Alt, neither one edits', () => {
    expect(accionDeClick(pieza('1', 'L'), 'N', false)).toBeNull();
    expect(accionDeClick(pieza('1', 'L'), 'N', true)).toBeNull();
  });
});

describe('`Alt`+click on an own piece toggles the mute', () => {
  it('AC-BRD-010 — it mutes the piece that sounds and unmutes the muted piece: a toggle, not a set', () => {
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
    // `in` reads the prototype chain: these are keys of `Object.prototype`.
    for (const key of ['toString', 'constructor', 'valueOf']) {
      expect(piezaDeTecla(key), key).toBeNull();
    }
  });
});

describe('a modifier gives the letter back to the browser', () => {
  it('AC-BRD-018 — with `ctrlKey`, `metaKey` or `altKey` the letter does not select', () => {
    // `F` is a pentomino, and `Ctrl`+`F` is the find shortcut.
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', [mod]: true })), mod).toBeNull();
    }
  });

  it('AC-BRD-018 — the `keyup` of a letter does not select either, even when it arrives with no modifier', () => {
    expect(accionDeTecla(tecla({ key: 'v', tipo: 'keyup' }))).toBeNull();
    expect(accionDeTecla(tecla({ key: 'V', tipo: 'keyup', ctrlKey: true }))).toBeNull();
  });
});

describe('AC-BRD-019 — what the letter does NOT do', () => {
  it('with the focus on a control of a panel it does not select', () => {
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', targetEsControl: true }))).toBeNull();
  });

  it('with auto-repeat it does not select', () => {
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', repeat: true }))).toBeNull();
  });

  it('no letter blocks the default', () => {
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
    expect(abreTapLimpio({ key: 'f', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
    expect(abreTapLimpio({ key: 'F', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
  });
});

describe('with a cell focused the letter STILL selects', () => {
  it('AC-BRD-021 — `targetEsCelda` does not enter the branch of the letters, and it does enter the branch of the space bar', () => {
    expect(accionDeTecla(tecla({ key: 'f', tipo: 'keydown', targetEsCelda: true }))).toBe(ACCION.seleccionar);
    expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', targetEsCelda: true }))).toBeNull();
  });
});

describe('the space bar, `Shift` and `Ctrl` keep their gestures', () => {
  it('AC-BRD-028 — the space bar still toggles the transport with `Ctrl`, `Alt` or `Meta` down', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(accionDeTecla(tecla({ key: ' ', tipo: 'keydown', [mod]: true })), mod).toBe(ACCION.transporte);
    }
  });

  it('AC-BRD-024 — `Shift` and `Control` still rotate and reflect at the end of a clean tap', () => {
    expect(accionDeTecla(tecla({ key: 'Shift', tipo: 'keyup' }))).toBe(ACCION.rotar);
    expect(accionDeTecla(tecla({ key: 'Control', tipo: 'keyup' }))).toBe(ACCION.reflejar);
  });
});
