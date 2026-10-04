import { describe, it, expect } from 'vitest';
import { textoDeOrientacion } from '../orientation-text.ts';
import { miniCells } from '../../pieces/piece-mini.ts';
import type { PieceKey } from '../../pieces/pieces.types.ts';

/**
 * La línea que el panel pone en lugar de los cuatro botones de grados.
 *
 * Lo que hay para verificar no es la interpolación —eso es un `* 90`— sino el criterio que
 * la justifica: que para las seis piezas donde la miniatura NO puede decir la orientación,
 * dos orientaciones indistinguibles a la vista den textos distintos. La pura no recibe la
 * pieza, así que esa afirmación sólo es falsable cruzándola con `miniCells`.
 */

/** El formato visible, compuesto como lo compone `PiecePalette.tsx`. */
const visible = (rotation: number, mirror: boolean) => {
  const { grados, reflejada } = textoDeOrientacion(rotation, mirror);
  return reflejada === null ? grados : `${grados} · ${reflejada}`;
};

describe('textoDeOrientacion — las ocho combinaciones', () => {
  it('AC-PNL-016 — sin reflejar dice los grados y nada más', () => {
    expect([0, 1, 2, 3].map(r => textoDeOrientacion(r, false))).toEqual([
      { grados: '0°', reflejada: null },
      { grados: '90°', reflejada: null },
      { grados: '180°', reflejada: null },
      { grados: '270°', reflejada: null },
    ]);
  });

  it('AC-PNL-016 — reflejada agrega la palabra, y los grados no cambian', () => {
    // La reflexión no rota: el espejo es otra transformación y el texto lo dice sumando,
    // no corrigiendo el número.
    expect([0, 1, 2, 3].map(r => textoDeOrientacion(r, true))).toEqual([
      { grados: '0°', reflejada: 'reflejada' },
      { grados: '90°', reflejada: 'reflejada' },
      { grados: '180°', reflejada: 'reflejada' },
      { grados: '270°', reflejada: 'reflejada' },
    ]);
  });

  it('AC-PNL-016 — las ocho son distintas entre sí', () => {
    const ocho = [false, true].flatMap(m => [0, 1, 2, 3].map(r => visible(r, m)));
    expect(new Set(ocho).size).toBe(8);
  });
});

describe('donde la miniatura no puede decirlo, el texto sí', () => {
  /** Las seis piezas cuya forma no distingue las ocho orientaciones. */
  const CIEGAS: PieceKey[] = ['I', 'T', 'U', 'V', 'W', 'X'];

  /** La forma de una orientación como cadena comparable: la miniatura no ordena celdas. */
  const forma = (p: PieceKey, r: number, m: boolean) =>
    miniCells(p, r, m).map(([x, y]) => `${x},${y}`).sort().join('|');

  it('AC-PNL-017 — para `I T U V W X` hay pares con la MISMA forma, o sea que el criterio no es vacuo', () => {
    // Si esto diera cero pares, el test de abajo pasaría sin verificar nada: es el
    // guardián del guardián.
    const pares = CIEGAS.flatMap(p => {
      const ocho = [false, true].flatMap(m => [0, 1, 2, 3].map(r => ({ r, m, f: forma(p, r, m) })));
      return ocho.flatMap((a, i) => ocho.slice(i + 1).filter(b => b.f === a.f).map(b => ({ p, a, b })));
    });
    expect(pares.length).toBeGreaterThan(0);
    // La `X` es el testigo extremo: una sola forma para las ocho orientaciones, o sea
    // 28 pares indistinguibles ella sola.
    expect(pares.filter(x => x.p === 'X')).toHaveLength(28);
  });

  it('AC-PNL-017 — cada uno de esos pares da textos distintos', () => {
    for (const p of CIEGAS) {
      const ocho = [false, true].flatMap(m => [0, 1, 2, 3].map(r => ({ r, m, f: forma(p, r, m) })));
      for (const [i, a] of ocho.entries()) {
        for (const b of ocho.slice(i + 1)) {
          if (a.f !== b.f) continue;
          expect(visible(a.r, a.m), `${p} ${a.r}/${a.m} vs ${b.r}/${b.m}`)
            .not.toBe(visible(b.r, b.m));
        }
      }
    }
  });
});
