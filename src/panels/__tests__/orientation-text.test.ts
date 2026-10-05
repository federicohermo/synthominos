import { describe, it, expect } from 'vitest';
import { textoDeOrientacion } from '../orientation-text.ts';
import { miniCells } from '../../pieces/piece-mini.ts';
import type { PieceKey } from '../../pieces/pieces.ts';

/**
 * The orientation readout: the line of text that says the orientation of the piece in hand.
 *
 * The thing to verify is not the interpolation, which is a `* 90`, but the criterion that
 * justifies it: for the six pieces where the thumbnail CANNOT say the orientation, two
 * orientations that look the same give different texts. The pure function does not get the
 * piece, so that claim is falsifiable only when crossed with `miniCells`.
 */

/** The visible format, composed as `PiecePalette.tsx` composes it. */
const visible = (rotation: number, mirror: boolean) => {
  const { grados, reflejada } = textoDeOrientacion(rotation, mirror);
  return reflejada === null ? grados : `${grados} · ${reflejada}`;
};

describe('textoDeOrientacion: the eight combinations', () => {
  it('AC-PNL-016 — not reflected, it says the degrees and nothing else', () => {
    expect([0, 1, 2, 3].map(r => textoDeOrientacion(r, false))).toEqual([
      { grados: '0°', reflejada: null },
      { grados: '90°', reflejada: null },
      { grados: '180°', reflejada: null },
      { grados: '270°', reflejada: null },
    ]);
  });

  it('AC-PNL-016 — reflected adds the word, and the degrees do not change', () => {
    // The reflection does not rotate: it is another transform, and the text says it with
    // one more word, not with a change of the number.
    expect([0, 1, 2, 3].map(r => textoDeOrientacion(r, true))).toEqual([
      { grados: '0°', reflejada: 'reflejada' },
      { grados: '90°', reflejada: 'reflejada' },
      { grados: '180°', reflejada: 'reflejada' },
      { grados: '270°', reflejada: 'reflejada' },
    ]);
  });

  it('AC-PNL-016 — the eight are different from each other', () => {
    const ocho = [false, true].flatMap(m => [0, 1, 2, 3].map(r => visible(r, m)));
    expect(new Set(ocho).size).toBe(8);
  });
});

describe('where the thumbnail cannot say it, the text can', () => {
  /** The six pieces whose shape does not tell the eight orientations apart. */
  const CIEGAS: PieceKey[] = ['I', 'T', 'U', 'V', 'W', 'X'];

  /** The shape of an orientation as a comparable string: the thumbnail does not order cells. */
  const forma = (p: PieceKey, r: number, m: boolean) =>
    miniCells(p, r, m).map(([x, y]) => `${x},${y}`).sort().join('|');

  it('AC-PNL-017 — for `I T U V W X` some pairs have the SAME shape, so the criterion is not vacuous', () => {
    // With zero pairs the test below would pass and verify nothing: this test guards the
    // guard.
    const pares = CIEGAS.flatMap(p => {
      const ocho = [false, true].flatMap(m => [0, 1, 2, 3].map(r => ({ r, m, f: forma(p, r, m) })));
      return ocho.flatMap((a, i) => ocho.slice(i + 1).filter(b => b.f === a.f).map(b => ({ p, a, b })));
    });
    expect(pares.length).toBeGreaterThan(0);
    // The `X` is the extreme witness: one shape for the eight orientations, so 28 pairs
    // that look the same from that piece alone.
    expect(pares.filter(x => x.p === 'X')).toHaveLength(28);
  });

  it('AC-PNL-017 — each of those pairs gives different texts', () => {
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
