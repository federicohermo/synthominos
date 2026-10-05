import type { PieceKey } from './pieces.ts';

/**
 * The color of each piece: the background, and the text that goes on it.
 *
 * The 12 backgrounds come from the reference sheet and are MEASURED, not derived. A
 * formula (a hue wheel, equally spaced HSL) gives other colors and breaks the match with
 * the sheet.
 *
 * It is ONE record `Record<PieceKey, ...>` and not two parallel tables, for the same
 * reason that `BASE_MAP` is typed and is not `as const`: a piece added with no color is a
 * compile error, and `bg` and `fg` cannot go out of step by index because they travel
 * together.
 *
 * `fg` is always black or white, the better of the two against `bg`. It is stored and not
 * computed in the render: the WCAG luminance calculation has no reason to run 60 times in
 * a frame and return the same result each time. The test `__tests__/palette.test.ts`
 * keeps it in step with `bg`: it computes the contrast again from `bg` and does not trust
 * this table.
 *
 * ## The criterion is APCA, not WCAG 2.1
 *
 * The contrast ratio of WCAG 2.1 (the quotient of relative luminances, floor 4.5:1)
 * chooses the wrong `fg` here. The 12 colors were MEASURED with the two models, and the
 * trigger was the board itself: the saturated mid-tone backgrounds visibly asked for
 * white text while the 2.1 ratio said black.
 *
 * The 2.1 ratio weights green at 71.5% and red at 21.3%, and is known to predict badly
 * exactly there: saturated reds, magentas and cyans. The numbers of the repo show it with
 * no ambiguity. On `T` (`#FF0000`), 2.1 gives black 5.25 against white 4.00, so "black
 * wins", and APCA gives black 37.6 against white 69.6. The floor of APCA for body text is
 * Lc 60: the black that 2.1 chooses does not reach it.
 *
 * So `fg` is the better of black and white BY APCA (the algorithm of WCAG 3), and the
 * number next to each line is its Lc. The `bg` values are those of the sheet, untouched:
 * the APCA criterion is what makes it possible NOT to darken four colors to make room for
 * white.
 *
 * ## The two marginal ones
 *
 * `L` (55.8) and `Y` (56.9) do not reach Lc 60 with any text color. The `bg` lacks the
 * contrast, not the `fg`, so no choice of `fg` fixes them, and to raise them the color of
 * the sheet must move. They are noted here and the test has them as an explicit
 * exception, so that it is a visible debt and not an oversight.
 */
export const PIECE_COLOR: Record<PieceKey, { bg: string; fg: string }> = {
  F: { bg: '#D9E021', fg: '#000000' },   // Lc 83.1 with black
  I: { bg: '#ED1E79', fg: '#FFFFFF' },   // Lc 71.9 with white (black gives 37.6)
  L: { bg: '#29ABE2', fg: '#FFFFFF' },   // Lc 55.8: marginal, see above
  N: { bg: '#8CC63F', fg: '#000000' },   // Lc 64.3
  P: { bg: '#F15A24', fg: '#FFFFFF' },   // Lc 65.6 with white (black gives 43.9)
  T: { bg: '#FF0000', fg: '#FFFFFF' },   // Lc 69.6 with white (black gives 40.0)
  U: { bg: '#009245', fg: '#FFFFFF' },   // Lc 72.5 with white (black gives 37.1)
  V: { bg: '#FFFF00', fg: '#000000' },   // Lc 101.4
  W: { bg: '#0000FF', fg: '#FFFFFF' },   // Lc 90.7 with white
  X: { bg: '#00A99D', fg: '#FFFFFF' },   // Lc 60.4 with white (black gives 48.9)
  Y: { bg: '#FF7BAC', fg: '#000000' },   // Lc 56.9: marginal, see above
  Z: { bg: '#FBB03B', fg: '#000000' },   // Lc 69.4
};

/**
 * The contrast floor of the repo for text on a piece color: APCA Lc 60, the minimum for
 * body text.
 *
 * It takes the place of the 4.5 of WCAG 2.1 AA, for the reason measured above. `L` and
 * `Y` do not reach it, and the test excepts them.
 */
export const CONTRAST_LC = 60;

/** The pieces whose `bg` does not reach `CONTRAST_LC` with any `fg`. It is debt, not design. */
export const LC_EXCEPCIONES = ['L', 'Y'] as const;
