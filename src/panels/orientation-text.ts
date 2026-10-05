/**
 * The orientation of the piece in hand, in words.
 *
 * It exists because the thumbnail **cannot say all of it**, and that is measured: of the 96
 * combinations of piece × rotation × reflection, **29 sound different and look the same**
 * (30 %, spread over 6 of the 12 pieces). The `I` has two shapes for four rotations and the
 * `X` has one for the four. The reflection adds no shape to `I`, `T`, `U`, `V`, `W` or `X`.
 * Four rotations of an `X` give four different arpeggios (`A4 B4 C#5 E5 F#5` at 0°,
 * `E5 F#5 G#5 B5 C#6` at 270°) and no visible change.
 *
 * The dock has no button that turns a piece: the wheel and `Shift` do that. A button that
 * also informs is two things. The dock needs only the second, and a line of text cannot be
 * pressed.
 *
 * ## Why it is in a `.ts` and not inside the `.tsx`
 *
 * `react-refresh/only-export-components` forbids a `.tsx` to export anything but the
 * component. Inside `PiecePalette.tsx` this pure function could not be exported, so it could
 * not be tested. `cell-text.ts` and `piece-mini.ts` are separate modules for the same reason.
 *
 * And not in `cell-text.ts`: that file answers what a CELL OF THE BOARD says, and its type
 * crosses to `Board.tsx`. Here the question is what the dock says of the piece in hand.
 */

/**
 * The two fragments of the orientation: the degrees, and the word «reflejada» or `null`.
 *
 * **Fragments and not a finished string.** That is the whole decision of this file: the two
 * readers write the orientation in different ways, and neither can give way.
 *
 * ```
 * the visible line of the dock     180° · reflejada
 * the `aria-label` of the slot     X, rotación 180°, reflejada
 * ```
 *
 * The visible format in the `aria-label` would remove the noun «rotación» and add a
 * separator that the screen reader spells out. The format of the `aria-label` in the visible
 * line would make a long sentence in a row that must fit in one line.
 *
 * What the two share is the DERIVATION: the `* 90` and the condition of the reflection. Each
 * `.tsx` composes its format from these two fragments.
 *
 * The type is inline in the signature and not in a separate module: it is not a props type
 * that two components pass, it is the shape of the return of one function. The precedent is
 * `reflejaElContextMenu(e: { ctrlKey: boolean })` in `input.ts`.
 */
export function textoDeOrientacion(
  rotation: number,
  mirror: boolean,
): { grados: string; reflejada: string | null } {
  return { grados: `${rotation * 90}°`, reflejada: mirror ? 'reflejada' : null };
}
