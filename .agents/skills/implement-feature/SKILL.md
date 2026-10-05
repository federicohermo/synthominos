---
name: implement-feature
description: "Implements one issue of the instrument, or one spec written without an issue, test first, and closes with the PR open. Use when one change is ready to build. For two or more issues at once, use implement-batch."
argument-hint: "<issue number | capability with a spec and no issue>"
---

# implement-feature

The unit is an issue, or a spec written without an issue. The issue is the plan of this change:
what to touch and how to know it is done. The spec, `specs/<capability>/<capability>.md`, is the
contract that stays. Many issues touch no spec.

This skill leaves no debt. The doctrine is in [no-debt.md](no-debt.md). What belongs to
implementing is the loop: a planning problem found here is a defect of the skill that let it
through. Fix both in this run.

`gh` is not on PATH on this machine. Run it as `"/c/Program Files/GitHub CLI/gh.exe"`; this skill
writes it as `gh`.

## Step 1: Open the branch

```bash
gh issue view <N>
git fetch origin
git checkout --no-track -b <type>/<N>-<kebab> origin/staging
```

- The prefix is the issue type: `feature/`, `bugfix/`, `refactor/` or `improvement/`. Only these
  write `src/` and `mcp-server/src/`; the hook denies the rest. The table is in
  `docs/infra/branches.md`.
- If the branch exists (`to-spec` may have opened it with the spec commit), work on it. If another
  session holds it, open your own worktree on it, under `.claude/worktrees/<name>` of the main
  checkout. The hook denies any other place.
- If the change creates, modifies or deletes behavior and the spec delta is not written, run
  `to-spec` first, on this branch. The spec is the first commit.
- If the change touches a spec, read the whole spec, not only its new criteria. A criterion met by
  breaking another rule is not met.
- Run `pnpm install --frozen-lockfile` in a new worktree. It is born without `node_modules`.

The step is done when `git merge-base --is-ancestor origin/staging HEAD` exits 0 on the branch.

## Step 2: Respect the file boundaries

The issue's File boundaries table is a contract. Its "Does not touch" row is a closed list. If
the work needs a file from that row, that is a finding about the issue: discharge it by
`no-debt.md`, and do not write the file.

## Step 3: Test first

For each behavior the change adds or changes:

1. **Write the test first and run it alone.** It must fail, and fail for the expected reason: an
   assertion on the value. A red from a missing import or `is not a function` only proves the
   file does not exist.
2. Write the least code that makes it pass.
3. Clean up, with the test as witness.

**The test title cites its criterion**, when you write it, not at the end:

```ts
it('AC-BRD-004 — a piece is not placed over another', () => { … })
```

Coverage is 100 in four metrics, and `suite` fails under it. Every branch you add needs a test
that would fail if the branch were wrong. A branch you cannot reach is deleted or made reachable.
No comment skips it.

**If a rule cannot be tested without React, Web Audio or the DOM, it is in the wrong file.** Move
it to a pure `.ts` module of its capability. That is the conversation coverage forces, and it keeps the
instrument testable.

**The test project follows the suffix.** `*.browser.test.tsx` runs in Chromium; everything else
runs in `node`. A change you can see is measured in the DOM of a browser test
(`getComputedStyle`, a `Range` on the text node), not by looking.

**Ask the domain before you simulate it.** `describe_piece`, `simulate_board` and
`check_invariants` (MCP `pentomino-domain`) run the real functions. After you edit the model, the
authority is the suite: the session's server reads the main checkout and may hold modules it
loaded before your edit.

The step is done when each criterion the change delivers has a test that cites it and passes.

## When the test checks prose

Part of what this repo verifies is that a `.md` says something. Three traps cost a full round,
because the red lies about its cause:

- **Flatten line breaks before you search.** Docs wrap at 100 columns, so the phrase falls split
  and the test says the doc lacks it when it has it. Collapse whitespace and compare per
  paragraph.
- **Search for what the doc verifies, not only for its name.** A bare file name can be green on a
  doc that names it for another reason.
- **Measure the falsification as a triple, in one run:** green, red with the change, green again.

## Step 4: Converge with `pnpm verify`

`pnpm verify` is the convergence node, not `pnpm test`. What it runs is in
`docs/guides/verification.md`.

- **Commit and push before you run it.** It takes minutes. Another session may close its batch and
  delete worktrees in that time. What is on the remote survives.
- **Save its output to a file**, and read the verdict from the exit code. The tool truncates long
  output before the failing test.
- **If the change redefines a gesture, find the tests that assert the old state** and run them
  alone first.
- **If it falsifies a number a test reads**, grep the literal in the tests before the full run.

The step is done when `pnpm verify` exits 0.

## When the issue or the contract falls short: the loop

By now no planning doubt should remain. They are settled in `to-issue` and `to-spec`, where they
cost a paragraph. A doubt found while implementing is evidence of a hole in one of them.

Discharge it in two halves, both in this run:

1. **Fix what is missing.** If it belongs to the contract, edit the spec in this PR. If it belongs
   to the issue, edit it with `gh issue edit <N>`.
2. **Fix the `SKILL.md` that let it through**, with the rule that would have caught it. The table
   is in `no-debt.md`. If no row fits, add the row.

Never adjust the contract to match the code. If they differ, fix the code.

## Step 5: Close

- **Each criterion the change adds or changes is cited by a test title.** The gate enforces it on
  `ratified` specs; on a `draft`, check with `rg -n "AC-<COD>-" src/ mcp-server/`.
- **Each criterion of the issue is met and checked off in the issue.** Those carry no ID and die
  with the issue.
- **If every criterion of the capability is now cited, set `status: ratified`** in the spec, in
  this PR.
- **What comes up while implementing is done, not noted.** An incomplete issue is not closed by
  opening another one.
- **What generates a committed resource goes into the repo with it**, with its test.
- **Screenshots the issue asks for go to the PR, not to the branch.** Upload them with
  `node .claude/skills/implement-feature/scripts/screenshots-to-branch.ts <N> <folder>`, and show
  them in the PR by the raw URL it prints.
- If the work falsified something the docs state in the present tense, update `docs/`, the rules
  and `CLAUDE.md`.
- Open the PR against `staging`, or against the branch it stacks on. The body states, for each
  `AC-<COD>-###`, `AC → test → result`, and carries `Closes #N` if there is an issue.

The run is done when the PR is open, `pnpm verify` exits 0 on its head, and no criterion of the
change lacks a citing test.
