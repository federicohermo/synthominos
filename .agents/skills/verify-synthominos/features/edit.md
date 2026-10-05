# Mute, remove, reset

## Sub-features

- `Alt`+click on a placed piece mutes it, and again gives it its sound back.
- A click on a placed piece removes it.
- The reset button empties the board and stops the transport.

## How to get to it (user POV)

Place a piece, then click it with or without `Alt`. The reset button is in the transport.

## Driving it with Playwright

`app.cell(6, 3).click({ modifiers: ['Alt'] })`, `app.cell(6, 3).click()`,
`app.button('Vaciar el tablero y frenar el transporte').click()`.

End state: the cell name holds `pieza L muteada`, then the live region says
`pieza L quitada de fila 4, columna 7` and the cell name ends in `libre`.

## Gotchas

- After a reset the live region still holds the last edit: read the cells, not the region.
- The proof does not cover that reset stops a transport that plays.
