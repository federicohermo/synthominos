# The circuit between pieces

## Sub-features

- With two or more pieces, the circuit visits each one, and a leg goes from one piece to the next.
- The click switch, `Recorrido en el vacío`, makes the clicks sound: the events of a leg on a cell
  with no note.
- A crossing sounds the note of the placed cell that a leg enters, with the click switch on or off.
  Over a muted piece it is a click.
- The playhead marks the cell that sounds. A note and a crossing draw outside the cell. A click
  does not.

## How to get to it (user POV)

Place two pieces apart, press the click switch, press play.

## Driving it with Playwright

`prove.ts circuit` places T and L at the two ends of row 4, presses the click switch and play, and
follows the playhead. `app.playhead()` gives the name of the cell the playhead marks, and `outer`:
whether the mark goes outside the cell. The proof passes when the playhead marked a cell of each
piece with `outer`, and a free cell without it.

## Gotchas

- The order of the circuit comes from the geometry, not from the order of placement. To know
  what a board must sound, ask the `pentomino-domain` MCP tool `simulate_board`.
- The proof does not hear a click: a note that rings covers it in the spectrum. It proves the mark,
  not the sound.
- No proof drives a crossing or a muted piece yet.
