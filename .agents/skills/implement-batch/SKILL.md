---
name: implement-batch
description: "Implements N issues of the instrument in parallel, one lane per dependency chain, each lane in its own worktree, and closes with one PR per issue. Use when two or more issues are ready at once. For one issue, use implement-feature."
argument-hint: "<N N ...>"
---

# implement-batch

The method for each issue is `implement-feature`, and this file does not repeat it. This file
holds only what exists with more than one issue at a time: split into lanes, isolate in
worktrees, close the batch.

This skill leaves no debt. The doctrine is in [no-debt.md](no-debt.md).

`gh` is not on PATH on this machine. Run it as `"/c/Program Files/GitHub CLI/gh.exe"`; this skill
writes it as `gh`.

## Step 0: Read the batch, and remove what does not go

```bash
gh issue list --state open --limit 50
gh issue view <N>          # one per issue in the batch
gh pr list --state open
```

From each issue take three things: the criteria it delivers, its "Writes" row, and what it
declares to depend on.

Remove from the batch, before you split it:

- An issue that already has an open PR.
- An issue that depends on something outside the batch that has not landed.
- An issue blocked by an unanswered `OQ-<COD>-###`.

**Measure again what the issue declares.** A number the issue measured right can be stale today.
Measure today's tree.

The step is done when each issue left in the batch has its three things written down.

## Step 1: Split into lanes

A lane is a dependency chain. Lanes run at the same time. Only an edge puts two issues in the same
lane, in order:

| Between A and B | It is | It costs |
|---|---|---|
| B imports what A creates | edge | series |
| B starts from a number A moves | edge | series |
| Both write the same function of the same file | edge | series |
| Both write distant regions of the same file | conflict | one merge resolution |
| A declares `Depends on #B` | edge, unless the files deny it | series |

The usual error is the conservative one. Almost every UI change writes `App.tsx`. Treat that as an
edge and the batch collapses to one lane. Measured on a batch of five: four wrote `App.tsx` in
disjoint regions; as edges they gave one lane, as conflicts three. Test a shared file with
`git merge-tree --write-tree <branch> <branch>` and resolve what clashes.

Three more judgments that fail from memory:

- **A mention is not a write.** An issue that names a file because it updates a doc listing it
  does not write that file.
- **A declared dependency is intent, not graph.** Derive the graph from the files first, then
  compare. When they differ, that is a finding of the batch. Measured: a batch declared as "one
  chain" of five gave three lanes.
- **A number one issue moves and another measures from is a hard edge.** No import shows it. The
  second issue's criterion is unfalsifiable without the first in the tree.

If only one lane comes out, say so and run it anyway. The batch still buys step 2 and the
preamble. It does not buy wall-clock time, and that goes to the report.

The step is done when each issue is in exactly one lane and each edge names its file or number.

## Step 2: Cross-check, before writing a line

Cross the issues of the batch with each other, and with the open issues outside it:

- Two issues that deliver the same criterion. One is redundant.
- A criterion that no issue delivers and the batch assumes.
- Two issues that contradict the same rule of a contract.
- A default that two issues move. One turns it on, the other turns it off.
- One issue produces data that another turns off. Measured here: one change made a muted piece
  emit a click without a note, and another silenced exactly that branch. Together, the muted
  piece went fully silent, and a criterion asked for the opposite.
- An open issue outside the batch that starts from a rule the batch changes. Search by the spec
  it touches, not by number.

Fix what you find now: the issue with `gh issue edit`, the contract with `to-spec`. An issue the
cross-check rewrites is rewritten whole: premise, contract and criteria. A design decision the
issue lacks: decide it, write it into the issue, and put it in the lane's prompt as a task with
its reason. It goes to the report, where the user can revert a paragraph.

The step is done when every question above has a written answer, including the ones that gave no.

## Step 3: One worktree per lane

Launch the lanes in one message: one sub-agent per lane, each in a worktree under
`.claude/worktrees/` (in Claude Code, `Agent` with `isolation: "worktree"`).

Write the preamble once for the whole batch, to a file, with `Write`. Pass its absolute path.
A heredoc breaks on the backticks and `$` of its content. Each lane receives:

- **The preamble**: the capability folders, the conventions with who checks each,
  and the traps below. Without it, N lanes derive it N times from cold.
- **The whole issue, pasted.** The worktree does not carry the plan; it lives in GitHub. The
  contract does travel: `specs/` is tracked.
- **Its issues in order**, each delegated to `implement-feature`, each closed before the next
  starts. The first PR of the lane targets `staging`; the next ones target the previous branch of
  the lane.

The traps, measured in this repo and in the one this harness comes from:

- **Branch from an explicit base.** The worktree may not start on it. Run
  `git fetch origin staging` and `git checkout --no-track -b <branch> origin/staging`, then
  `git merge-base --is-ancestor origin/staging HEAD` before the first edit. `--no-track` keeps two
  lanes from writing the shared `.git/config` at once; `push -u` sets the upstream.
- **The branch name is `<type>/<N>-<kebab>`, with the issue type.** The hook writes `src/` only
  from `feature/`, `bugfix/`, `refactor/` and `improvement/`. The symptom is a denied `Edit` that
  reads like a permission problem. It is the first failure of a lane.
- **Run `pnpm install --frozen-lockfile` first.** The worktree has no `node_modules`, and
  `pnpm verify` is red until it does. Chromium does not need reinstalling: its cache belongs to
  the machine.
- **The domain MCP does not see the lane's worktree.** It reads the main checkout. Inside a lane,
  `rg` on the worktree is the truth.
- **One command per Bash call.** In an isolated worktree, Bash may reject a compound command, a
  long `&&` chain, or a `$(…)` used as an argument, as "too complex to verify". Put it in a script
  in the lane's scratch, run in one line. Write files with `Write`.
- **Each scratch file has its own name.** Two lanes writing the same temp file overwrite each
  other with no visible conflict.
- **Commit and push as you go.** A session limit cuts every lane at once. The worktree survives;
  the process does not. Resume the same agent (`SendMessage`), stating its last commit and what is
  uncommitted. Do not relaunch.
- **Screenshots go up with
  `node .claude/skills/implement-batch/scripts/screenshots-to-branch.ts <N> <folder>`**, not with
  a second worktree: the guard rejects `git -C <other worktree>` from a lane.
- **A lane does not edit a skill.** It reports the failure, and the parent writes the rule. Two
  lanes that fix the same `SKILL.md` collide.
- **Rerun every command this skill hands out before you hand it out.** A broken command spreads
  N times.

### The gates of a lane

Each lane is the Owner of one run of the implementation protocol, in supervised mode: the profile
`supervised-local/v1` and the adapter `implement-feature`. A lane is a sub-agent, so two things it
cannot do itself go through the parent:

| The lane needs | What happens |
|---|---|
| An answer of the person, or the approval of its fingerprint | The lane stops and returns the question, or the plan with its fingerprint. The parent collects them from every lane and asks the person once. Then it resumes each lane (`SendMessage`) with the answer. |
| To dispatch `general-code-reviewer` or `mutation-hardener` | A sub-agent cannot start another agent. The lane writes the target file and returns its absolute path. The parent dispatches the agent, and resumes the lane with the path of the handoff. The lane inspects the diff and takes what it accepts: it is still the Owner. |

Dispatch the hardening agents of several lanes in one message. The run folder of a lane is in its
worktree: `.agent-runs/<run-id>/`.

### When a lane is done

> A lane ends with its PRs open and no criterion without a citing test. Not before.
>
> For each of its issues: `pnpm verify` exits 0, everything the issue asks is done, the branch is
> pushed, and the PR is open against its base with `Closes #N`.
>
> "Ready to commit", "PR still to open" and "left in the working tree" are not endings. If
> something truly blocks, the lane returns what it closed, plus the block with its evidence and
> the exact command.

**The parent verifies; it does not believe.** When a lane returns:

```bash
gh pr list --head <type>/<N>-<kebab> --json number,statusCheckRollup
rg -n "AC-<COD>-" src/ mcp-server/
```

The gate enforces citations on `ratified` specs; `rg` answers for the `draft` ones. A report that
says "done" without a PR is an incomplete lane: finish it or resume it. Wait for every lane.

## Step 4: What only the parent closes

- **Edits outside any lane**, in series, so the diff reads.
- **Before you ask the user, measure what the question assumes.** If one option meets every
  constraint, decide it and report the evidence. Ask only what no measurement answers.
- **The loop.** It belongs to the parent by construction. It ships in its own `harness/` PR from
  `staging`, not in a lane's PR.
- **A contract two lanes edited.** `specs/` is tracked, so this is a real merge conflict. The
  parent resolves it.
- **A conflict between lanes is resolved in a branch, not in the report.** Put the two in one
  stack: the first issue of the later lane takes the head of the other, and its PR is retargeted
  to that branch.
- **`pnpm verify` on the head of each stack.** N green lanes do not imply green together.

## Step 5: Destroy the worktrees

```bash
node .claude/skills/implement-batch/scripts/clean-worktrees.ts <path> [<path> ...]
```

- **The paths are this batch's, one per lane.** Each lane's notification carries its worktree
  path. The script has no "all" mode: everything under `.claude/worktrees/` includes other
  sessions' worktrees.
- **Run it before the report, and never by hand.** On Windows, `git worktree remove` fails with
  `Directory not empty` on every worktree that ran `pnpm install`, and a live `vite` or `esbuild`
  holds a handle. The script unregisters, kills what runs inside by worktree path (never by
  process name), and deletes.
- If it says a worktree is still there, something outside holds a handle, such as the IDE. The
  user closes it; say so.
- If it skips a worktree with uncommitted changes, it exits 1. Do not force it. If the worktree is
  yours, the lane did not close, and that goes first in the report.

The step is done when the script exits 0, or each remaining worktree is in the report with its
reason.

## Step 6: The report

1. **If something stayed blocked, the first line says the run failed.**
2. **A table, one row per issue:** number, lane, PR, criteria delivered, and whether
   `pnpm verify` passed on the first run or the second.
3. **The lanes, their width, and how many declared dependencies were false.**
4. **What step 2 found and what was decided.** This is the deliverable of the batch.
5. **What forced an edit to a contract or an issue.**
6. **Which `SKILL.md` was fixed, and with which rule.**
7. **The merge order, bottom up**, and which PR to retarget to `staging` before its base is
   deleted. Merge commits only: a squash forces a rebase of the PR above.
8. **Which capabilities can now be ratified**: every criterion cited.

The report cannot say "pending". If that word appears, something was not discharged.
