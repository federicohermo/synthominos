# The circuit between pieces

## Sub-features

- With two or more pieces, the cycle visits each one and walks the cells between them.
- The switch `Recorrido en el vacío` makes the walk over empty cells sound.
- A walk over a placed piece sounds the note of the cell it enters.
- The playhead thickens the border of the cell that sounds.

## How to get to it (user POV)

Place two pieces apart, press the switch, press play.

## Driving it with Playwright

`app.button('Recorrido en el vacío').click()` sets `aria-pressed="true"`. No proof exists yet.

## Gotchas

- The order of the circuit comes from the geometry, not from the order of placement. To know
  what a board must sound, ask the `pentomino-domain` MCP tool `simulate_board`.
- The playhead is drawn outside React, on nodes with no accessible name. A proof must read the
  computed border width of a cell, or compare two screenshots.
