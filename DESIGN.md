# The visual language

What each thing on the screen says, and what it does not say on purpose. A contract in `specs/`
says what the instrument shows. This document gives the rule and its reason, for the next element.

No value lives here. The twelve colors are in [`palette.ts`](./src/pieces/palette.ts), the measures
of the tile in [`grid-fit.ts`](./src/board-fit/grid-fit.ts), the widths of the playhead in
[`playhead-loop.ts`](./src/playback/playhead-loop.ts), and the background color in
[`index.css`](./src/styles/index.css).

## Color says identity, never state

Each piece has one color and one tonic: one identity, seen and heard. The letter names the shape
and not the sound. Piece `F` has tonic C, so its lime is the color of a C.

- **Hue says which piece it is, and never what occurs.** A state uses a neutral: white, gray, pink
  or dark slate. The ghost is gray and not green, because green was one more color in competition
  with the twelve.
- **State wins over identity.** Where a state and a piece color meet in one cell, the state shows.
- **The twelve backgrounds are sampled from the reference sheet, and nobody retouches them.** When
  a color causes a problem, change what is around it: the text color, a border, the criterion.
- **A piece color is a background, never a text color.** As text on white, the yellow of `V` has a
  contrast ratio of 1.07.
- **The color carries the piece, so the text is free.** An occupied cell does not repeat the letter
  of its piece five times. It shows its own note.
- **The background of a control says "selected", so it never takes a piece color.** A slot paints
  the piece color on its thumbnail. With the color on the slot background, the dock cannot say
  which piece is in hand.

## Contrast: APCA for text, 3:1 for a shape

The text on a piece color is black or white, the one with more contrast for that background. The
criterion is APCA with a floor of Lc 60, and not the ratio of WCAG 2.1. The ratio chose black on the
saturated mid-tone backgrounds, where white reads better. On the red of `T` the ratio gives black
5.25 and white 4.00, and APCA gives black Lc 40.0 and white Lc 69.6. The new criterion gave white
text to six pieces, and no color of the reference sheet became darker. Two pieces stay below the
floor. The numbers and the cost are in
[the decision](./docs/architecture/decisions/2026-10-04-apca-chooses-the-text-color.md).

A shape with no text is a graphic object. It answers to WCAG 1.4.11, a ratio of 3:1 against the
surface behind it, and not to APCA.

## What a cell shows

- **The note name is the main content, and the step is a small number in a corner.** The note is
  what sounds. The step is when it sounds, and the steps 0 to 4 draw the path of the arpeggio
  through the shape.
- **The number is the step and not the degree, because a number on screen follows what the eye sees
  move.** On a reflected piece the playhead enters at degree 4 and counts down. The note name says
  the tonic, and a reflection does not move a note name.
- **A cell is a rounded tile with a gap around it, not a box of a table.** A placed piece reads as
  five tiles that rest on the grid, as on the reference sheet.
- **The board is drawn by its cells, not by a filled background.** Each tile has a dark border,
  occupied or empty. A light border on white cells was almost invisible. A painted board surface,
  gray and then black, was tried and rejected: it takes the lead from the twelve colors, and they
  are the only thing the board is there to say.
- **What is typographic scales with the cell. A hairline does not.** If only the text grows, at a
  cell of 180 px the note name is tight against a gap of 2 px, and the tile reads as a box again.
  A border is a delimiter. A proportional border gives fractions of a pixel that the browser rounds
  differently on each edge, and adjacent tiles show an irregular lattice.

## The channels of a cell

| Channel | What it says |
|---|---|
| Background hue of the tile | which piece it is |
| White tile that keeps its text | a muted piece |
| Light gray tile | the ghost of a legal placement |
| Pink tile | a placement that does not fit |
| Border thickness of the tile | the playhead: a note, a crossing or a click |
| Translucent white cover with a dashed border | the veil: the cell did not sound yet |
| The gap, in the outer box of the cell | the focus ring, in two tones |

**No channel is free.** The next state must take a channel from another state, and this table
must say which one.

- **Mute is the absence of color.** The two obvious channels were taken. Color is identity, and a
  desaturated color breaks the measured contrast with its text. Opacity belongs to the veil: a
  dimmed muted piece would look the same as a new piece that waits for its turn.
- **A muted cell is not a free cell, because a free cell has no text.** Its text is gray: the
  text color of a piece is chosen against its own background, and on white several are illegible.
- **Never mark a cell with `transform: scale`.** A scaled box counts for the overflow of its
  container. Measured with a cell of 63 px and `scale(1.10)` on the last cell: the scroll height of
  the board went from 378 to 381 px, and two scrollbars appeared. An `outline` and a `box-shadow`
  paint outside the box and do not make it larger.

## The playhead: state goes to the border

The playhead thickens the border of the tile, inward and outward, in dark slate. It adds no fill,
no hue and no scale. A lighter cell disappears on a light board, and a dark fill covers the note
name. The alternatives and their measurements are in
[the decision](./docs/architecture/decisions/2026-10-04-the-playhead-thickens-the-border.md).

- **The three events differ by the amount of border and by nothing else:** a note is the thickest,
  a crossing is in the middle, and a click is the thinnest and stays inside its cell. If two looked
  the same, the circuit would show a piece where there is none, or a pass would look like a turn.
- **The mark of a click shows also with the click switch off.** The switch belongs to the mix, not
  to the circuit.
- **The veil covers a cell, and lifts cell by cell, not piece by piece.** That is the only thing on
  screen that shows that the play order is not the placement order.

## The floating panels

- **A panel over the board is translucent, with a blur.** There are cells with notes under it. An
  opaque panel hides them, and a translucent panel says that they are there.
- **A panel opens unfolded.** An instrument that opens with its controls hidden is not discovered.
  A folded panel keeps its header, so it still says what it is.
- **A slot shows the shape of its piece, not only the letter.** The letters are arbitrary names:
  `N` does not look like an N, and `V` and `L` are one shape with an arm of a different length.
- **A thumbnail says no note and no step.** The dock answers which piece and how it is turned. The
  board answers what sounds. A separate preview of the piece in hand was removed: the ghost shows
  the same piece where it will land, with its notes. Two views of one object, where one is strictly
  better, cost screen height and say nothing.
- **A control does not move when the user touches it.** A panel that rearranges itself moves the
  button at the moment the user presses it. So a part with variable content reserves its worst
  case: one fixed box for every thumbnail, and one line height for every readout text.
- **The border of a thumbnail cell changes with the state of its slot.** Against the light slot, 7
  of the 12 colors are below 3:1, and the worst is `V` with 1.02. Against the dark slot only `W` is,
  with 2.08. The two sets share no piece, and no single border color serves the two slots: the dark
  border has 1.00 on the dark slot, and the light border has 2.34 on the light slot.
