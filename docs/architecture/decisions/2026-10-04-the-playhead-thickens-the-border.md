# The playhead thickens the border of the tile: no fill, no hue, no scale

**Recorded 2026-10-04.** The decision is older: it came with the playhead.

The playhead marks the cell of the event that sounds now. That cell already shows a piece color, a
note name and a step. The mark must show on each of the twelve colors and on a white cell, and it
must not hide the note name.

**Decision: the playhead thickens the border of the tile, inward and outward, in dark slate.** It
changes no fill, no hue and no size. A note, a crossing and a click differ by the amount of border.
The widths are in [`playhead-loop.ts`](../../../src/playback/playhead-loop.ts).

What was weighed:

- **A lighter cell.** A sequencer with a dark background lights the active step, as an LED. This
  board is light, and its empty cells are white. A cell that gets lighter disappears: the yellow
  of `V` goes to white.
- **A dark fill.** It shows. Measured with a fill of 30 %: the worst of the twelve colors, the blue
  of `W`, changes its L\* by 8.8, against a threshold of about 3. But the fill covers the note
  name, which is what the user must read.
- **`transform: scale`.** A scaled box counts for the overflow of its container. Measured with a
  cell of 63 px, a board of 630 × 378 px, the playhead on the last cell and `scale(1.10)`: the
  scroll height of the board container went from 378 to 381 px, and two scrollbars appeared. A
  `box-shadow` paints outside the box and does not make it larger.
- **A piece color for the mark.** Hue says which piece a cell is. It never says what occurs.
- **A border that grows inward only.** Each tile already has a dark border, so it is a change of
  degree in a field of dark borders. The outer ring adds the change of size.

The cost:

- **Thickness is the only channel of the playhead.** Three kinds of event share it, and nothing
  else tells them apart.
- **The widths are fixed pixels and do not scale with the cell.** Each one is a step above the
  border of the tile, which is fixed too. On a larger cell the mark is thinner in proportion.
- **The border of the tile is spent.** The focus ring could not use it and went to the outer box of
  the cell. After it, a cell has no free channel.
- **The measurement of `scale` is old.** The board container that scrolled is gone. Today the root
  clips, so the symptom would be a cell cut at the edge of the board and not a scrollbar. Nobody
  measured it again at the current cell size. The mechanism is the same.
