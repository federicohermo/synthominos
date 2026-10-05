# The circuit between pieces

## Sub-features

- With two or more pieces, the circuit visits each one, and a leg goes from one piece to the next.
- The click switch, `Recorrido en el vacío`, makes the clicks sound: the events of a leg on a cell
  with no note.
- A crossing sounds the note of the placed cell that a leg enters, with the click switch on or off.
  Over a muted piece it is a click.
- The playhead thickens the border of the cell that sounds.

## How to get to it (user POV)

Place two pieces apart, press the click switch, press play.

## Driving it with Playwright

`app.button('Recorrido en el vacío').click()` sets `aria-pressed="true"`. No proof exists yet.

## Gotchas

- The order of the circuit comes from the geometry, not from the order of placement. To know
  what a board must sound, ask the `pentomino-domain` MCP tool `simulate_board`.
- The playhead is drawn outside React, on nodes with no accessible name. A proof must read the
  computed border width of a cell, or compare two screenshots.
