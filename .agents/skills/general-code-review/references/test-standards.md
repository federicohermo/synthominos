# Test standards

The bar for a test of the product. The Owner writes to it and the reviewer holds to it.

A test verifies **behavior through the public interface**. The code inside can change completely,
and the test does not move. A good test reads as a statement of what the instrument does, not as a
mirror of how it does it today.

## Three pairs

**It tests the implementation, or it tests the behavior:**

```ts
// BAD: it knows the internals, and breaks on a harmless refactor
it('pushes the piece to the internal array', () => {
  const board = place(empty, piece);
  expect(board.pieces).toContain(piece);
  expect(board.pieces.length).toBe(1);
});

// GOOD: it asserts what a player can observe
it('AC-BRD-004 — a piece over the limit is not placed', () => {
  const board = place(full, oneMore);
  expect(cellsOf(board)).toEqual(cellsOf(full));
});
```

**It checks the mocks, or it checks the result:**

```ts
// BAD: it only proves that the mock was called
it('calls scheduleHit for each note', () => {
  schedule(sequence, 0, 1, bpm);
  expect(scheduleHit).toHaveBeenCalledTimes(5);
});

// GOOD: it proves the instants that come out
it('AC-PLY-011 — overlapping windows emit each onset once', () => {
  const hits = [...schedule(sequence, 0, 1, bpm), ...schedule(sequence, 0.5, 1.5, bpm)];
  expect(new Set(hits.map(h => h.time)).size).toBe(hits.length);
});
```

**It goes around the interface, or it goes through it:**

```ts
// BAD: it reads a private field of the engine to know what plays
it('sets the internal bpm', () => {
  setTempo(140);
  expect(engine._bpm).toBe(140);
});

// GOOD: the interface is the contract
it('AC-PLY-007 — a tempo change stretches the tour without reordering it', () => {
  const slow = onsets(sequence, 60);
  const fast = onsets(sequence, 160);
  expect(order(fast)).toEqual(order(slow));
});
```

## Structure

- **One behavior for each test.** Several `expect` are fine when they state one behavior. Two
  behaviors are two tests.
- **The title says what the instrument does, never how.** "A muted piece does not sound", not
  "sets the gain to zero".
- **The title cites the criterion** it verifies, as `AC-<COD>-###`.

## Red flags

- A mock of a module this repo owns, when the subject of the test is that module.
- An assertion on how many times your own code was called.
- A title that describes a mechanism.
- A test that breaks on a refactor with no change of behavior.
- A check through a private field and not through the interface.
- A test from which you cannot tell what behavior it guarantees.

## Where a mock is right

Mock only at the edge of the system:

- **Time and randomness**: inject a clock or a seed. The scheduler takes the time as an argument
  for this reason.
- **The audio device**: a `node` test uses `node-web-audio-api`, a real implementation of Web
  Audio. A browser test uses a real `AudioContext`.
- **The engine, in a test of the shell**: the subject is `App.tsx`, not the engine.

Never mock the module under test or a pure module it calls. If your own code is hard to test
without mocks, that is a finding about its design, not about mocking: move the rule to a pure
module of its capability.

## Design for a test

- **Take what varies as an argument**: the time, the board size, the tempo. A function that reads
  them from outside cannot be tested at its limits.
- **Keep the rule out of the component.** A rule that needs no React, no Web Audio and no DOM lives
  in a `.ts` module, and a `node` test proves it in milliseconds.

---

Adapted from Matt Pocock's `tdd` skill (`tests.md` and `mocking.md`), through the bundle this
harness comes from. The examples are sketches in the words of this repo. They are not code of it.
