---
paths:
  - "src/App.tsx"
  - "src/**/*.tsx"
  - "src/**/use-*.ts"
---

# UI: the shell, the components and the hooks

`App.tsx` is the shell: local `useState`, derived values, handlers and the composition. What a
control exposes is in the contract `specs/accessibility/accessibility.md`. What a cell shows is in
[DESIGN.md](../../DESIGN.md).

## Rules

- **The shell holds no pure function and no literal of the instrument.** A `.tsx` exports only its
  component, so a decision written there has no test. Put it in a `.ts` module of the capability.
- **A component is presentational**: props in, no state and no effect of its own. `Spectrum.tsx`
  and `Playhead.tsx` are the exception: they read the engine and draw by hand.
- **The rate of a value decides where it lives.** A value that changes many times in a second, or
  that nothing draws, goes in a ref, a custom property or a draw loop, not in `useState`:
  [the decision](../../docs/architecture/decisions/2026-10-04-a-fast-value-is-drawn-outside-react.md).
- **A draw loop touches no node that React renders, and React touches no node of the loop.** The
  board cells have no ref and no `data-*` for this reason. The loop paints on its own nodes.
- **Handlers change state, and effects reconcile.** All that sounds in the loop goes through the
  reconciliation effect of `playback/use-engine.ts`, the one door from the shell to the transport.
- **Derive a value one time, in the shell, and pass the result down.** The sequence, the pointed
  cell and "this click edits" have one derivation each. With two copies, the screen and the sound
  can disagree, and nothing fails.
- **Never mutate an object that React holds.** Data that changes later goes in state with its own
  setter, or outside React. The `key` of an element that can be removed is its id, not its index.
- **A value that comes from a constant goes in an inline style, not in a class.** Tailwind scans
  the source and generates no interpolated class (`w-[${n}px]`). All that depends on the cell size
  reads `--cell`.
- **Do not show a state of a piece with its color.** Color is identity, and each channel of the
  tile is taken. Read DESIGN.md before you add a state.
- **A new control obeys `BR-ACC-002` to `BR-ACC-010` from its first commit.** No tool sees a
  toggle without `aria-pressed`: the gate finds a toggle by that attribute.
- **A composite region is one tab stop, with the arrow keys inside** (roving tabindex). One member
  always has `tabIndex={0}`. If none has it, the region leaves the tab order.
- **A browser test asks by role and name, never by `className`.** `getByRole` matches the name as
  a substring: anchor it with a regex, `/^Piezas$/`.

## Input listeners

- **A global listener lives in a `use-*.ts` hook, in its own effect.** The shell makes the `ref`
  and gives the hook callbacks, not setters. A change of the state shape then changes the shell
  only.
- **The dependencies of an effect are the real ones.** Do not read the state through a ref to
  subscribe one time. The shell memoizes each callback, so the shell decides when the effect
  subscribes again. Do not put an object built inline in the dependencies: list its fields.
  The one exception is the wheel, which subscribes once for each mount: `alRotar` reads the piece
  in hand from `selectedRef`, and only `elegirPieza` writes that ref.
- **A ref that two hooks share comes in as a parameter of both.**
- **The decision of a gesture is a pure function in a `.ts` module.** It gets the fields of the
  event, not the event. "Is there an action?" and "does the default stop?" are two functions: a
  key that repeats has no action, and its default still scrolls.
- **A handler that skips an event leaves all of it to the browser**: no `preventDefault`.
- **The cleanup is synchronous and removes each listener of the effect.** StrictMode mounts twice.
- **A `wheel`, `touchstart` or `touchmove` handler that stops the default is not a JSX prop.**
  React registers the three as passive (react-dom 19.1.1): the handler runs and `preventDefault()`
  does nothing. Use `addEventListener(…, { passive: false })` in the hook.
