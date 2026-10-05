# Keyboard

## Sub-features

- The letter of a piece chooses it.
- The space bar starts and stops the transport.
- The board is one tab stop: the arrow keys move inside it, and `Enter` or the space bar on a cell
  edits it as a click does.

## How to get to it (user POV)

Press a letter from `F I L N P T U V W X Y Z`, or the space bar, with the focus outside a control.

## Driving it with Playwright

`app.key('w')`, `app.blur()`, `app.key('Space')`.

End state: the slot of `W` has `aria-pressed="true"`, and the transport button reads `Pausa`.

## Gotchas

- The space bar on a focused cell edits the cell and does not move the transport. Take the focus
  from the cell first with `app.blur()`: a focus call on the `body` leaves it on the cell.
- The proof does not cover the arrow keys nor an edit from the keyboard.
