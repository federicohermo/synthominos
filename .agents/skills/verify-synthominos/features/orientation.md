# Orient a piece

## Sub-features

- The wheel over the board, or a tap of `Shift`, rotates the chosen piece by 90°.
- A tap of `Control` reflects it.
- The `0°` button returns the chosen piece to no rotation and no reflection.
- Each piece keeps its own orientation.
- The two regime buttons, `escala` and `orden`, change what a rotation does to the notes.

## How to get to it (user POV)

Choose a piece, then turn the wheel over the board or tap `Shift` or `Control`.

## Driving it with Playwright

`app.cell(4, 4).hover()` then `app.page.mouse.wheel(0, 100)`; `app.page.keyboard.press('Shift')`;
`app.page.keyboard.press('Control')`; `app.button('Volver esta pieza a 0° sin reflejar').click()`.

End state: the name of the palette button, `F, rotación 180°, reflejada`.

## Gotchas

- The wheel rotates only while the pointer is over the board: hover a cell first.
- `Shift` and `Control` act on a clean tap. A key held with another key or with the wheel does
  nothing on release.
- The proof does not cover the regime buttons, nor the memory of each piece.
