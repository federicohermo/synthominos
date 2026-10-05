import { describe, it, expect } from 'vitest';
import { PIECE_COLOR, CONTRAST_LC, LC_EXCEPCIONES } from '../palette.ts';
import { BASE_MAP } from '../../musical-model/music.ts';
import type { PieceKey } from '../pieces.ts';

/**
 * The text of each cell contrasts with the color of its piece.
 *
 * It is a test of the UI, and it is PURE: constants and arithmetic, with no DOM and no
 * React. It runs in the `environment: 'node'` that the rest of the repo uses.
 *
 * The formula is written again here on purpose. If `palette.ts` exported a `contraste()`
 * and the test called it, the test would verify that the table agrees with itself.
 * Computed again from `bg`, it verifies the one thing that matters: that `fg` is still
 * the better of black and white AFTER someone changes a `bg` and forgets the `fg`.
 *
 * ## Why APCA and not WCAG 2.1
 *
 * The contrast ratio of WCAG 2.1 with a floor of 4.5:1 chooses wrong: on the saturated
 * mid-tone backgrounds (`I`, `P`, `T`, `U`, `X`) it declares black the winner, with
 * numbers that APCA puts well below the floor of legibility. The detail, with the
 * measurements, is in the docblock of `palette.ts`. APCA is the candidate algorithm of
 * WCAG 3 and models polarity (light text on a dark background is not symmetric with its
 * inverse), which is exactly what 2.1 does not do and what this case needs.
 */

const PIECES = Object.keys(BASE_MAP) as PieceKey[];

const NEGRO = '#000000';
const BLANCO = '#FFFFFF';

/**
 * APCA luminance: a plain 2.4 power on the sRGB channel, without the low linear segment
 * of WCAG 2.1. It is not a portability slip. It is the model of APCA.
 */
function luminanciaY(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const canal = (desplazamiento: number) => Math.pow(((n >> desplazamiento) & 255) / 255, 2.4);
  return 0.2126729 * canal(16) + 0.7151522 * canal(8) + 0.0721750 * canal(0);
}

/** The soft clamp of blacks: without it, very dark backgrounds give an inflated Lc. */
function ablandar(y: number): number {
  return y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y;
}

/**
 * The APCA contrast (Lc) between text and background, as an absolute value.
 *
 * The exponents come in pairs and change with the polarity: 0.56/0.57 for dark text on a
 * light background, 0.65/0.62 for light text on a dark background. That asymmetry is the
 * basic difference from WCAG 2.1, which uses a quotient and so gives the same result in
 * the two directions.
 */
function lc(texto: string, fondo: string): number {
  const yTexto = ablandar(luminanciaY(texto));
  const yFondo = ablandar(luminanciaY(fondo));
  const s = yFondo > yTexto
    ? (Math.pow(yFondo, 0.56) - Math.pow(yTexto, 0.57)) * 1.14
    : (Math.pow(yFondo, 0.65) - Math.pow(yTexto, 0.62)) * 1.14;
  if (Math.abs(s) < 0.1) return 0;
  return Math.abs(s > 0 ? s - 0.027 : s + 0.027) * 100;
}

describe('PIECE_COLOR', () => {
  it('has one entry for each piece, with a 6-digit hex', () => {
    expect(Object.keys(PIECE_COLOR).sort()).toEqual([...PIECES].sort());
    for (const p of PIECES) {
      expect(PIECE_COLOR[p].bg).toMatch(/^#[0-9A-F]{6}$/);
      expect([NEGRO, BLANCO]).toContain(PIECE_COLOR[p].fg);
    }
  });

  it('the fg of each piece is the better of black and white against its bg', () => {
    // This is the test that keeps `bg` and `fg` in step, and the only one that applies to
    // the 12 with no exception: also where no `fg` reaches the floor, to choose the worse
    // of the two is still an error.
    for (const p of PIECES) {
      const { bg, fg } = PIECE_COLOR[p];
      const mejor = lc(NEGRO, bg) >= lc(BLANCO, bg) ? NEGRO : BLANCO;
      expect(fg, `${p} (${bg}) should use ${mejor}`).toBe(mejor);
    }
  });

  it('the 10 pieces that are not excepted reach the Lc floor with their fg', () => {
    for (const p of PIECES) {
      if ((LC_EXCEPCIONES as readonly string[]).includes(p)) continue;
      const { bg, fg } = PIECE_COLOR[p];
      expect(lc(fg, bg), `${p} (${bg})`).toBeGreaterThanOrEqual(CONTRAST_LC);
    }
  });

  it('the excepted pieces still do not reach the floor with ANY fg', () => {
    // The exception justifies itself or it has no justification. If someone makes the
    // `bg` of `L` or `Y` light enough, this test fails and forces its removal from the
    // list. An exception left with no reason is how exceptions become permanent.
    for (const p of LC_EXCEPCIONES) {
      const { bg } = PIECE_COLOR[p];
      const mejorPosible = Math.max(lc(NEGRO, bg), lc(BLANCO, bg));
      expect(mejorPosible, `${p} (${bg}) now reaches ${CONTRAST_LC}`).toBeLessThan(CONTRAST_LC);
    }
  });

  it('the pieces with white text are exactly I, L, P, T, U, W and X', () => {
    // It is not cosmetic: if another bg changes enough to ask for the other text color,
    // the change is not "one different color". It moves the balance of the whole sheet. A
    // fixed list makes that show in the review.
    const blancas = PIECES.filter(p => PIECE_COLOR[p].fg === BLANCO).sort();
    expect(blancas).toEqual(['I', 'L', 'P', 'T', 'U', 'W', 'X']);
  });

  it('the 12 backgrounds are all different', () => {
    // Two pieces with the same background would not be distinguishable on the board,
    // which is the one thing the color is there to do.
    const bgs = PIECES.map(p => PIECE_COLOR[p].bg);
    expect(new Set(bgs).size).toBe(PIECES.length);
  });
});

/**
 * The border of the palette thumbnail.
 *
 * ## Why WCAG 2.1 comes back here, after all of the above
 *
 * It is not a relapse: it is another criterion for another thing. The tests above choose
 * the color of the TEXT that goes on a piece color, and for that APCA predicts better.
 * That argument stands. A painted cell of the thumbnail is a GRAPHIC OBJECT: it carries
 * no text, and all it must do is stand out from the background it sits on. WCAG 1.4.11
 * covers that, and its floor is the 3:1 ratio of 2.1. To confuse the two criteria is to
 * read the wrong table.
 *
 * ## What this test fixes
 *
 * The numbers that the `.tsx` and `DESIGN.md` cite to justify that the border INVERTS
 * with the state of the button. The fact that makes it necessary is that the sets of
 * pieces that fail in each state are DISJOINT: no fixed border color covers the two, and
 * without this test that fact lives only in three comments that nothing keeps in step.
 *
 * A known LIMIT: the three hex values below are the values that Tailwind gives to the
 * classes that `OrientationPanel.tsx` writes, and they are copied. If that file changes
 * `bg-slate-900` for another class, this test stays green and measures the old
 * background. There is no way to read them from here without taking the backgrounds out
 * of the idiom of Tailwind.
 */
const BOTON_REPOSO = '#f1f5f9';   // `bg-slate-100`, the button not selected
const BOTON_ACTIVO = '#0f172a';   // `bg-slate-900`, the button selected
const BORDE_CLARO = '#94a3b8';    // `border-slate-400`, the border on the selected button
const BORDE_OSCURO = '#0f172a';   // `border-slate-900`, the border on the button at rest

const PISO_GRAFICO = 3;

/** The contrast ratio of WCAG 2.1: the quotient of relative luminances, with the low linear segment. */
function razon(a: string, b: string): number {
  const relativa = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const canal = (d: number) => {
      const c = ((n >> d) & 255) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(16) + 0.7152 * canal(8) + 0.0722 * canal(0);
  };
  const [alta, baja] = [relativa(a), relativa(b)].sort((x, y) => y - x);
  return (alta + 0.05) / (baja + 0.05);
}

describe('the border of the palette thumbnail', () => {
  const bajoElPiso = (fondo: string) =>
    PIECES.filter(p => razon(PIECE_COLOR[p].bg, fondo) < PISO_GRAFICO).sort();

  it('without the border, seven pieces do not show on the button at rest', () => {
    // The worst is `V` (#FFFF00) with 1.02: yellow on light gray is almost the same
    // color. It is the reason the thumbnail carries a border.
    expect(bajoElPiso(BOTON_REPOSO)).toEqual(['F', 'L', 'N', 'V', 'X', 'Y', 'Z']);
    expect(razon(PIECE_COLOR.V.bg, BOTON_REPOSO)).toBeCloseTo(1.02, 2);
  });

  it('on the selected button another piece fails, and only one', () => {
    // `W` (#0000FF) against the near black. The other eleven are light or saturated and
    // gain contrast when the background inverts. That is exactly why this case is easy to
    // miss: the state at rest looks perfect.
    expect(bajoElPiso(BOTON_ACTIVO)).toEqual(['W']);
    expect(razon(PIECE_COLOR.W.bg, BOTON_ACTIVO)).toBeCloseTo(2.08, 2);
  });

  it('the two sets are DISJOINT, which forces the border to invert', () => {
    // This is the statement that holds the whole decision. If one day a piece failed in
    // the two states, the way out would not be to invert the border but to move the color
    // of that piece.
    const enReposo = new Set(bajoElPiso(BOTON_REPOSO));
    const enActivo = bajoElPiso(BOTON_ACTIVO);
    expect(enActivo.filter(p => enReposo.has(p))).toEqual([]);
  });

  it('each border reaches the floor against the background where it IS USED', () => {
    expect(razon(BORDE_OSCURO, BOTON_REPOSO)).toBeGreaterThanOrEqual(PISO_GRAFICO);
    expect(razon(BORDE_CLARO, BOTON_ACTIVO)).toBeGreaterThanOrEqual(PISO_GRAFICO);
  });

  it('and neither of the two would do for the TWO backgrounds', () => {
    // The bug that the inverted border corrects, written as a test: `slate-900` on the
    // selected button gives exactly 1.00 because it is the same color as its background.
    // The border does not look bad: it does not exist. And the obvious candidate for the
    // two sides, `slate-400`, does not reach the floor on the light one either.
    expect(razon(BORDE_OSCURO, BOTON_ACTIVO)).toBeCloseTo(1.0, 2);
    expect(razon(BORDE_CLARO, BOTON_REPOSO)).toBeLessThan(PISO_GRAFICO);
  });
});
