---
schema_version: 1
capability_id: CAP-BRD
status: draft
owner: federicohermo
provenance: migrated from specs 013 (#75), 014 (#76, the mute action), 016 (#78, the ghost and the orientation the palette mirrors), 018 (#80); the piece limit and the stored pieces from 031 (#93); current code and tests
---

# Capability: board editing

## Purpose

The user changes the board with the hand that is already on it. Board editing places, removes and mutes pieces, draws the ghost of the next placement, and binds the direct gestures that choose and turn the piece in hand. It must never edit a piece by accident: a click edits a placed piece only when the user holds a piece of the same type.

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Piece in hand** | The piece type that the next placement uses, with its current orientation. | selected piece, current piece |
| **Placed piece** | A piece on the board. It occupies five cells and keeps the orientation it had when it was placed. | colocated piece, tile |
| **Grip cell** | The cell of the piece in hand that lands on the pointed cell. | anchor, grab cell |
| **Pointed cell** | The board cell under the mouse pointer, or the board cell with keyboard focus. | hover cell |
| **Ghost** | The drawing of the piece in hand at the pointed cell, before it is placed. | preview, shadow |
| **Own piece** | A placed piece of the same type as the piece in hand. | |
| **Muted piece** | A placed piece that keeps its cells and its time in the circuit but does not sound its notes. | silenced, disabled |
| **Stored piece** | A placed piece that does not fit entirely in the current board. The board does not draw it. | hidden piece |
| **Piece limit** | The maximum number of placed pieces on the board, stored pieces included. | |
| **Clean tap** | A press and release of `Shift` or `Ctrl` with no other modifier down at the press, and no other key and no wheel event before the release. | |
| **Control** | A button or an input of the app. A board cell is not a control. | widget |

## Normative behavior

### BR-BRD-001 — Place the piece in hand

WHEN the user clicks a cell that no visible placed piece occupies, the system SHALL place the piece in hand with its current orientation. The grip cell SHALL land on the clicked cell. The board SHALL accept several placed pieces of the same type.

### BR-BRD-002 — Only a legal placement changes the board

IF one of the five cells falls outside the board, or overlaps a placed piece, THEN the system SHALL NOT change the board. Stored pieces count for the overlap.

### BR-BRD-003 — The piece limit

IF the board already holds the piece limit, THEN the system SHALL reject a legal placement and SHALL NOT change the board. The count includes stored pieces.

### BR-BRD-004 — The courtesy arpeggio

WHEN a piece is placed unmuted while the transport is stopped, the system SHALL play the arpeggio of that piece once, immediately. WHILE the transport runs, the system SHALL NOT play it. A piece placed muted SHALL NOT play it.

### BR-BRD-005 — The edit key is the piece in hand

The system SHALL decide an edit gesture on the occupant of the clicked cell only. IF the occupant is an own piece, THEN the gesture edits that placed piece and no other. IF the occupant is a placed piece of another type, THEN the system SHALL do nothing.

### BR-BRD-006 — A click removes an own piece

WHEN the user clicks an own piece without `Alt`, the system SHALL remove that placed piece. A muted piece SHALL be removable in the same way.

### BR-BRD-007 — Alt and click toggles the mute

WHEN the user clicks an own piece with `Alt` down, the system SHALL toggle the mute of that placed piece. The placed piece SHALL keep its cells and its orientation. The other placed pieces SHALL NOT change.

### BR-BRD-008 — Alt and click on a free cell places muted

WHEN the user clicks a free cell with `Alt` down, the system SHALL place the piece in hand as a muted piece, under the same legality rules as an unmuted placement.

### BR-BRD-009 — How a muted piece looks

The system SHALL draw each cell of a muted piece white. The text SHALL use the gray of the board and not the text color of the piece.

### BR-BRD-010 — The ghost

WHILE a pointed cell exists and it is not a cell of an own piece, the system SHALL draw the ghost on the cells that the placement would occupy. A ghost cell SHALL be light gray when the placement is legal and light pink when it is not. A ghost cell over a placed piece SHALL be strong pink, over the color of that piece. WHEN the pointer leaves the board and no board cell has focus, the system SHALL remove the ghost.

### BR-BRD-011 — No ghost where the click edits

WHILE the pointed cell is a cell of an own piece, the system SHALL NOT draw the ghost, and the cursor SHALL be the pointer. WHILE the ghost shows an illegal placement, the cursor SHALL show "not allowed".

### BR-BRD-012 — A stored piece takes no edit

The system SHALL treat a cell of a stored piece as free for the edit gestures and for the ghost. A placement over that cell SHALL still be illegal (BR-BRD-002).

### BR-BRD-013 — The letter selects the piece

WHEN a key down event carries the letter of one of the pieces in the set, in upper or lower case, the system SHALL make that piece the piece in hand. The system SHALL NOT select IF `Ctrl`, `Meta` or `Alt` is down, IF a control has focus, or IF the event is an auto-repeat. A key up event SHALL NOT select. The system SHALL NOT block the default of the letter. Pressing the letter of the piece in hand SHALL change nothing.

### BR-BRD-014 — The wheel turns the piece in hand

WHEN the wheel moves over the board with a vertical delta and without `Ctrl`, the system SHALL rotate the piece in hand by one quarter turn. Wheel down SHALL add 90°, and wheel up SHALL subtract 90°, cyclically in both directions. The system SHALL block the page scroll for that event. IF `Ctrl` is down, THEN the system SHALL NOT rotate and SHALL leave the browser zoom. IF the vertical delta is zero, THEN the system SHALL NOT rotate and SHALL NOT block the scroll.

### BR-BRD-015 — Shift turns the piece in hand

WHEN `Shift` is released at the end of a clean tap, the system SHALL rotate the piece in hand by plus 90°. Holding `Shift` SHALL NOT add rotations.

### BR-BRD-016 — The secondary click reflects the piece in hand

WHEN a context menu event reaches the board, the system SHALL NOT open the context menu. IF `Ctrl` is not down, THEN the system SHALL toggle the reflection of the piece in hand. IF `Ctrl` is down, THEN the system SHALL NOT toggle it.

### BR-BRD-017 — Ctrl reflects the piece in hand

WHEN `Ctrl` is released at the end of a clean tap, the system SHALL toggle the reflection of the piece in hand. A mouse click SHALL NOT break the clean tap, so `Ctrl` and click toggles the reflection exactly once.

### BR-BRD-018 — What breaks a clean tap

The system SHALL start a clean tap only WHEN `Shift` or `Ctrl` goes down with no other of `Shift`, `Ctrl`, `Alt` and `Meta` down. Any other key down, a letter included, SHALL break it. A wheel event SHALL break it, also with `Ctrl` down.

### BR-BRD-019 — The space bar toggles the transport

WHEN a space bar key down event arrives, the system SHALL toggle the transport, also with `Ctrl`, `Alt` or `Meta` down. The system SHALL block the page scroll of that event. IF the event is an auto-repeat, THEN the system SHALL block the scroll and SHALL NOT toggle again. A key up event SHALL NOT toggle.

### BR-BRD-020 — A focused control keeps its keys

WHILE a control has focus, the system SHALL ignore the space bar, `Shift`, `Ctrl` and the letters, and SHALL NOT block their default. The control receives the key.

### BR-BRD-021 — Reset empties the board

WHEN the user resets the board, the system SHALL remove every placed piece, stored pieces included.

### BR-BRD-022 — A focused cell keeps the gestures

WHILE a board cell has focus, a letter SHALL select a piece, `Shift` SHALL rotate the piece in hand, and `Ctrl` SHALL reflect it. The space bar SHALL NOT toggle the transport, because it edits the cell.

## Acceptance criteria

### AC-BRD-001 — The grip cell lands on the clicked cell *(verifies BR-BRD-001)*

GIVEN a piece shape and its grip cell WHEN the shape is placed at a cell THEN the grip cell occupies exactly that cell and the other four keep their offsets.

### AC-BRD-002 — A click places and sounds *(verifies BR-BRD-001, BR-BRD-004)*

GIVEN an empty board, the transport stopped and F in hand WHEN the user clicks a cell where F fits THEN five cells show notes and the arpeggio of F plays once.

### AC-BRD-003 — An illegal placement is rejected *(verifies BR-BRD-002)*

GIVEN an empty board WHEN a placement crosses any one of the four edges THEN the placement is illegal; GIVEN two placed pieces WHEN a placement overlaps the second one only THEN the placement is illegal; GIVEN F in hand WHEN the user clicks the corner cell (0,0) THEN no cell shows a note and no arpeggio plays.

### AC-BRD-004 — The piece limit *(verifies BR-BRD-003)*

GIVEN the board holds the piece limit WHEN the user places one more piece in a legal position THEN the number of placed cells does not change.

### AC-BRD-005 — No courtesy arpeggio while the transport runs *(verifies BR-BRD-004)*

GIVEN the transport runs WHEN the user places F THEN F is placed and no courtesy arpeggio plays.

### AC-BRD-006 — Alt and click on a free cell *(verifies BR-BRD-001, BR-BRD-004, BR-BRD-008)*

GIVEN a free cell WHEN the gesture is a click THEN the action is "place"; WHEN the gesture has `Alt` down THEN the action is "place muted", and the two actions differ; GIVEN an empty board and the transport stopped WHEN the user clicks a free cell with `Alt` down THEN F is placed, its cells are white with their notes, and no arpeggio plays.

### AC-BRD-007 — A click removes the clicked own piece *(verifies BR-BRD-005, BR-BRD-006)*

GIVEN two placed N pieces and N in hand WHEN the edit is decided on a cell of either one THEN the action is "remove" on the occupant of that cell, and the two occupants are distinct pieces; GIVEN one placed F and F in hand WHEN the user clicks a cell of F THEN no cell shows a note.

### AC-BRD-008 — A muted piece is removable *(verifies BR-BRD-006)*

GIVEN a muted placed N and N in hand WHEN the user clicks it without `Alt` THEN the piece counts as an own piece and the action is "remove".

### AC-BRD-009 — Another type is not edited *(verifies BR-BRD-005)*

GIVEN a placed F and W in hand WHEN the user clicks a cell of F, with or without `Alt` THEN the action is none and the board keeps the five cells of F.

### AC-BRD-010 — The mute toggles both ways *(verifies BR-BRD-007)*

GIVEN a placed own piece WHEN the user clicks it with `Alt` down THEN its cells turn white and keep five notes; WHEN the user does it again THEN its cells show the color of the piece.

### AC-BRD-011 — The mute touches one piece *(verifies BR-BRD-007)*

GIVEN two placed F pieces WHEN the user mutes the first one THEN the first one is white, the second one keeps its color, and ten cells still show notes.

### AC-BRD-012 — The look of a muted piece *(verifies BR-BRD-009)*

GIVEN a muted placed F WHEN the board draws a cell of F THEN the cell is white, has no piece background, shows a step number, and its title gives the coordinate, the note and the step.

### AC-BRD-013 — The ghost colors *(verifies BR-BRD-010)*

GIVEN a ghost cell on a free cell WHEN the placement is legal THEN the cell is light gray; WHEN it is illegal THEN the cell is light pink; GIVEN a ghost cell over a placed piece THEN the cell is strong pink and has no piece background.

### AC-BRD-014 — The ghost follows the pointer *(verifies BR-BRD-010)*

GIVEN an empty board and F in hand WHEN the pointer enters cell (4,3) THEN five cells show notes; WHEN the pointer leaves the board THEN no cell shows a note.

### AC-BRD-015 — No ghost where the click edits *(verifies BR-BRD-011)*

GIVEN a placed F and F in hand WHEN the pointer enters a cell of F THEN exactly five cells show notes, no cell is strong pink, and the cursor is the pointer; GIVEN an illegal ghost WHEN the pointed cell is not an own piece THEN the cursor shows "not allowed"; GIVEN no pointed cell THEN the cursor is the pointer.

### AC-BRD-016 — A half stored piece takes no click *(verifies BR-BRD-012, BR-BRD-002)*

GIVEN a placed I that the board shrinks to two cells inside and three outside, and I in hand WHEN the user activates one of the two inside cells THEN no piece is removed, nothing is announced, the ghost appears, and I returns whole when the board grows back.

### AC-BRD-017 — The twelve letters select *(verifies BR-BRD-013)*

GIVEN each of the twelve letters WHEN it arrives in upper or lower case on key down THEN the action is "select" for that piece; GIVEN `i` and then `P` with `Shift` WHEN they arrive THEN the ghost takes the shape of I and then of P.

### AC-BRD-018 — A modifier keeps the letter for the browser *(verifies BR-BRD-013)*

GIVEN a letter WHEN `Ctrl`, `Meta` or `Alt` is down THEN the action is none; GIVEN a letter key up without modifiers THEN the action is none.

### AC-BRD-019 — What the letter does not do *(verifies BR-BRD-013, BR-BRD-020)*

GIVEN a letter WHEN a control has focus, or the event is an auto-repeat THEN the action is none; WHEN any letter arrives THEN its default is not blocked; WHEN the letter of the piece in hand repeats THEN the action is the same selection.

### AC-BRD-020 — Other keys do nothing *(verifies BR-BRD-013)*

GIVEN `a`, `Enter`, `Alt`, `ArrowUp` or `Escape` WHEN they arrive on key down or key up THEN the action is none; GIVEN a key that names no piece THEN it selects no piece.

### AC-BRD-021 — The letter works on a focused cell *(verifies BR-BRD-013, BR-BRD-022)*

GIVEN a board cell has focus WHEN a piece letter arrives on key down THEN the action is "select"; WHEN the space bar arrives THEN the action is none.

### AC-BRD-022 — The wheel rotates cyclically *(verifies BR-BRD-014)*

GIVEN rotation 0° WHEN the wheel goes down THEN the rotation is 90°; WHEN it goes up from 0° THEN the rotation is 270°; WHEN it goes down from 270° THEN the rotation is 0°; WHEN the vertical delta is zero THEN the rotation does not change.

### AC-BRD-023 — The wheel blocks the scroll, and Ctrl and the wheel zoom *(verifies BR-BRD-014, BR-BRD-018)*

GIVEN the wheel over the board with a vertical delta of 120 WHEN the event arrives THEN the rotation changes and the default is blocked; WHEN `Ctrl` is down THEN the rotation does not change, the default is not blocked, and the clean tap breaks; WHEN only a horizontal delta arrives THEN nothing rotates and the default is not blocked.

### AC-BRD-024 — The modifiers act on a clean release *(verifies BR-BRD-015, BR-BRD-017, BR-BRD-018)*

GIVEN `Shift` or `Ctrl` WHEN the key goes down THEN the action is none; WHEN it is released at the end of a clean tap THEN `Shift` rotates and `Ctrl` reflects; WHEN it is released after a broken tap THEN the action is none; GIVEN `Ctrl` down WHEN `C` goes down and both are released THEN the reflection does not change.

### AC-BRD-025 — What starts a clean tap *(verifies BR-BRD-018)*

GIVEN no key down WHEN `Shift` or `Ctrl` goes down alone THEN a clean tap starts; WHEN any other key goes down, a letter included THEN no clean tap starts; WHEN `Shift` goes down with `Ctrl` down, or either goes down with `Alt` or `Meta` down THEN no clean tap starts.

### AC-BRD-026 — The secondary click reflects *(verifies BR-BRD-016)*

GIVEN the board WHEN a context menu event arrives without `Ctrl` THEN the default is blocked and the reflection toggles; WHEN it arrives with `Ctrl` down THEN the reflection does not toggle.

### AC-BRD-027 — Ctrl and click reflects exactly once *(verifies BR-BRD-016, BR-BRD-017)*

GIVEN `Ctrl` down WHEN the user clicks the board, the context menu event arrives with `Ctrl` down, and `Ctrl` is released THEN the reflection has toggled exactly once.

### AC-BRD-028 — The space bar toggles on key down *(verifies BR-BRD-019)*

GIVEN the space bar WHEN it arrives on key down, also with `Ctrl`, `Alt` or `Meta` down THEN the transport toggles and the default is blocked; WHEN it arrives on key up THEN the action is none; WHEN it arrives as an auto-repeat THEN the transport does not toggle and the default is blocked.

### AC-BRD-029 — A focused control keeps its keys *(verifies BR-BRD-020)*

GIVEN a focused button or input WHEN the space bar, `Shift` or `Ctrl` arrives THEN the action is none and the default is not blocked.

### AC-BRD-030 — Reset empties the board *(verifies BR-BRD-021)*

GIVEN a placed piece and the transport running WHEN the user resets the board THEN no cell shows a note; GIVEN F rotated to 90° and placed WHEN the user resets the board THEN the board is empty.

### AC-BRD-031 — The space bar spares a cell and a control *(verifies BR-BRD-019, BR-BRD-020, BR-BRD-022)*

GIVEN the focus on a free cell WHEN the user presses the space bar THEN F is placed and the transport does not start; GIVEN the focus on the play button WHEN the space bar reaches the page THEN the page shortcut does not toggle the transport; GIVEN the focus on no control WHEN the user presses the space bar THEN the transport starts and the play button is named `Pausa`.

### AC-BRD-032 — The gestures work on a focused cell *(verifies BR-BRD-022)*

GIVEN the focus on cell (4,3) WHEN the user taps `Shift` THEN the notes of the ghost change; WHEN the user then taps `Ctrl` THEN they change again; WHEN the user presses `i` THEN the ghost takes the shape of I and the transport does not start.

## Non-goals

- This capability does NOT decide the shapes, the rotation arithmetic or the orientation each piece remembers. It only sends the gesture to the piece in hand.
- This capability does NOT decide what a muted piece sounds like in the circuit. It only sets the mute.
- This capability does NOT decide what a reset does to the transport. Playback decides.
- This capability does NOT size the board, and does NOT decide when a placed piece becomes a stored piece.
- This capability does NOT move the keyboard focus across the board, and does NOT word the announcements.
- This capability does NOT show the order of the circuit on the board.
- This capability does NOT undo. A removed piece returns only when the user places it again.
- This capability does NOT place a piece across the seam that joins two opposite corners of the circuit.
- This capability does NOT rotate or reflect a placed piece in place.
- This capability does NOT let the user configure the gestures.

## Contracts

- **Input:** a click or a keyboard activation on a cell, with or without `Alt`; the pointed cell; key down and key up events with their modifiers, auto-repeat flag and focus target; wheel events over the board; context menu events over the board; the reset action.
- **Output:** the list of placed pieces, each with its type, orientation, cells and mute; the piece in hand; the rotation and reflection requests for the piece in hand; the ghost cells and their legality; the cursor; the transport toggle; the courtesy arpeggio request.
- **Failure:** an illegal placement, a click on a placed piece of another type, and a key that is not a gesture change nothing. The piece limit changes nothing. No failure changes the board.

## Signals

- A placement, a removal, a mute and an unmute, each with the piece type and the cell.
- The rejection at the piece limit.
- The ghost colors: legal, illegal, and overlap.

## Dependencies

- `pieces` (consumes): the shapes, the grip cell of each piece, and the orientation of the piece in hand.
- `musical-model` (consumes): the note and the step number that each ghost cell and each placed cell shows, and the arpeggio of a piece.
- `board-fit` (consumes): the board dimensions, and which placed pieces are stored pieces.
- `circuit` (feeds): the placed pieces and their mute.
- `playback` (feeds): the courtesy arpeggio request, the transport toggle, the reset, and the mute of each placed piece.
- `accessibility` (feeds): the edits and the rejection at the piece limit, which it announces.
- `accessibility` (consumes): the keyboard activation of a cell, which reuses the click.
- `panels` (feeds): the piece in hand and its orientation, which the dock shows.

## Open questions

- **OQ-BRD-001 — Where does the app write the gestures?**
  - Why it is still open: the gesture legend left the dock. No surface of the app names the wheel, `Shift`, the secondary click, `Ctrl`, the space bar or the letter.
  - Decides: the repo owner (issue #170).
  - Blocks: nothing. It adds a rule on where the gestures are named.
- **OQ-BRD-002 — Does removal need an undo?**
  - Why it is still open: a click, a key on a focused cell, and reset each remove pieces without confirmation, and nothing restores them.
  - Decides: the repo owner (issue #47).
  - Blocks: nothing. It would change BR-BRD-006 and BR-BRD-021.
- **OQ-BRD-003 — Does a placement wrap across the seam?**
  - Why it is still open: the circuit joins two opposite corners, and a placement rejects every cell outside the grid. No decision explains the asymmetry.
  - Decides: the repo owner (issue #49).
  - Blocks: nothing. It would change BR-BRD-002 and BR-BRD-010.
