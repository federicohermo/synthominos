# MCP server: the executable domain

An MCP server inside the repo **imports the real pure functions and runs them**. It does not index
code. The source of truth is `HEAD` at the time of the query, so there is no indexing step, nothing
goes stale, and nothing needs a seal. If someone changes `notesForRotation`, the tool answers
differently on the next query.

It lives in [`mcp-server/`](../../mcp-server/README.md), a separate package of the workspace.

## Setup

```bash
pnpm install          # from the root: the workspace installs the app and the server
pnpm mcp:test         # typecheck + node --test
```

That is all. `.mcp.json` is committed at the root, so a session in the repo starts the server with
no configuration.

**It requires Node ≥ 22.18**, above the ≥ 22.12 that Vite asks for. The server runs TypeScript
without a build: Node strips the types. It is development tooling. It is not in the bundle or the
deploy, so with Node 20 the server does not start and **the repo works the same**.

## Four tools and one resource

| Tool | Answers | Instead of |
|---|---|---|
| `find_symbol` | where a symbol of `src/` is defined (file, line, signature, first sentence of the doc) and which files import it, `mcp-server/` included | `grep` + opening the file to see the signature |
| `describe_piece` | transformed shape, two ASCII grids (one marks the anchor, one shows the **step** of each cell), tonic, scale, `cellMap` (degree **and** step per cell) and the 5 notes with the retrograde applied | composing four pure functions by hand over five coordinate pairs |
| `simulate_board` | validity of each placement, the order of the circuit with its jumps, and the timeline of notes and clicks that the tour produces | reading the scheduler and walking the lookahead by hand, or listening |
| `check_invariants` | the seven checks of `domain/invariants.ts`, with counterexamples and the size of the model (96 orientations) | running the tests and reading the output |

**The three domain tools reimplement nothing.** `simulate_board` calls `cellsAt`/`isValid` of
`domain/board.ts` and `buildSequence` of `domain/sequence.ts` to build the circuit.
`check_invariants` calls `checkAll()`. `describe_piece` calls `rotateN`/`reflect`/`notesForRotation`.
The server owns only the ASCII render, the symbol index and the format of the answers.

`find_symbol` is the exception, and the difference matters: **it is the only tool that reads the
code as text instead of running it.** "Where is X and who uses it" has no answer in execution. It
keeps the property that matters: it builds the index **at query time** and does not persist it, so
there is no artifact to regenerate and nothing to go stale.

### All four only read, and a field says so

Each tool declares `annotations` in its `tools/list`, so **a machine** can read what the tool does:

| Field | What it says | Value |
|---|---|---|
| `readOnlyHint` | whether the tool **modifies** its environment | `true` in all four |
| `openWorldHint` | whether the domain of entities is open | `false` in all four: twelve pieces, one `src/` |

It matters for a concrete reason: **several MCP clients use `readOnlyHint` to skip the permission
prompt.** A tool that only reads must not pay the friction of a tool that writes.

`readOnlyHint: true` on `find_symbol` is not an error. The hint says whether the tool modifies its
environment. `find_symbol` reads the disk and does not change it.

A test holds this in place: `tools.test.ts`, `describe('el registro')`. It has the shape "nobody
forgot": it walks `tools` and requires the fields on **every** tool, instead of repeating tool by
tool what the code already says. Both fields are optional in `ToolDef`, so the compiler cannot catch
a new tool without them. The test can.

### The resource: `pentomino://constantes`

Next to the tools, the server exposes **one resource**: the 14 fixed values that govern the
instrument. They are the minimum and default board, the maximum number of pieces, the crossing cost,
the cells and notes per piece, the default octave and regime, the BPM, the master gain, the FFT
size, the lookahead, the tick and the step limit. Each value comes with **the path of the `src/`
file that defines it**.

**You do not call it like a tool, and that is the difference that matters.** You do not invoke a
resource: you **list** it and **read** it by URI. In Claude Code, use `ListMcpResources` and
`ReadMcpResource`, with the server `pentomino-domain` and the URI `pentomino://constantes`. It is not
in `tools/list`, and a tool call for it fails. In exchange, a client can **attach and enumerate** it,
which a tool cannot do: the client can bring the whole resource into context without a call.

It is a resource and not a tool because it is **reference** material: you read it whole, and it
takes no arguments. A tool with an empty `inputSchema` puts the same information behind a call that
someone must remember to make.

Three properties make it worth it, and the three are the usual one:

- **It imports; it does not copy.** `resources/constantes.ts` has no numeric literal. The 14 values
  come from `src/domain/constants/` and `src/audio/constants/`, grouped by file with property
  shorthand. So the key **is** the imported identifier, and a rename breaks the import instead of
  lying.
- **No `cacheHint`, by type.** `ResourceDef.config` is a bare `ResourceMetadata`, so a `cacheHint`
  does not compile. This server is reliable because nothing in it can go stale, and a cached answer
  is a copy with another name.
- **The path travels next to the value.** Without it, the resource is one more copy, only a
  generated one: you know the number but not where to change it. The test opens the file that each
  constant names and checks that it exports the constant. A wrong path is the one thing the compiler
  does not catch.

**The entry criterion: a value enters the resource when `docs/` or an agent document copies it
today.** That criterion is verifiable. "What looks useful" is not, and without the rule the resource
becomes a drawer nobody reads.

## When to prefer them over reading the code

The short rule: **simulating the model is expensive, and locating is no longer free.** The expensive
part is still the answer to "what does the model produce". There, a mental simulation also **gives
no warning when it is wrong**. The other half of the rule changed, and it is measured. When the
server was written, `src/` had 8 files and 855 lines, and a `grep` answered any "where is X?" at low
cost. After `App.tsx` split into layers, `src/` had **38 files, 1,303 source lines and 84 exported
symbols**, 78 without the `__tests__/` files, which is what the index shows by default. Locating is
still easy for a person. What is no longer cheap is the **token cost** of locating by reading.

Ask instead of reading when the question is:

- *Which notes sound for piece `Z` rotated 270° and reflected?* → `describe_piece`. By hand, you
  apply the scale formula, the octave shift and the retrograde, in that order. The question **is not
  complete without the regime**. `describe_piece` and `simulate_board` take it as an argument (default
  `escala`, the default of the app) and **return** it in the answer. In 36 of the 48 piece × rotation
  combinations, the same five notes have two correct answers.
- *What shape does `F` rotated 180° have, and where is its grab cell?* → `describe_piece`.
- *Does this board sound like a continuous tour or with long jumps?* → `simulate_board`. Look at the
  order of the circuit, its jumps and the cycle length.
- *Did I break something in the model?* → `check_invariants`, before and after you touch geometry or
  pieces.
- *Where is `cellsAt` and who uses it?* → `find_symbol`, **not `grep`**. It brings the signature, so
  you do not open the file. `usedBy` comes from the import graph: a file that calls it fifteen times
  appears once, and a namesake in another module does not appear.
- *What does `src/` export in total?* → `find_symbol` without arguments: the whole map in ~2 KB.
- *How big is the minimum board, what is the default BPM, how long is the lookahead?* →
  `pentomino://constantes` with `ReadMcpResource`, **not** the value copied into `AGENTS.md` or here.
  Nothing verifies those copies, and the resource also brings the path of the file to edit.

And **read the code anyway** when the question is why something is built that way. The answer lives
in the comments, not in the output of a tool.

## Two traps the tools avoid

1. **The letter describes the shape, not the sound.** Piece `F` sounds with tonic C. The note F
   belongs to piece `T`. An agent that answers from memory mixes them up. `BASE_MAP`, executed, does
   not.
2. **Reflection is not always visible.** It always reverses the notes. But it leaves the shape
   identical in `I` and `X` (all four rotations) and in `T` and `U` (rotations 0° and 180°). In `V`
   and `W` the shape changes. What does not change is the set of reachable shapes, because the
   reflection lands on another rotation.

## How much it saves, measured

Reference question: *"which notes and which shape does `Z` give at 270° reflected, and which onsets
does it produce if I place it at `x=1` and another piece at `x=5`?"*

| | Bytes | ~Tokens |
|---|---|---|
| Reading the code: `domain/{transform,music,board,sequence}` + their `constants/` and `types/` + `audio/scheduler` + its constants | 48,565 | ~12,141 |
| With the tools: `describe_piece` (621) + `simulate_board` (2,064) | **2,685** | **~671** |
| Catalog of the tools, once per session, measured with six tools | 13,714 | ~3,430 |

The first two rows were measured again after the board became a tour, and **the gap grew**. The
answer of `simulate_board` grew from 1,189 to 2,064 bytes, because it now carries the path of each
jump. The code to read grew much more, from 14,999 to 48,565 bytes. And those files are no longer
enough, because order and silence come from `sequence.ts`.

The catalog row has two caveats. First, it is serialized through the SDK, not with the method of the
other two rows. Second, it was measured with six tools; two have since been removed, so the real
catalog is smaller, and nobody has measured it again. The descriptions are where the criterion of
when to prefer each tool lives. They are the cost paid once per session to save on every question.
One more measured fact: the `title` and `annotations` of six tools weighed **556 bytes** in total.
And the number this row carried before, 13,118, was already **40 bytes off** before any change,
because one description grew and nobody measured again. It is a number written by hand, and that
happens to all of them.

**94% less per question**, and the first question pays for the catalog. The table does not show
what matters most. When you read the code, you still **derive the answer by hand**: three rotations,
a mirror, the scale transposed +7, the retrograde and the walk of the lookahead. And nothing warns
you if it is wrong.

### `find_symbol` against `grep`

Reference question: *"where is `notesForRotation` and what depends on it?"*

| | Bytes | What it leaves |
|---|---|---|
| `grep -rn notesForRotation src/ mcp-server/src/` | 4,544 | 40 hits, most of them repeated call sites in one test |
| + opening `domain/music.ts` (needed for the signature) | 1,663 | |
| **`grep` path** | **6,207** | |
| `find_symbol("notesForRotation")` | **433** | definition, line, signature, doc and the 4 files that import it |

**14x less.** Its catalog entry costs 1,705 bytes and saves ~5,774 per query, so the first query also
pays for it. The full index, the 78 non-test symbols grouped by file, is 1,993 bytes.

The `grep` in the comparison covers both packages, because that is what matches the answer: `usedBy`
includes `mcp-server/`, and that is the part that is easy to forget.

Build cost: **112 ms** on the first query and ~50 ms after, measured over 36 + 16 files. The index
later grew to 92 files plus 22 that only add edges. This cost is what allows the index to stay
unpersisted. If it ever hurts, the answer is a cache keyed by `mtime`, not an artifact that someone
must regenerate.

### The scope of the graph, and why it is asymmetric

The index holds the symbols of `src/`. The graph **reads the imports** of `src/` and of
`mcp-server/src/`. The asymmetry is on purpose. The tools import 31 domain symbols, so without the
second root `usedBy` answered 2 users where there are 4. It was *less* complete than the `grep` it
replaced. The exports of the server do not enter the map: the index describes the surface of
`src/`, and the tools are not part of the app.

### What the graph matches, and what it does not

`usedBy` matches the **exported name** against the **resolved file**, and each half has its trap.

- `import { isValid as esValida }` imports `isValid`. The second name is only the local name, so the
  graph stores `propertyName`.
- `import Board from './Board.tsx'` brings no name, because the symbol has no name on the export
  side. The graph marks the default binding apart and matches it by file only. A match by name
  fails as soon as someone renames it at import, which `src/main.tsx` does not do and `App.tsx`
  could. Both cases matter here: the six `export default` of `src/` are `App` and the five
  components, the whole UI layer.

The graph does **not** see `import * as x`: a namespace does not say which symbol is used. `src/`
has none today. If one appears, `usedBy` under-reports silently.

`includeTests` filters **both** ends, the matches and the users, not only `usedBy`. A filter on one
end returned the helpers of `audio/__tests__/test-context.ts` as orphan symbols of `src/`. And an
exact match inside a test hid the substring search of a real symbol.

Know which problem this solves and which it does not. A broken domain signature **does not pass
silently**. The tsconfig of the server typechecks across the package edge (that is why its `lib`
includes `DOM`), and `pnpm verify` fails and points at `describePiece.ts` and `simulateBoard.ts`.
What the second root fixes is the *planning input*: when you size a change, the answer must not say
2 when there are 4.

## Check that it works

```bash
pnpm mcp:test                    # typecheck + the server tests
node mcp-server/src/index.ts     # starts on stdio and waits (Ctrl+C to exit)
```

If the server does not start, begin with
[troubleshooting](./troubleshooting.md#el-mcp-server-no-arranca-err_module_not_found).
