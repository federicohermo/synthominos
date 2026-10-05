# Keyboard

## Sub-features

- The letter of a piece chooses it.
- The space bar starts and stops the transport.
- The board is one tab stop: the arrow keys move inside it, and `Enter` or the space bar on a cell
  edits it as a click does.

## How to get to it (user POV)

Press a letter from `F I L N P T U V W X Y Z`, or the space bar, with the focus outside a control.

## Driving it with Playwright

`app.page.keyboard.press('w')`, `app.page.keyboard.press('Space')`.

End state: the palette button of `W` has `aria-pressed="true"`, and the transport button reads
`Pausa`.

## Gotchas

- The space bar on a focused cell edits the cell and does not move the transport. Move the focus
  to the `body` first.
- The proof does not cover the arrow keys nor an edit from the keyboard.
