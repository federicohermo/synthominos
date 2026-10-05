# The domain MCP server

The `pentomino-domain` server imports the pure functions of `src/` and runs them. An answer comes
from the code on disk at the time of the query, so no answer is stale.
[The decision](../architecture/decisions/2026-10-04-the-mcp-server-runs-the-domain.md) gives the
reason and the cost. The `description` of each tool says what the tool returns.

## Which tool answers which question

| The question | Ask | Instead of |
|---|---|---|
| Which notes and which shape does `Z` have at 270°, reflected? Where is its anchor cell? | `describe_piece` | the scale formula, the octave and the retrograde, by hand |
| In which order does the circuit visit this board, with which legs and which crossings? | `simulate_board` | a walk of the lookahead by hand, or your ears |
| Did the change break the geometry or the musical model? | `check_invariants`, before and after | the output of the test run |
| Where is `cellsAt`, and which files import it? | `find_symbol` | `grep`, then the file for the signature |
| What does `src/` export? | `find_symbol` with no `name` | the tree |
| What is the piece limit, the default tempo, the lookahead? | the resource `pentomino://constantes` | a number that a document copies |

- **Give the regime** to `describe_piece` and `simulate_board`. In 36 of the 48 combinations of
  piece and rotation, the two regimes give different notes. The answer names the regime it used.
- **The resource is not a tool.** List it and read it by URI: in Claude Code, `ListMcpResources`
  and `ReadMcpResource`. A tool call for it fails.
- **Read the code for the why.** The reason of a piece of code is in its comment, and no tool
  returns it.

## When a tool beats reading the code

- **For what the model produces: always.** A derivation by hand gives no warning when it is wrong.
- **For where a symbol is: also.** A person locates a symbol at no cost. An agent pays for each
  file it reads, and the table below gives the price.

## Two traps the tools avoid

1. **The letter names the shape, not the sound.** Piece `F` has the tonic C. The note F is the tonic
   of piece `T`.
2. **A reflection is not always visible.** It always reverses the arpeggio. It leaves the shape
   the same for `I` and `X` at each rotation, and for `T` and `U` at 0° and 180°.

## What `usedBy` matches, and what it does not

`find_symbol` matches the exported name against the file that the import resolves to.

- An alias counts under the exported name: `import { isValid as ok }` is a user of `isValid`.
- A default import has no name, so it matches by file only.
- **`import * as x` is not seen.** `src/` has none today. If one appears, `usedBy` reports fewer
  users, with no warning.
- The index holds the exports of `src/` only. A symbol that is local to its module, or that belongs
  to `mcp-server/`, gives no match.
- The graph also reads the imports of `mcp-server/src/`, so `usedBy` names the tools that a
  signature change can break.
- `includeTests` filters the matches and the users. The default leaves `__tests__/` out.
- A search by substring stops at 20 matches, and the answer says so.

`usedBy` sizes a change. It is not the gate: `pnpm verify` typechecks across the package edge.

## Measured savings

| The question | By reading | By asking | Measured |
|---|---|---|---|
| The notes and the shape of `Z` at 270°, reflected, and the events of a board with two pieces | 48,565 bytes: the modules of the model and of the scheduler | 2,685 bytes: `describe_piece` 621, `simulate_board` 2,064 | 2026-08-17 |
| Where `notesForRotation` is, and what depends on it | 6,207 bytes: `grep` 4,544, the file 1,663 | 433 bytes | 2026-08-16 |
| What `src/` exports: 204 symbols in 34 files | the tree | 4,182 bytes | 2026-10-04 |

The first question costs 94% less, and the second costs 14 times less. Each number is of its
date: nobody measured the first two rows again after the code moved to one folder per capability.
