---
schema_version: 1
capability_id: CAP-MUS
status: draft
owner: federicohermo
provenance: migrated from specs 007 (#69), 008 (#70, the musical part), 012 (#74), 017 (#79); current code and tests; docs/architecture/modelo-musical.md; open debt #53
---

# Capability: musical model

## Purpose

The musical model turns a piece and its orientation into five notes, and gives each cell of the piece one of them.
The one thing it must get right: a piece sounds the same wherever it is on the board.
Its notes depend only on its letter, its orientation and the regime.

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Piece** | one of the twelve pentominoes, named by its letter | pentomino, block |
| **Tonic** | the pitch class that a piece owns | root, base note |
| **Regime** | the global setting that decides what rotation does to the notes: the **scale regime** or the **order regime** (labeled "escala" and "orden") | mode, difficulty, level |
| **Ascending arpeggio** | the five notes of a piece before the retrograde, lowest degree first | scale, note set |
| **Arpeggio** | the five notes of a piece in the order they sound, with the retrograde applied | melody, phrase |
| **Retrograde** | the arpeggio played in reverse order | inversion, mirror notes |
| **Degree** | which note of the ascending arpeggio a cell owns, from 0 to 4 | index, grade |
| **Step** | the position of a cell in the order the arpeggio sounds, from 0 to 4 | degree, order number |
| **Walk** | the order in which the arpeggio visits the five cells of a piece | path, ring |
| **Move** | the passage from one cell of the walk to the next | step, hop |
| **Touching cells** | two cells that share an edge or a corner | adjacent, neighbor |
| **Canonical shape** | the shape of a piece with no rotation and no reflection, with its cells in their fixed order | base shape |
| **Interval** | one sixteenth note at the current tempo: the unit of musical time | spread, tick, beat |

## Normative behavior

### BR-MUS-001 — Five notes per piece

The system SHALL give each piece five distinct notes, one per cell.

### BR-MUS-002 — A tonic per piece

The system SHALL give each piece a distinct tonic, in letter order over the chromatic scale from C:

| Piece | F | I | L | N | P | T | U | V | W | X | Y | Z |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tonic | C | C# | D | D# | E | F | F# | G | G# | A | A# | B |

The tonic SHALL sit in octave 4, where C4 is MIDI 60.

### BR-MUS-003 — The octave carries upward

IF the tonic plus a scale interval passes B, THEN the system SHALL raise that note one octave.
The system SHALL NOT wrap it down into the tonic's octave.

### BR-MUS-004 — One regime for the whole instrument

The system SHALL apply one regime to every piece at the same time.
WHEN the app opens, the regime SHALL be the scale regime.

### BR-MUS-005 — The scale regime: rotation selects the formula

WHILE the regime is the scale regime, the system SHALL build the ascending arpeggio from the tonic with the formula of the rotation:

| Rotation | Formula, in semitones from the tonic |
|---|---|
| 0 | major pentatonic: 0, 2, 4, 7, 9 |
| 1 | minor pentatonic: 0, 3, 5, 7, 10 |
| 2 | minor pentatonic with blue note: 0, 3, 5, 6, 7 |
| 3 | major pentatonic transposed up 7: 7, 9, 11, 14, 16 |

### BR-MUS-006 — The order regime: rotation shifts the start

WHILE the regime is the order regime, the system SHALL use the major pentatonic for every rotation.
For rotation `r`, note `j` of the ascending arpeggio SHALL be note `(j + r) mod 5` of rotation 0.
A note that wraps around SHALL keep its pitch and octave.

### BR-MUS-007 — A regime change re-derives the board

WHEN the regime changes, the system SHALL re-derive the notes of every placed piece, of the ghost and of every occupied cell.
The regime SHALL NOT change the walk, the steps or the circuit.

### BR-MUS-008 — Reflection plays the retrograde

WHEN a piece is reflected, the system SHALL play its ascending arpeggio in reverse order.
The five pitches SHALL stay the same.

### BR-MUS-009 — The arpeggio walks the piece

The system SHALL give degree `g` to the cell that the walk visits at position `g`.
The walk SHALL visit the five cells once each, and SHALL never pass over a cell of the piece.
The system SHALL choose the walk by these criteria, in this order:

1. The most moves between touching cells.
2. The smallest sum of Manhattan distances between consecutive cells.
3. The longest moves as early as possible.
4. The lexicographically smallest sequence of angular ranks (BR-MUS-010).

### BR-MUS-010 — The angular rank decides the direction

The system SHALL rank the cells of the canonical shape by angle around its centroid, clockwise on screen from east.
A cell on the centroid SHALL rank before every other cell.
At equal angle, the cell earlier in the canonical shape SHALL rank first.

### BR-MUS-011 — The shape decides, the board does not

The system SHALL compute the degrees on the canonical shape.
WHEN a piece is rotated, reflected or moved, each cell SHALL keep the degree of its canonical cell.
The position of a piece and its neighbors SHALL NOT change its degrees or its arpeggio.

### BR-MUS-012 — Reflection does not move the note of a cell

The cell of degree `g` SHALL own note `g` of the ascending arpeggio, with or without reflection.

### BR-MUS-013 — The step of a cell

The step of a cell SHALL equal its degree when the piece is not reflected.
The step SHALL equal 4 minus the degree when the piece is reflected.
Step 0 SHALL be the cell of the first note that sounds, and step 4 the cell of the last.

### BR-MUS-014 — What a cell shows

An occupied cell and a ghost cell SHALL show the name of the note of the cell and its step.
A note name SHALL be the pitch class, with sharps, followed by the octave.

### BR-MUS-015 — One note per cell for every reader

Every reader of the note of a cell SHALL get the note that the cell shows, under the current regime.
This includes the note that sounds when the circuit crosses the cell.
A cell outside the piece SHALL have no note.

### BR-MUS-016 — The interval is the unit of musical time

The system SHALL derive the interval from the tempo as one sixteenth note: 60 / bpm / 4 seconds.
The notes of an arpeggio SHALL sound one interval apart, when placed and while the transport plays.

## Acceptance criteria

### AC-MUS-001 — Five distinct notes in every combination *(verifies BR-MUS-001)*

GIVEN the twelve pieces, the four rotations and the two regimes WHEN the system derives each ascending arpeggio THEN each one has five notes and no repeated note.

### AC-MUS-002 — Twelve tonics for twelve pieces *(verifies BR-MUS-002)*

GIVEN the twelve pieces THEN their tonics cover the twelve pitch classes exactly once.
GIVEN each piece at rotation 0 in the scale regime THEN the cell of degree 0 sounds the tonic of the table.

### AC-MUS-003 — C4 is MIDI 60 and note names are exact *(verifies BR-MUS-002, BR-MUS-014)*

GIVEN pitch class C in octave 4 THEN its MIDI number is 60, and A4 is 69.
GIVEN every pitch class in octaves 0 to 8 THEN its name is the pitch class with sharps followed by the octave.

### AC-MUS-004 — The octave carries upward *(verifies BR-MUS-003)*

GIVEN the Z at rotation 0 in the scale regime THEN its lowest note is B4, its highest note is G#5, and the span is 9 semitones.

### AC-MUS-005 — The four formulas of the scale regime *(verifies BR-MUS-005)*

GIVEN tonic C in octave 4 in the scale regime THEN rotation 0 gives C4 D4 E4 G4 A4.
Rotation 1 gives C4 D#4 F4 G4 A#4.
Rotation 2 gives C4 D#4 F4 F#4 G4.
Rotation 3 gives G4 A4 B4 D5 E5.

### AC-MUS-006 — The scale regime always ascends *(verifies BR-MUS-005)*

GIVEN the 48 piece and rotation combinations in the scale regime THEN each ascending arpeggio rises at every note.
Each rise is 1 to 3 semitones, and the span is 7 to 10 semitones.

### AC-MUS-007 — The order regime shifts the arpeggio *(verifies BR-MUS-006)*

GIVEN the F in the order regime THEN rotation 1 gives D4 E4 G4 A4 C4.
Rotation 2 gives E4 G4 A4 C4 D4, and rotation 3 gives G4 A4 C4 D4 E4.
The same shift holds for the 48 combinations.

### AC-MUS-008 — The two regimes meet at rotation 0 *(verifies BR-MUS-005, BR-MUS-006)*

GIVEN the twelve pieces at rotation 0 THEN the two regimes give the same five notes.
GIVEN the 48 combinations THEN the regimes differ in exactly 36, and none of the 36 is at rotation 0.

### AC-MUS-009 — The order regime keeps one pitch set per piece *(verifies BR-MUS-006)*

GIVEN the 48 combinations THEN the order regime gives 12 distinct pitch sets and the scale regime gives 43.

### AC-MUS-010 — What survives a rotation *(verifies BR-MUS-005, BR-MUS-006)*

GIVEN the 180 cells of the twelve pieces at rotations 1, 2 and 3, compared with rotation 0 THEN 36 cells keep their note in the scale regime.
They are 24 at rotation 1, 12 at rotation 2 and 0 at rotation 3.
In the order regime 0 cells keep their note.
GIVEN the scale regime THEN the cell of degree 0 keeps the tonic at rotations 1 and 2, and not at rotation 3.

### AC-MUS-011 — The order regime descends once and narrows the register *(verifies BR-MUS-006)*

GIVEN the 36 combinations of the order regime at rotations 1 to 3 THEN each arpeggio has exactly one descent, and it is 9 semitones.
GIVEN all combinations THEN the register of the scale regime is C4 to D#6, and the register of the order regime is C4 to G#5.

### AC-MUS-012 — The app opens in the scale regime *(verifies BR-MUS-004)*

GIVEN a fresh app WHEN it renders THEN the scale regime control is the selected one.

### AC-MUS-013 — A regime change reaches the ghost *(verifies BR-MUS-004, BR-MUS-007)*

GIVEN the F in hand at rotation 1 over the board WHEN the regime changes from scale to order THEN the ghost shows a different note than before.

### AC-MUS-014 — The cell text follows the regime *(verifies BR-MUS-007, BR-MUS-014)*

GIVEN the L at rotation 1 WHEN its cell text is derived in the scale regime and in the order regime THEN the notes differ and the steps are equal.

### AC-MUS-015 — The regime moves pitches, not the circuit *(verifies BR-MUS-007)*

GIVEN a board of the F at rotation 1, the Z at rotation 2 and the I at rotation 1 WHEN it is simulated in the two regimes THEN the circuit is the same.
The order of visits, the moves of each leg, the cycle length and the onset times are equal.
The pitches of the timeline differ.

### AC-MUS-016 — A crossed cell sounds the note of its regime *(verifies BR-MUS-007, BR-MUS-015)*

GIVEN the 96 orientations placed on the board WHEN the note of each cell is read THEN it is the note that the board shows in that cell.
GIVEN a piece in the order regime THEN the note read is the note of the order regime, not of the scale regime.
GIVEN a cell outside the piece THEN it has no note.

### AC-MUS-017 — Reflection reverses the arpeggio *(verifies BR-MUS-008)*

GIVEN the 48 combinations in the scale regime WHEN the piece is reflected THEN its arpeggio is the unreflected arpeggio in reverse order.
GIVEN the V at rotation 0 reflected THEN the board plays its ascending arpeggio reversed.

### AC-MUS-018 — The walk never passes over a cell *(verifies BR-MUS-009)*

GIVEN the walk of each of the twelve pieces THEN no move is longer than Manhattan distance 2.
Diagonal moves occur only in F, T and Y, with one each, and in X, with two.

### AC-MUS-019 — The walk is optimal *(verifies BR-MUS-009)*

GIVEN the twelve pieces WHEN the walk is compared with a brute force over the 120 orders written in the test THEN they are equal.
GIVEN the Y THEN its one long move comes first.

### AC-MUS-020 — The witness U *(verifies BR-MUS-009)*

GIVEN the U rotated once and placed at (7,4) THEN the walk visits (8,3), (7,3), (7,4), (7,5), (8,5) in this order.

### AC-MUS-021 — Degree 0 is an end of the walk *(verifies BR-MUS-009, BR-MUS-010)*

GIVEN the I, the X and the Z THEN their cell on the centroid does not have degree 0.
GIVEN the I THEN its degrees run 4, 3, 2, 1, 0 from one end to the other.

### AC-MUS-022 — The angular rank decides the direction *(verifies BR-MUS-010)*

GIVEN the eleven pieces other than the T WHEN the angular rank is reversed THEN the walk starts at another cell.
GIVEN the I, the X and the Z THEN the cell on the centroid has rank 0.
GIVEN the F, the I and the T THEN at equal angle the cell earlier in the canonical shape ranks first.

### AC-MUS-023 — Degrees travel with the cells *(verifies BR-MUS-011)*

GIVEN the 96 orientations of the twelve pieces THEN cell `k` of the transformed shape is cell `k` of the canonical shape.
GIVEN the degrees recomputed on the transformed shape THEN they differ from the canonical degrees in 53 of the 96.
GIVEN a rotation, a reflection or a translation THEN the distances between consecutive cells of the walk do not change.

### AC-MUS-024 — The frozen reference *(verifies BR-MUS-009, BR-MUS-010, BR-MUS-011)*

GIVEN the twelve pieces at rotation 0, in the scale regime and not reflected THEN each cell has the note of the reference table written by hand in the test.
For example, the I reads A#4, G#4, F4, D#4, C#4 along its canonical cells.

### AC-MUS-025 — The ascending arpeggio names the note of a cell *(verifies BR-MUS-012)*

GIVEN the 48 combinations, reflected and not reflected THEN the cell of degree `g` has note `g` of the ascending arpeggio.
GIVEN the L at rotation 0 reflected THEN reading the reversed arpeggio by degree gives a different note in 4 of its 5 cells.

### AC-MUS-026 — The step of a cell *(verifies BR-MUS-013, BR-MUS-014)*

GIVEN the 96 orientations THEN the step of each cell is its degree without reflection and 4 minus its degree with reflection.
The arpeggio read by step gives the same note as the ascending arpeggio read by degree.
The cell of step 0 shows the first note that sounds, and the cell of step 4 the last.

### AC-MUS-027 — The reported case: the reflected L *(verifies BR-MUS-008, BR-MUS-013, BR-MUS-014)*

GIVEN the L at rotation 0, reflected, in the scale regime THEN the cell of step 0 shows B4.
Its arpeggio sounds B4, A4, F#4, E4, D4.

### AC-MUS-028 — The interval is a sixteenth note *(verifies BR-MUS-016)*

GIVEN 100 bpm THEN the interval is exactly 0.15 s.
GIVEN any tempo THEN the four intervals of an arpeggio measure exactly a quarter of a bar.
GIVEN a piece while the transport plays THEN the first and last onsets of its arpeggio are 1.000 s apart at 60 bpm and 0.375 s apart at 160 bpm.

### AC-MUS-029 — The placement arpeggio follows the tempo *(verifies BR-MUS-016)*

GIVEN the transport paused at 60 bpm WHEN a piece is placed THEN its five notes start 0.25 s apart.
GIVEN 160 bpm THEN they start 0.09375 s apart.

## Non-goals

- This capability does NOT decide the shapes, the rotation or the reflection of a piece. It reads them.
- This capability does NOT decide when a piece sounds in the cycle, or the silence between pieces.
- This capability does NOT decide the duration, the envelope or the timbre of a note.
- This capability does NOT decide whether a muted piece sounds.
- This capability does NOT use the row or the column of a piece for pitch, octave, duration or velocity.
- This capability does NOT let the board choose the entry of a piece, even where that shortens the cycle.

## Contracts

- **Input:** the letter of the piece, the rotation in quarter turns from 0 to 3, the reflection, the regime, and the tempo for the interval.
- **Output:** the ascending arpeggio, the arpeggio in sound order, the degree and the step of each cell, the note name of each cell, and the interval in seconds.
- **Failure:** a cell outside the piece has no note. A rotation outside 0 to 3 has no defined behavior (OQ-MUS-003).
- Every output is a pure derivation. The same input always gives the same output.

## Signals

- None. The capability emits no event. The board, the circuit and the transport read its outputs.

## Dependencies

- [`pieces`](../pieces/pieces.md) (consumes): the canonical shapes, the fixed order of their cells, and the rotation and reflection of each piece.
- [`board-editing`](../board-editing/board-editing.md) (feeds): the notes and steps that the placed pieces and the ghost show.
- [`circuit`](../circuit/circuit.md) (feeds): step 0 and step 4 as the entry and the exit of each piece, and the note of a crossed cell.
- [`playback`](../playback/playback.md) (feeds): the arpeggio in sound order and the interval. It applies a regime change at the next cycle.
- [`panels`](../panels/panels.md) (consumes): the request of the regime selector.

## Open questions

- **OQ-MUS-001 — Which regime stays?**
  - Why it is still open: the two regimes exist to decide by ear which one makes the instrument more expressive. Nobody has decided.
  - Decides: the owner of the repo, by listening.
  - Blocks: nothing. Removing a regime deletes BR-MUS-004, BR-MUS-005 or BR-MUS-006 and their criteria.
- **OQ-MUS-002 — Should the order regime raise a wrapped note one octave?**
  - Why it is still open: raising it keeps the arpeggio ascending and avoids the 9-semitone descent. It also changes the MIDI notes, which the regime promised not to do.
  - Decides: the owner of the repo, by listening.
  - Blocks: nothing. It would change BR-MUS-006 and AC-MUS-011.
- **OQ-MUS-003 — What does a rotation outside 0 to 3 do?**
  - Why it is still open: the rotation is not bounded. Today the scale regime falls back to the major formula and the order regime shifts cyclically. No user action reaches this case (#53).
  - Decides: the owner of the repo.
  - Blocks: nothing.
- **OQ-MUS-004 — Is a diagonal move inside a piece permanent?**
  - Why it is still open: the diagonal move was accepted "for now" inside a piece, and never between pieces.
  - Decides: the owner of the repo.
  - Blocks: nothing. It would change BR-MUS-009.
