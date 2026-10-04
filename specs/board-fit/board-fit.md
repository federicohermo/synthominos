---
schema_version: 1
capability_id: CAP-FIT
status: draft
owner: federicohermo
provenance: migrated from specs 021 (#83), 031 (#93); 031 replaces the cell size of 021 and keeps its proportional tile; current code and tests
---

# Capability: board fit

## Purpose

The board fills the screen. It must get two things right: the cell stays near the target cell
size, so the board grows by more cells and not by bigger cells; and nothing scrolls.

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Box** | the area that the instrument occupies: the visible area of the browser window | viewport, window size, screen |
| **Board** | the grid of square cells that the user plays on | grid, canvas |
| **Dimensions** | the number of columns and the number of rows of the board | board size, grid size |
| **Cell size** | the side of one cell, in pixels | tile size, cell px |
| **Target cell size** | the cell size that the fit aims at, about 73 px | default cell, base cell |
| **Minimum board** | five columns by five rows: the smallest board that holds every piece in every orientation | minimum grid |
| **Leftover** | the part of the box that the board does not cover, on one axis | margin, gap |
| **Tile** | the colored square inside a cell, with the note name and the step number | card, chip |
| **Gap** | the space between the edge of a cell and its tile | padding, air |
| **Proportional measure** | a measure of the tile that is a fixed fraction of the cell size | scaled value |
| **Stored piece** | a placed piece that does not fit entirely in the current board | hidden piece, offscreen piece |
| **Visible piece** | a placed piece with all five cells inside the current board | drawn piece |
| **Pointed cell** | the board cell under the mouse pointer, or the board cell with keyboard focus | hover cell |

## Normative behavior

### BR-FIT-001 — The board fills the box

The system SHALL size the board from the box. It SHALL measure the box itself, not the browser
window, so that the board and the box use the same size.

### BR-FIT-002 — More cells, not bigger cells

WHEN the box grows or shrinks, the system SHALL change the dimensions. The cell size SHALL stay
near the target cell size.

### BR-FIT-003 — The fit calculation

The system SHALL calculate the dimensions and the cell size in three steps:

1. Count at the target: columns₀ = max(5, round(box width / target cell size)), and
   rows₀ = max(5, round(box height / target cell size)).
2. Cell size = min(box width / columns₀, box height / rows₀). The cells are square.
3. Count at the real cell size: columns = max(5, floor(box width / cell size)), and
   rows = max(5, floor(box height / cell size)).

Reference values: a box of 1920 × 1080 gives 26 × 15 cells of 72.0 px. A box of 375 × 667
gives 5 × 9 cells of 74.1 px. A box of 320 × 568 gives 5 × 8 cells of 64.0 px.

### BR-FIT-004 — Nothing scrolls

The system SHALL NOT scroll the board or the page, on either axis, at any box size. The board
width SHALL NOT exceed the box width. The board height SHALL NOT exceed the box height.

### BR-FIT-005 — The leftover is less than one cell

On each axis, the leftover SHALL be less than one cell. The dimensions SHALL be the largest
count of cells that fits the box at the cell size.

### BR-FIT-006 — The minimum board

The board SHALL never be smaller than the minimum board. IF five cells of the target cell size
do not fit on an axis, THEN the system SHALL shrink the cell size and keep five cells.

### BR-FIT-007 — Resize recalculates at once

WHEN the box changes size, the system SHALL recalculate the cell size and the dimensions
immediately, with no delay between the resize and the new board.

### BR-FIT-008 — The tile is proportional

The note name, the step number, the gap, the corner radius, the space under the note name, and
the position of the step number SHALL each be a proportional measure. At the target cell size,
the note name and the step number SHALL have their measured legible sizes.

### BR-FIT-009 — The tile border does not scale

The border of a tile SHALL be one pixel wide at every cell size.

### BR-FIT-010 — The focus ring scales

Each tone of the focus ring SHALL be as wide as the gap, so the ring grows with the cell.

### BR-FIT-011 — Every layer uses one cell size

Each cell, the playhead, and every mark that the playhead draws over a cell SHALL use the same
cell size. WHILE the box resizes, the playhead SHALL stay on its cell, also with the transport
running.

### BR-FIT-012 — The whole piece decides

The system SHALL draw a placed piece only if all five of its cells are inside the board.
IF one cell or more falls outside, THEN the placed piece SHALL be a stored piece.

### BR-FIT-013 — A stored piece is inert

The system SHALL NOT draw a stored piece. A stored piece SHALL NOT be part of the circuit and
SHALL NOT sound.

### BR-FIT-014 — A resize never deletes a piece

WHEN the board shrinks, the system SHALL keep each stored piece with its type, orientation,
cells and mute. WHEN the board grows so that the piece fits whole, the system SHALL draw it
again, unchanged.

### BR-FIT-015 — A pointed cell outside the board is dropped

IF the pointed cell falls outside the board after a resize, THEN the system SHALL treat the
board as having no pointed cell.

### BR-FIT-016 — One board size for everything

The system SHALL use the current dimensions for the drawn cells, for the accessible grid, for
placement legality, for keyboard movement and for the circuit.

## Acceptance criteria

### AC-FIT-001 — The reference boxes *(verifies BR-FIT-003)*

GIVEN the boxes 1920 × 1080, 1512 × 982, 1440 × 900, 1366 × 768, 1280 × 720, 834 × 1112,
430 × 932, 375 × 667 and 320 × 568 THEN the dimensions are 26 × 15, 21 × 13, 20 × 12, 19 × 11,
18 × 10, 11 × 15, 6 × 13, 5 × 9 and 5 × 8, and the cell sizes are 72.0, 72.0, 72.0, 69.8,
71.1, 74.1, 71.7, 74.1 and 64.0 px, to one decimal.

### AC-FIT-002 — The count grows, the cell stays *(verifies BR-FIT-002)*

GIVEN a box of 730 × 438 and a box of 1920 × 1080 THEN the large box has more than six times the
cells of the small box, and the two cell sizes differ by less than 2 px.

### AC-FIT-003 — The cell stays near the target *(verifies BR-FIT-002, BR-FIT-006)*

GIVEN the nine reference boxes THEN each cell size is at least 64 px and at most 2 % above the
target cell size.

### AC-FIT-004 — The board fits the box *(verifies BR-FIT-004)*

GIVEN the nine reference boxes THEN columns × cell size is not more than the box width, and
rows × cell size is not more than the box height.

### AC-FIT-005 — Less than one cell left over *(verifies BR-FIT-005)*

GIVEN the nine reference boxes, and the boxes 2000 × 300 and 300 × 2000 THEN the leftover on
each axis is less than one cell size.

### AC-FIT-006 — The count is the largest that fits *(verifies BR-FIT-004, BR-FIT-005)*

GIVEN a box 800 px high and each width from 300 to 2000 px in steps of 7 px THEN the columns
fit the width, and one more column does not.

### AC-FIT-007 — Never below the minimum board *(verifies BR-FIT-006)*

GIVEN the boxes 1 × 1, 0 × 0 and 100 × 3000 THEN the board has at least five columns and at
least five rows.

### AC-FIT-008 — The page does not scroll *(verifies BR-FIT-004)*

GIVEN the instrument loaded in a window of 1440 × 900, and again in 375 × 667 THEN the page
does not scroll horizontally, the page height equals the window height, and the board does not
scroll.

### AC-FIT-009 — A drawn board never scrolls *(verifies BR-FIT-004, BR-FIT-011)*

GIVEN a window of 375 × 800 and the boards 10 × 6, 5 × 9 and 26 × 15, each with the cell size
that fits the window THEN the board is columns × cell size wide, it has columns × rows cells,
and neither the board nor the page scrolls.

### AC-FIT-010 — The drawn board is the fitted board *(verifies BR-FIT-001, BR-FIT-016)*

GIVEN the instrument loaded in a window of 375 × 667 THEN the board draws 5 × 9 cells, and the
accessible grid reports 5 columns and 9 rows.

### AC-FIT-011 — The box, not the window *(verifies BR-FIT-001)*

GIVEN two boxes of 400 × 400 and 1500 × 900 in the same window THEN each gets the dimensions
of its own size, and the two dimensions differ.

### AC-FIT-012 — A resize recalculates *(verifies BR-FIT-007)*

GIVEN a box of 1000 × 600 WHEN it becomes 2000 × 1200 and the resize arrives THEN the cell size
and the dimensions are those of 2000 × 1200. WHEN the instrument closes THEN a later resize
changes nothing.

### AC-FIT-013 — Each cell is one cell size *(verifies BR-FIT-011)*

GIVEN a cell size of 73 px, and then of 180 px THEN each cell measures that size in width and
in height.

### AC-FIT-014 — The tile keeps its proportions *(verifies BR-FIT-008)*

GIVEN a placed piece at a cell size of 73 px and of 180 px THEN the gap, the corner radius, the
space under the note name, the size of the note name, the size of the step number and the
distance of the step number to the bottom, each divided by the cell size, are equal at both
sizes, within the rounding of the browser.

### AC-FIT-015 — The target tile reads as measured *(verifies BR-FIT-008)*

GIVEN the target cell size THEN the note name is 19 px and the step number is 13 px.

### AC-FIT-016 — The border stays one pixel *(verifies BR-FIT-009)*

GIVEN a placed piece at a cell size of 73 px, and then of 180 px THEN its tile border is 1 px.

### AC-FIT-017 — The focus ring grows with the cell *(verifies BR-FIT-010)*

GIVEN a cell with keyboard focus at a cell size of 180 px THEN the light tone is wider than
2 px and is the gap width to the nearest whole pixel.

### AC-FIT-018 — The playhead follows the cell size *(verifies BR-FIT-011)*

GIVEN the playhead on the cell (3, 2) WHEN the cell size is 73 px THEN the playhead is offset
by (219, 146) px. WHEN the cell size becomes 180 px with no new write by the playhead THEN it
is offset by (540, 360) px.

### AC-FIT-019 — The whole piece fits or it does not *(verifies BR-FIT-012)*

GIVEN a piece on the cells (0,0) to (4,0) THEN it fits a 10 × 6 board and a 5 × 5 board. GIVEN a
piece that passes one cell beyond the right, bottom, left or top edge THEN it does not fit.

### AC-FIT-020 — The same piece on two boards *(verifies BR-FIT-012, BR-FIT-014)*

GIVEN a piece on the cells (7,1), (8,1) and (9,1) THEN it fits a 10 × 6 board, it does not fit a
6 × 6 board, and it fits the 10 × 6 board again.

### AC-FIT-021 — Shrink and grow returns the piece *(verifies BR-FIT-013, BR-FIT-014)*

GIVEN an I placed on the cells (9,4) to (13,4) WHEN the window becomes 375 × 667 THEN no cell
shows a piece. WHEN the window grows back THEN the same five cells show the I, with the same
accessible names as before.

### AC-FIT-022 — A half piece is not drawn *(verifies BR-FIT-012, BR-FIT-013)*

GIVEN an I placed on the cells (9,4) to (13,4) WHEN the window becomes 800 × 600, which gives
11 columns THEN the cells (9,4) and (10,4) show no piece. WHEN the window grows back THEN the I
shows whole.

### AC-FIT-023 — A stored piece does not sound *(verifies BR-FIT-013)*

GIVEN two placed pieces WHEN the board shrinks so that one is a stored piece THEN the circuit
visits only the other piece, and only its notes sound.

### AC-FIT-024 — A pointed cell outside is dropped *(verifies BR-FIT-015)*

GIVEN the pointer on the last column of a large board WHEN the window becomes 375 × 667 THEN no
cell shows the "not allowed" cursor.

## Non-goals

- This capability does NOT change a note, a tempo or a sound. It decides where the cells are.
- This capability does NOT decide the piece limit. Board editing does, and the limit does not
  grow with the board.
- This capability does NOT decide the position, size or folding of the floating panels.
- This capability does NOT decide the circuit, its seam or its cost. It gives the dimensions.
- This capability does NOT use the full-screen mode of the browser. The board fills the box.
- This capability does NOT keep stored pieces across a reload. A reload empties the board.
- This capability does NOT let the user choose the cell size or the dimensions.

## Contracts

- **Input:** the width and the height of the box, at load and at each resize. The placed
  pieces.
- **Output:** the dimensions; the cell size; the visible pieces; the stored pieces.
- **Failure:** no box size is rejected. A box too small for the minimum board gives smaller
  cells. A box with no size gives the minimum board with a cell size of zero, until the next
  resize (OQ-FIT-002).

## Signals

- The cell size changes with every resize. The dimensions change only when a column or a row
  enters or leaves.
- No signal tells the user that a piece became stored or came back (OQ-FIT-003).

## Dependencies

- `pieces` (consumes): the largest extent of a piece in any orientation, which sets the minimum
  board.
- `board-editing` (feeds): the dimensions for placement legality, and which placed pieces are
  stored pieces.
- `circuit` (feeds): the dimensions and the visible pieces.
- `playback` (feeds): the cell size that the playhead uses, and the visible pieces.
- `panels` (feeds): the cell size, which the floating panels use as their unit.
- `accessibility` (feeds): the dimensions for the accessible grid and the keyboard bounds, and the
  width of the focus ring.

## Open questions

- **OQ-FIT-001 — Does the board have a largest size?**
  - Why it is still open: a 4K box gives about 53 × 30 cells. The circuit then takes about
    30.9 ms against a budget of 5 ms (issue #51). No decision caps the dimensions.
  - Decides: the repository owner.
  - Blocks: nothing. A cap would add a rule next to BR-FIT-006.
- **OQ-FIT-002 — What does a box with no size show?**
  - Why it is still open: the code gives the minimum board with cells of size zero. No spec
    decided it.
  - Decides: the repository owner.
  - Blocks: nothing. It would add a rule or confirm the contract.
- **OQ-FIT-003 — Does the user learn that a piece is stored?**
  - Why it is still open: a shrink hides a piece without notice. The stored piece still counts
    toward the piece limit, so the limit can arrive with fewer pieces in view.
  - Decides: the repository owner.
  - Blocks: nothing. It would add an announcement to BR-FIT-013.
