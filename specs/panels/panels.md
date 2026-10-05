---
schema_version: 1
capability_id: CAP-PNL
status: draft
owner: federicohermo
provenance: migrated from specs 019 (#81), 028 (#90), 052 (#169, open PR #174, not merged); app name from the commit that renames the app; open debt #170, #171, #172, #173
---

# Capability: panels

## Purpose

Defines the two floating panels over the board, the controls in the dock, and the identity of the
app. It must get two things right: a panel never hides the board for good, and the open dock shows
all its content without a scroll.

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Floating panel** | a panel that floats over the board and takes no board space | card, window, overlay |
| **Dock** | the floating panel titled «Piezas», with the pieces and the controls | palette card, sidebar |
| **Signal panel** | the floating panel titled «Señal», which holds the spectrum | spectrum card, strip |
| **Handle** | the control in the header of a floating panel that moves the panel | grip, title bar |
| **Fold control** | the control in the header of a floating panel that hides or shows its content | collapse, toggle |
| **Keyboard step** | the distance that one arrow key moves a panel | nudge |
| **Visible margin** | the part of a panel that stays inside the viewport after any move | safe area |
| **Slot** | the square button of one piece in the dock | thumbnail button, tile, cell |
| **Thumbnail** | the drawing of a piece in its remembered orientation inside its slot | mini, icon |
| **Slot grid** | the twelve slots in rows and columns | periodic table, palette |
| **Grid width ceiling** | the largest width that the slot grid may take | max width |
| **Orientation readout** | the text that says the orientation of the piece in hand | orientation line, label |
| **Regime selector** | the two buttons that choose the regime | regime toggle |
| **Tempo clock** | the control that shows the tempo as a number and changes it | slider, spinner, tempo control |
| **Drag step** | the vertical distance of a drag that changes the tempo by one bpm | sensitivity |
| **Transport row** | the play button, the click switch and the reset button | transport bar |
| **Prose** | visible text that explains or labels, as opposed to a value or a letter | caption, legend |
| **Background color** | the one color behind the board, the page and the installed app | theme color |

## Normative behavior

### BR-PNL-001 — Two floating panels, one chassis

The system SHALL show two floating panels: the dock and the signal panel. Neither SHALL take space
from the board. Both SHALL have the same header: a handle with the panel title and a fold control.

### BR-PNL-002 — Folding

WHEN the user activates the fold control, the system SHALL hide the content of that panel and keep
its header. The hidden content SHALL stay in the page, so the spectrum keeps running. Each panel
SHALL fold on its own. Both panels SHALL open unfolded.

### BR-PNL-003 — A drag moves the panel

WHEN the user drags the handle by a displacement, the system SHALL move the panel by the same
displacement. The panel SHALL stay at that position until the next move.

### BR-PNL-004 — The arrows move the panel

WHILE the handle has the focus, each arrow key SHALL move the panel one keyboard step in the
direction of the arrow. Any other key SHALL keep its default.

### BR-PNL-005 — A panel cannot be lost

WHEN a panel moves, the system SHALL keep at least the visible margin of its width inside the
viewport. The top edge of the panel SHALL stay inside the viewport, and at least the visible margin
above the bottom edge. The handle is on the top edge, so it stays reachable.

### BR-PNL-006 — A drag is only a move

A drag that starts and ends on the handle SHALL NOT fold the panel. A drag across the board SHALL
NOT place, turn or reflect a piece.

### BR-PNL-007 — The start positions

WHEN the instrument loads, the system SHALL put the dock in the top right corner and the signal
panel in the bottom left corner. Each SHALL sit at the start margin from the two edges of its
corner.

### BR-PNL-008 — The signal panel size

The signal panel SHALL be three cells wide. When it is open, it SHALL be one cell high.

### BR-PNL-009 — The dock fits its content

The size of the dock SHALL come from its content. The open dock SHALL show all its content without
a scroll.

### BR-PNL-010 — The dock content, in order

The dock SHALL show, from top to bottom: the header, the slot grid, the regime selector, the
orientation readout with the reset-orientation button, the tempo clock and the transport row.

### BR-PNL-011 — The slot grid is a full rectangle

The number of columns SHALL divide the number of pieces, so the last row is full. The system SHALL
use the largest proper divisor whose width fits in the grid width ceiling. IF no proper divisor
fits, THEN it SHALL use the smallest one. IF the count has no proper divisor, THEN it SHALL use one
column. With twelve pieces and the grid width ceiling, the grid is four columns by three rows.

### BR-PNL-012 — The slot

Each slot SHALL be a square of fixed side. It SHALL show the thumbnail and the letter of its piece
as a symbol in a corner. The thumbnail SHALL sit in a fixed box of five by five small cells, the
same box for every piece and every orientation. Its cells SHALL have the color of the piece and a
border. The background of the slot SHALL NOT have the color of the piece. The thumbnail SHALL draw the remembered
orientation of its own piece, not that of the piece in hand.

### BR-PNL-013 — The slot of the piece in hand

The slot of the piece in hand SHALL have the dark background. The other eleven SHALL NOT have
it. The border of the thumbnail cells SHALL change with the state. WHEN the user
activates a slot, the system SHALL make its piece the piece in hand.

### BR-PNL-014 — The dock says the orientation and does not change it

The dock SHALL NOT have a control that turns or reflects a piece. The orientation readout SHALL
say the rotation of the piece in hand in degrees and add the reflected word when the piece is
reflected. The eight orientations SHALL give eight different texts. The readout SHALL keep its line
height for every text.

### BR-PNL-015 — The reset-orientation button

The dock SHALL have one button, labeled with zero degrees, that asks to reset the orientation of the
piece in hand. Its tooltip SHALL say that it returns this piece to zero degrees without
reflection.

### BR-PNL-016 — The regime selector

The regime selector SHALL be two buttons, one per regime, with no visible word. WHEN the user
activates a button, the system SHALL ask for its regime.

### BR-PNL-017 — The tempo clock

The tempo clock SHALL show the tempo as a number only. It SHALL change the tempo with three gestures:

- the wheel: up adds one bpm and down takes one, whatever the size of the wheel step;
- the arrows, with the focus on the clock: up and right add one bpm, down and left take one;
- a vertical drag: each drag step up adds one bpm, and each drag step down takes one.

A drag SHALL count from the tempo at its start, so a pointer back at the start point gives the start
tempo. Every result SHALL be a whole number inside the tempo range.

### BR-PNL-018 — The transport row

The transport row SHALL show three buttons with a symbol and no visible word: the play button,
the click switch and the reset button. The click switch SHALL show its state with color. The reset
button SHALL stand apart from the other two.

### BR-PNL-019 — No prose in the dock

The open dock SHALL show no prose: no gesture legend, no row labels, no tonic line and no note line.
Its visible text SHALL be fewer than 210 characters.

### BR-PNL-020 — A control without a word has a tooltip

Each button in the dock whose visible text has no letter SHALL have a tooltip with the same text as
its accessible name. A handle SHALL have no tooltip.

### BR-PNL-021 — One app name

The installed app, the page title and the first heading of the readme SHALL say the same app name.
The short name of the installed app SHALL be the app name or its start.

### BR-PNL-022 — One background color

The page, the root of the app, the theme color of the browser and the background of the installed
app SHALL use the same background color. The page and the root SHALL NOT be transparent.

### BR-PNL-023 — The app presents an instrument

The description of the page SHALL say that the app is a musical instrument and not a game. The app
icons SHALL be drawn from the instrument, in the sizes that the installed app declares, and SHALL
NOT be the icons of a project template.

## Acceptance criteria

### AC-PNL-001 — Two panels over the board *(verifies BR-PNL-001)*

GIVEN the instrument loads THEN there are two floating panels, titled «Piezas» and «Señal». Each
has a handle and an expanded fold control, and neither is in the page flow.

### AC-PNL-002 — Folding hides and keeps *(verifies BR-PNL-002)*

GIVEN both panels open WHEN the user folds the signal panel THEN its content is hidden and its
canvas is still in the page. WHEN the user folds the dock THEN its content is hidden, the signal
panel stays as it was, and the twelve slots are still in the page.

### AC-PNL-003 — The panel goes where it is dropped *(verifies BR-PNL-003)*

GIVEN a panel WHEN the user drags its handle by (dx, dy) inside the viewport THEN the panel box
moves by (dx, dy) within one pixel, and stays there after a render that does not move it.

### AC-PNL-004 — The arrows move one step *(verifies BR-PNL-004)*

GIVEN the focus on a handle WHEN the user presses each of the four arrows THEN the panel moves one
keyboard step in the direction of each arrow. WHEN the user presses another key THEN the panel does
not move and the key keeps its default.

### AC-PNL-005 — The impossible corner *(verifies BR-PNL-005)*

GIVEN a panel WHEN the user drops it at (-9999, -9999) THEN its box intersects the viewport and its
top edge is at the viewport top. GIVEN a move past each of the four edges THEN at least the visible
margin of the panel stays inside the viewport.

### AC-PNL-006 — A drag does not fold *(verifies BR-PNL-006)*

GIVEN an open panel WHEN a drag starts and ends on its handle THEN the fold control is still
expanded.

### AC-PNL-007 — A drag does not touch the board *(verifies BR-PNL-006)*

GIVEN a board with pieces WHEN the user drags a panel handle across the board THEN the placed pieces
and the remembered orientations of the twelve pieces are the same as before.

### AC-PNL-008 — The signal panel follows the same chassis *(verifies BR-PNL-001, BR-PNL-003, BR-PNL-004, BR-PNL-005)*

GIVEN the signal panel WHEN the user drags its handle, moves it with the arrows, and drops it at
(-9999, -9999) THEN it moves as AC-PNL-003, AC-PNL-004 and AC-PNL-005 require.

### AC-PNL-009 — The start corners *(verifies BR-PNL-007, BR-PNL-008)*

GIVEN the instrument loads THEN the top edge of the dock is at the start margin from the viewport
top and the dock is in the right half. The left edge of the signal panel is at the start margin from
the viewport left, and the open signal panel is three cells wide and one cell high.

### AC-PNL-010 — The open dock does not scroll *(verifies BR-PNL-009)*

GIVEN the open dock WHEN the cell size is 69.5 px and when it is 73 px THEN the scroll height of the
dock and of its content equals their client height.

### AC-PNL-011 — Twelve slots in a full rectangle *(verifies BR-PNL-011)*

GIVEN twelve pieces THEN the column count is 2, 3, 4 or 6, never 1, 5 or 12, and the rows are full.
GIVEN a width that admits five columns THEN the count is 4. GIVEN the grid width ceiling THEN the grid
is four columns by three rows.

### AC-PNL-012 — The floor of the grid *(verifies BR-PNL-011)*

GIVEN twelve pieces and a width that admits fewer than two columns THEN the count is 2. GIVEN seven
pieces THEN the count is 1.

### AC-PNL-013 — A fixed box for every shape *(verifies BR-PNL-012)*

GIVEN the twelve slots THEN each shows its letter. Each thumbnail box is five small cells wide and
five high for every piece. WHEN the piece in hand turns THEN no slot moves by a pixel.

### AC-PNL-014 — Color and state *(verifies BR-PNL-012, BR-PNL-013)*

GIVEN the twelve slots THEN the thumbnail cells have the color of their piece and no slot background
has it. Exactly one slot has the dark background: the slot of the piece in hand. Its thumbnail cells have
a different border color from the cells of another slot.

### AC-PNL-015 — A slot selects its piece *(verifies BR-PNL-013)*

GIVEN the dock WHEN the user activates the slot of T THEN the system asks to make T the piece in
hand.

### AC-PNL-016 — Eight texts *(verifies BR-PNL-014)*

GIVEN the four rotations not reflected THEN the readout reads «0°», «90°», «180°» and «270°». GIVEN
them reflected THEN it reads the same degrees followed by «· reflejada». The eight texts are
different.

### AC-PNL-017 — The text says what the thumbnail cannot *(verifies BR-PNL-014)*

GIVEN the pieces I, T, U, V, W and X THEN some pairs of orientations give the same thumbnail, X
gives 28 such pairs, and each pair gives two different readout texts.

### AC-PNL-018 — The readout follows the piece in hand *(verifies BR-PNL-014)*

GIVEN the instrument loads THEN the readout reads «0°». WHEN the piece in hand turns forward THEN it
reads «90°». WHEN the piece is then reflected THEN it reads «90° · reflejada».

### AC-PNL-019 — The readout keeps its line *(verifies BR-PNL-014)*

GIVEN the readout at «0°» and at «270° · reflejada» THEN its height is the same.

### AC-PNL-020 — No control turns or reflects *(verifies BR-PNL-014)*

GIVEN the dock THEN no button is named «90°», «180°», «270°» or «Reflexión», and there is no range
input.

### AC-PNL-021 — The zero-degree button *(verifies BR-PNL-015)*

GIVEN the dock WHEN the user activates the button «0°» THEN the system asks once to reset the
orientation of the piece in hand. Its tooltip says that it returns this piece
to zero degrees without reflection.

### AC-PNL-022 — The regime selector *(verifies BR-PNL-016)*

GIVEN the scale regime THEN the selector has two buttons and no visible label. WHEN the user activates
the order button THEN the system asks for the order regime.

### AC-PNL-023 — The clock shows a number *(verifies BR-PNL-017)*

GIVEN a tempo of 110 bpm THEN the clock shows «110» and nothing else.

### AC-PNL-024 — Wheel and arrows *(verifies BR-PNL-017)*

GIVEN a tempo inside the range WHEN the wheel moves up once THEN the tempo grows by one bpm, for a
small and a large wheel step. GIVEN the focus on the clock WHEN the user presses up, right, down and
left THEN the tempo moves +1, +1, -1 and -1. GIVEN the tempo at the top of the range WHEN the wheel
moves up or the user presses up THEN the tempo stays. GIVEN the tempo at the bottom WHEN the user
presses down THEN the tempo stays. A horizontal wheel does not change the tempo.

### AC-PNL-025 — The drag is anchored *(verifies BR-PNL-017)*

GIVEN a drag that starts on the clock WHEN the pointer goes up by two drag steps THEN the tempo grows
by two bpm. WHEN the pointer comes back to the start point THEN the tempo is the start tempo. WHEN the
pointer is released or the browser cancels the gesture THEN a later pointer move does not change the
tempo.

### AC-PNL-026 — The transport row *(verifies BR-PNL-018)*

GIVEN the click switch off THEN it has no visible text, and its tooltip is «Recorrido en el vacío».
GIVEN it on THEN it has the dark background. GIVEN the reset button THEN it shows «↺», and its
tooltip says that it empties the board and stops the transport.

### AC-PNL-027 — No prose *(verifies BR-PNL-019)*

GIVEN the open dock THEN its visible text has fewer than 210 characters and contains none of
«Rueda sobre el tablero», «arranca y para», «pieza la elige», «Rotación», «Notas actuales»,
«tónica», «Tempo» and «bpm».

### AC-PNL-028 — Every wordless button has a tooltip *(verifies BR-PNL-020)*

GIVEN the open dock THEN it has 21 buttons. The 8 buttons whose visible text has no letter have a tooltip equal to their accessible name. The
handle shows «Piezas» and has no tooltip.

### AC-PNL-029 — One name in three places *(verifies BR-PNL-021)*

GIVEN the installed app name THEN it is not empty, the page title equals it, the first readme
heading equals it, and it starts with the short name.

### AC-PNL-030 — One background color *(verifies BR-PNL-022)*

GIVEN the background color token THEN it is a six-digit hex color, the page uses it, and the theme
color and the background of the installed app and the theme color of the page equal it. GIVEN the
app on screen THEN the root and the page compute the same background, and neither is transparent.

### AC-PNL-031 — An instrument, with its own icons *(verifies BR-PNL-023)*

GIVEN the page THEN its description says that the app is an instrument and not a game. GIVEN the
icons that the installed app declares THEN each file exists with its declared size, and no file is
a project template icon.

### AC-PNL-032 — Each thumbnail shows its own piece *(verifies BR-PNL-012)*

GIVEN twelve different remembered orientations THEN each thumbnail draws the orientation of its own
piece, not that of the piece in hand. GIVEN the twelve at the initial orientation WHEN only L changes
to 270° and reflected THEN the thumbnail of L changes, and the other eleven do not.

## Non-goals

- This capability does NOT keep the position or the fold state of a panel across sessions.
- This capability does NOT decide what the transport buttons, the reset button or the tempo do to
  the sound. It shows the controls and passes the requests on.
- This capability does NOT decide what a regime or a reset of the orientation does. It asks for them.
- This capability does NOT pack the twelve pieces into a pentomino tiling. The slots are equal,
  separate and aligned.
- This capability does NOT write the gesture legend. Where the gestures are written is open.
- This capability does NOT make the app installable offline. The app has no service worker.
- This capability does NOT choose which board cells a panel covers. The user moves the panel.

## Contracts

- **Input:** the piece in hand; the remembered orientation of each piece; the regime; the tempo and
  the tempo range; whether the transport runs; the state of the click switch; the viewport size and
  the cell size; pointer, wheel and key gestures on a handle, a fold control, a slot or the clock.
- **Output:** a request to select a piece, to set a regime, to reset the orientation of the piece in
  hand, to set a tempo, to toggle the transport, to toggle the click switch, or to reset the board; the
  position and the fold state of each panel.
- **Failure:** no gesture is rejected. A move past an edge is clamped to the visible margin. A tempo
  gesture past the range is clamped to the range. A key that is not an arrow keeps its browser
  default.

## Signals

- The fold control shows whether its panel is folded.
- The panel moves on screen after each drag or arrow key.
- The slot of the piece in hand, the active regime button and the click switch show their state.
- The tempo clock shows the new tempo.

## Dependencies

- `pieces` (consumes): the remembered orientation of each piece and the cells of each orientation,
  for the thumbnails and the readout.
- `pieces` (feeds): the request to reset the orientation of the piece in hand.
- `board-editing` (feeds): the request to select a piece from its slot.
- `board-editing` (consumes): the piece in hand, and the rule that a focused control keeps its keys.
- `musical-model` (feeds): the request to set the regime.
- `musical-model` (consumes): the active regime.
- `playback` (feeds): the tempo, the transport toggle, the click switch and the reset request.
- `playback` (consumes): the tempo range, the transport state and the state of the click switch.
- `board-fit` (consumes): the cell size, which sizes the signal panel.
- `spectrum` (consumes): the signal panel, which holds the spectrum and keeps it alive when folded.
- `accessibility` (feeds): the controls of each panel, which it names.
- `accessibility` (consumes): the accessible name of each control, which its tooltip repeats.

## Open questions

- **OQ-PNL-001 — What happens to a panel when the window shrinks?**
  - Why it is still open: the clamp runs only on a drag or an arrow key. A smaller window can leave a
    panel and its handle outside the viewport, with no way back short of a reload (#171).
  - Decides: the repository owner.
  - Blocks: nothing. It extends `BR-PNL-005` to a resize.
- **OQ-PNL-002 — How does the eye tell the readout from the zero-degree button?**
  - Why it is still open: at the start state the dock shows «0°» twice, side by side. The
    accessibility tree tells them apart, and the eye does not (#173).
  - Decides: the repository owner.
  - Blocks: nothing. It can change `BR-PNL-014` or `BR-PNL-015`.
