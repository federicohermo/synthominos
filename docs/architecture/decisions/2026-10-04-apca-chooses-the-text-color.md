# APCA chooses the text color on a piece, not the WCAG 2.1 ratio

**Recorded 2026-10-04.** The decision is older: it came after the twelve colors were in the code.

An occupied cell shows its note name on the color of its piece, in black or in white. The twelve
backgrounds are sampled from the reference sheet, and the repo does not retouch them. The first
criterion was the contrast ratio of WCAG 2.1, with the AA floor of 4.5:1. On the board it chose
wrong: the saturated mid-tone backgrounds asked for white text, and the ratio said black.

**Decision: the text color is the better of black and white by APCA, and the floor is Lc 60, the
APCA minimum for body text.** The text color is stored next to its background in
[`palette.ts`](../../../src/pieces/palette.ts). It must stay the better of the two when someone
changes a background.

The two models were measured on the twelve backgrounds. The ratio weighs green at 71.5 % and red
at 21.3 %, and it gives the same number in the two polarities. APCA does not: light text on a dark
background is not the mirror of dark text on a light one. The six pieces whose text became white:

| Piece | Ratio, black | Ratio, white | APCA, black | APCA, white |
|---|---|---|---|---|
| `I` | 5.06 | 4.15 | Lc 37.6 | Lc 71.9 |
| `L` | 8.02 | 2.62 | Lc 53.4 | Lc 55.8 |
| `P` | 6.23 | 3.37 | Lc 43.9 | Lc 65.6 |
| `T` | 5.25 | 4.00 | Lc 40.0 | Lc 69.6 |
| `U` | 5.20 | 4.04 | Lc 37.1 | Lc 72.5 |
| `X` | 7.16 | 2.93 | Lc 48.9 | Lc 60.4 |

On each of the six, the black text that the ratio chose is below Lc 60. With APCA, 10 of the 12
pieces reach the floor with their text color. Under the ratio, white text needed darker
backgrounds, so white text and the colors of the reference sheet could not both stay.

The cost:

- **`L` (Lc 55.8) and `Y` (Lc 56.9) do not reach the floor with any text color.** The background
  lacks the contrast, not the text. To lift them is to move two colors of the reference sheet. They
  are a named exception, and the exception must stay necessary: when one of the two backgrounds
  reaches the floor, it leaves the list.
- **The six white texts are below 4.5:1 in the WCAG 2.1 ratio.** A tool that audits with that
  ratio reports them. APCA is the candidate method of WCAG 3, not a published standard, so the
  repo cannot claim AA for the text of those tiles.
- **Two criteria live in the repo.** APCA judges text on a piece color. A shape with no text, such
  as a thumbnail cell on its slot, still answers to WCAG 1.4.11 and its ratio of 3:1.
