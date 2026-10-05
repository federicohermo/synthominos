---
paths:
  - "src/**"
  - "mcp-server/src/**"
---

# Testing

The floor for every test of the product. `package.json` declares what `pnpm verify` runs.

1. **Each change of behavior has a test that fails if the behavior regresses.** A test that passes
   with the change removed proves nothing: run it against the old code once and see it fail.
2. **Use the lowest boundary that proves the property.**
   - Pure logic: a `node` test, by example or by property.
   - The Web Audio graph, a canvas, the DOM or a layout: a browser test, `*.browser.test.tsx`.
   - A tool of the MCP server: a `node --test` file in `mcp-server/`.
3. **A bug fix keeps a regression test**, at the boundary where the defect is.
4. **Do not mock the boundary you prove.** A test of the engine runs a real `AudioContext`. A test
   of the shell may replace the engine, because its subject is the shell.
5. **The test title cites the criterion**: `AC-<COD>-###`, for each criterion of a contract.
6. **A branch no test reaches is deleted or made reachable.** No comment skips it.
7. **A surviving mutant is killed by a test of behavior, or by simpler code.** It is equivalent, or
   beyond the tool, only when a person agrees. The agent that found it cannot approve it.
8. **A function with a wide input space has a property test**, with `fast-check`: a transform of
   a piece, a route, a parser, a validator. An example test shows one case. A property shows the
   rule.
9. **A property that fails keeps its seed and its counterexample** as a permanent example test.
10. **Never delete, weaken or skip a test, a threshold, a fixture or a mutation setting to turn a
    gate green.** A test that is wrong is fixed, with the reason in the commit.
11. **Report the command, its exit code and the output that matters.** Name each check you did not
    run.
