---
schema_version: 1
capability_id: CAP-CIR
status: draft
owner: federicohermo
provenance: migrated from specs 009 (#71), 011 (#73); gates from 010 (#72); seam on any board size from 031 (#93); crossing over a muted piece from 014 (#76)
---

# Capability: circuit

## Purpose

Turns the placed pieces into one sequence: which piece sounds when, and what sounds between two
pieces. It must get one thing right: the geometry decides the order and the silences, not the order
in which the user placed the pieces.

## Capability language

| Term | Meaning here | Avoid |
|---|---|---|
| **Circuit** | the closed order in which the sequence visits the placed pieces, once each per cycle | tour, path, loop |
| **Cycle** | one full pass of the circuit, measured in intervals | bar, loop length |
| **Interval** | the time unit of the instrument; the musical model defines it | beat, tick |
| **Entry gate** | the cell of the first note that a piece sounds | entrance, start cell |
| **Exit gate** | the cell of the last note that a piece sounds | exit, end cell |
| **Leg** | the route from the exit gate of one piece to the entry gate of the next piece in the circuit | hop, jump |
| **Route** | the cells that a leg goes through, its moves and its cost | path |
| **Intermediate cell** | a cell of a route that is not one of its two ends | crossed cell |
| **Move** | the passage from one cell to a neighbour cell; one move lasts one interval | step, hop |
| **Seam** | the one extra neighbour pair of the board: the cell at column 0, row 0 and the cell at the last column, last row | wrap, torus |
| **Crossing cost** | the cost of entering an occupied intermediate cell, a fixed value greater than 1 | penalty, weight |
| **Event** | one thing that sounds at one interval of the cycle: a note of a piece, a crossing or a click | hit, onset |
| **Sequence** | the events of one cycle, each with its interval and its cell, and the cycle length | route, pattern |
| **Click** | the event of an intermediate cell that has no note to give | tick, metronome |
| **Crossing** | the event of an intermediate cell that a placed piece occupies; it carries the note of that cell | grace note, flourish |

## Normative behavior

### BR-CIR-001 — A closed circuit

The system SHALL visit each placed piece once per cycle. After the last piece, the circuit SHALL go
back to the first piece with the same rule as every other leg. The cycle SHALL have no start mark.

### BR-CIR-002 — The gates follow the melody

The entry gate of a piece SHALL be its cell of step 0. The exit gate SHALL be its cell of step 4.
The two gates of a piece SHALL be different cells.

### BR-CIR-003 — The board graph and its seam

Two cells SHALL be neighbours when they share a side. The seam SHALL also make the cell at column 0,
row 0 and the cell at the last column, last row neighbours, on a board of any size. No other pair of
cells SHALL be neighbours.

### BR-CIR-004 — Stepping on a piece costs

A leg SHALL take the route of least cost. Entering an empty intermediate cell SHALL cost 1. Entering an
occupied intermediate cell SHALL cost the crossing cost. The two ends of a route SHALL cost nothing.
A route SHALL enter a piece only when no route around it costs less.

### BR-CIR-005 — The route tie-break

IF two routes have the same least cost, THEN the system SHALL take the route whose sequence of
intermediate cells is lexicographically smaller. The comparison goes cell by cell, and compares the
column first and the row second. The first cell that differs decides.

### BR-CIR-006 — The cost orders, the moves measure time

The moves of a route SHALL be its intermediate cells plus one. Each move SHALL last one interval. The
cost SHALL choose between routes and circuits, and SHALL NOT change a duration.

### BR-CIR-007 — The shortest circuit, exact

The system SHALL choose the circuit of least total cost among all orders of the placed pieces. The
solution SHALL be exact, not approximate.

### BR-CIR-008 — The circuit tie-break

IF two circuits have the same least cost, THEN the system SHALL take the circuit with fewer total
moves. IF they also have the same moves, THEN the system SHALL take the circuit whose order of
placement indices is lexicographically smaller. The cycle SHALL start with the piece placed earliest.

### BR-CIR-009 — Silence is distance

The first piece of the cycle SHALL start at interval 0. The first note of the next piece SHALL sound
as many intervals after the last note of the previous piece as the leg has moves. The silence SHALL have no cap. The cycle length SHALL be four
intervals per piece plus the moves of all legs, the return leg included.

### BR-CIR-010 — The empty board and the single piece

WHILE the board is empty, the system SHALL emit no event, and the cycle length SHALL be zero. WHILE
the board has one piece, the system SHALL make no leg and no click, and the cycle SHALL be five
intervals long.

### BR-CIR-011 — Each intermediate cell sounds

The system SHALL emit one event for each intermediate cell of each leg, in route order, one interval
apart. The event SHALL keep its cell. No two events of a cycle SHALL fall on the same interval.

### BR-CIR-012 — A crossing gives the note of its cell

IF a placed piece occupies an intermediate cell, THEN its event SHALL be a crossing with the note
that the board shows on that cell. IF the cell is empty, THEN its event SHALL be a click with no note.

### BR-CIR-013 — Mute does not move the circuit

The circuit, the offsets, the routes and the cycle length SHALL NOT depend on which pieces are muted.

### BR-CIR-014 — The regime does not move the circuit

The circuit, the gates, the offsets and the cycle length SHALL NOT depend on the regime.

### BR-CIR-015 — The same board sounds the same

WHEN the system builds the sequence of the same board twice, it SHALL give the same sequence. The
order of placement SHALL NOT change the cyclic order or the cycle length, except in a full tie of
BR-CIR-008.

### BR-CIR-016 — The time budget

WHEN the board holds the piece limit, the system SHALL build the sequence in less than 5 ms, as the median
of 21 runs. The budget SHALL hold on the reference board and on the board of a 1920 × 1080 screen.

## Acceptance criteria

### AC-CIR-001 — The seam on the reference board *(verifies BR-CIR-003)*

GIVEN an empty board of 10 × 6 cells WHEN the route goes from (0,0) to (9,5), or back THEN it has one
move, no intermediate cell and cost 0. AND the longest route between two cells of that board has 12
moves, not 14.

### AC-CIR-002 — The seam on any board size *(verifies BR-CIR-003)*

GIVEN boards of 10 × 6, 5 × 5, 26 × 15 and 64 × 7 cells THEN the seam joins (0,0) and (w − 1, h − 1).
GIVEN an empty board of 26 × 15 THEN the route from (0,0) to (25,14) has one move, and the route from
(0,0) to (24,14) has two.

### AC-CIR-003 — A route is a real path *(verifies BR-CIR-006)*

GIVEN two different cells of an empty board of 10 × 6 THEN the intermediate cells are one fewer than
the moves, each pair of consecutive cells are neighbours, no cell repeats, and neither end is an
intermediate cell.

### AC-CIR-004 — The witness case goes around *(verifies BR-CIR-004, BR-CIR-006)*

GIVEN P on (3,3), (4,3), (3,2), (4,2), (3,1) and Y on (7,4), (7,3), (7,2), (7,1), (8,2) WHEN the route
goes from (3,1) to (8,2) THEN its intermediate cells are (3,0), (4,0), (5,0), (6,0), (7,0), (8,0),
(8,1), it has 8 moves and cost 7, and it does not enter (7,1). GIVEN the same two cells on an empty
board THEN the route has 6 moves.

### AC-CIR-005 — Least cost against a reference *(verifies BR-CIR-004, BR-CIR-005)*

GIVEN the empty board, the witness board and six random boards from fixed seeds WHEN
the route goes from each of (0,0), (4,2), (9,5), (2,4) to every other cell THEN cost, moves and
intermediate cells equal those of an independent least-cost search.

### AC-CIR-006 — The cost is symmetric *(verifies BR-CIR-004)*

GIVEN the boards of AC-CIR-005 THEN for each pair of different cells the cost from a to b equals the
cost from b to a.

### AC-CIR-007 — The route tie-break is exercised *(verifies BR-CIR-005)*

GIVEN the pairs (0,0)→(3,2) and (4,2)→(7,4) on the empty board, and (3,1)→(8,2) and (1,1)→(8,4) on the
witness board, each with more than one route of least cost THEN the route is the lexicographically
smallest of all of them. AND among the routes that start with the same cell, it is still the smallest.

### AC-CIR-008 — The gates in all 96 orientations *(verifies BR-CIR-002)*

GIVEN each of the twelve pieces in each of its eight orientations THEN the entry gate is the cell of
step 0, the exit gate is the cell of step 4, and the two differ. GIVEN L
at rotation 0, reflected, with grip cell on (1,1) THEN the entry gate is (0,0) and the exit gate is (1,3).

### AC-CIR-009 — The geometry reorders the placement *(verifies BR-CIR-007, BR-CIR-009)*

GIVEN W, P, F and X at rotation 0, placed in that order with grip cells on (6,4), (4,4), (8,2), (2,2)
THEN the circuit is W, X, F, P with cost 19, the placement order costs 25, and the cycle is 35
intervals long.

### AC-CIR-010 — The circuit is exact *(verifies BR-CIR-007)*

GIVEN boards of two to seven pieces THEN no order of the pieces has a lower total cost than the chosen
circuit, by enumeration of all orders.

### AC-CIR-011 — Two adjacent pieces are contiguous *(verifies BR-CIR-009)*

GIVEN L at rotation 0 with grip cell on (1,1) and N at rotation 90° with grip cell on (3,2) THEN both
legs have 1 move and cost 0, there is no click, the pieces start at intervals 0 and 5, and the cycle is
10 intervals long.

### AC-CIR-012 — Offsets and the return leg *(verifies BR-CIR-001, BR-CIR-009)*

GIVEN each prefix of a tiling of the board with the twelve pieces THEN the first piece starts at
interval 0, each next piece starts four intervals plus the leg moves after the previous one, and the
cycle length is four intervals per piece plus the moves of all legs, the return leg included.

### AC-CIR-013 — The empty board and the single piece *(verifies BR-CIR-010)*

GIVEN an empty board THEN the sequence has no event and a cycle length of 0. GIVEN one F, Z, I or X
alone THEN there is no click, the piece starts at interval 0, and the cycle is five intervals long.

### AC-CIR-014 — A leg of d moves gives d − 1 events *(verifies BR-CIR-011)*

GIVEN each prefix of the tiling with two pieces or more THEN the clicks and crossings of the cycle are the
intermediate cells of each leg, in circuit order and route order.

### AC-CIR-015 — No two events on one interval *(verifies BR-CIR-011)*

GIVEN each prefix of the tiling, with and without muted pieces THEN the intervals of the clicks and
crossings strictly increase, and none falls on the interval of a note.

### AC-CIR-016 — Crossing the X *(verifies BR-CIR-012)*

GIVEN X on (1,0), (0,1), (1,1), (2,1), (1,2) and a board where a leg crosses it THEN the cycle has three
crossings on (2,1), (1,2) and (1,1), with the notes 69, 71 and 76 that the board shows on those cells.
AND the event on the empty cell (2,0) has no note.

### AC-CIR-017 — A note if and only if occupied *(verifies BR-CIR-012)*

GIVEN each prefix of the tiling THEN a click or crossing has a note if and only if a piece occupies its cell, and
the note is the one that the board shows on that cell. GIVEN the full tiling THEN all 13 leg events carry
a note.

### AC-CIR-018 — Mute keeps the circuit *(verifies BR-CIR-013)*

GIVEN a board with one piece muted THEN the circuit, the offsets, the cycle length and the cell and
interval of each leg event equal those of the same board with no piece muted.

### AC-CIR-019 — The regime keeps the circuit *(verifies BR-CIR-014)*

GIVEN each prefix of the tiling with pieces at rotations other than 0 WHEN the sequence is built under
each of the two regimes THEN the circuit, the gates, the offsets and the cycle length are the same.

### AC-CIR-020 — Fewer moves win a cost tie *(verifies BR-CIR-008, BR-CIR-015)*

GIVEN N at 270° on (6,1), X at 0° on (4,1), U at 270° on (2,3), I at 270° on (0,2) and P at 90° on
(8,2), by grip cell, where two circuits cost 32 and take 21 and 25 moves WHEN the five pieces are
placed in each of the 120 orders THEN the cyclic order is always the same, and the cycle is always 41 intervals long.

### AC-CIR-021 — The placement index breaks a full tie *(verifies BR-CIR-008)*

GIVEN F at 0° on (8,4), Z at 0° on (3,4) and Y at 0° on (6,2), by grip cell, placed in that order,
where both circuits cost 19 and take 14 moves THEN the circuit is F, Z, Y. AND on boards of two to seven pieces the
circuit is the lexicographically smallest order among all orders of least cost.

### AC-CIR-022 — The same board, the same sequence *(verifies BR-CIR-015)*

GIVEN each prefix of the tiling WHEN its sequence is built twice, and from a copy of the board THEN the
three sequences are equal. AND each route of the boards of AC-CIR-005 is the same in repeated queries.

### AC-CIR-023 — The budget on the reference board *(verifies BR-CIR-016)*

GIVEN twelve pieces that tile a board of 10 × 6 THEN the median of 21 builds of the sequence is below
5 ms.

### AC-CIR-024 — The budget on a desktop screen *(verifies BR-CIR-016)*

GIVEN twelve pieces on the board of a 1920 × 1080 screen THEN the median of 21 builds of the sequence
is below 5 ms.

## Non-goals

- This capability does NOT place, remove or mute a piece. It receives the placed pieces.
- This capability does NOT let a piece sit across the seam. The seam joins cells for the route only.
- This capability does NOT decide the notes of a piece or their order inside the piece. The musical
  model gives them.
- This capability does NOT turn intervals into seconds, and does not decide the voice of a crossing or a click.
- This capability does NOT decide what a muted piece sounds. Playback does.
- This capability does NOT decide when a new sequence starts to sound. Playback does.
- This capability does NOT let the user choose a route or change the crossing cost.
- This capability does NOT draw the playhead. It gives the cells that the playhead shows.

## Contracts

- **Input:** the placed pieces, at most the piece limit, each with its letter, orientation, cells and
mute state; the board size; the regime.
- **Output:** the circuit, with the starting interval of each piece; the notes of each piece;
  one event per intermediate cell, with its interval, its cell and, for a crossing, its note; the cycle
  length in intervals.
- **Failure:** no board is rejected. The board is connected, so a route always exists. An empty board
  gives an empty sequence with cycle length zero.

## Signals

- A new sequence after each board change.
- Each event says if it is a click or a crossing: a crossing carries a note, and a click does not.

## Dependencies

- `pieces` (consumes): the cells of each placed piece, in the cell order of its shape.
- `musical-model` (consumes): the notes of each piece, their play order, the note of each cell and the
  interval as the unit of time.
- `board-editing` (consumes): the placed pieces, their mute state, and the piece limit.
- `board-fit` (consumes): the board size, which places the seam, and the visible pieces.
- `playback` (feeds): the sequence to schedule.

## Open questions

- **OQ-CIR-001 — Does the budget hold on a 4K screen?**
  - Why it is still open: on a board of 53 × 30 cells the build takes 30.9 ms, six times the budget.
    A faster search is identified and not done. Tracked as #51.
  - Decides: the repository owner.
  - Blocks: `BR-CIR-016` on boards larger than a 1920 × 1080 screen.
- **OQ-CIR-002 — Should the placement order break a full tie?**
  - Why it is still open: in a full tie of cost and moves, the circuit and its first piece depend on
    the placement order. The two cycles last the same, but the pieces sound in another order. That
    goes against "the geometry decides".
  - Decides: the repository owner.
  - Blocks: nothing. It changes `BR-CIR-008` and `BR-CIR-015`.
