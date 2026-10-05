# The circuit is exact, so the board holds twelve pieces at most

**Recorded 2026-10-04.** The decision is older than this record.

The circuit visits each placed piece once and comes back to the first one. To find the circuit of
least cost is a travelling salesman problem on the gates of the pieces. A search can be exact, or
it can go to the nearest piece first.

**Decision: the circuit is the exact one, by Held-Karp, and the piece limit is 12 on a board of any
size.** The search costs `O(n² · 2ⁿ)`, so the limit is what keeps it inside the budget of 5 ms
(`BR-CIR-016`).

What was measured:

- **Nearest piece first.** Its circuits are 20.1 % longer on average, and 79 % longer in the worst
  case. On 120 boards it gives a longer cycle on 54 % of them: 5.8 % longer on average, and 49 %
  longer in the worst case. Its circuit also depends on the piece it starts from, so one board can
  sound in two ways.
- **The exact search.** It takes 1.87 ms with 12 pieces on the reference board.
- **More than 12 pieces.** On a board of 26 × 14 cells the build of the sequence doubles with each
  piece:

  | Pieces | 12 | 13 | 14 | 15 | 16 |
  |---|---|---|---|---|---|
  | Build | 3.1 ms | 3.7 ms | 5.6 ms | 9.7 ms | 18.6 ms |

- **The routes.** One route search for each entry gate, and not one for each pair of gates, makes
  12 searches from 144. The build goes from 10.9 ms to 3.1 ms on 364 cells, and from 2.3 ms to
  1.9 ms on the reference board. No route changes.

An exact circuit can pass next to a piece and come back to it later. That is not an error: a visit
at that point makes the cycle longer. "The nearest piece first" is the search that was rejected.

The cost: a large board holds no more pieces than the reference board. The area of the reference
board gives the limit by itself, 60 cells for pieces of 5. The board of a 1920 × 1080 screen has
390 cells, which is room for 78 pieces, and 78 pieces are 66 doublings. So the limit is a written
rule, `MAX_PIEZAS` in `src/board-editing/placement.ts`, and `BR-BRD-003` of the
[board editing](../../../specs/board-editing/board-editing.md) contract. No optimization of the
exact search buys 66 doublings.
