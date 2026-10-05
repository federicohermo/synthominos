# Quickstart

## Prerequisites

- **Node ≥ 20.19 or ≥ 22.12.** This is a requirement, not advice. Vite 7 declares it in `engines`
  (`^20.19.0 || >=22.12.0`), and the build fails on Node 18.
- **Node ≥ 22.18 for the tooling.** The MCP server and the harness scripts in `.agents/scripts/` run
  TypeScript without a build. On Node 20 they do not start. The app, the build and the deploy do not
  change.
- **pnpm.** The repo tracks `pnpm-lock.yaml`. `packageManager` in `package.json` pins the version.
  With Corepack on (`corepack enable pnpm`), you do not install pnpm by hand.

## Install

```bash
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

Run the commands from the repo root. The app has no subfolder.

**You need the second command once, and the tests do not run without it.** It is for a **local
clone**. In CI, the workflow runs it with `--with-deps`, because the Ubuntu runner does not have the
system libraries that Chromium needs.

The tests are three Vitest projects; one runs in a real Chromium. It is the only way to cover the
spectrum canvas and the engine `AudioContext`. The browser binary **is not in the lockfile**. So
`pnpm install` does not get it, and `pnpm verify` fails with a Playwright error until you install it.
It takes ~700 MB in the user cache (`%LOCALAPPDATA%\ms-playwright` on Windows,
`~/.cache/ms-playwright` on Linux). All repos on the machine share it.

The dev server listens on `http://localhost:5173`. To set a different port:

```bash
pnpm exec vite --port 5199 --strictPort
```

With `--strictPort`, Vite fails when the port is busy. Without it, Vite silently moves to the next
port. Use it when something must be on a known port.

**There are no environment variables to set.** The app runs entirely in the client.

The capability contracts (`specs/<capability>/<capability>.md`) are tracked in git. A clone gets
all of them, and `rg` finds them with no extra flag.

## Commands

```bash
pnpm dev            # Dev server with HMR
pnpm build          # tsc -b && vite build → dist/
pnpm lint           # ESLint
pnpm preview        # Serves dist/ the way production does
pnpm test           # Vitest: the two projects, without instrumentation
pnpm coverage       # Vitest with coverage, threshold 100 on all four metrics
pnpm suite          # coverage: this is what verify runs
pnpm budgets        # the time budgets of the circuit, alone
pnpm verify         # lint ‖ typecheck ‖ suite ‖ mcp:test, then budgets: the convergence node
pnpm mcp:test       # MCP server: typecheck + node --test, threshold 100
pnpm mcp:typecheck  # MCP server: tsc only
```

`pnpm install` from the root installs **both** workspace packages: the app and `mcp-server/`. You do
not enter the folder or pass a prefix.

`pnpm build` runs the typecheck **before** the bundle. A type error breaks the build even when the
code works in dev, because Vite does not typecheck.

To check types without a build:

```bash
pnpm exec tsc -b --noEmit
```

## How to play it

Four gestures control the piece **to place**. Rotate and reflect have **no other path**. The buttons
that did the same thing were the slow path to the same place, so they were deleted. Select keeps its
second path: the twelve thumbnails.

The panel **shows** the state, so the shortcuts stay discoverable. Turn the wheel, and the
orientation line of the palette goes from `0°` to `90°`. That readout is not decoration: it does
half the work the buttons did. A thumbnail cannot show the full orientation. In 29 of the 96
combinations, two orientations look identical and sound different. The `X` is the extreme case: four
rotations, four arpeggios, one shape.

| Gesture | What it does | Where it listens |
|---|---|---|
| Wheel down / up | Rotation `+90°` / `−90°` | Only over the board |
| `Shift` (tap) | Rotation `+90°` | The whole window, on **release** |
| Right button | Toggles the reflection | Only over the board |
| `Ctrl` (tap) | Toggles the reflection | The whole window, on **release** |
| Space bar | Play / pause | The whole window |
| `F I L N P T U V W X Y Z` | Selects that piece | The whole window, on **press** |
| Click on a cell | Places the piece and plays it | The board |

Three things look like bugs and are not:

- **With the cursor over the board, the page does not scroll.** This is the cost of a wheel that
  rotates without a scroll at the same time, which is worse than no rotation. The palette, the
  signal panel and the margin still scroll. Every embedded map makes the same deal.
- **`Ctrl`+wheel zooms the browser and does not rotate**, and `Ctrl`+C does not toggle the
  reflection. A modifier acts on **release**, and only if no other key and no wheel event came while
  it was down. A system gesture wins over ours.
- **With the Play button focused, the space bar activates that button.** With the focus on `↺`, it
  clears the board. This is the native behavior, and it is correct: the focus says which control is
  armed.

**The board also takes the keyboard**, and it is **one** tab stop. One `Tab` enters it and the next
one leaves it. Inside, the arrows move the focus, and `Home` and `End` go to the ends of the row.
`Enter` and the space bar do the same as a click, and `Alt` plus either does the same as `Alt`+click.
The focused cell **is** the cursor, so the ghost and the note are the same as with the mouse. With a
cell focused, the space bar does not toggle the transport: the board uses it to place. `Shift` and
`Ctrl` still rotate and reflect. The board takes the space bar, `Enter` and the arrows, and nothing
else.

## Typical workflows

### Add a piece or change a shape

1. Edit `SHAPES` in `src/pieces/pieces.ts`. Coordinates are `[x, y]`, and `y`
   grows **down**.
2. To add a piece, add it to `PieceKey` in `pieces/pieces.ts`. Then update `BASE_MAP`
   (its tonic, in `music.ts`) and `ANCHOR_INDEX` (its grab cell, as an index into the cell
   array). All three are `Record<PieceKey, …>`, so a missing entry **does not compile**.
3. Make sure the grab cell is a **central** cell. It is the cell under the cursor. If it falls in a
   hole of the bounding box, placement feels broken.

### Change how something sounds

For the **timbre**, edit `DEFAULT_VOICE` in `src/playback/voice.ts` (ADSR and
waveform). One edit is enough, because both playback paths go through `scheduleVoice()`. If you change
the envelope shape, add an envelope test.

For the **arpeggio spacing**, one definition serves two places. `intervalDuration(bpm)` sets it, and
both `playNotes()` (the trigger on placement) and `collectHits()` (the loop) read it. One edit covers
both. Detail in [audio.md](../architecture/audio.md#los-dos-caminos-de-reproducción).

**Do not break the context injection.** `scheduleVoice` and `collectHits` receive the `AudioContext`
as a parameter. If they take it from the singleton, you cannot test them.

### Check audio without listening

In tests, `OfflineAudioContext` renders deterministically, and a test can assert frequency, envelope
and onsets. In the browser, use `sequenceInfo()` (steps, silent clicks, crossings with pitch, and
cycle length of the active sequence) and the oscillator count. Recipes in
[audio.md](../architecture/audio.md#cómo-verificar-el-audio).

### Ask the model instead of simulating it

Before you derive by hand which notes sound, which shape results or which onsets a board makes, ask
the MCP server tools: `describe_piece`, `simulate_board`, `check_invariants` and `find_symbol`. The
first three run the real pure functions, so they answer what the code does today. Catalog and
recipes in [mcp-domain.md](./mcp-domain.md).

### Before a change

An issue is not a spec. The issue is the disposable plan of one change, in the
[task-brief](../../.github/ISSUE_TEMPLATE/task-brief.md) format, and its PR closes it. The spec is
the durable contract of one capability. An issue touches a spec only if it changes what the
instrument does.

1. **Interview** when anything is assumed: skill `shape`. It writes nothing.
2. **Write the issue**: skill `to-issue`.
3. **Write the spec** only when the change creates, modifies or deletes behavior: skill `to-spec`.
   It is the first commit of the `feature/` branch, or of `bugfix/` if the bug was an unwritten rule.
4. **Implement**: skill `implement-feature`, test first.

The contract rules are in [`.agents/rules/specs.md`](../../.agents/rules/specs.md). The branch
prefixes, and what the hook blocks, are in [branches.md](../infra/branches.md).

## Checks before a PR

```bash
pnpm verify                 # lint ‖ typecheck ‖ suite ‖ mcp:test in parallel, then budgets
pnpm build                  # full build
pnpm preview                # and try it by hand
```

`pnpm verify` is the convergence node, and it replaces a manual run of the five. A red node returns
exit 1. Measured with a warm cache, before the budgets had their own step: 41.2 s in series against
23.7 s in parallel.

**It does not depend on your memory.** `.github/workflows/verify.yml` runs the same command on each
`pull_request` and on each push to `staging` and `main`. It runs the script, not a list of nodes, so
the YAML does not need a change when the shape of `verify` changes. When `test` became `suite`, a
list would have stayed green without the coverage gate. A local run is still worth it: you learn
faster here than in the PR.

`pnpm mcp:test` is not optional when you touch `src/` or `src/`. The server imports
those modules with plain node, and an import without an extension **does not** break the app build.
`pnpm lint` catches that case first, on the whole repo. `mcp:test` still checks that the modules
really *load* in node.

The tests run in **three projects**: `*.test.ts` in Node against `node-web-audio-api`,
`*.browser.test.tsx` in a real Chromium through Playwright, and the time budgets,
`*.budget.test.ts`, alone after the others. None runs in jsdom. **Chromium is not in
the lockfile**: a fresh clone needs `pnpm exec playwright install chromium` before the first
`verify`.
