# Verification

This page explains what `pnpm verify` does and why it has its shape.
[`AGENTS.md`](../../AGENTS.md) states each rule and its measured number in one line. This page
gives the reasoning behind them.

None of it is preference. Each decision comes from a measurement. Several came after a check
failed **green**: it reported success and verified nothing. This document hunts that failure mode
from start to end.

## `pnpm verify` is the convergence node

It runs `lint ‖ typecheck ‖ suite ‖ mcp:test` in parallel. Run it before every PR. Measured with a
warm cache: **41.2 s in series against 23.7 s in parallel**. A red node returns exit 1.

**It does not depend on memory.** `.github/workflows/verify.yml` runs it on each `pull_request` and
on each push to `staging` and `main`. The workflow installs Chromium itself.

The workflow runs the **script**, not the list of nodes. The YAML comment gives the reason: the
exact shape of `verify` already cost two traps, and a list in the YAML is a second place where
that shape lives. The evidence is real. The node `test` became `suite` once. A workflow with the
list kept `test` and stayed green without the coverage gate.

### Two parts of its exact shape are not cosmetic

The script is `pnpm --filter "{.}" run --parallel "/^(…)$/"`. Both parts were found by failing
green:

- **`--filter "{.}"` is mandatory.** `--parallel` is a recursive workspace flag and **excludes
  the root package**. Without the filter, it runs only the scripts of `mcp-server` and reports
  success. It never runs `lint`, `typecheck` or `test` of the app. The filter selects **by path**
  (`{.}`), not by name, so a package rename cannot silence it again.
- **The `$` of the regex is not decoration.** Without it, the pattern also matches `test:watch`
  and starts a second Vitest. Measured: in a non-interactive shell it does not hang, because
  Vitest without a TTY does not enter watch mode. The visible cost is duplicate work. In an
  interactive terminal it waits for input. The anchor removes the question.

## `suite` is TWO Vitest passes, in sequence and not in parallel

First `test` runs without instrumentation. Then `coverage` runs, with a threshold of **100** on all
four metrics. Two measured reasons decide the shape:

- **Instrumentation measures the instrument.** v8 inserts a counter in each branch. The two
  performance budgets of the circuit go from 1.8 ms to **11.3 ms** against a ceiling of 5 ms. A
  `skipIf` skips them under coverage, and the clean pass verifies the budget **locally**. The same
  `skipIf` skips them when `CI` is set. The Actions runner gave **8.4 ms and 15.7 ms** in two runs
  of the same commit. It is not a slow machine with its own number. It is a VM without a stable
  number, and no ceiling means anything there. The cost, stated next to the `skipIf`: **CI does not
  verify these two budgets.** The `verify` on your machine does.
- **In sequence, because in parallel the budget also fails, for a different reason.** Five heavy
  processes compete for CPU, the median goes up, and `verify` went red with nothing wrong. The
  comment of AC8 in `sequence.test.ts` documents the same failure mode, from when its ceiling went
  from 2 to 4. A chain leaves **four** concurrent nodes, the same contention as before the second
  pass existed. The budget then measures what it says it measures.

### Why the threshold is 100 and not 95

A lower threshold is a debt budget **without an owner**. Nobody knows which lines the margin
allows, so nobody reviews them. The corollary: **zero comments that skip a branch**, by the same
argument as "zero `any`". If a branch looks unreachable, delete it or make it reachable.
`no-warning-comments` checks this with three terms.

One more case appears only when the gate runs on **another** machine. A comparator
`a.name < b.name ? -1 : 1` inside `walk()` covered both branches on Windows and one branch on the
runner. **Which side runs depends on the order in which the file system returns entries**: NTFS is
alphabetical, ext4 is by hash. `mcp:test` gave `99.64%`, so the threshold of 100 depended on the
file system of the person who ran it. The fix was not an ignore: it deleted the branch. The
comparator is now arithmetic (`Number(a > b) - Number(a < b)`), which also gives a total order.

## The node that grew most is `lint`

Linting with type information took it from ~2.5 s to **11.0 s**. The measurement came with it:
`recommendedTypeChecked` over the whole repo gives 100 findings, and 97 are one pattern of
`node:test`. What did not pay was cut. `import-x/no-cycle` cost **15 s more** and found zero
cycles, so it is not in the config.

Even so, `lint` does not set the clock of `verify`. **`suite` does, with 19.4 s.** Each number is
measured without the other change; the pair above is measured with both in place.

`lint` also lints **every `.md`** of the repo, with the full `@eslint/markdown` preset. The detail is
in `eslint.config.js`, next to the block. This page does not write the file count on purpose: that
number goes stale with the next `.md`, and `eslint .` without a glob verifies it.

**Markdown costs 2.5 s.** The "before" needed a new measurement. The 11.0 s above came from another
machine at another time, so it said nothing. `eslint .` ran with `--ignore-pattern "**/*.md"` in the
same session: **13.6 → 16.1 s**. `suite` still set the clock with 33.8 s, more than double. The rule
applies to every number on this page: **an old performance number is not a baseline.** Each pair
above is valid only inside its own measurement.

## Lint does not wait for someone to run it

All of the above shares one problem: **it fires when someone types the command.** An agent that
edits twenty files and never runs `pnpm verify` sees no repo rule until it opens the PR. CI then
runs `verify` on the PR, and the ruleset of `main` blocks a red promotion, so the error does not
reach production. But the agent finds it **at the end**, with twenty files written on a wrong
premise.

`.claude/scripts/lint-al-cerrar.mjs` runs as the **`Stop` and `SubagentStop`** hook. It lints what
changed in the tree. On a finding, it returns the finding as text, and the agent fixes it before
it ends the turn. **It does not replace `pnpm verify` or CI.** It moves the moment the agent learns
about the error, from "when it opens the PR" to "when it thinks it is done".

**Per turn, not per edit.** Four numbers measured on `63e569a` decide it: the whole `pnpm lint`
takes 21.78 s, one file with type information 4.42 s, one file without types 2.44 s, and the 38
files of `src/` without types 3.47 s. So **~2.4 s is fixed startup**. A `PostToolUse` hook adds that
to *each* `Edit`, and twenty edits are a minute and a half in twenty pauses. And **going from 1 file
to 38 costs 1 second**, so a finer grain buys nothing.

**Two events, and their cost.** `Stop` and `SubagentStop` are distinct events, and `Stop` does not
cover subagents. This repo does most of its work inside subagents, so a hook on `Stop` alone misses
the turn that wrote the files. The cost: N parallel lanes pay the budget N times on the same ESLint
cache. So the hook serializes with a **lock that does not wait**: a lane that does not get the lock
lets the turn through and says so.

Measured on the development machine, **never on CI**, which varies up to 1.86× between runs:

| | Ceiling | Measured (median) |
|---|---|---|
| Tree without a lintable file | < 200 ms | **135 ms** |
| One changed file | < 6 s | **4.57 s** |

Both values hold **only on an idle machine**. Under five concurrent `verify` runs, the one-file row
measured 5.5–16.2 s, and the clean-tree row 201–237 ms. One more `.md` in the repo does not move
them, because the hook lints **only what changed**. It moves the whole `pnpm lint` above
([#145](https://github.com/federicohermo/pentomino-games/issues/145)).

The declared `timeout` is **30 s**. It is not the `10` of the branch hook copied: that hook runs in
milliseconds, and this one costs seconds. 30 s is five times the ceiling, a margin for a turn that
changed thirty files and for a loaded machine. It is far below the default of 600 s, which is a
session stuck for ten minutes.

**What runs and what does not.**

- **It lints what changed.** The list comes from `git diff`, `git diff --cached` and
  `git ls-files --others`. Only the last one sees new files.
- **It keeps `.ts`, `.tsx`, `.js` and `.md`**, the extensions the config covers, **and only files
  that still exist.** A deletion also appears in `git diff`. ESLint on a missing path exits with
  status 2, and the hook reads that as "could not decide". Without the filter, a turn that deleted
  a `.md` stopped the check of everything else, silently and green.
- **`.mjs` stays out on purpose.** The block that extends `js.configs.recommended` targets
  `**/*.js`, and in flat config that glob does not match `.mjs`. So the `.mjs` files, this hook
  included, get zero rules today
  ([#143](https://github.com/federicohermo/pentomino-games/issues/143)).
- **It does not run the suite.** The suite is the clock of `verify`, and
  [#97](https://github.com/federicohermo/pentomino-games/issues/97) documents an intermittent test.
  In a node that a person types, that is a nuisance. In a hook on every turn, it blocks the end of
  the turn at random, and that is the fastest way to get the hook turned off.
- **It does not run the typecheck separately.** The lint already runs with type information; that
  is where the 4.42 s come from.

**And it fails open, like the branch hook.** If ESLint is missing, if the config is broken, or if
the previous block came from the hook itself (`stop_hook_active`), it lets the turn through and
says so. A hook that blocks when it cannot decide gets disabled on the first day.

### The hooks protect the SESSION, not the repository

This applies to this hook and to the branch hook (`.agents/scripts/hook.ts`). Read it before you
trust either one: **an agent hook fires only when the session does the work.** A person who edits
`docs/architecture/overview.md` in an editor, on `main`, never runs the branch hook. A `git commit`
from a terminal outside the session does not run it either.

**This is not a defect to fix.** To cover a person, the repo needs a git hook. That is another
decision with another cost: it starts with the installation of a tool this repo does not have, and
this repo measures before it adds a dependency. This is an agent harness, and it does what an agent
harness does. The other half protects the repository, whatever wrote the change: `pnpm verify` in
CI on each PR, and the ruleset that blocks a red merge into `main`.

## The tests are two Vitest projects and one command

The split is by what the test needs:

- **`node`**: `environment: 'node'` with `node-web-audio-api`. The domain is pure, and the audio
  layer has a native Web Audio implementation, so it runs there without adaptation. Only one of
  its `include` roots is `src/`. The others hold gates that **do not import a line of `src/`**:
  each gate lives next to the **subject** it verifies, not next to what the subject touches. The
  list, with the subject of each root, is in `vite.config.ts`.
- **`browser`**: real Chromium, through Playwright, for `*.browser.test.tsx` files. It exists
  because jsdom cannot do the job. `Spectrum.tsx` needs a 2D canvas, `createLinearGradient`,
  `ResizeObserver`, `matchMedia` and a `getBoundingClientRect` with numbers. `playback/engine.ts` needs
  `new AudioContext()` and `window.setInterval`. Coverage with jsdom needs a mock of exactly the
  code under test. That is coverage without verification.

The discriminant is the **suffix**, not a folder. A test of `Board.tsx` that needs a browser is
still a test of `Board.tsx`, and it lives next to the others.

The coverage `include` holds `src/**` and the code of this repo that runs from outside (ESLint,
Claude Code, Codex, a run of the implementation protocol), whose tests import it in the same
process. `mcp-server/**` is in the coverage `exclude`. v8 reports every file
that **ran**, and `include` only decides which untouched files join the denominator. So a test
that imports from the server pulls the whole server file into the table. The server has its own
gate at 100: `mcp:test`.

**Chromium is not in the lockfile.** A fresh clone needs `pnpm exec playwright install chromium`
before the first `verify`. CI does not need anyone to remember it: the workflow installs it with
`--with-deps`, because the Ubuntu runner lacks the system libraries Chromium needs.

The MCP server tests use `node --test`, in their own package, with the `--test-coverage-*=100`
flags of Node.

## Mutation is a CI job, and it judges a file whole

`pnpm mutation` runs Stryker. It is not a node of `verify`, and the reason is time, measured on the
development machine on 2026-10-04 with 15 workers:

| Target | Mutants | Time |
|---|---|---|
| One small module, `playback/playhead-offset.ts` | 24 | 30 s, of which 20 s are the start of Stryker |
| The kernel, `.spec-anchored/kernel.ts` and `pyjson.ts` | 2,760 | 8 min |
| The whole `mutate` list | 4,515 | The first test run alone passed 5 min, and the run was stopped |

So the job is differential: it mutates the files a PR changes, not the tree.

**A file is judged whole.** The first PR that touches a module must leave it with no surviving
mutant, also the ones that were there before the PR. Most modules of `src/` have never been
mutated, so that first PR pays for the file. This is the cost of a threshold of 100 with no stored
baseline, and it was chosen over a baseline for the reason the coverage threshold is 100.

**The sandbox can stay behind on Windows.** Stryker copies the repo to `.stryker-tmp/`, and fails
to delete it when a process still holds a file. A stopped run also leaves its worker processes
alive. Delete the folder, and end the `node` processes whose command line names
`@stryker-mutator`.

## The package manager is pnpm

`packageManager` pins it, and `pnpm-lock.yaml` versions it. **Do not use npm.** npm installs a flat
`node_modules` and leaves a `package-lock.json` next to `pnpm-lock.yaml`: two lockfiles that resolve
differently, and a deploy that picks one of them. The pnpm config lives in `pnpm-workspace.yaml`,
not in `package.json`.

`node_modules` is **strict**: you can import only what `package.json` declares. An import of a
transitive dependency that worked with npm fails here. This is on purpose. It catches phantom
imports before they reach production.

## Node version

The app needs Node ≥ 20.19 or ≥ 22.12. Vite 7 requires it, and **our own** `engines` declares it,
not only the one of Vite. With Node 18, the package manager reports it at install time, before the
build does.

The MCP server and the harness scripts need **≥ 22.18**, because they run TypeScript without a
build. That floor lives in the `engines` of the server, the package that needs it. With Node 20,
you lose only the server and the harness scripts.
