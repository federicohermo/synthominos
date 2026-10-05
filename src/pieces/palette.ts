import type { PieceKey } from './pieces.ts';

/** `bg` comes from the reference sheet. `fg` is the better of black and white by APCA, not by WCAG 2.1. */
export const PIECE_COLOR: Record<PieceKey, { bg: string; fg: string }> = {
  F: { bg: '#D9E021', fg: '#000000' },
  I: { bg: '#ED1E79', fg: '#FFFFFF' },
  L: { bg: '#29ABE2', fg: '#FFFFFF' },
  N: { bg: '#8CC63F', fg: '#000000' },
  P: { bg: '#F15A24', fg: '#FFFFFF' },
  T: { bg: '#FF0000', fg: '#FFFFFF' },
  U: { bg: '#009245', fg: '#FFFFFF' },
  V: { bg: '#FFFF00', fg: '#000000' },
  W: { bg: '#0000FF', fg: '#FFFFFF' },
  X: { bg: '#00A99D', fg: '#FFFFFF' },
  Y: { bg: '#FF7BAC', fg: '#000000' },
  Z: { bg: '#FBB03B', fg: '#000000' },
};

/** APCA Lc, the minimum for body text. */
export const CONTRAST_LC = 60;

/** The pieces whose `bg` does not reach `CONTRAST_LC` with any `fg`. */
export const LC_EXCEPCIONES = ['L', 'Y'] as const;
