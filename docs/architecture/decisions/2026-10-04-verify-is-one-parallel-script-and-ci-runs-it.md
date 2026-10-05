# `pnpm verify` is one parallel script, and CI runs that script

**Recorded 2026-10-04.**

The repo has four checks: `lint`, `typecheck`, `suite` and `mcp:test`. A person who runs them one
by one forgets one, and a check that did not run reads as green.

**Decision: `pnpm verify` runs the four in parallel, as one script, and
`.github/workflows/verify.yml` runs `pnpm verify` and not a list of its steps.** The shape of the
gate lives in one place, the `verify` script of `package.json`. The time budgets run after the
parallel block, alone.

Measured with a warm cache, before the budgets had their own step: 41.2 s in series against 23.7 s
in parallel. The suite set the clock of the block then, not lint. Two measurements say so, each one
when lint took on more work:

| What lint took on | `lint` | `suite` |
|---|---|---|
| Type information | from about 2.5 s to 11.0 s | 19.4 s |
| Every `.md` of the repo | from 13.6 s to 16.1 s | 33.8 s |

The second row measured its "before" again, in the same session, with
`--ignore-pattern "**/*.md"`. The 11.0 s of the first row came from another machine at another
time, so it was no baseline for the second.

Since `suite` is one pass, `lint` ends last: in three runs of the parallel block on one machine,
`lint` ended 3 to 4 s after `suite`.

The alternative for CI was one step for each check. A list in the YAML is a second copy of the
shape, and the day the script changes, the copy runs the old one. A list that names a bare `test`
in place of `suite` stays green without the coverage gate.

## Two parts of the script that are not decoration

`package.json` takes no comment, so the reasons are here.

- **`--filter "{.}"`.** `--parallel` is a recursive flag of the workspace, and a recursive run
  excludes the root package. Without the filter, pnpm runs only the scripts of `mcp-server` and
  reports success: no lint, no typecheck and no test of the app. The filter selects by path and
  not by name, so a rename of the package cannot silence it.
- **The `$` of the regex.** Without it, the pattern matches every script whose name starts with
  the name of a check. When the check was `test`, it matched `test:watch` and started a second
  Vitest. Measured: in a shell with no TTY, that Vitest does not enter watch mode, and the cost is
  duplicate work. In an interactive terminal it waits for input.

## The cost

- **The checks compete for the CPU.** A time measured inside the block measures the machine. So
  the time budgets run outside it, and the test timeout goes from 5 s to 30 s under coverage.
  Measured: next to the other checks, the budget of the large board took 8.07 ms in one run of
  three, against 3.1 ms alone. The counters of v8 took the first budget from 1.8 ms to 11.3 ms.
- **A red run of the workflow names no check.** The workflow has one step for the four, so the
  check that failed is in the log.
