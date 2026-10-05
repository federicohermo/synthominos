# The shape decides inside a piece, and the board decides only between pieces

**Recorded 2026-10-04.** The decision is older than this record.

Two things can decide how a piece sounds: its shape and its place on the board. The circuit already
reads the board: it gives the order of the pieces and the silence between them. The walk of a piece
has two ends, so the circuit could also choose the end where it enters each piece.

**Decision: the board decides the order of the pieces and the silence between them. The shape
decides everything inside a piece.** The notes of a piece, their order, the degree of each cell and
the two gates depend only on the letter, the orientation and the regime. A piece sounds the same
wherever it is, and whatever its neighbours are.

The alternative was measured: the circuit enters each piece at the end of its walk that is nearest
to the previous piece. It shortens the cycle on 79 % of the boards, by 10.4 % on average. It was
rejected, because then a move of one piece changes the arpeggio of its neighbours. The user plays
the instrument from memory, and a piece that sounds different in each place cannot be learned.

The same rule shaped the order regime. A rotation shifts the arpeggio, and not the end where the
walk starts. The two sound the same, but a shifted start moves the gates, so a change inside one
piece reorders the board.

The cost: the cycle is longer than it can be on 79 % of the boards.

Test each idea that starts with "what if the board also decided" against this record. The
contracts hold the rule: `BR-MUS-011` and the last non-goal of the
[musical model](../../../specs/musical-model/musical-model.md), and `BR-CIR-002` and `BR-CIR-014`
of the [circuit](../../../specs/circuit/circuit.md).
