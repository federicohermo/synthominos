import { describe, it, expect } from 'vitest';
import { PIECE_COLOR, CONTRAST_LC, LC_EXCEPCIONES } from '../palette.ts';
import { BASE_MAP } from '../../musical-model/music.ts';
import type { PieceKey } from '../pieces.ts';

const PIECES = Object.keys(BASE_MAP) as PieceKey[];

const NEGRO = '#000000';
const BLANCO = '#FFFFFF';

/** A plain 2.4 power, without the low linear segment of WCAG 2.1: it is the model of APCA. */
function luminanciaY(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const canal = (desplazamiento: number) => Math.pow(((n >> desplazamiento) & 255) / 255, 2.4);
  return 0.2126729 * canal(16) + 0.7151522 * canal(8) + 0.0721750 * canal(0);
}

function ablandar(y: number): number {
  return y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y;
}

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
    for (const p of LC_EXCEPCIONES) {
      const { bg } = PIECE_COLOR[p];
      const mejorPosible = Math.max(lc(NEGRO, bg), lc(BLANCO, bg));
      expect(mejorPosible, `${p} (${bg}) now reaches ${CONTRAST_LC}`).toBeLessThan(CONTRAST_LC);
    }
  });

  it('the pieces with white text are exactly I, L, P, T, U, W and X', () => {
    const blancas = PIECES.filter(p => PIECE_COLOR[p].fg === BLANCO).sort();
    expect(blancas).toEqual(['I', 'L', 'P', 'T', 'U', 'W', 'X']);
  });

  it('the 12 backgrounds are all different', () => {
    const bgs = PIECES.map(p => PIECE_COLOR[p].bg);
    expect(new Set(bgs).size).toBe(PIECES.length);
  });
});

// The Tailwind values of `bg-slate-100`, `bg-slate-900`, `border-slate-400` and `border-slate-900`,
// copied from `OrientationPanel.tsx`: a change of class there leaves this test green.
const BOTON_REPOSO = '#f1f5f9';
const BOTON_ACTIVO = '#0f172a';
const BORDE_CLARO = '#94a3b8';
const BORDE_OSCURO = '#0f172a';

const PISO_GRAFICO = 3;

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
    expect(bajoElPiso(BOTON_REPOSO)).toEqual(['F', 'L', 'N', 'V', 'X', 'Y', 'Z']);
    expect(razon(PIECE_COLOR.V.bg, BOTON_REPOSO)).toBeCloseTo(1.02, 2);
  });

  it('on the selected button another piece fails, and only one', () => {
    expect(bajoElPiso(BOTON_ACTIVO)).toEqual(['W']);
    expect(razon(PIECE_COLOR.W.bg, BOTON_ACTIVO)).toBeCloseTo(2.08, 2);
  });

  it('the two sets are DISJOINT, which forces the border to invert', () => {
    const enReposo = new Set(bajoElPiso(BOTON_REPOSO));
    const enActivo = bajoElPiso(BOTON_ACTIVO);
    expect(enActivo.filter(p => enReposo.has(p))).toEqual([]);
  });

  it('each border reaches the floor against the background where it IS USED', () => {
    expect(razon(BORDE_OSCURO, BOTON_REPOSO)).toBeGreaterThanOrEqual(PISO_GRAFICO);
    expect(razon(BORDE_CLARO, BOTON_ACTIVO)).toBeGreaterThanOrEqual(PISO_GRAFICO);
  });

  it('and neither of the two would do for the TWO backgrounds', () => {
    expect(razon(BORDE_OSCURO, BOTON_ACTIVO)).toBeCloseTo(1.0, 2);
    expect(razon(BORDE_CLARO, BOTON_REPOSO)).toBeLessThan(PISO_GRAFICO);
  });
});
