# A board change sounds at the cycle boundary

**Recorded 2026-10-04.** The decision is of 2026-08-17, in
[#71](https://github.com/federicohermo/pentomino-games/issues/71).

The circuit takes the order of least cost among all orders of the placed pieces. So one piece that
is placed or removed can change the order of all the pieces, and the offset of each event with it.
If the engine applied that change in the middle of a cycle, the pattern would jump in the middle of
a phrase.

**Decision: the engine finishes the sounding cycle and starts the queued sequence at the cycle
boundary.** The rule is `BR-PLY-008` of
[the playback contract](../../../specs/playback/playback.md). A board change replaces only the
queued sequence. The sequence comes from the board and not from the clock, so the same board gives
the same sequence each time, and to replace it whole is safe.

The cost is latency, and it is the highest cost of the circuit model: a change waits up to one
cycle. Measured when the decision was taken, on 200 random boards of 10 × 6 cells for each count of
pieces:

| Pieces | Mean cycle, in intervals | Mean cycle at 110 bpm |
|---|---|---|
| 2 | 18.2 | 2.48 s |
| 3 | 25.4 | 3.46 s |
| 4 | 32.3 | 4.40 s |
| 6 | 44.1 | 6.02 s |
| 8 | 54.8 | 7.47 s |
| 10 | 65.8 | 8.98 s |

With eight pieces the cycle is 13.7 s at 60 bpm and 5.1 s at 160 bpm. The crossing cost came later
and makes a cycle longer. The board is now sized to the screen, so these values hold only for a
board of 10 × 6 cells.

What the wait brings with it:

- **A removed piece sounds to the end of the cycle.** Only pause and reset act at once
  (`BR-PLY-010`, `BR-PLY-021`).
- **The drawing needs the same pair.** `src/playback/route-source.ts` keeps a sounding route and a
  queued route with their cells, so the playhead draws what sounds and not the board of now
  (`BR-PLY-018`). The veil exists to show the wait (`BR-PLY-020`).

What was weighed:

- **Apply the change at once.** Refused: it reorders the pattern in the middle of a phrase.
- **Apply the change at the next pass over the affected piece.** It is a finer rule and a change of
  its own. Nobody built it. `OQ-PLY-004` keeps it open, and the owner decides by ear.
