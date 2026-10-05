# Orient a piece

## Sub-features

- The wheel over the board, or a tap of `Shift`, rotates the piece in hand by 90°.
- A tap of `Control`, or a right click on the board, reflects it.
- The `0°` button returns the piece in hand to no rotation and no reflection.
- Each piece keeps its own orientation.
- The regime selector, `escala` and `orden`, changes what a rotation does to the notes.

## How to get to it (user POV)

Choose a piece, then turn the wheel over the board, tap `Shift` or `Control`, or right-click the
board.

## Driving it with Playwright

`app.cell(4, 4).hover()` then `app.wheel(100)`; `app.key('Shift')`; `app.key('Control')`;
`app.cell(4, 4).click({ button: 'right' })`;
`app.button('Volver esta pieza a 0° sin reflejar').click()`.

End state: the name of the slot of `F` reads `F, rotación 180°, reflejada` after `Control`, and
`F, rotación 0°` after the `0°` button.

## Gotchas

- The wheel rotates only while the pointer is over the board: hover a cell first.
- `Shift` and `Control` act on a clean tap. A key held with another key or with the wheel does
  nothing on release.
- The proof does not cover the regime selector, nor the orientation each piece remembers.
