# Directory structure

## Overview

```text
pentomino-games/           # repo root: the app lives here, with no subdirectory
├── AGENTS.md              # What a file cannot tell you; loaded by Claude Code and Codex
├── CLAUDE.md              # Imports AGENTS.md and adds what only Claude Code needs
├── DESIGN.md              # The visual language
├── docs/                  # This documentation; docs/__tests__/ holds the gates that verify it
├── specs/                 # The contract of each capability: specs/<capability>/<capability>.md
├── public/                # Assets served as they are, copied to dist/
├── src/                   # All the app code
├── mcp-server/            # Domain MCP server: tooling, NOT in the bundle
├── __tests__/             # Gates on files outside src/: the root files and the branch model
├── .agents/               # The harness, canonical for Claude Code and Codex: rules, scripts, skills
├── .claude/               # Claude Code: settings, generated copies of rules and skills, one hook script
├── .codex/                # Codex: hooks.json
├── .github/               # The verify workflow and the task-brief issue template
├── .mcp.json              # Registers the server; committed, nothing to configure
├── index.html             # Vite entry point (at the root, not in public/)
├── vite.config.ts         # Plugins react() + tailwindcss(), and the two Vitest projects
├── eslint.config.js       # Flat config v9: direction zones + the repo rules
├── eslint-rules/          # The two local rules `local/comment-*`, bloques.mjs and their __tests__/
├── vercel.json            # Deploy config (see infra/deploy.md)
├── pnpm-workspace.yaml    # Workspace of two packages: `.` and `mcp-server`
├── pnpm-lock.yaml         # One lockfile for both packages
├── LICENSE
└── tsconfig{,.app,.node,.eslint-rules}.json
```

## The harness

`.agents/` is the source. Each other harness folder holds a copy that
`node .agents/scripts/sync.ts` writes, and `sync.ts --check` fails when a copy differs from its
source. Do not edit a copy by hand.

```text
.agents/
├── rules/                        one rule per layer; its `paths:` say which folders it covers
│   └── audio · comments · domain · mcp-server · specs · ui (.md)
├── skills/                       shape · to-issue · to-spec · implement-feature · implement-batch ·
│                                   pr-review · pr-review-batch · review-spec-drift
│                                   A skill carries copies of the scripts and docs it uses
└── scripts/                      TypeScript that node runs without a build
    ├── hook.ts                   the PreToolUse hook of both harnesses: `hook.ts <claude|codex>`
    ├── protocol.ts               how each harness sends its payload, and how it becomes an Intent
    ├── policy.ts                 what can be written from which branch; INTEGRATION_BRANCH and
    │                               RELEASE_BRANCH
    ├── system.ts                 the git port of the hook, with real git behind it
    ├── worktrees.ts              where worktrees live (.claude/worktrees/) and how they go
    ├── clean-worktrees.ts        removes worktrees under .claude/worktrees/, and only there
    ├── specs.ts                  the spec gate: corpus shape, and each criterion against its test
    ├── sync.ts · copies.ts       writes or checks the generated copies
    ├── task-brief.ts · brief.ts  starts and checks an issue draft against the task-brief template
    ├── pr-diff.ts · diff.ts      materializes the diff of one PR and measures its review axes
    ├── screenshots-to-branch.ts · screenshots.ts
    │                             pushes the screenshots of an issue to the orphan branch
    │                               screenshots/<N>
    └── __tests__/                one per module
```

Each entrypoint (`hook.ts`, `sync.ts`, `task-brief.ts`, `pr-diff.ts`, `screenshots-to-branch.ts`)
has no branches: the logic lives in the module next to it, with git and the disk injected, so a
test can drive it.

The generated copies:

| Source | Copy |
|---|---|
| `.agents/skills/` | `.claude/skills/` |
| `.agents/rules/` | `.claude/rules/` |
| each rule, by its `paths:` | the `AGENTS.md` of each folder it covers: `src/`, `mcp-server/`, `mcp-server/src/`, `specs/` |
| each contract in `specs/` | `src/<capability>/AGENTS.md`, a pointer to the contract |

The root `AGENTS.md` is written by hand. A generated `AGENTS.md` starts with a comment that names
its source.

`.claude/` also holds `settings.json` (the hooks) and `scripts/lint-al-cerrar.mjs`, which lints what
changed when a turn ends. `.codex/hooks.json` points Codex at the same `hook.ts`.

## `specs/`

```text
specs/
├── <capability>/<capability>.md  the contract: BR rules and AC criteria
│                                   accessibility · board-editing · board-fit · circuit ·
│                                   musical-model · panels · pieces · playback · spectrum
├── _template/capability-spec.md  the shape of a new contract
├── __tests__/specs.test.ts       the gate: every AC of a `ratified` spec is cited by a test
└── AGENTS.md                     generated from .agents/rules/specs.md
```

The rules of a contract are in [specs.md](../../.agents/rules/specs.md).

## `mcp-server/`

A separate package, with its own dependencies and its own `tsconfig.json`. **The dependency goes
one way: `mcp-server/` imports from `src/`, never the reverse.**

```text
mcp-server/
└── src/
    ├── index.ts                  entrypoint: serveStdio + registration of tools and resources
    ├── pieces.ts                 the 12 letters, derived from SHAPES
    ├── render.ts                 ASCII of one piece (pure)
    ├── symbols.ts                index of the symbols of src/, built on each query
    ├── resources/                one resource per file + the array in index.ts
    ├── tools/                    one tool per file + the array in index.ts: check_invariants ·
    │                               describe_piece · find_symbol · simulate_board
    └── __tests__/                node --test: tools, resources, symbols and render
```

A package and not one more folder, for a reason: `zod` and `@modelcontextprotocol/server` stay in
`mcp-server/node_modules` and **do not** appear in the root one. The tooling cannot leak into the
bundle. pnpm guarantees it, not discipline.

It has no `dist/`: node runs the `.ts` files and strips the types. That is why the server requires
**Node ≥ 22.18**, above the floor of the app. It is also why the server cannot serve stale code.
Detail in [mcp-domain.md](../guides/mcp-domain.md).

## `src/`

**`src/` is organized by capability.** Each folder under `src/` has the name of a contract in
`specs/`, and it holds the code of that capability and nothing else. Inside a capability, the
layers are subfolders: `domain/`, `audio/` and `ui/`. A capability has only the layers it needs.
The shell stays at the root of `src/`.

The link goes both ways, and the spec gate verifies it: every folder under `src/` except the shell
has a contract with its name, and every contract has a folder. Each capability folder holds a
generated `AGENTS.md` that points at its contract.

```text
src/
├── main.tsx                      # createRoot + StrictMode + import of styles/index.css
├── App.tsx                       # the shell: state, derived values, handlers and composition. Zero effects
├── vite-env.d.ts                 # Vite types
├── styles/
│   └── index.css                 # @import "tailwindcss" + global body/code styles
├── __tests__/                    # the app-level tests, and browser-setup.ts for the browser project
├── AGENTS.md                     # generated from the layer rules: domain, audio, ui, comments
│
├── pieces/                       # the 12 shapes, their orientation, and the checks of the model
│   ├── domain/
│   │   ├── transform.ts          # rotate90 · normalize · rotateN · reflect · centroid ·
│   │   │                         #   angleFromCentroid · pathThroughCells
│   │   ├── invariants.ts         # the seven checks of the model + checkAll
│   │   ├── transform.types.ts    #   Cell
│   │   ├── pieces.types.ts       #   PieceKey
│   │   ├── pieces.constants.ts   #   SHAPES · ANCHOR_INDEX
│   │   └── invariants.constants.ts #   ROTATIONS
│   └── ui/
│       ├── piece-mini.ts         # the shape of a piece centered in the 5×5 box of the palette,
│       │                         #   rotated and reflected. Outside the .tsx so it can be tested
│       ├── orientation.constants.ts # ROTACION, the initial orientation and the twelve slots
│       │                         #   derived from SHAPES
│       ├── orientation.types.ts  # Rotacion · Orientacion · MemoriaDeOrientacion
│       └── palette.constants.ts  # the 12 colors and their text color (see DESIGN.md)
│
├── board-editing/                # place, remove, mute, and the gestures that do it
│   ├── domain/
│   │   ├── board.ts              # cellsAt · isValid · cabeEn · occupantAt · occupantCellIndex
│   │   ├── board.types.ts        #   PlacedPiece · Dims
│   │   └── board.constants.ts    #   GRID_MIN · GRID_DEFAULT · MAX_PIEZAS
│   │                             #   (the board size is a parameter)
│   └── ui/
│       ├── Board.tsx             # the grid that `dims` gives: color per piece, note per cell, and the
│       │                         #   ghost that shows the same before placement
│       ├── input.ts              # the decision for each input gesture: wheel, key, context menu
│       │                         #   and click on a cell
│       ├── use-input.ts          # the two input effects: keyboard and wheel. They receive callbacks,
│       │                         #   not setters, and the tapLimpio of the shell
│       ├── input.constants.ts    # ACCION and EDICION: what a gesture can ask for
│       └── input.types.ts        # Accion · Edicion · the event fields the pure functions read
│
├── board-fit/                    # how many cells fit in the screen, and the size of each one
│   └── ui/
│       ├── grid-fit.ts           # how many cells fit in the viewport and the size of each one.
│       │                         #   Pure, outside the hook so it can be tested without a browser
│       ├── use-grid.ts           # measures the root container, writes the cell into --cell and
│       │                         #   returns the dimensions as state
│       └── layout.constants.ts   # CELL_PX_OBJETIVO (the target size, 73) and the ratios that make
│                                 #   the tile proportional · MINI_BOX · MINI_CELL_PX ·
│                                 #   MINI_PISTA_PX · TEMPO_MIN · TEMPO_MAX · the two ratios of the
│                                 #   cell focus ring
│
├── musical-model/                # the note of each cell
│   ├── domain/
│   │   ├── music.ts              # midiFor · midiName · notesForRotation · arpeggioFor ·
│   │   │                         #   degreeByCellIndex · angularRank
│   │   ├── music.types.ts        #   RegimenDeRotacion, derived from REGIMEN
│   │   └── music.constants.ts    #   CHROMATIC · PENT_* · BASE_MAP · DEFAULT_OCTAVE
│   └── ui/
│       ├── cell-text.ts          # what each cell shows: its note (by degree) and its #N (by step).
│       │                         #   Outside the .tsx so it can be tested
│       └── cell-text.types.ts    # CellText: what a cell shows
│
├── circuit/                      # the order of the pieces, the legs between them, the silences
│   └── domain/
│       ├── routing.ts            # costuraDe · routeBetween · rutador: the graph of the board and
│       │                         #   the cheapest route between two cells
│       ├── sequence.ts           # buildSequence (the circuit, Held-Karp, and the cycle offsets),
│       │                         #   cellsByPlayOrder, gates (the two doors; simulate_board uses them)
│       │                         #   and noteAtCell, the note on one cell
│       ├── routing.types.ts      #   Ruta
│       ├── routing.constants.ts  #   CROSS_COST
│       ├── sequence.types.ts     #   Step · Click · Sequence
│       └── sequence.constants.ts #   PASOS_MAX
│
├── playback/                     # the transport, and the sound in time
│   ├── audio/                    # Web Audio; speaks MIDI, knows neither the domain nor the UI
│   │   ├── voice.ts              # midiToHz · scheduleVoice · scheduleClick
│   │   ├── scheduler.ts          # collectHits · collectWindow (the swap at the cycle end) ·
│   │   │                         #   barDuration · intervalDuration
│   │   ├── engine.ts             # singletons and the API the UI consumes
│   │   ├── playhead.ts           # offsetAt: the offset arithmetic of the playhead
│   │   ├── voice.types.ts · scheduler.types.ts
│   │   ├── voice.constants.ts    #   the envelope, the three velocities and the click
│   │   ├── scheduler.constants.ts #  LOOKAHEAD · TICK_MS · the subdivision · HIT
│   │   ├── engine.constants.ts   #   MASTER_GAIN · DEFAULT_BPM · the two delays · the FFT
│   │   └── __tests__/test-context.ts # render and measurement helpers (not a test)
│   └── ui/
│       ├── engine-bridge.ts      # the two pure functions of the bridge to the engine: proyectarAlMotor
│       │                         #   (the only one in the repo that sees both Sequence types) and
│       │                         #   alternarTransporte, which returns what the engine says
│       ├── use-engine.ts         # the four reconciliation effects: tempo, clicks, the sequence
│       │                         #   against the board, and unmount
│       ├── engine.types.ts       # MotorDeTransporte · SequenceDelMotor
│       ├── Playhead.tsx          # playhead: rAF + imperative style, no props
│       ├── playhead-loop.ts      # the loop of the playhead and of the veil, outside the .tsx so it
│       │                         #   can be exported and tested
│       ├── playhead.constants.ts # the three border widths, their table by MarcaKind and the
│       │                         #   veil classes
│       ├── route-source.ts       # singleton outside React (not a component): mirrors the active/
│       │                         #   pending pair of the engine with the domain Sequence, with cells
│       ├── route.constants.ts    # MARCA: the states of a cell under the playhead
│       └── route.types.ts        # Marca · CeldaPorEstrenar
│
├── spectrum/                     # the signal on screen
│   ├── audio/
│   │   └── spectrum.ts           # pure mapping from FFT bins to bar heights
│   └── ui/
│       ├── Spectrum.tsx          # spectrum canvas: rAF + HiDPI, no props
│       ├── spectrum-loop.ts      # the loop outside the .tsx: drawBars, drawIdle and iniciarEspectro
│       └── spectrum.constants.ts # BAR_COUNT · GAP · MIN_BAR · IDLE_TEXT
│
├── panels/                       # the dock and its two panels
│   └── ui/
│       ├── PiecePalette.tsx      # the floating dock, the composition of the two panels and the
│       │                         #   two rows between them
│       ├── OrientationPanel.tsx  # the twelve thumbnails, each one in ITS remembered orientation
│       ├── TransportPanel.tsx    # tempo, play/pause, the empty-board tour and reset
│       ├── orientation-text.ts   # the orientation in words, in two fragments: the visible line of
│       │                         #   the panel and the aria-label of the thumbnails
│       └── panel.types.ts        # PropsDeOrientacion · PropsDeTransporte
│
└── accessibility/                # keyboard and the accessible tree
    └── ui/
        └── cell-name.ts          # what each cell ANNOUNCES: its accessible name and the text of
                                  #   the aria-live region for the three edits
```

Each layer folder has a `__tests__/` with one test per module, next to its subject. A file belongs to
the capability whose criteria its tests cite. A module that serves two capabilities lives in the one
that owns its rule, and the other imports it.

## The dependency direction

This rule orders everything else, and **the linter verifies it**, not review:

```text
inside every capability:   domain/ and audio/ import nothing from ui/ or from the shell
                           domain/ imports nothing from any audio/; audio/ nothing from any domain/
                           ui/ and App.tsx import from both
between domain modules:    transform ← board · routing · music ← sequence · invariants
```

`domain/` and `audio/` are **siblings with no edge between them**: the engine speaks MIDI numbers and
does not know what a pentomino is. A forbidden import fails `pnpm lint` with the message of its zone
in `eslint.config.js`. The zones are globs over every capability (`src/*/domain/**`), so a new
capability is covered on its own. The order between the domain modules is a list of module paths,
because those modules live in different capabilities. The reason for each rule is in
[conventions.md](../guides/conventions.md).

All files in `src/` are live. The leftovers of the Create React App and Vite templates (`App.css`,
`logo.svg`, `assets/react.svg`, `setupTests.ts`) were deleted. This sentence keeps them from coming
back.

To confirm that a file you add is used:

```bash
grep -rq "App.css" src --include="*.tsx" --include="*.ts" --include="*.css"
```

### Tests

`pnpm test` runs Vitest in **two projects and one command**. The split is not by layer. It is by what
the test needs:

- **`node`**: `environment: 'node'` against `node-web-audio-api`, over **seven** roots. There are 41
  files: 20 in `src/`, 4 in the root `__tests__/`, 3 in `docs/`, 1 in `specs/`, 1 in
  `.claude/scripts/`, 2 in `eslint-rules/` and 10 in `.agents/scripts/`. The domain is pure and the
  audio has a native Web Audio implementation, so both run there with no adaptation. A test that is
  **not** the test of a module reads a file **from disk**: the browser project serves its own document
  and never loads those files. **Each gate lives next to the subject it verifies**, not next to what
  the subject touches:
  - `__tests__/` at the **repo root**: four gates that check a claim against the files outside `src/`
    that hold it. `documento.test.ts` checks the `lang` of `index.html`.
    `fondo-sincronizado.test.ts` and `nombre-sincronizado.test.ts` check that the background color and
    the app name say the same in the three places that write them: `index.html`,
    `public/manifest.json`, `README.md`. `branches-in-sync.test.ts` checks the two-branch model in
    `.github/workflows/verify.yml`, in `.agents/scripts/policy.ts` and in `docs/infra/branches.md`.
    These gates read the root, so they live at the root and not in `src/`.
  - `src/__tests__/`: what stays there belongs to the **app**. `App.browser.test.tsx` and
    `arbol-accesible.browser.test.tsx`, the gate that walks the accessibility tree of the whole app.
    Both run in the other project.
  - `docs/__tests__/`: the three gates of the **documentation**. They import no line of `src/`.
    `enlaces-resueltos.test.ts` checks the links and anchors of every `.md` in the repo.
    `mapa-de-directorios.test.ts` checks that this file names every production file.
    `agent-docs-bounded.test.ts` keeps `AGENTS.md` and `CLAUDE.md` within their line budget.
  - `specs/__tests__/specs.test.ts`: the **spec gate**. It goes red when a `ratified` contract has an
    AC that no test title cites, or when a test title cites an AC that does not exist.
  - `.claude/scripts/__tests__/lint-al-cerrar.test.ts`: the hook that lints what changed when a turn
    ends.
  - `eslint-rules/__tests__/`: the `RuleTester` of the two local comment rules. ESLint runs them, not
    the app, so without this root they stay unverified. It is the only root outside `src/` that
    enters coverage, because it verifies code of this repo and not a text file.
  - `.agents/scripts/__tests__/`: one per harness module. They also enter coverage.
- **`browser`**: real Chromium, through Playwright, over `src/**/__tests__/*.browser.test.tsx`. There
  are 12: the six components, `App.tsx`, the accessibility-tree gate, the three hooks and
  `playback/audio/engine.ts`. They render with `vitest-browser-react`. The `setupFiles` (`browser-setup.ts`)
  imports the stylesheet **once**. Without it, `z-10` is in the `className` and `getComputedStyle`
  returns `auto`: a layout test passes or fails for the wrong reason, in silence.

The discriminant is the **suffix**, not the folder: a test of `Board.tsx` that needs a browser is
still a test of `Board.tsx` and lives next to it. The `include` patterns end in `__tests__/` with one
`*`, so they match neither the helpers that are not tests (`test-context.ts` and `browser-setup.ts`
lack the `.test.` before the extension) nor the `__screenshots__/` artifacts.

**Chromium is not in the lockfile:** a fresh clone needs `pnpm exec playwright install chromium`
before the first `pnpm verify`.

The **MCP server tests run apart**, with `pnpm mcp:test`. They live in `mcp-server/src/__tests__/` and
`node --test` runs them, with its own coverage thresholds at 100 (node flags, not Vitest ones). The
`include` patterns do not overlap: the Vitest one starts at `src/`.

**Rendering a component works without `jsdom`, and rejecting it was the decision.** jsdom gives no 2D
canvas, `createLinearGradient`, `ResizeObserver`, `matchMedia` or `getBoundingClientRect` with
numbers. Covering `Spectrum.tsx` with it would require mocking exactly the code under test: coverage
without verification. The `@testing-library/*` packages **are not in the tree**. They left together
with `@types/jest`, `postcss` and `autoprefixer`, because none had a consumer. The case that waited
for them (the transport button says what the clock does, not what it was asked) closed another way:
the handler moved to a pure function (`engine-bridge.ts`) that receives the engine as a parameter.

`pieces/ui/__tests__/palette.test.ts` tests constants, runs in the `node` project and mounts
nothing. The logic does not live in the components either: the derivation from `(x, y)` to the note
name that `Board` shows is in the `domain/` layers (`occupantCellIndex` · `degreeByCellIndex` ·
`playOrderByCellIndex` · `notesForRotation` · `midiName`), and the `.tsx` only indexes the result.

**Chaining those functions is a decision too, so the chain left the `.tsx`.** It lives in
`cell-text.ts`. Choosing *which* of the two numberings per cell feeds the number and which feeds the
note is a decision. Inside a component it could not be tested: `react-refresh/only-export-components`
forbids the file to export anything but the component. So the `#N` bug lived with 238 green tests.
The pure domain functions were right; there was no test between the pure function and the pixel.

`route-source.test.ts` shows where the seam is: `route-source.ts` is **not** a component. It is the
module singleton that mirrors the active/pending pair of the engine, so it has its own logic and its
test mounts nothing. It mocks `playback/audio/engine.ts` with `vi.mock`, because it only uses
`cycleGeneration()`, a number. Importing the real engine would pull in the `AudioContext` singleton
to read a counter. The state belongs to the module, so each case imports it again after
`vi.resetModules()`. Without that, the test order would be part of the oracle.

## `public/`

Copied as it is to `dist/`. Paths are referenced from the site root (`/favicon.ico`).

**No routing rule goes here.** A `_redirects` file with the SPA fallback `/* /index.html 200` lived
here, documented as "live and necessary", and both halves were false. The app has no routing: no
`react-router`, no `pushState`, no read of `window.location`. There was no client route to fall
back to. When one exists, the rule goes as `rewrites` in `vercel.json`, not as a loose file here.

| File | Status |
|---|---|
| `favicon.ico`, `icon-192.png`, `icon-512.png` | Live, referenced from `index.html` and `manifest.json`. They replace the three icons of the CRA template (the React logo): the `X` piece in `#00A99D`, drawn in the language of `DESIGN.md`. The `.png` files are renamed on purpose (`logoNNN.png` was the CRA name); `favicon.ico` keeps its name |
| `manifest.json` | Live, with its own `name`/`short_name` and `theme_color`/`background_color` = `#f8fafc`. It replaced the CRA defaults (`"name": "Create React App Sample"`) |
| `robots.txt` | Live |

## Where to create each thing

The base rule: **a file lives in the capability that owns it, in the folder of its layer.** A module
holds functions; its data, types and fixed values sit next to it in `<module>.constants.ts` and
`<module>.types.ts`. A new capability starts as a contract in `specs/`, and only then as a folder.

| Role | Folder | File |
|---|---|---|
| logic of one concern | `src/<capability>/<layer>/` | `<module>.ts` |
| type that crosses a boundary | next to its module | `<module>.types.ts` |
| data or fixed value | next to its module | `<module>.constants.ts` |
| test of a module | `<capability>/<layer>/__tests__/` | `<module>.test.ts` |
| test helper | `<capability>/<layer>/__tests__/` | descriptive name (`test-context.ts`) |
| component | `src/<capability>/ui/` | `PascalCase.tsx`, **single export** |
| new UI state | `useState` inside `App()` | there is no global state, and none is needed |
| audio effect | `playback/ui/use-engine.ts`, next to the other four | see [audio.md](./audio.md) |
| hook that wires a module | next to the module | `use-<module>.ts`, kebab-case like the rest |
| asset referenced by URL | `public/` | copied without processing |
| architecture documentation | `docs/architecture/` | |
| architecture decision | `docs/architecture/decisions/` | `<date>-<topic>.md` |
| gate that verifies the documentation | `docs/__tests__/` | `<what-it-verifies>.test.ts`, no import from `src/` |
| gate that verifies a root file | `__tests__/` at the root | `<what-it-verifies>.test.ts`, no import from `src/` |
| contract of a capability | `specs/<capability>/` | `<capability>.md`, see [specs.md](../../.agents/rules/specs.md) |
| plan of one change | a GitHub issue | the [task-brief](../../.github/ISSUE_TEMPLATE/task-brief.md) format |
| rule, skill or harness script | `.agents/` | then `node .agents/scripts/sync.ts` |
| new MCP server tool | `mcp-server/src/tools/` | `<tool>.ts` + one line in `tools/index.ts` |
| new MCP server resource | `mcp-server/src/resources/` | `<resource>.ts` + one line in `resources/index.ts` |
| rule the server must execute | `src/<capability>/domain/` | **not** in `mcp-server/`: it is a change to `src/`, in its own commit |

**A role folder is created with its first file.** There is no `schemas/`, `utils/`, `hooks/` or
`lib/`: they would be empty, and an empty folder is ceremony. The growth table (which folder appears
on which trigger) is in [conventions.md](../guides/conventions.md).

## Naming

- **Components**: `PascalCase.tsx`, one component per file and no other export.
- **Pure functions and utilities**: `camelCase`.
- **Domain constants**: `SCREAMING_SNAKE_CASE` (`SHAPES`, `BASE_MAP`, `ANCHOR_INDEX`, `MAX_PIEZAS`).
- **Types and interfaces**: `PascalCase` (`Cell`, `PieceKey`, `PlacedPiece`).
- **Role files**: repeat the name of their module with the role suffix
  (`transform.ts` → `transform.types.ts`, `transform.constants.ts`, `__tests__/transform.test.ts`).
