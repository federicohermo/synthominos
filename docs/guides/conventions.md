# Code Conventions

## Language

Text in this repo follows **ASD-STE100**. The rules apply to code, tests, comments, documentation,
`AGENTS.md` and the rules. They also apply to specs, issues, commits, PRs and the answers of an
agent.

1. Write one idea per sentence.
2. Write instructions of 20 words or fewer. Write descriptions of 25 words or fewer.
3. Write paragraphs of one idea and six sentences or fewer.
4. Use the active voice and the present tense.
5. Write steps in the imperative: "Run the gate", "Move the rule to the domain".
6. Use numbers for a sequence and bullets for a set.
7. Put a warning before the step it applies to.
8. Use one term for one concept. Do not use synonyms.
9. Do not use filler words: "simply", "basically", "very", "really".
10. Write code, file and variable names as they are, in backticks.

- **Write everything in English.** This covers content, folder names and file names. The
  exceptions are the existing identifiers of the instrument: see
  [The language of identifiers](#the-language-of-identifiers).
- **Write a measured number with its measurement, not with an adjective.** "Almost three times" is
  not data.

## Organization of `src/`

### The dependency direction

`src/` has one folder per capability, and three layers inside each one, with **one direction**:

```text
src/<capability>/domain/   imports no audio/ and no ui/ of any capability
src/<capability>/audio/    imports no domain/ and no ui/ of any capability
src/<capability>/ui/       imports from both, and so does App.tsx
domain modules:            transform ← board · routing · music ← sequence · invariants
```

`domain/` and `audio/` are **siblings with no edge between them**: the engine speaks MIDI numbers and
does not know what a pentomino is.

**The linter verifies it, not the review.** It verifies it by **path**:
`import-x/no-restricted-paths` has one zone per forbidden edge, all in one rule and not in one
override per layer. A forbidden import added by hand fails `pnpm lint` with the message of its zone.
This is tested from a module and from a test.

**A path is not a string.** A rule on the import *string* needs one pattern per depth of `../`, and
a new folder stays uncovered until someone adds a pattern. Zones resolve the path against the
filesystem, and their globs (`./src/*/domain/**`) cover a new capability on its own.

**`no-restricted-imports` keeps the packages**, because an npm package has no path in the repo: React
for `domain/` and `audio/`, and the global-state packages for all of `src/`. It uses the
`typescript-eslint` variant and not the core one, because that variant also sees `import type`. A
careless refactor uses `import type` to slip through.

**The domain modules have a direction too, and the linter verifies it.** Without it, a `placement.ts`
that imports `sequence.ts` passes lint in silence. The modules live in different capabilities, so
`DOMAIN_MODULES` and `DOMAIN_DIRECTION` in `eslint.config.js` write it module by module, in three
levels:

- `transform.ts` (pieces) at the bottom.
- `placement.ts` (board-editing), `routing.ts` (circuit) and `music.ts` (musical-model) above it.
  `music.ts` **does not know the other two**: the board rules and the musical model are orthogonal,
  and that is a property of the instrument.
- `sequence.ts` (circuit) and `invariants.ts` (pieces) as leaves that do not import each other.

Those six rows expand to six **zones** of the same rule. So the flat-config trap does not apply
there: there is no override to overwrite. The trap is this: the most specific override replaces the
previous one instead of adding to it. It still applies to the two `no-restricted-imports` blocks. That
is why the groups are named constants (`GRUPO_ESTADO`, `GRUPO_REACT`) and not lists written twice.

The most important effect is indirect. `voice.ts` and `scheduler.ts` receive the `AudioContext` as a
parameter and **cannot** touch the singleton: it lives in `engine.ts`, and they do not import it. The
import graph holds that invariant, not a comment. This is what makes the audio testable.

### Each role has its folder

**Modules contain behavior. Data, types and fixed values live in the folder of their role.** A layer
`.ts` file has functions and nothing else. The file repeats the module name with the role suffix:
`Cell` is not in `types/index.ts`, it is in `pieces/transform.ts`, the contract of the
module `transform.ts`.

| Role | Folder | File |
|---|---|---|
| logic of one concern | `src/<capability>/<layer>/` | `<module>.ts` |
| a type that crosses a boundary | next to its module | `<module>.types.ts` |
| data or a fixed value | next to its module | `<module>.constants.ts` |
| test of a module | `<layer>/__tests__/` | `<module>.test.ts` |
| test helper | `<layer>/__tests__/` | descriptive name |
| component | `src/<capability>/ui/` | `PascalCase.tsx`, only export |
| hook that wires a module | next to the module | `use-<module>.ts` |
| hook with no module of its own | `<layer>/hooks/` | `useCamelCase.ts` |
| validation of external data | `<layer>/schemas/` | `<module>.schema.ts` |
| internal helper of a module | `<layer>/utils/` | `<module>.utils.ts` |
| helper that two capabilities use | the capability that owns its rule | the other one imports it |

**Modules do not declare constants.** A literal with a meaning goes to `<module>.constants.ts`. The only numbers
left in a module are the ones that cannot have a name: an index `+ 1`, a `% 12` that is pitch-class
arithmetic, the `440`/`69` that *defines* the MIDI anchor.

**The linter verifies this in `domain/` and `audio/`, and not in `ui/`.** The line follows
the reason in the next paragraph: the damage came from a value written in two places. A private
constant of one component cannot get out of sync with anything.

The reason is measurable, not aesthetic. Before the split, four pairs of numbers had to match and
nothing kept them in sync:

- `NOTE_DUR` was `0.35`, and the same number was the default of `scheduleVoice`.
- The tempo `110` was in the UI and in the engine.
- The cell size lived next to a `w-7 h-7` that had to be worth the same.

`ui/` has no private constants today: all of them live in `ui/*.constants.ts`, with
their docblocks whole. The scope of the linter does not change because of that. What holds the line
is measurable: a private constant cannot get out of sync with anything. The selector does not look
at `ObjectExpression` either: `MOTOR` and `RUTA_VACIA` are wiring of functions, not fixed values.

The `Props` of each component are the exception. They stay **inline and unexported**, because
`react-refresh/only-export-components` requires the component to be the only export of the `.tsx`.

**A hook that wires a module goes next to that module, not to `hooks/`.** There are two pairs:

- `engine-bridge.ts` has the pure functions, and `use-engine.ts` has the four effects that call them.
- `input.ts` has the pure input functions, and `use-input.ts` has the two effects that wire them.

The kebab-case name and the adjacency make the pair visible. The decision lives in the file without
`use-`, and the wiring lives in the file with it. `ui/hooks/` would split each pair across two
folders for a naming convention. `hooks/` stays reserved for a hook that wires **no** module.

**A role folder is created with its first file.** Today there is no `hooks/`, `utils/` or `schemas/`:
they would be empty.

<a id="growth-table"></a>

| When this appears… | It goes to |
|---|---|
| a second CSS concern (`@theme` tokens, base layer) | `styles/theme.css` + `styles/base.css`, imported by `styles/index.css` |
| tests that do not map 1:1 to a module (e2e, smoke, visual) | `tests/` at the root, outside `src/` |
| a test helper shared **across layers** | `src/testing/` |
| validation of external data (persist, share by URL) | `<layer>/schemas/` + zod — **a decision for its own spec** |
| an asset imported from code | `src/assets/` |
| a provider or a router | `src/app/`, with `App.tsx` inside |
| a second screen or mode | a capability of its own: a contract in `specs/`, then its folder |
| state that two branches of the tree need | lift the state, or a single-purpose hook in `<layer>/hooks/` — **never** a global store |

A folder under `src/` that is no capability is part of the shell. The spec gate rejects it until
its name is in `SHELL`, in `.agents/scripts/specs.ts`: `src/testing/`, `src/assets/` and `src/app/`
go there with their first file.

### No barrels, explicit extensions, no aliases

- **No re-export `index.ts`.** `export * from './x'` loads extra files and makes the module
  responsible for propagating those re-exports through HMR. Each import points to the concrete
  module.
  - **The linter verifies `export *`**, with a selector on a bare `ExportAllDeclaration`. The
    extension rule below does **not** see it: `export * from './x.ts'` satisfies that rule.
  - The linter does **not** verify the file name, and that is a measured decision. The repo has
    three `index.ts`: `mcp-server/src/index.ts`, `resources/index.ts` and `tools/index.ts`. They are an
    entrypoint and two registries that build a `readonly [...]`, not barrels. A selector cannot
    evaluate "re-export", so a ban on the name gives three false positives.
  - A barrel that re-exports by hand (`export { a } from './a.ts'`) stays outside. This doc states
    it: half a net, written as half a net, is honest.
- **An explicit extension on every local import**: `./pieces/transform.ts`, not `./domain/transform`.
  It reduces resolution work, and above all **raw node requires it** (`ERR_MODULE_NOT_FOUND`). That
  is what lets node load `domain/` without a build.
  - Warning: a missing extension **does not break the app**, because Vite resolves it anyway. The
    error is invisible on the browser side.
  - **The linter verifies it** (`no-restricted-syntax`), on all of `src/` and `mcp-server/`. It covers
    the four forms that name a module: `import`, `import()`, `export … from` and `export * from`.
    These are the four forms that carry **the extension**, not the barrel: `export * from` is in the
    list because it also carries a path.
  - The MCP server loads `src/` with raw node, so `pnpm mcp:test` also fails at the first import
    without an extension. That is the second net, and it only sees what the server imports.
- **No path aliases** (`@/domain/…`). The maximum depth is one, so the benefit is cosmetic, and node
  does not know Vite aliases.
- **One component per file**, and no export other than the component in a `.tsx`. This is not a style
  preference: lint already requires it, and the Fast Refresh granularity is the module.

## TypeScript

### No `any`

**Zero `any` and zero `@ts-ignore` in the repo.** This is the current state, not a goal.

The three that existed went away without a direct attack. Two were around loop management, and they
left when that logic became declarative. The third was the Tone `synth`, with its `@ts-ignore` for
the generic constructor types, and it left with Tone.

All three hid a design problem, not a type problem. **If you want to write a new one, suspect the
design before TypeScript.**

Its counterpart in the linter is `noInlineConfig`: **the repo has no `eslint-disable`**, because to
silence a rule is the other way to hide the problem. A real exception goes as a **per-file override**
in `eslint.config.js`, where the diff shows it and a comment explains it. It never goes as a loose
comment.

### The non-null assertion (`!`) is of the same family

A `!` is a small `any`: it tells the compiler to be quiet **without a reason**.
`@typescript-eslint/no-non-null-assertion` is at `error`.

**Before you write one, try a `const`.** The `!` in `playback/engine.ts` existed only because
TypeScript loses the narrowing inside the closure of a `forEach` when the variable is a module `let`.
A local `const` removed it, with no fight against the compiler.

Production has **three**. All three live as per-file overrides in `eslint.config.js`, with the reason
written next to them:

| File | Why the compiler cannot see it |
|---|---|
| `src/main.tsx` | The Vite idiom on a `#root` that `index.html` itself guarantees |
| `src/pieces/invariants.ts` | The `queue.shift()!` of a BFS, inside a `while` that already guarantees a non-empty queue |
| `src/board-editing/Board.tsx` | The `[role="grid"]` ancestor exists by construction: the handler lives in a descendant of that grid. The alternative `if` is an unreachable branch, and the 100 threshold does not let it be covered |

**In tests the rule does not apply**, and it is off there. A `!` on a `find` or a `querySelector`
that the test itself just set up makes the test **fail** if the node is missing. There are 102, on
100 lines, and they are deliberate.

That list of overrides is the **only source** of the number. While the number lived in prose, it got
out of sync twice: it said "two" when there were three, and "66" when there were 102. The number is
**written with the rule that produces it**, because without the rule nobody can reproduce it. Count
by *occurrence*, with the rule on and its three overrides off. Counted by line it gives 100, because
two lines have two `!` each.

### No skipped coverage branch

This is the corollary of the 100 threshold. `no-warning-comments` verifies it, with the three terms of
the coverage providers and `location: 'anywhere'`.

If a branch looks unreachable, **delete it or make it reachable**. Never ask the provider to skip it.
A threshold with escapes is a lower threshold with no owner. The same argument rejected a threshold
of 95.

**The rule reads text, not syntax, and that has a price.** To spell one of the terms *to explain why
not to use it* also violates the rule. So the three literal terms live in `eslint.config.js` and in
no comment of the repo. A comment that needs them names the mechanism instead of the term.

### Domain types

```ts
// pieces/transform.ts
export type Cell = [number, number];       // [x, y], y grows downward
// pieces/pieces.ts
export type PieceKey = 'F' | 'I' | … ;     // declared explicitly, not derived
```

`PieceKey` is declared by hand and `BASE_MAP` is typed `Record<PieceKey, number>`, not the other way
around. The piece type comes from geometry and not from the musical table, so **a piece added
without a tonic is a compile error**. A `PieceKey` derived from `keyof typeof BASE_MAP` lets that case
pass in silence.

### No `enum`

**The repo has none, and it cannot have one**: `tsconfig.app.json` has `erasableSyntaxOnly: true`,
which rejects them with `TS1294`. This is not a restriction to lift. The same option keeps the code
*type-strippable*, and that lets node load `src/<capability>/domain/` without a build. An `enum` emits runtime
code, so it stays out.

The replacement for any closed set puts its two halves in the role folders. This is the closed set
for the rotation:

```ts
// pieces/orientation.ts  — the value
export const ROTACION = { cero: 0, noventa: 1, ciento_ochenta: 2, doscientos_setenta: 3 } as const;
// pieces/orientation.ts          — the type
export type Rotacion = (typeof ROTACION)[keyof typeof ROTACION];
```

The other closed sets are `ACCION` and `EDICION` (`board-editing/input.ts`),
`MARCA` (`route-source.ts`) and `REGIMEN` (`musical-model/music.ts`).

### The language of identifiers

**English for universal technical vocabulary, Spanish for the existing vocabulary of the
instrument.** This rule is **descriptive**: it comes from what the code already contains. **Nothing
is renamed** backward. A rename backward is churn that no test catches.

English when the name would exist the same in any repo: `rotate90`, `normalize`, `reflect`,
`midiFor`, `buildSequence`, `setBpm`, `clockRunning`, `offset`, `notes`. This is the vocabulary of the
technical domain (geometry, MIDI, Web Audio, React). A translation adds one mental jump per read.

Spanish when the name names something of **this** instrument, or a role that exists only here:
`puertas`, `regimen`, `velo`, `tapLimpio`, `celdas`, `marcas`, `encolar`, `rutaActiva`,
`proyectarAlMotor`, `accionDeTecla`, `MotorDeTransporte`.

The edge case that decides the rule is the **role**. `MotorDeTransporte` does not copy
`startClock`/`stopClock`/`clockRunning`, because the type describes what its consumer needs, not the
engine API. A name that comes from outside keeps the language of its origin.

## Geometry

### The array order is an invariant

`rotate90`, `normalize` and `reflect` (in `pieces/transform.ts`) are a `map` over the cells: **the cell
at index `k` stays the same logical cell after the transform.**

Three things depend on that:

- `ANCHOR_INDEX`, which stores the grab cell as an index instead of a coordinate.
- The cell↔note mapping, which `degreeByCellIndex` computes on the canonical shape and carries by
  index.
- The gates of the circuit, which read the cell of step 0 and the cell of step 4 by index on
  `PlacedPiece.cells`.

A change that filters, sorts or regroups cells inside those functions breaks piece placement **in
silence**.

`checkArrayOrder()` in `pieces/invariants.ts` verifies the order on the 96 combinations. Its own
test checks that the check **goes red** when a transform reorders.

If you need to transform cells another way, write a new function. Do not change these.

### `y` grows downward

Coordinates are grid coordinates, not Cartesian ones: `y` is the row index. In practice, any angular
calculation (`Math.atan2(dy, dx)`) goes around the circle **clockwise** on screen. That is not wrong,
but it is the kind of thing someone "fixes" by mistake.

## State

- **No global state.** No Context, Redux or Zustand. All state is a local `useState` in `App`. The
  linter verifies it by **two** paths, because one is not enough:
  - the package (Redux, Zustand and similar), with `no-restricted-imports`;
  - the **call** to `createContext`. The package ban does not catch it: to import `react` in
    `ui/` is legitimate, so the ban there is on the call, not the import.
- **What is not UI state does not go in state.** The id counter lives in a `useRef`, because a change
  to it must not re-render. The `AudioContext` and the engine sequence (the active one and the
  pending one) live in module singletons, because there is one per tab, not one per component.
- **Never mutate objects already given to React.** That is the bug the loops had:
  `newPiece._sched = id` after `setPlaced(prev => [...prev, newPiece])`. Data that must change later
  goes in state with its own `set`, or outside React.
- **Stable identity for removable elements.** `PlacedPiece.id` exists for that. List `key`s use the
  id, never the index.

## Effects

Effects **reconcile**. They do not run commands. The audio effect observes `[secuencia, placed]` and
gives the whole sequence to the engine with `setSequence`. Handlers only change state.

**A `.tsx` does not declare the logic of an effect: at most it mounts a module in one line.** The
reason is the same one that moved audio and domain out. `react-refresh/only-export-components`
forbids a `.tsx` to export anything but the component. Effect logic written there cannot be exported,
so it cannot be tested. The shell keeps the **derivation** (the `useMemo` calls) and the callbacks:
the hook receives the result, not the rule.

**The linter verifies it** (`no-restricted-syntax` on `src/**/*.tsx`). The counts today:

- **Nine production effects.**
  - Seven live in three hooks of `ui/`: four reconciliation effects in `use-engine.ts`, two
    input effects in `use-input.ts`, and the viewport measure in `use-grid.ts`, a `useLayoutEffect`.
  - **Two live in a `.tsx`**: `Playhead.tsx` and `Spectrum.tsx`.
  - `App.tsx` declares none.
- **Those two are the only exemptions, named file by file** in `eslint.config.js`, not by glob. The
  precedent is the three non-null assertions. They meet the reason and break the letter: each is
  **one line** and delegates to `iniciarCabeza` or `iniciarEspectro`. Those live outside the `.tsx`
  and have tests. If one grows, its own argument stops the exemption. The linter does not count
  lines, so the reason is written above the override.
- **The rule names both hooks**, `useEffect` and `useLayoutEffect`. `use-grid.ts` uses the second on
  purpose, so a rule on the first only lets the same logic through under the other name.
- **`src/**/__tests__/` stays outside**, by a written decision. The ban is on the component layer,
  not on what mounts it. A harness that mounts a component with an effect is legitimate.

`playing` is **not** in the dependencies. The sequence is a function of the board and not of the
transport. `togglePlay` with `alternarTransporte` stops or starts the sound.

To replace the whole sequence is acceptable by design. The sequence is **pure data** that `tick()`
reads, and the clock is an origin that the effect does not touch. `setSequence` does not even make it
current: it keeps it **pending** until the active cycle closes. With Tone, each loop was an event with
identity: the same pattern restarted the phase of all of them, and a lost ID left orphan loops.

Today **no effect in the repo does asynchronous work**, so there is no cancellation flag anywhere. If
one needs it, the pattern is the usual one: `let cancelled = false` captured in the closure, checked
after the `await`, set in the cleanup.

Warning about asynchronous cleanups: in StrictMode they can run **after** the next effect. A cleanup
that must beat the remount must be synchronous. The unmount effect of `use-engine.ts` is that case: it
calls `stopClock()` and gives an empty sequence to `setSequence()`. See
[audio.md](../architecture/audio.md#reconciliación-de-loops).

## Tests

### No `.only`, no `.skip`, no test without an assertion

This is the same bug family as `--filter "{.}"` and the `$` of the `verify` regex: **failing green**.
A forgotten `.only` lets the whole suite pass with no warning. A test without `expect` adds to the
count and verifies nothing.

The linter verifies it, and it needs **one rule per runner**, because neither rule reaches the other
runner:

| Where | What catches it |
|---|---|
| `src/**/__tests__/`, `__tests__/`, `docs/__tests__/`, `specs/__tests__/`, `eslint-rules/__tests__/`, `.claude/scripts/__tests__/` and `.agents/scripts/__tests__/` | `@vitest/eslint-plugin`: `no-focused-tests` (with `fixable: false`, so `--fix` does not delete the `.only` in silence), `no-disabled-tests` and `expect-expect` |
| `mcp-server/**/__tests__/` | a `no-restricted-syntax` selector: `node --test` runs there, and the Vitest plugin does not look at it |

**The test without an assertion stays outside in `mcp-server/`, on purpose.** `node:test` has no
`expect` to count, so there is no cheap equivalent. Without the selector, a `.skip` there also fails,
but **by accident**: `no-floating-promises` catches it, because `allowForKnownSafeCalls` names
`test`/`describe`/`it` and not their members. The message then talks about unawaited promises and
not about the reason, and a `void` silences it with no warning.

## Comments

**Comments explain the why, not the what.** The code says what it does. The comment exists for what
the code cannot say: a decision, a constraint, a bug avoided.

Ousterhout's wording is easier to apply: **a comment must be at a DIFFERENT level of abstraction from
the code.** His red flag *"Comment Repeats Code"* comes from it. The reason to prefer it is
practical. The answer to "is this a why?" is almost always yes. The answer to **"is this at another
level than the code?" comes from a look**. `// normalized` above `return c` fails the second question
with no discussion.

Good:

```ts
// Stored as an index into SHAPES[piece] instead of a coordinate because
// rotate, reflect and normalize map each cell and keep the array order.
const ANCHOR_INDEX: Record<PieceKey, number> = { … };
```

Bad:

```ts
// Maps each piece to an index
const ANCHOR_INDEX: Record<PieceKey, number> = { … };
```

A comment you write is **in English**, like commits and specs. See [Language](#language).

### What is verified is accuracy, not length

This criterion orders the whole section. **The main reader of the comments in this repo is a model
that reads the code to change it**, and for that reader comments do not behave as expected. Three
measurements, and all three push the same way:

- **To remove them is expensive, in the exact task done here.** To turn off the comment concepts in
  the internal representations of a model degrades code refinement **by up to 90 %** and completion
  by up to 15 % ([arXiv:2512.16790](https://arxiv.org/html/2512.16790v1)). Code refinement is what
  this repo does. **Long prose is a measured asset.**
- **A comment that lies costs as much as obfuscated code.** CodeCrash measured **17 models and 1279
  tasks**. Misleading natural language, comments included, degrades code reasoning by **23.2 %** on
  average. It still costs **13.8 %** with step-by-step reasoning: as much damage as obfuscating the
  structure ([arXiv:2504.14119](https://arxiv.org/html/2504.14119)).
- **Irrelevant volume misleads, even when it is true.** The *context rot* study on 18 models names
  **distractor interference**: content that is semantically close but irrelevant actively misleads.
  A chronicle of how the code got here is exactly that: it talks about the code, about a past that no
  longer applies.

**Conclusion: what matters is not how much a comment says, but that what it says stays true.** A long,
true comment is cheap. A short, rotten one is expensive. So the checks target accuracy, and
**nothing in this repo is shortened because it is long**.

### Each clause, and what verifies it

Two local rules in `eslint-rules/` verify the comment convention. The operational detail, for
writing and not for reference, lives in
[`.agents/rules/comments.md`](../../.agents/rules/comments.md). It loads on its own when you touch
`src/**` or `mcp-server/src/**`.

| Clause | Verified by |
|---|---|
| A comment is not empty and does not archive code | `local/comment-shape`, `vacio` and `codigo` |
| A JSX comment does not relabel the markup | `local/comment-shape`, `etiqueta` |
| The first paragraph of a docblock is 2 lines or fewer | `local/comment-shape`, `resumen` |
| **A citation must resolve** | `local/comment-anchor`, `muerta` |
| A comment does not narrate history | `local/comment-anchor`, `historia` |
| The comment says the why and is at another level than the code | **Nothing: a linter cannot evaluate it** |

The last row is the point of the table. What the linter requires is not explained again in prose
here. What it cannot evaluate stays whole, because there the prose is all there is.

**A citation must resolve** reverses a borrowed rule. The source repo **forbids** a file name in a
comment, with a good argument there: its citations point outside the repo. Here it was measured
first: **315 citations, 309 alive**. A ban would be 98 % noise. So the check verifies that a
citation resolves. That catches the real failure mode: a file deleted or renamed,
which [arXiv:2212.01479](https://arxiv.org/abs/2212.01479) measured on more than 3000 projects. The
case here was `log.md`: comments cited it **seven** times, three in production, after its deletion.

This is not a style preference. **A change that leaves the comment inconsistent is ~1.5 times more
likely to end in a bug-introducing commit** than a consistent one. Wen et al. (ICPC 2019) measured it
on 1.3 billion AST-level changes in 1500 systems. That is why it is a gate and not a guideline.

### The time axis: current constraint against chronicle

"The why" has two forms, and only one ages well. **A comment that describes a constraint that TODAY
forces the code to be this way stays. A comment that tells how the code got here moves out, and a
one-line pointer stays in its place.** The chronicle of a change goes to its PR or its issue. The
reason for a big choice goes to an ADR in [`decisions/`](../architecture/decisions/).

A chronicle in the code has a cost. The reader must separate, paragraph by paragraph, the constraint
that is still alive from the story of how it came to be. The story rots on its own: each change adds
one more layer of "this used to say something else".

**`local/comment-anchor` marks it, with `historia`.** The rule does not decide: it points to the
candidate, and the split is a judgment.

It stays (current constraint: the code cannot be written another way):

```ts
// The ternary and not `({ offset, note })`: with the short form the silent click goes out
// with the key `note` PRESENT and `undefined`, and the absence of the field is exactly
// what says "empty cell".
```

It moves (chronicle: it tells a change of mind, not a constraint of today):

```ts
// The plan said the cycle was X. It changed AFTER LISTENING to it, and the next change
// removed the symptom and not the cause.
```

Three rules to apply it without loss:

- **When in doubt, it stays.** One comment too many costs a read. One too few costs the argument,
  and the argument is what this repo values.
- **If a paragraph mixes the two, split it.** The constraint stays where it is. The history moves and
  leaves the pointer.
- **No numeric target.** A percentage is an incentive to delete the long comment, and here the long
  comment is systematically the good one.

### Three checks evaluated and rejected

They are here so that nobody proposes them again. All three came with the borrowed rules, and all
three were measured on this tree before the decision:

- **Length (302 findings) and density (49).** They are prose budgets. They conflict with "no numeric
  target" above and with the 90 % degradation in refinement. A cut by number optimizes the wrong
  variable.
- **A comment at the end of a code line (49).** **It is allowed**, by an explicit decision. It anchors
  the explanation to the exact token without one more line, and no benchmark shows harm. The ESLint
  core rule `no-inline-comments` does exactly that ban. It is also *frozen*, with its deprecation
  accepted and no replacement in `@stylistic`, so a dependency on it buys the work twice.
- **A ban on citing an issue (10).** Here the pointer to an issue **is** the convention.

Run verbatim, the borrowed rule gave **1007 findings in 92 of 93 files**. A gate that turns the whole
tree red does not get fixed: it gets turned off. After the cut above, 186 were left, and none is a
style disagreement. Each is a citation that does not resolve, a first paragraph that runs into the
body, or a chronicle that already has a place to move to.

## Styles

Tailwind 4, with no config file. Utilities are written inline in the JSX. For conditional class logic,
use template literals:

```tsx
className={`border ${occ ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-100'}`}
```

When there are more than two branches, compute the class in a variable before the JSX, as the `tone`
of the board cells does. Do not nest ternaries.

**A value that comes from a constant goes through an inline style, not a class.** Tailwind scans the
source: an interpolated class (`w-[${CELL_PX}px]`) is never generated, so the number is written twice
again. The board cells read the custom property `--cell`. `board-fit/use-grid.ts` writes it on the
root container from the measured viewport. The inline style is still the path:
`width: calc(var(--cell) * 1)`. And there is one more reason: the browser resolves a custom property
on each element. So a window resize moves the cells, the veil and the playhead **with no React
re-render**.

## Commits

- In English, in the imperative, with no Conventional Commits scope.
- The body explains **the why and the root cause**, not the list of files touched: the diff already
  has that.
- A deletion goes in its own commit, so that a revert is trivial.
