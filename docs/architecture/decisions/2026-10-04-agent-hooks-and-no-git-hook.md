# The hooks protect the session, and the repo has no git hook

**Recorded 2026-10-04.**

The repo has two hooks. The branch hook, `.agents/scripts/hook.ts`, refuses a write to the product
from a branch with the wrong prefix. The lint hook, `.claude/scripts/lint-al-cerrar.mjs`, lints
what changed when a turn ends. An agent harness runs both, not git. So a hook fires only when a
session does the work:

- A person who edits a file of `src/` in an editor, on `main`, runs neither hook.
- A `git commit` from a terminal outside the session runs neither hook.

**Decision: the repo adds no git hook.** The agent hooks protect a session. `pnpm verify` in CI on
each PR, and the ruleset that blocks a red merge into `main`, protect the repository, whatever
wrote the change.

A git hook covers a person. It needs a tool that the repo does not have, installed in each clone.
The repo measures a dependency before it adds one, and this one has no measurement.

The cost:

- **Nothing checks the branch prefix of a change that a person writes.** The branch hook is the
  only check of the prefix, and CI does not repeat it.
- **A lint finding that a person commits is found at the PR**, by `pnpm verify`, and not before.
- **A push straight to `staging` is checked after it lands.** `staging` has no ruleset, so the run
  of `verify` on that push is the first check.

Do not read a quiet hook as a green gate. The gate is `pnpm verify`.
