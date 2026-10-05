# Conventions

These directives apply to the code, the tests, the comments, the documentation, the rules, the
specs, the issues, the commits and the PRs. The linter enforces most of them, and the reason for
each one is a comment next to it in [`eslint.config.js`](../../eslint.config.js). This document
names those in one line, and gives in full the directives that no tool enforces.

## Code

1. Put a file in the folder of the capability whose rule it implements. The spec gate and the
   linter refuse a subfolder, a `constants/` or `types/` folder, and a `*.constants.ts` or
   `*.types.ts` file.
2. Put a constant, a type or a helper in the module that defines or produces it. If two modules
   read it, it belongs to the module whose rule it states, and the other module imports it. No
   tool checks the owner.
3. Put no value that another file reads in `playback/engine.ts`. Only the browser project runs
   that module, and the coverage gate fails when the node project loads it. See
   [the decision](../architecture/decisions/2026-10-04-package-by-capability.md).
4. Put a decision that a test must reach in a `.ts` module. A `.tsx` exports only its component
   (`react-refresh/only-export-components`) and declares no effect (`no-restricted-syntax`).
5. Put a hook that wires a module next to that module, as `use-<module>.ts`. The decision lives in
   the file without `use-`. The wiring lives in the file with it.
6. End each local import with its extension: `./transform.ts`. The linter checks it. Use no path
   alias: plain node loads `src/` for the MCP server, and node does not know a Vite alias.
7. Write no barrel. The linter refuses `export *`. It does not see a barrel that re-exports by
   hand (`export { a } from './a.ts'`): do not write one.
8. Import `src/` from `mcp-server/`, never the reverse (`import-x/no-restricted-paths`).
9. Write no `any`, no `@ts-ignore`, no `enum` and no `eslint-disable`. If you want one, suspect
   the design before TypeScript. A real exception goes as a per-file override in
   `eslint.config.js`, where the diff shows it and a comment explains it.
10. Write no non-null assertion (`!`) in production code. Try a local `const` first. In a test, a
    `!` on a node that the test itself set up is deliberate: the test fails if the node is missing.
11. Keep no global state: no Context, no Redux, no Zustand. The linter refuses the packages and
    the call to `createContext`. If two branches of the tree need a state, lift it.
12. Write no `.only`, no `.skip` and no test without an assertion. The linter checks each runner.
    In `mcp-server/`, `node:test` has no `expect` to count, so no tool sees a test without an
    assertion there.
13. Write no comment that skips a coverage branch (`no-warning-comments`). Delete the branch or
    make it reachable. The rule reads text: a comment that spells one of its three terms fails
    too, so name the mechanism and not the term.
14. Write a comment by [the comment rules](../../.agents/rules/comments.md). Two local lint rules
    check accuracy, and none checks length:
    [the decision](../architecture/decisions/2026-10-04-comment-checks-measure-accuracy-not-length.md).
15. Write a commit message in the imperative, with no Conventional Commits scope. The body gives
    the reason and the root cause, not the list of files. Put a deletion in its own commit.

## Language

The rules follow ASD-STE100.

1. Write one idea in each sentence.
2. Write instructions of 20 words or fewer. Write descriptions of 25 words or fewer.
3. Write paragraphs of one idea and six sentences or fewer.
4. Use the active voice and the present tense.
5. Write a step in the imperative: "Run the gate", "Move the rule".
6. Use numbers for a sequence and bullets for a set.
7. Put a warning before the step it applies to.
8. Use one term for one concept. Use the term of the glossary. Do not use synonyms.
9. Do not use filler words: "simply", "basically", "very", "really".
10. Write code, file and variable names as they are, in backticks.
11. Write everything in English: content, file names, folder names and new identifiers. An
    identifier of the instrument that exists in Spanish stays as it is: `puertas`, `velo`,
    `MotorDeTransporte`. A rename is churn that no test catches.
12. Write a measured number with its unit, not an adjective. Write the decimal point as a point:
    `11.3 ms`.
13. Name a rule by what it says, or a criterion by its code: `AC-CIR-006`. Do not name a numbered
    spec.
14. Wrap Markdown at 100 columns.

## Glossary

The contract of each capability has its full term table. This glossary has the terms that cross a
contract. [Capabilities](../architecture/capabilities.md) gives the owner of each term.

| Term | Meaning | Do not use |
|---|---|---|
| piece | One of the twelve pentominoes, named by its letter. | pentomino, block |
| board | The grid of square cells that the user plays on. | grid, canvas |
| cell | One square of the board. | square, gridcell |
| reference board | The board of 10 columns by 6 rows that the examples and the time budgets use. | default board |
| orientation | A rotation of 0°, 90°, 180° or 270°, plus a reflection flag. | pose, angle |
| piece in hand | The piece that the next placement uses, with its orientation. | selected piece |
| grip cell | The cell of the piece in hand that lands on the pointed cell. | anchor cell, handle |
| pointed cell | The board cell under the mouse pointer, or the board cell with keyboard focus. | hover cell, cursor |
| anchor cell | The one cell of the board that the Tab key reaches. | entry cell, grip cell |
| ghost | The drawing of the piece in hand at the pointed cell, before it is placed. | preview, shadow |
| muted piece | A placed piece that keeps its cells and its time in the circuit, and sounds no note. | silenced, disabled |
| stored piece | A placed piece that does not fit entirely in the current board. It is not drawn. | hidden piece |
| piece limit | The maximum number of placed pieces on the board, stored pieces included. | cap |
| tonic | The pitch class that a piece owns. | root, base note |
| regime | The global setting that decides what rotation does to the notes: scale or order. | mode, level |
| degree | Which note of the ascending arpeggio a cell owns, from 0 to 4. | index, grade |
| step | The position of a cell in the order the arpeggio sounds, from 0 to 4. | order number |
| interval | One sixteenth note at the current tempo: the unit of musical time. | beat, tick |
| circuit | The closed order in which the sequence visits the placed pieces, once in each cycle. | tour, path, loop |
| cycle | One full pass of the circuit, measured in intervals. | bar, loop |
| gate | The cell of the first note of a piece (entry gate) or of its last note (exit gate). | entrance, exit |
| leg | The route from the exit gate of one piece to the entry gate of the next piece. | hop, jump |
| seam | The one extra neighbour pair of the board: its first cell and its last cell. | wrap, torus |
| sequence | The events of one cycle, each with its interval and its cell. | route, pattern |
| crossing | The event of a leg on a cell that a placed piece occupies. It sounds the note of that cell. | grace note |
| click | The event of a leg on a cell that has no note to give. | tick, metronome |
| transport | The play or pause state of the instrument. | loop, clock |
| playhead | The mark on the cell of the event that sounds now. | read head, cursor |
| veil | The cover on a placed cell that has not sounded yet. | dimming |
| dock | The floating panel with the pieces and the controls. | palette, sidebar |

A code name does not change for the glossary: `ANCHOR_INDEX` is the index of the grip cell.
