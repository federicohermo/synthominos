---
schema_version: 1
capability_id: CAP-ACC
status: draft
owner: federicohermo
provenance: migrated from specs 025 (#87), 026 (#88), 050 (#142); full-board announcement from 031 (#93); open debt #48, #172
---

# Capability: accessibility

## Purpose

Makes the instrument playable without sight and without a mouse. It must get one thing right:
each state that the screen shows with color, the accessible tree also says, and each edit of the
board can be done and confirmed from the keyboard.

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Accessible tree** | what a screen reader reads: roles, names and states | DOM, markup |
| **Control** | a button or an input of the app. A board cell is not a control | widget, element |
| **Accessible name** | the name that the browser computes for a control | label, aria-label |
| **Visible label** | text on screen next to a control that says what the control is | caption, title |
| **Icon-only control** | a control that shows a glyph or a drawing and no word | icon button |
| **Toggle** | a control with two states, on and off | switch, checkbox |
| **Pressed state** | the state of a toggle, as the accessible tree exposes it | checked, active |
| **Tab stop** | a place that the Tab key stops on | focus stop |
| **Cell** | one square of the board, as the accessible tree exposes it | square, gridcell |
| **Pointed cell** | the cell that the ghost follows; the mouse or the keyboard focus sets it | cursor, hover |
| **Slot** | the button of one piece in the dock, with its thumbnail | thumbnail, tile |
| **Anchor cell** | the one cell of the board that Tab reaches | entry cell |
| **Focus ring** | the mark that shows which cell has keyboard focus | outline, highlight |
| **Edit** | a change of the board: place, place muted, remove, mute or unmute | action, move |
| **Announcement** | text that the live region gives to the screen reader after an edit | message, alert |
| **Live region** | the one region of the page that a screen reader reads when its text changes | toast, status |

## Normative behavior

### BR-ACC-001 — Language of the page

The page SHALL declare Spanish as its language. The interface text is in Spanish, and a screen
reader picks its voice from this declaration.

### BR-ACC-002 — Every control has a name

Each control in the accessible tree SHALL have an accessible name. The name SHALL contain at least
one letter or digit. A glyph, an arrow or a drawing alone is not a name.

### BR-ACC-003 — An icon-only control says what it does

An icon-only control SHALL have an accessible name that says what the control does. The drawing
inside the control SHALL be hidden from the accessible tree.

### BR-ACC-004 — The visible label is the name

WHEN a control has a visible label, the system SHALL take the accessible name from that label. The
system SHALL NOT write the same text a second time as a separate name.

### BR-ACC-005 — A toggle exposes its state

Each toggle SHALL expose its pressed state. Its accessible name SHALL say what it toggles. Its
name SHALL NOT be a state word such as on, off, yes or no.

### BR-ACC-006 — A single choice is a labelled group of toggles

A set of buttons where exactly one is chosen SHALL be one group, with an accessible name that says what the set chooses. Each button SHALL be a toggle, and exactly one SHALL be pressed. Each button SHALL
stay its own tab stop.

### BR-ACC-007 — The slots say their piece and its orientation

Each of the twelve slots SHALL be a toggle. Its name SHALL be the letter of its piece and then
the remembered orientation of that piece, in words. Exactly one slot SHALL be pressed: the
one of the piece in hand.

### BR-ACC-008 — The tempo value carries its unit

The tempo clock SHALL announce its value as the number of beats per minute followed by the unit.
The number SHALL be the number that the screen shows.

### BR-ACC-009 — A fold button says if its panel is open

A button that folds a panel SHALL expose whether the panel is open, and SHALL name the region that
it folds. A folded region SHALL leave the accessible tree.

### BR-ACC-010 — No button submits

Every button SHALL declare that it is a plain button. No button SHALL be able to submit a form and
reload the page.

### BR-ACC-011 — The board is a grid

The board SHALL be one grid, with one row for each board row and one cell for each board column.
The grid SHALL declare its count of rows and of columns, equal to the board that is drawn. Its name
SHALL say the board size.

### BR-ACC-012 — The board is one tab stop

The board SHALL be one tab stop. The anchor cell SHALL be the pointed cell. IF there is no pointed cell,
THEN the anchor cell SHALL be the first cell of the first row.

### BR-ACC-013 — Arrows, Home and End move the focus

WHEN a cell has focus and the user presses an arrow key, the system SHALL move the focus one cell in
that direction. At the edge of the board, the focus SHALL stay on its cell. WHEN the user presses
Home or End, the system SHALL move the focus to the first or the last cell of the same row. These
keys SHALL NOT scroll the page.

### BR-ACC-014 — The focused cell is the pointed cell

WHEN a cell receives focus, the system SHALL make it the pointed cell, so the ghost shows on it as it
does under the mouse. WHILE the focus is in the board, the mouse SHALL NOT move the pointed cell. WHEN the
focus leaves the board, the system SHALL clear the pointed cell. A move of the focus from one cell to
another is not a departure.

### BR-ACC-015 — A mouse click does not take the focus

WHEN the user clicks a cell with the mouse, the system SHALL NOT move the keyboard focus to that
cell. The pointed cell SHALL keep following the mouse.

### BR-ACC-016 — Enter and Space edit like a click

WHEN a cell has focus and the user presses Enter or Space, the system SHALL do what a click on that
cell does. WHEN the user also holds Alt, the system SHALL do what an Alt-click does.

### BR-ACC-017 — Other keys pass through a focused cell

WHILE a cell has focus, a key that the board does not use SHALL keep its browser behavior and SHALL
NOT move the focus.

### BR-ACC-018 — The focus ring

WHILE the focus is in the board, the system SHALL draw the focus ring on the focused cell only. The
ring SHALL have a light tone and a dark tone, so it shows on every piece color and on white. The
ring SHALL NOT show under the mouse alone. The ring SHALL NOT make the scroll area of the board
larger.

### BR-ACC-019 — The name of a cell

Each cell SHALL have an accessible name. The name SHALL start with the row and the column, counted
from 1. A free cell SHALL add the word for free. An occupied cell SHALL add its piece letter, the
muted state if the piece is muted, its note, and its step out of the last step. The ghost SHALL
NOT change the name of a cell.

### BR-ACC-020 — An edit is announced

WHEN an edit changes the board, the system SHALL put an announcement in the live region. The
announcement SHALL say the piece, the state in which the piece ends, and the cell, with the same
row and column words as the cell name. An attempt that does not change the board SHALL NOT be
announced. The live region SHALL be polite, so it waits for the screen reader to finish.

### BR-ACC-021 — A full board is announced

IF a placement is refused because the board holds the piece limit, THEN the system
SHALL announce the piece limit and say that a piece must be removed first.

### BR-ACC-022 — Only edits speak

The live region SHALL announce only edits and the full-board refusal. The playhead, the sequence and
the spectrum SHALL NOT be announced.

### BR-ACC-023 — A handle says how to move its panel

The accessible name of the handle of a floating panel SHALL contain the panel title and SHALL say
how to move the panel.

## Acceptance criteria

### AC-ACC-001 — The page is in Spanish *(verifies BR-ACC-001)*

GIVEN the page document THEN its root declares the language `es`, and no part of it declares `en`.

### AC-ACC-002 — The tree has no nameless control *(verifies BR-ACC-002)*

GIVEN the whole instrument rendered THEN it has more than twenty controls, and each has an
accessible name with at least one letter or digit.

### AC-ACC-003 — The reset button is named by its action *(verifies BR-ACC-002, BR-ACC-003)*

GIVEN the reset button THEN its name is `Vaciar el tablero y frenar el transporte`, and no
button is named `Reset`.

### AC-ACC-004 — The tempo value carries its unit *(verifies BR-ACC-008)*

GIVEN tempo 110 THEN the tempo clock announces `110 bpm`, with the number that the screen shows. GIVEN tempo 96 THEN it announces `96 bpm`.

### AC-ACC-005 — The click switch *(verifies BR-ACC-003, BR-ACC-005)*

GIVEN the click switch off THEN one button is named `Recorrido en el vacío`, it is not
pressed, it has no text, and its drawing is hidden from the tree. GIVEN the click switch on THEN the
same button is pressed.

### AC-ACC-006 — No toggle is named by its state *(verifies BR-ACC-005)*

GIVEN the whole instrument rendered THEN it has at least one toggle, and no toggle has the name
`on`, `off`, `sí`, `si`, `no`, `activado`, `desactivado`, `encendido` or `apagado`, in any case.

### AC-ACC-007 — The regime is one named group *(verifies BR-ACC-006)*

GIVEN the scale regime THEN there is exactly one group, with an accessible name and two buttons. The
scale button is pressed and the order button is not.

### AC-ACC-008 — Exactly one slot is pressed *(verifies BR-ACC-007)*

GIVEN F in hand THEN all twelve slots expose a pressed state, exactly one is pressed, and its
name starts with `F,`.

### AC-ACC-009 — A slot says its orientation *(verifies BR-ACC-007)*

GIVEN F remembered at 90° and reflected THEN its slot is named `F, rotación 90°, reflejada`.
GIVEN Z remembered at 180° and not reflected THEN its slot is named `Z, rotación 180°`.

### AC-ACC-010 — The fold button *(verifies BR-ACC-009)*

GIVEN the dock open THEN its fold control exposes open and names the region it folds. WHEN the dock
is folded THEN the fold control exposes closed and the region leaves the accessible tree.

### AC-ACC-011 — Every button is a plain button *(verifies BR-ACC-010)*

GIVEN the whole instrument rendered THEN every button declares the type `button`.

### AC-ACC-012 — Rows and cells of the grid *(verifies BR-ACC-011, BR-ACC-012)*

GIVEN a board of the reference size THEN the grid has one row per board row, each row has one cell
per board column, and exactly one cell is a tab stop.

### AC-ACC-013 — One Tab in, one Tab out *(verifies BR-ACC-012)*

GIVEN the focus on the tab stop just before the board WHEN the user presses Tab THEN the anchor
cell has the focus. WHEN the user presses Tab again THEN no cell has the focus.

### AC-ACC-014 — The anchor follows the pointed cell *(verifies BR-ACC-012)*

GIVEN no pointed cell THEN the anchor cell is (row 1, column 1). GIVEN the pointed cell at x 4, y 2 THEN that
cell is the anchor and the first cell is not. GIVEN the pointed cell in the last column, row 5, WHEN the
window shrinks to 375 × 667 THEN the anchor cell is the first cell.

### AC-ACC-015 — Arrows move one cell and stop at the edge *(verifies BR-ACC-013)*

GIVEN the focus at x 0, y 0 WHEN the user presses Right, Down, Left and Up THEN the focus goes to
(1,0), (1,1), (0,1) and (0,0), and each key cancels its browser default. WHEN the user presses Up
or Left at (0,0) THEN the focus stays at (0,0). WHEN the user presses Right or Down at the last
cell THEN the focus stays there.

### AC-ACC-016 — Arrows do not scroll the page *(verifies BR-ACC-013)*

GIVEN the whole instrument and the focus at x 4, y 2 WHEN the user presses the four arrows THEN the
focus moves one cell each time and the page scroll position does not change.

### AC-ACC-017 — Home and End stay in the row *(verifies BR-ACC-013)*

GIVEN the focus at x 5, y 3 WHEN the user presses End THEN the focus is on the last cell of row y 3.
WHEN the user presses Home THEN the focus is at x 0, y 3. WHEN the user presses Home again THEN the
focus stays there.

### AC-ACC-018 — Other keys pass through *(verifies BR-ACC-017)*

GIVEN the focus at x 2, y 2 WHEN the user presses Shift THEN the browser default is not cancelled
and the focus stays on that cell.

### AC-ACC-019 — Enter and Space are the click *(verifies BR-ACC-016)*

GIVEN the focus at x 3, y 1 WHEN the user presses Enter or Space THEN the board receives a click on
(3,1) without Alt. WHEN the user presses Alt+Enter or Alt+Space THEN it receives a click on (3,1)
with Alt.

### AC-ACC-020 — A whole edit cycle from the keyboard *(verifies BR-ACC-016, BR-ACC-020)*

GIVEN F in hand and the focus at x 3, y 2 WHEN the user presses Enter, Enter, Alt+Enter, Alt+Enter
and Alt+Enter THEN the live region says, in order, `pieza F colocada en fila 3, columna 4`,
`pieza F quitada de fila 3, columna 4`, `pieza F colocada muteada en fila 3, columna 4`,
`pieza F con sonido en fila 3, columna 4` and `pieza F muteada en fila 3, columna 4`.

### AC-ACC-021 — Focus sets and clears the pointed cell *(verifies BR-ACC-014)*

GIVEN the focus enters x 2, y 4 THEN the pointed cell is (2,4). WHEN the user presses Right THEN the
pointed cell is (3,4) and is never cleared on the way. WHEN the focus leaves the board THEN the pointed cell is
cleared.

### AC-ACC-022 — The mouse is inert while the board has focus *(verifies BR-ACC-014)*

GIVEN no focus in the board WHEN the mouse enters x 4, y 2 THEN the pointed cell is (4,2). GIVEN the
focus at x 0, y 0 WHEN the mouse enters x 4, y 2 THEN the pointed cell does not move. GIVEN the focus at
x 4, y 3 WHEN the mouse leaves the grid THEN the ghost stays, with the same notes.

### AC-ACC-023 — A mouse click leaves the focus alone *(verifies BR-ACC-015)*

GIVEN the whole instrument WHEN the user clicks x 2, y 1 THEN F is placed and no cell has the focus.
WHEN the mouse then moves to x 7, y 4 THEN the ghost shows there.

### AC-ACC-024 — The ring is for the keyboard *(verifies BR-ACC-018)*

GIVEN the pointed cell at x 4, y 2 from the mouse THEN no cell has the focus ring. GIVEN the same pointed cell
with the focus in the board THEN exactly one cell has the ring, the ring has an outer tone and an
inner tone.

### AC-ACC-025 — The ring does not grow the scroll area *(verifies BR-ACC-018)*

GIVEN the pointed cell on the last cell and a cell of 180 px WHEN the focus enters the board THEN the
scroll width and the scroll height of the board do not change.

### AC-ACC-026 — Cell names *(verifies BR-ACC-019)*

GIVEN x 3, y 2 free THEN its name is `fila 3, columna 4, libre`. GIVEN x 5, y 3 occupied by a muted
L THEN its name is `fila 4, columna 6, pieza L muteada, nota <note>, paso <step> de 4`, with the note
and step that the cell shows. GIVEN a free cell under the ghost THEN its name is still `libre`.

### AC-ACC-027 — Announcement wording *(verifies BR-ACC-020)*

GIVEN L removed from x 0, y 0 THEN the announcement is `pieza L quitada de fila 1, columna 1`, muted
or not. GIVEN W muted at x 9, y 5 THEN it is `pieza W muteada en fila 6, columna 10`, and unmuted
it is `pieza W con sonido en fila 6, columna 10`. GIVEN any cell THEN the announcement and the cell
name use the same row and column words.

### AC-ACC-028 — A placement past the piece limit is announced *(verifies BR-ACC-021)*

GIVEN the board holds the piece limit of I pieces WHEN the user presses Enter on a free cell THEN
the live region names the piece limit, and the board still holds the piece limit.

### AC-ACC-029 — Playback is silent in the live region *(verifies BR-ACC-022)*

GIVEN one F placed and the live region text after that placement WHEN the transport runs one full
cycle of the sequence THEN the live region text does not change.

### AC-ACC-030 — The handle names its panel *(verifies BR-ACC-023)*

GIVEN the handle of the dock THEN its accessible name contains «Piezas» and says how to move the
panel. GIVEN the handle of the signal panel THEN its accessible name contains «Señal».

## Non-goals

- This capability does NOT decide what an edit does. It gives the keys, and the board-editing
  capability decides.
- This capability does NOT give undo.
- This capability does NOT decide the shortcuts Space, Shift, Ctrl and the piece letters. Board
  editing decides them, also on a focused cell.
- This capability does NOT narrate the playhead or the sequence.
- This capability does NOT measure or fix the contrast of the piece colors.
- This capability does NOT make a single choice a radio group with arrow keys. Each choice stays a
  tab stop.

## Contracts

- **Input:** the state of each control; the board size and its occupants; the pointed cell; the remembered
  orientation of each piece; the result of each edit.
- **Output:** the accessible tree: names, roles, pressed and open states; the keyboard focus and
  the focus ring; one announcement per edit or refused placement on a full board.
- **Failure:** an edit that does not change the board is silent. A key at the edge of the board
  leaves the focus where it is. A key that the board does not use passes to the browser.

## Signals

- The live region text after each edit and after a refused placement on a full board.
- The pressed state of each toggle, and the open state of each fold button.
- The anchor cell, and the focus ring while the focus is in the board.

## Dependencies

- `board-editing` (consumes): what a click and an Alt-click on a cell do, the result of each edit,
  and the rejection at the piece limit.
- `board-editing` (feeds): the pointed cell that the keyboard focus sets, for the ghost.
- `pieces` (consumes): the remembered orientation of each piece, for the slot names.
- `musical-model` (consumes): the note and the step of each occupied cell, for the cell name.
- `board-fit` (consumes): the board size, for the grid counts and the anchor cell, and the width of
  the focus ring.
- `playback` (consumes): the tempo and the transport state, for the tempo value and the play name.
- `panels` (consumes): the controls of each panel, which this capability names and labels.

## Open questions

- **OQ-ACC-001 — What does focus on a cell under a floating panel do?**
  - Why it is still open: a floating panel can cover cells. The focus can move to a covered cell,
    and the focus ring is then invisible. One answer folds the panel that covers the cell.
  - Decides: the repository owner.
  - Blocks: nothing. It adds a rule on focus and panels.
- **OQ-ACC-002 — Does Alt+Space reach the page on Windows?**
  - Why it is still open: the system window menu can take Alt+Space. Alt+Enter is the sure path.
    No measurement in a real window exists.
  - Decides: a measurement in a browser on Windows.
  - Blocks: nothing. It can narrow `BR-ACC-016` to Alt+Enter.
- **OQ-ACC-003 — What does Enter or Space do on a continuous control?**
  - Why it is still open: a draggable panel handle and a tempo dial are continuous controls. A
    button with no discrete action announces a button that does nothing when activated.
  - Decides: the repository owner, with the panels capability.
  - Blocks: nothing. It can add a role or an activation to the handle and to the tempo clock
    (#172).
- **OQ-ACC-004 — How does a listener follow the sequence without narration?**
  - Why it is still open: the playhead moves several times per second. Announcing it would never
    let the screen reader finish a sentence.
  - Decides: the repository owner.
  - Blocks: nothing. It can add a signal to `BR-ACC-022`.
