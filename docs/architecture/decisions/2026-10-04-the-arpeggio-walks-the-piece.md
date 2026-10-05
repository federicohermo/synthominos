# The arpeggio walks the piece, and four pieces pay a diagonal

**Recorded 2026-10-04.** The decision is older than this record.

Each cell of a piece owns one degree of the arpeggio. At first the degrees followed the angular
order of the cells around the centroid, and a cell on the centroid took the tonic. That order knows
nothing of adjacency. Of the 48 moves of the twelve pieces, 4 passed over a cell of the piece that
had not sounded yet, in I, T, U and Y, and 9 were diagonal.

**Decision: degree `g` goes to the cell that a walk visits at position `g`, and the walk takes the
most moves between touching cells.** Two cells touch when they share a side or a corner. The
angular order stays only as the last tie-break: a walk and its reverse are equal, and the angular
order chooses the end where the walk starts.

What was measured, on the same 48 moves: the moves that pass over a cell go from 4 to 0, and the
diagonal moves from 9 to 5. With moves by sides only, 8 of the 12 pieces have a full walk. F, T, Y
and X have none: their cells make a tree with a cell of 3 or 4 neighbours, and a tree has a full
walk by sides only when it is a path. The search takes 4 µs for each call, against 0.57 µs for the
angular order.

The cost:

- **Four pieces move by a corner.** F, T and Y have one diagonal move, and X has two.
- **Two rules of movement.** A walk inside a piece can move by a corner. A leg between pieces moves
  by sides only. Inside a piece the alternative is to pass over a cell; between pieces each cell of
  the route sounds, so that problem does not exist. `OQ-MUS-004` of the
  [musical model](../../../specs/musical-model/musical-model.md) keeps the diagonal open.
- **The tonic left the centre.** Degree 0 is an end of the walk. In I and X the cell on the
  centroid lost the tonic: a walk of the I that starts at its centre must jump over cells of the
  piece.

One consequence reaches the circuit. The centre cell of the X is no longer a gate. It was the one
gate that a leg reached only through cells of its own piece.
