# A value that changes many times in a second is drawn outside React

**Recorded 2026-10-04.** The decision is older: it came with the spectrum, and the playhead
confirmed it.

All the state of the app is local `useState` in the shell and goes down by props. A change of
state runs the tree again: the board, which has 60 cells on the reference board and up to 390 on a
desktop screen, and the dock. Some values change at the rate of the audio or of the pointer. For
them, most of those renders give the same DOM.

**Decision: the rate of a value decides where it lives, not its importance.** A value that changes
many times in a second does not go in React state. The code that draws it reads its source and
writes the DOM by hand, or the browser resolves it in CSS. React state keeps the values that change
at the rate of an edit.

| Value | Rate | Where it lives |
|---|---|---|
| The spectrum | 60 frames in a second | a canvas, drawn by the loop of [`spectrum-loop.ts`](../../../src/spectrum/spectrum-loop.ts) |
| The playhead and the veil | 4 to 10.6 changes in a second: the interval is 0.25 s at 60 bpm and 0.094 s at 160 bpm | nodes that the loop of [`playhead-loop.ts`](../../../src/playback/playhead-loop.ts) owns |
| The cell size | each pixel of a drag of the window edge | the custom property `--cell`, written by [`use-grid.ts`](../../../src/board-fit/use-grid.ts) |
| The clean tap of a modifier key | some times in each gesture, and nothing draws it | a ref in the shell |
| The dimensions of the board | one or two times in a full drag | React state: they decide how many nodes exist |
| The focus is in the board | two times for each visit | React state |
| The pointed cell | one cell for each frame under the mouse | React state, with a `memo` on the orientation panel |

What was weighed and measured:

- **State for the cells that have not sounded yet.** The first design kept them in React state,
  because the set changed one time in a cycle: 7.5 s with 8 pieces at 110 bpm. Then the veil
  became cell by cell, which is five changes at the rate of the interval. The state left React.
  The exception was not made larger.
- **A class on each cell for the playhead.** That is a write on all the cells to change one. The
  playhead is one element that moves: each frame costs one arithmetic read, and one write of
  `transform` when the cell changes.
- **The pointed cell outside React.** It stays in state, because the ghost, the cursor and the
  focus ring are drawn from it. The cost was measured with `Profiler`: a median of 4.9 ms for
  each crossed cell, and 1.9 ms with a `memo` on the orientation panel. The panel ran its 337
  elements for each cell, and none of its props depends on the pointed cell: 3.0 ms, or 61 %, went
  to a subtree that cannot change. The `memo` was enough.
- **The cell size in state.** One drag of the window edge is tens of renders of the tree in a
  second. With `--cell`, a resize moves the cells, the veil and the playhead, and React runs
  nothing.

The cost:

- **`Spectrum.tsx` and `Playhead.tsx` are not presentational.** They get no props and read the
  engine by themselves. They are the two `.tsx` files that the lint rule on effects exempts by
  name.
- **A rule of ownership that no tool checks.** The loop touches no node that React renders, and
  React touches no node of the loop. The board cells have no ref and no `data-*`, so the loop has
  no handle on them. The veil covers a cell with a node of its own and does not dim the cell.
- **React does not see what the loop draws.** A test of the playhead or of the veil reads the DOM
  and the computed style in a browser, not the output of a render.
- **The numbers are from the layout of their day.** The rates of the playhead follow from the
  tempo range and hold. The 4.9 ms and the 1.9 ms were measured on the mouse. The keyboard focus
  writes the same state at the rate of the hand, and nobody measured it.
