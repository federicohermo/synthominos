---
schema_version: 1
capability_id: CAP-PCS
status: draft
owner: federicohermo
provenance: migrated from specs 020 (#82), 036 (#103); letter check from the follow-up of 036
---

# Capability: pieces

## Purpose

Defines the twelve pieces and how each one is oriented before it goes on the board. It must
get two things right: the set is the twelve real pentominoes, and a gesture on the piece in hand
never moves another piece.

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Piece** | one of the twelve pentominoes, named by its letter | tile, block |
| **Shape** | the five cells of a piece, before any orientation | form, figure |
| **Orientation** | a rotation plus a reflection flag | pose, angle |
| **Rotation** | one of four quarter turns: 0°, 90°, 180° or 270° | angle, spin |
| **Reflection** | the left-right mirror of a shape | flip, mirror image |
| **Initial orientation** | rotation 0°, not reflected | default, canonical |
| **Piece in hand** | the piece that the next placement uses | selected piece, current piece |
| **Remembered orientation** | the orientation that a piece holds while it is not placed | saved, stored orientation |
| **Placed piece** | a piece on the board, with the orientation it had when it was placed | board piece |
| **Grip cell** | the cell of a piece that goes under the pointer when the piece is placed | anchor, handle |
| **Shape check** | the verification that the twelve shapes are the twelve pentominoes | invariant, validator |

## Normative behavior

### BR-PCS-001 — Twelve pieces of five cells

The system SHALL have twelve pieces, named F, I, L, N, P, T, U, V, W, X, Y and Z. Each shape SHALL
have five different cells, connected by sides. Two cells that touch only at a corner are not
connected.

### BR-PCS-002 — Each letter names its pentomino

Each shape SHALL be the pentomino that its letter names in the standard pentomino naming. The
comparison ignores rotation and reflection, so a piece and its mirror image are the same piece.

### BR-PCS-003 — Twelve distinct pieces

No two shapes SHALL be the same pentomino after any rotation or reflection.

### BR-PCS-004 — The shape check names the culprit

IF two shapes are the same pentomino, THEN the shape check SHALL fail and name the piece that the
shape repeats. IF a shape is not the pentomino of its letter, THEN the shape check SHALL fail and
name the letter that the shape has, or say that it is no pentomino.

### BR-PCS-005 — Eight orientations per piece

An orientation SHALL be one of four rotations and a reflection flag. This gives eight orientations
per piece. The system SHALL apply the rotation first and the reflection second.

### BR-PCS-006 — Quarter turns

WHEN a piece turns forward, the system SHALL turn its shape one quarter turn counterclockwise on
screen. WHEN a piece turns back, the system SHALL turn it one quarter turn clockwise. The rotation
SHALL wrap: forward from 270° gives 0°, and back from 0° gives 270°.

### BR-PCS-007 — Reflection

WHEN a piece is reflected, the system SHALL mirror its shape left to right. Two reflections SHALL
give the shape back.

### BR-PCS-008 — A cell keeps its identity

The system SHALL keep the identity of each cell under every orientation. The cell that is first in
a shape is the first cell in each of its eight orientations.

### BR-PCS-009 — The grip cell

Each piece SHALL have one grip cell, on the mass of the piece and not on a gap of its bounding box.
IF a piece has a cell on its centroid, THEN that cell SHALL be the grip cell. The grip cell SHALL
stay the same cell under every orientation.

### BR-PCS-010 — Each piece remembers its orientation

The system SHALL hold one remembered orientation for each of the twelve pieces. The orientation of
one piece SHALL NOT depend on the orientation of another.

### BR-PCS-011 — A gesture changes only the piece in hand

WHEN the piece in hand turns or is reflected, the system SHALL change only the remembered
orientation of the piece in hand. The other eleven SHALL stay as they were.

### BR-PCS-012 — A selected piece comes back as it was left

WHEN a piece becomes the piece in hand, the system SHALL give it its remembered orientation.

### BR-PCS-013 — The instrument opens at the initial orientation

WHEN the instrument loads, the system SHALL give each of the twelve pieces the initial
orientation.

### BR-PCS-014 — Reset returns one piece

WHEN the user resets the orientation, the system SHALL give the piece in hand the initial
orientation, both rotation and reflection. The other eleven SHALL stay as they were.

### BR-PCS-015 — A board reset keeps the orientations

WHEN the user resets the board, the system SHALL keep all twelve remembered orientations.

### BR-PCS-016 — A placed piece keeps its orientation

The system SHALL keep the orientation that a placed piece had when it was placed. A change to the
orientation of the piece in hand SHALL NOT change a cell or a note of a placed piece.

### BR-PCS-017 — One orientation for ghost, readout and placement

The system SHALL use the remembered orientation of the piece in hand for the ghost on the board,
for the readout of its notes and for the piece that it places.

## Acceptance criteria

### AC-PCS-001 — Five connected cells *(verifies BR-PCS-001)*

GIVEN the twelve shapes THEN each has five cells, no cell repeats, and each is connected by sides.

### AC-PCS-002 — A diagonal does not connect *(verifies BR-PCS-001)*

GIVEN a shape whose cells touch another cell only at a corner THEN the shape check fails.

### AC-PCS-003 — Twelve distinct pentominoes *(verifies BR-PCS-003)*

GIVEN the twelve shapes reduced to their smallest orientation THEN there are twelve different
results.

### AC-PCS-004 — The old Z is caught *(verifies BR-PCS-003, BR-PCS-004)*

GIVEN the Z shape replaced by the cells (0,1), (1,1), (1,0), (2,0), (3,0) THEN the check of five
connected cells passes, and the distinctness check fails with one failure: Z repeats N.

### AC-PCS-005 — The order of cells does not make a new piece *(verifies BR-PCS-003)*

GIVEN the N shape with its five cells in reverse order THEN the distinctness check passes.

### AC-PCS-006 — Each letter is its pentomino *(verifies BR-PCS-002)*

GIVEN the twelve shapes and the standard naming THEN each shape matches the pentomino of its
letter.

### AC-PCS-007 — Swapped letters are caught *(verifies BR-PCS-002, BR-PCS-004)*

GIVEN the shapes of L and Y swapped THEN the distinctness check passes, and the letter check fails
with two failures: L is the Y pentomino, and Y is the L pentomino.

### AC-PCS-008 — A shape that is no pentomino *(verifies BR-PCS-004)*

GIVEN the Z shape replaced by the cells (0,0), (1,0), (2,0), (3,0), (9,9) THEN the letter check
fails with one failure: Z is not the Z pentomino and not any other of the twelve.

### AC-PCS-009 — Four turns come back *(verifies BR-PCS-005, BR-PCS-006)*

GIVEN each of the twelve shapes WHEN it turns forward four times THEN it is the shape it was.

### AC-PCS-010 — The direction of a turn *(verifies BR-PCS-006)*

GIVEN the cells (0,0), (1,0), (2,3) WHEN they turn forward once, before the shape moves back to the
origin THEN they are (0,0), (0,-1), (3,-2): a cell east of another goes to its north.

### AC-PCS-011 — The rotation wraps *(verifies BR-PCS-006)*

GIVEN rotation 270° WHEN the piece turns forward THEN the rotation is 0°. GIVEN rotation 0° WHEN
the piece turns back THEN the rotation is 270°.

### AC-PCS-012 — The forward cycle *(verifies BR-PCS-006)*

GIVEN rotations 0°, 90°, 180°, 270° WHEN each turns forward once THEN they are 90°, 180°, 270°,
0°.

### AC-PCS-013 — The mirror *(verifies BR-PCS-007)*

GIVEN the cells (0,0), (1,0), (2,1) WHEN they are reflected THEN they are (2,0), (1,0), (0,1).
GIVEN each of the twelve shapes WHEN it is reflected twice THEN it is the shape it was.

### AC-PCS-014 — Rotation before reflection *(verifies BR-PCS-005)*

GIVEN each combination of piece, rotation and reflection where the two orders give different
shapes WHEN the orientation applies THEN the result is the shape turned first and reflected
second.

### AC-PCS-015 — Cell identity in all 96 combinations *(verifies BR-PCS-008)*

GIVEN each of the twelve pieces in each of its eight orientations THEN the cell at each position is
the image of the cell at the same position in the shape.

### AC-PCS-016 — The grip cell follows its cell *(verifies BR-PCS-009)*

GIVEN each of the twelve pieces THEN its grip cell is one of its five cells, and in each of the
eight orientations it is the image of the same cell.

### AC-PCS-017 — The grip cell on the centroid *(verifies BR-PCS-009)*

GIVEN the twelve shapes THEN exactly I, X and Z have a cell on their centroid, and for each of the
three that cell is the grip cell.

### AC-PCS-018 — Twelve pieces open at the initial orientation *(verifies BR-PCS-010, BR-PCS-013)*

GIVEN the instrument loads THEN there is one remembered orientation per piece, twelve in total, and
each is rotation 0° and not reflected.

### AC-PCS-019 — A gesture moves one piece *(verifies BR-PCS-010, BR-PCS-011)*

GIVEN F in hand WHEN it turns forward twice and is reflected once THEN F is at 180° and reflected,
and T is at 0° and not reflected.

### AC-PCS-020 — Back to a piece, back to its orientation *(verifies BR-PCS-012)*

GIVEN F at 180° and reflected WHEN T becomes the piece in hand and then F again THEN F is at 180°
and reflected.

### AC-PCS-021 — Reset touches one piece *(verifies BR-PCS-014)*

GIVEN F in hand at 180° and reflected WHEN the user resets the orientation THEN F is at 0° and not
reflected, and T is at 0° and not reflected.

### AC-PCS-022 — A board reset keeps the orientations *(verifies BR-PCS-015)*

GIVEN F at 90° and one F placed WHEN the user resets the board THEN the board has no notes, and F is
still at 90°.

### AC-PCS-023 — Turning the hand does not touch the board *(verifies BR-PCS-016)*

GIVEN one F placed at the initial orientation WHEN the F in hand turns to 90° and is reflected THEN
the five cells of the placed F show the same notes and the same order as before.

### AC-PCS-024 — Ghost and placement agree *(verifies BR-PCS-017)*

GIVEN F in hand at 90° and reflected, and a free cell WHEN the ghost shows on that cell and the
user places the piece THEN the placed piece covers the cells and shows the notes that the ghost
showed.

## Non-goals

- This capability does NOT keep orientations across sessions. Closing the instrument forgets them,
  as it forgets the board.
- This capability does NOT turn a piece to a named angle in one step.
- This capability does NOT decide which gesture turns, reflects or resets. It receives the command.
- This capability does NOT decide what a rotation or a reflection does to the notes. It gives the
  orientation, and the musical model gives the notes.
- This capability does NOT decide where or whether a piece is placed. It gives the cells and the
  grip cell.

## Contracts

- **Input:** a command on the piece in hand: turn forward, turn back, reflect or reset. A change of
  piece in hand. A placed piece, with its own orientation.
- **Output:** the remembered orientation of each piece; the cells of any piece in any orientation,
  in the same cell order as its shape; the grip cell; the result of the shape check.
- **Failure:** no command is rejected. The rotation has four values, so no command can leave it out
  of range. A shape that breaks a rule fails the shape check, with the piece and the reason.

## Signals

- The remembered orientation of the piece in hand changes after each command. The slots of the dock and the
  orientation readout show it.
- The shape check emits one result per rule, with the failures.

## Dependencies

- `board-editing` (consumes): the gestures that turn, reflect and reset, and the selection of the
  piece in hand.
- `board-editing` (feeds): the cells and the grip cell of the piece in hand, for the ghost and
  the placement.
- `musical-model` (feeds): the letter, the orientation and the cell identity that give each cell
  its note.
- `panels` (feeds): the remembered orientation of each piece, for the thumbnails and the readout.
- `accessibility` (feeds): the orientation of each piece, for its accessible name.

## Open questions

- **OQ-PCS-001 — Which way does a forward turn go?**
  - Why it is still open: the shapes turn counterclockwise on screen. The code comments say
    clockwise. No spec decided the direction.
  - Decides: the repository owner.
  - Blocks: nothing. It changes `BR-PCS-006` or the comments.
