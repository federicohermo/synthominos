# Place a piece and hear it

## Sub-features

- A click on a free cell places the chosen piece, with its grip cell on that cell.
- A placement that does not fit, or that covers a piece, places nothing.
- Play starts the cycle, and pause stops it.

## How to get to it (user POV)

Choose a piece in the palette, click a cell of the board, press play.

## Driving it with Playwright

`app.piece('T').click()`, `app.cell(4, 4).click()`, `app.button('Reproducir').click()`.

End state: the live region says `pieza T colocada en fila 5, columna 5`, the cell name holds
`pieza T, nota …`, the button reads `Pausa`, and `app.litPixels()` is above zero.

## Gotchas

- The click places the grip cell, not the corner of the bounding box. The other four cells depend
  on the shape: read their names, do not compute them.
- The spectrum needs about one second of play before it paints.
- The proof does not cover a refused placement.
