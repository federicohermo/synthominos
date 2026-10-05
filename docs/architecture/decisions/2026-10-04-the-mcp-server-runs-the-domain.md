# The MCP server runs the domain, and keeps no index

**Recorded 2026-10-04.** The server entered the repo on 2026-08-15.

An agent that needs the notes of a piece, or the sound of a board, reads the modules of the model
and derives the answer by hand: the rotations, the reflection, the scale, the retrograde and the
walk of the lookahead. The derivation costs tokens, and nothing warns when it is wrong. The usual
MCP server for a codebase indexes the code as text. Its index is an artifact: someone builds it
again after each change, or it is stale.

**Decision: the server imports the pure functions of `src/` and runs them, with no build and no
stored index.** Node loads the TypeScript of `src/` and strips the types. An answer is the code on
disk at the time of the query. The server owns the ASCII drawing of a piece, the symbol index and
the format of an answer, and no rule of the instrument.

`find_symbol` is the one tool that reads the code as text, because "where is this symbol and who
uses it" has no answer in a run. It keeps the rule: it parses `src/` with the compiler on each
query, and stores nothing.

What decided it is the size of an answer against the size of the code that gives the same answer.
The table is in [the guide](../../guides/mcp-domain.md#measured-savings).

The cost:

- **A higher Node floor for the tooling.** The server needs Node 22.18 or later. The app needs
  20.19 or 22.12.
- **Every module that a tool imports must load in plain Node.** Each local import of `src/` ends in
  `.ts`. No module has an `enum`. No module touches React, the DOM or an `AudioContext` when it
  loads. No tool can reach a `.tsx`. A missing extension breaks the server and does not break the
  app.
- **The index is built on each query.** Measured over 36 + 16 files: 112 ms for the first query and
  about 50 ms for the next ones. The tree is now 92 files, and 22 more that give only imports.
  Nobody measured it again. If the time hurts, cache by `mtime`. Never write an index file.
- **The compiler loads when the server starts.** The domain tools load in 124 ms. With
  `find_symbol`, the start takes 420 ms, in a session that calls it or not. A lazy import was
  weighed and not taken: about 292 ms once per session does not pay for two ways to load one
  module.
- **The catalog of the tools is in the context of every session.** It was 13,714 bytes on
  2026-08-25, with six tools. Four tools are left, and nobody measured it again.
