---
name: implement-feature
description: "Implements one issue of the instrument with a person in the session: test first, through phases 0 to 10 of the implementation protocol, with the two hardening agents, and closes with the PR open. Use when one change is ready to build. For two or more issues at once, use implement-batch. For a worker with no person in the session, use implement-orchestrated or implement-backlog."
argument-hint: "<issue number>"
---

# implement-feature

The supervised adapter of the implementation protocol. This session is the **Owner** of the run. A
person is in the session and answers each gate.

**First, read `.agents/protocols/implementation-protocol.md`.** It is the state machine: phases 0
to 10, the three terminals, the two internal agents. This file says who answers each gate in this
mode, and how each phase is done in this repo.

The unit is an issue. The issue is the plan of this change: what to touch and how to know it is
done. The spec, `specs/<capability>/<capability>.md`, is the contract that stays. Many issues touch
no spec. A spec written with no issue gets its issue first, with `to-issue`: the approval of a run
binds the body of an issue.

This skill leaves no debt. The doctrine is in [no-debt.md](no-debt.md).

`gh` is not on PATH on this machine. Run it as `"/c/Program Files/GitHub CLI/gh.exe"`; this skill
writes it as `gh`.

## Who answers each gate

| The protocol needs | In this mode |
|---|---|
| An answer to a doubt about meaning | The person, in the session, after you searched the repo. Give numbered options and one recommendation. |
| Approval of the plan, the scope, the evidence and the mutation target | The person approves the exact fingerprint: `approved <fingerprint>` |
| A change to a contract | The person. Before the run: `to-spec`, as the first commit of the branch. During the run: a gated amendment, with the IDs, the old and the new meaning, the reason and the tests that change. The merge of the PR confirms it. |
| A wider scope, a dependency, an external action | A new manifest, a new fingerprint and a new approval |
| Phase 7 | Dispatch `general-code-reviewer`, and nothing else |
| Phase 8 | Dispatch `mutation-hardener`, and nothing else |
| Every other review | Outside the run: `pr-review` on the PR, and the person |
| Delivery | The PR is open against `staging`. The person reviews and merges. |

The policy is the profile `supervised-local/v1`. The adapter is `implement-feature` and the mode is
`supervised`.

Record the model and the effort of this session in `run-state.json`. If the harness cannot run an
internal agent at `effort=max`, stop and tell the person: do not go on with a lower effort.

## Phase 0: open the branch and the run

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
  `to-spec` first, on this branch. The spec is the first commit, and it is the effective contract
  of the run.
- If the change touches a spec, read the whole spec, not only its new criteria. A criterion met by
  breaking another rule is not met.
- Run `pnpm install --frozen-lockfile` in a new worktree. It is born without `node_modules`.

Then create the run folder and write `run-state.json`, as the protocol says. The base commit of
the run is the tip of the branch now: `origin/staging`, or the spec commit.

The phase is done when `git merge-base --is-ancestor origin/staging HEAD` exits 0 and the run
folder exists.

## Phases 1 to 3: the delta, the doubts, the plan

**The delta.** For each criterion of the issue, write what is expected and what the repo does
today, with the command that shows it. If nothing is missing, the run is a no-change candidate: do
not write a patch.

**The doubts.** By now no planning doubt should remain: `to-issue` and `to-spec` settle them, where
they cost a paragraph. Search the repo before you ask. Ask the person only what the repo cannot
answer.

**The plan.** The issue already holds most of it. Add what the protocol asks, and derive the scope
manifest from the File boundaries of the issue:

- the Writes row gives `allowed_paths`. Inside one capability it is `src/<capability>/**`;
- the Does not touch row gives `denied_paths`. It is a closed list. If the work needs a file of
  that row, that is a finding about the issue: discharge it by `no-debt.md`, and do not write the
  file;
- `truth_change` grants a path under `specs/` only for an amendment the person approves, and for
  the `status: ratified` line when the plan cites the last criterion of a contract.

Compute the fingerprint with the recipe of `.agents/protocols/references/run-artifacts.md`. Show
the person the plan, the manifest and the fingerprint. Edit nothing until the person answers
`approved <fingerprint>`. Then write the approval record and check it with `verify-approval`.

## Phase 4: test first

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
it to a pure `.ts` module of its capability. That is the conversation coverage forces, and it keeps
the instrument testable.

**The test project follows the suffix.** `*.browser.test.tsx` runs in Chromium; everything else
runs in `node`. A change you can see is measured in the DOM of a browser test
(`getComputedStyle`, a `Range` on the text node), not by looking.

**A function with a wide input space gets a property test**, with `fast-check`.

**Ask the domain before you simulate it.** `describe_piece`, `simulate_board` and
`check_invariants` (MCP `pentomino-domain`) run the real functions. After you edit the model, the
authority is the suite: the session's server reads the main checkout and may hold modules it
loaded before your edit.

The phase is done when each criterion the change delivers has a test that cites it and passes.

### When the test checks prose

Part of what this repo verifies is that a `.md` says something. Three traps cost a full round,
because the red lies about its cause:

- **Flatten line breaks before you search.** Docs wrap at 100 columns, so the phrase falls split
  and the test says the doc lacks it when it has it. Collapse whitespace and compare per
  paragraph.
- **Search for what the doc verifies, not only for its name.** A bare file name can be green on a
  doc that names it for another reason.
- **Measure the falsification as a triple, in one run:** green, red with the change, green again.

## Phase 5: converge with `pnpm verify`

`pnpm verify` is the convergence node, not `pnpm test`. What it runs is in
`docs/guides/verification.md`.

- **Commit and push before you run it.** It takes minutes. Another session may close its batch and
  delete worktrees in that time. What is on the remote survives.
- **Save its output to a file in the run folder**, and read the verdict from the exit code. The
  tool truncates long output before the failing test.
- **If the change redefines a gesture, find the tests that assert the old state** and run them
  alone first.
- **If it falsifies a number a test reads**, grep the literal in the tests before the full run.

Then run the scope check of the protocol on the diff from the base commit.

The phase is done when `pnpm verify` exits 0 and `validate-scope` accepts the diff.

## Phase 6: bring the durable artifacts up to date

- **Each criterion the change adds or changes is cited by a test title.** The gate enforces it on
  `ratified` specs; on a `draft`, check with `rg -n "AC-<COD>-" src/ mcp-server/`.
- **Each criterion of the issue is met and checked off in the issue.** Those carry no ID and die
  with the issue.
- **If every criterion of the capability is now cited, set `status: ratified`** in the spec. The
  manifest must grant that path.
- **What comes up while implementing is done, not noted.** An incomplete issue is not closed by
  opening another one.
- **What generates a committed resource goes into the repo with it**, with its test.
- If the work falsified something the docs state in the present tense, update `docs/`.

## Phases 7 and 8: the two hardening passes

For each pass, in order:

1. Write the target file in the run folder: `general-target.json`, then `mutation-target.json`.
   The shape and the dispatch are in `.agents/protocols/references/handoffs.md`.
2. Dispatch the agent with the absolute path of the target, and wait for its handoff.
3. Read the exact diff `input..output` in the worktree of the agent. For each change decide:
   accepted or rejected, and why.
4. Bring the accepted commit to the branch: `git cherry-pick <output_commit_sha>`. If you reject a
   part, apply only the accepted part by hand and say so in the disposition.
5. Run the affected tests, then `pnpm verify`.
6. Write the disposition in `owner-disposition.json`, then remove the worktree and the branch of
   the agent.

The mutation pass starts from the commit you accepted after the general pass. If you edit anything
after you accept the mutation handoff, run both passes again.

A mutant that the agent calls equivalent, or beyond the tool, goes to the person with its file, its
line and the reason. The person decides.

## Phases 9 and 10: freeze and deliver

Confirm the list of Phase 9 of the protocol. Then:

- Push the branch.
- **Screenshots the issue asks for go to the PR, not to the branch.** Upload them with
  `node .claude/skills/implement-feature/scripts/screenshots-to-branch.ts <N> <folder>`, and show
  them in the PR by the raw URL it prints.
- Open the PR against `staging`, or against the branch it stacks on, with the body of
  `.agents/protocols/references/pr-body.md`. It states `AC → test → result` for each criterion and
  carries `Closes #N`.
- Write `result.json` and check it with `validate-result`.

The run is done when the PR is open, `pnpm verify` exits 0 on its head, no criterion of the change
lacks a citing test, and `validate-result` accepts `result.json`.

## When the issue or the contract falls short: the loop

A doubt found while implementing is evidence of a hole in `to-issue` or in `to-spec`. Discharge it
in two halves, both in this run:

1. **Fix what is missing.** If it belongs to the issue, edit it with `gh issue edit <N>`. The body
   changed, so the fingerprint changed: go back to Phase 3. If it belongs to the contract, it is a
   gated amendment: the person approves it, the manifest grants the path, and the spec changes in
   this PR.
2. **Fix the `SKILL.md` that let it through**, with the rule that would have caught it. The table
   is in `no-debt.md`. If no row fits, add the row. The diff of a run cannot hold a file of
   `.agents/`: the scope check refuses it. So the fix lands in its own `harness/` PR, opened in
   this run, from a worktree under `.claude/worktrees/`.

Never adjust the contract to match the code. If they differ, fix the code.

## The run log

`.agent-runs/<run-id>/run-log.md`, one entry for each phase:

- the run id, the issue, the branch, the mode;
- Phase 0: the effective contract, the policy, the baseline failures;
- Phase 1: expected, observed, evidence, gap; or the no-change target and its corroboration;
- Phase 2: the facts, the decisions, the questions and the answers of the person;
- Phase 3: the plan, the scope, the mutation target, the fingerprint and who approved it;
- Phases 4 and 5: the commits, each command with its exit code;
- Phase 6: what was synchronized;
- Phase 7: the input and output commits of the reviewer, what you accepted and rejected, the
  checks you ran again;
- Phase 8: the same for the hardener, with the coverage and the mutant counts;
- Phases 9 and 10: the frozen commits, the PR, the terminal.
