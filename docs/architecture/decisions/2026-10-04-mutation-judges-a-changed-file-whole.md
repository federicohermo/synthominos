# Mutation runs on the files a PR changes, and judges each one whole

**2026-10-04**

The implementation protocol asks for no surviving mutant on the code a run changes. Coverage at 100
says that a line ran. It does not say that a test would notice if the line were wrong.

Measured on the development machine, with 15 workers:

| Target | Mutants | Time |
|---|---|---|
| One small module, `playback/playhead-offset.ts` | 24 | 30 s, of which 20 s are the start of Stryker |
| The kernel, `.spec-anchored/kernel.ts` and `pyjson.ts` | 2,760 | 8 min |
| The whole `mutate` list | 4,515 | The first test run alone passed 5 min, and the run was stopped |

**Decision: mutation is a CI job of its own, not a node of `pnpm verify`, and it mutates only the
files a PR changes.** `verify` is what a person runs before each PR, and it stays a few minutes
long.

**Decision: a changed file is judged whole, with a threshold of 100 and no stored baseline.** The
job fails on a surviving mutant of the file, also one that was there before the PR.

The cost: most modules of `src/` have never been mutated. The first PR that touches one pays for
the whole file. A baseline of the mutants that survive today would remove that cost, and was not
taken, for the reason the coverage threshold is 100 and not 95: a stored number is a debt budget
without an owner.

What stays outside, by a limit of the tool and not by choice: every module that only Chromium
covers, and `mcp-server/`. Stryker runs Vitest in the `node` project only. The coverage gate at 100
still holds them.
