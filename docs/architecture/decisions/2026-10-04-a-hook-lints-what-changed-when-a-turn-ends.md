# A hook lints what changed when a turn ends

**Recorded 2026-10-04.**

A rule of the repo fires when someone types `pnpm lint` or `pnpm verify`. An agent that edits
twenty files and runs neither learns of a finding when it opens the PR, with twenty files written
on a wrong premise.

**Decision: `.claude/scripts/lint-al-cerrar.mjs` runs on the `Stop` and `SubagentStop` events,
lints the files that changed, and blocks the end of the turn on a finding.** It does not replace
`pnpm verify` or CI. It moves the moment the agent learns of the finding, from the PR to the end
of the turn.

Before the comment cut, the docblock of the script held what was weighed for its code, with the
measurements: a hook on each edit against a hook on each turn, the two events, the lock that does
not wait, and the open failure. `git show 219d07a:.claude/scripts/lint-al-cerrar.mjs` prints it.
This record holds what the script and `.claude/settings.json` cannot say.

## It runs lint, and nothing else

- **Not the suite.** The suite is the longest check of `pnpm verify`, and issue
  [#97](https://github.com/federicohermo/synthominos/issues/97) holds a test that fails now and
  then. In a command that a person types, that test is a nuisance. In a hook on each turn, it
  blocks the end of a turn at random, and a hook that blocks at random gets turned off.
- **No typecheck of its own.** Lint already runs with type information.

## The budget

Measured on the development machine, idle:

| Case | Ceiling | Measured, median |
|---|---|---|
| A tree with no changed file that lint covers | 200 ms | 135 ms |
| One changed file | 6 s | 4.57 s |

Under five concurrent runs of `pnpm verify`, the second row measured from 5.5 s to 16.2 s, and the
first from 201 ms to 237 ms. Neither row was measured on CI, where one commit varies up to 1.86
times between two runs.

One more `.md` in the repo does not move these numbers, because the hook lints only what changed.
It moves the whole `pnpm lint`
([#145](https://github.com/federicohermo/synthominos/issues/145)).

The `timeout` of the hook is 30 s. `.claude/settings.json` takes no comment, so the reason is
here. It is five times the ceiling of one file: the margin for a turn that changed thirty files,
and for a loaded machine. The branch hook has 10 s because it runs in milliseconds. The default is
600 s, which is a session that hangs for ten minutes.

## The cost

- **Each turn that ends on a tree with a changed file pays the second row or more**, also when
  the turn changed nothing.
- **Lanes in parallel pay it once each, on one ESLint cache.** So the lock lets one lane lint, and
  the others end with no lint and say so. In a batch, a finding of a lane can reach `pnpm verify`.
- **A Codex session has no such hook.** `.codex/hooks.json` declares the branch hook only.
- **It covers a session, not the repository.** See
  [the decision on git hooks](./2026-10-04-agent-hooks-and-no-git-hook.md).
