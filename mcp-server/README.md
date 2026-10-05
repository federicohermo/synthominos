# mcp-server: the domain of pentomino-games, runnable

An MCP server that **imports the pure functions of `src/` and runs them**. It does not index code:
there is no index, nothing goes stale and there is no build step.

How to use it, and the catalog of tools: [`docs/guides/mcp-domain.md`](../docs/guides/mcp-domain.md).

**Install from the repo root.** `pnpm install` there installs the two packages of the workspace.

**Node ≥ 22.18.** The server runs TypeScript with no compile step, and Node 20 does not start it. The
app and the deploy are not affected: this is tooling.

## Rules for a new tool

A new tool is one file in `src/tools/` plus one line in `src/tools/index.ts`. The entry point does
not change and there is no `switch`.

**Do not write argument validation.** The SDK validates against the zod schema before it calls the
handler.

`title` and `annotations` are **optional in the type and mandatory in practice**. The compiler does
not require them: `__tests__/tools.test.ts` does, and it goes through the whole registry. Which hint
goes in each case is in [`.agents/rules/mcp-server.md`](../.agents/rules/mcp-server.md).

A **resource** is added the same way, with `src/resources/` in place of `src/tools/`. It **does not
copy values of `src/`: it imports them**. If a value cannot be imported, an export is missing, and
that is a change of `src/` in its own commit.

Write the description **by intent**: when it is better to call the tool than to read the code. Do
not write it by mechanism. Without adoption there is no saving, and only that description decides
the adoption.

## Four things that are not obvious

**The imports of `src/` have an explicit `.ts`, and that is not cosmetic.** Node needs it to resolve
them. An import with no extension inside `src/` breaks this server and does **not** break the app,
because Vite resolves it anyway: the error would be invisible on the browser side. `pnpm mcp:test`
catches it.

**The tsconfig has `DOM` in `lib` although the server never touches the DOM.** It typechecks the
chain `playback/scheduler.ts → playback/voice.ts`, which declares `BaseAudioContext`, `AudioNode` and
`OscillatorType`. Without `DOM` there are 8 TS2304 errors. At runtime none of that exists: the types
are erased and `collectHits` is arithmetic.

**No domain logic is written here.** Rotate, reflect, place, validate, compute notes and check
invariants all come from `src/`. What belongs to the server is the ASCII render, the symbol index
and the format of the answers. If you are tempted to compute a rotation or a scale in this package,
an export is missing in `src/`, and that is a change of `src/` in its own commit.

**`typescript` is needed at runtime, not only for the typecheck.** `symbols.ts` imports it to parse
`src/` with the AST of the compiler. `package.json` lists it in `devDependencies`, so an install
without the dev dependencies does not start the server. The import is of the whole module and is
**static**, so the ~292 ms of load are paid at the **start of the server**, whether a client calls
`find_symbol` or not: measured, the domain tools alone load in 124 ms, and with `find_symbol` the
load takes 420 ms. A lazy import is possible, with a `createRequire` inside `readIndex`, because
`typescript` is CJS and the rest of the chain is synchronous. It is not done on purpose: 292 ms once
for each session do not pay for two names for the same module.

Why an AST and not a regex: the question that `find_symbol` answers is *who uses* a symbol, and the
import graph answers it, a relative specifier resolved to a file, not a text match. A regex also
goes wrong silently with CRLF, which is the documented trap of this repo.
