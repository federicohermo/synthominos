---
name: pr-review-batch
description: "Reviews several open PRs of this repo in parallel, one agent per PR in its own worktree; each fixes, verifies, commits and pushes to its PR branch, and a stacked batch closes with the stack brought up to date. Use when two or more PRs need their review closed. For one PR, use pr-review."
argument-hint: "<N N ...> | --open [--comment] [--dry]"
---

# pr-review-batch

A PR review reads one diff. This skill reads N, and its own deliverable is what no single review
sees: **when branches stack, a finding in the upper PR is often a consequence of the lower one.**

It does not end at the report. Each agent finds, fixes, verifies, commits and pushes to its PR
branch.

This skill leaves no debt. The five discharges in [no-debt.md](no-debt.md) hold for every agent.
The batch adds one destination: `BELONGS-TO-PR-<N>`, a finding that belongs to another PR of the
chain. That is a route, not a discharge. It is discharged when someone applies it, and the parent
owns that (step 5).

The method of each agent is [findings.md](findings.md).

On Windows `gh` may be outside PATH: run it as `"/c/Program Files/GitHub CLI/gh.exe"` where this
skill writes `gh`. In a cloud session GraphQL answers 403, so `gh pr` and `gh issue` fail: use the
REST API, for example `gh api 'repos/<owner>/<repo>/pulls?state=open'`.

## Step 0: The PR map and the chain of bases

`$ARGUMENTS` is a list of PR numbers, or `--open` for every open PR. With no arguments, ask.

```bash
gh pr list --state open --json number,headRefName,baseRefName,author,title
```

1. For each PR write down: number, `headRefName`, `baseRefName`, author.
2. **`baseRefName` is the base, never `staging` by default.** A stacked PR diffed against
   `staging` pulls in the lower PR's commits.
3. **A `baseRefName` of `staging` can lie.** Compare `git log origin/staging..origin/<head>` of
   each PR with the others. If one head contains another's commits, they stack, and the review
   diff goes against that head.
4. **Draw the chain** and give it to the agents.
5. **Measure the hot list**: the files two or more PRs touch. `pr-diff.ts` takes the head as a
   third argument, so the parent measures with no checkout:

   ```bash
   for n in <N> <N> <N>; do
     node .claude/skills/pr-review-batch/scripts/pr-diff.ts <base-of-n> <dir>/$n origin/<head-of-n>
   done
   cat <dir>/*/pr.files | sort | uniq -cd | sort -rn
   ```

   Use `uniq -cd`, not an `awk` on the first column. The skill harness replaces numbered
   positional variables in the skill body with the invocation's arguments. An `awk` test on the
   first field reaches the shell as a constant that is always true, and the hot list comes out as
   the whole batch, silently. Named variables such as `$n` travel intact.
6. **Compare against `staging`.** If `staging` moved over files of the batch, the lowest PR may lag.
   Report it; do not update from here.
7. **An author other than you makes that PR `--dry`**, that PR alone. You are the login that
   `gh api user --jq .login` answers: compare it with the PR's `author.login`.
   `git config user.name` is not a login, and in a cloud session it is `Claude`.

With `--dry`, write nothing in any PR. Run to the report and stop.

The step is done when the chain and the hot list are written down.

## Step 0b: The merge order, and why no agent can check it

A chain merges bottom up, always. An agent stands on its own head, and
`git log origin/staging..HEAD` sees only downward: its PR and those below. The PRs above do not
exist for it. Measured here on 2026-08-22: two of four agents claimed no other PR touched their
files, and both were wrong about the same pair. So the parent measures the hot list and passes it
down.

Five clauses. They go **verbatim** in the preamble:

1. **A finding belongs to the lowest PR of the chain that introduced it.** If the line is not `+`
   in your `pr.diff`, it is not yours, even if it is not in `staging` yet. Report it as
   `BELONGS-TO-PR-<N>` with `file:line` and evidence, and do not touch it.
2. **Ownership goes to whoever falsifies the claim, not to whoever touches the line.** A diff can
   make false a claim it does not contain, typically a count. If your diff moves the number a
   sentence states, the sentence is yours.
3. **List every file you touched.** A fix below costs a merge in each PR above. The parent plans
   step 6 with your list. It does not change where the fix goes.
4. **Keep hunks small and still in every hot-list file**: do not reflow a paragraph, rewrap lines
   or reorder a table. This is hygiene, not a limit. It is never a reason to shrink a fix, choose a
   worse one, or skip it. Step 6 pays the conflict.
5. **Every finding is discharged, and no discharge is an issue.** Inside your PR's scope, into your
   PR. Outside it, into its own PR from `staging`, opened by you in this run. A fix that conflicts
   with an AC is discharged by correcting the AC in the spec, once the person approves the old and
   the new text (`.agents/rules/truth-layer.md`): return both as a `DECISION`. The only things you
   return unapplied are a `BELONGS-TO-PR-<N>`, a `BLOCKED` and a `DECISION`.

No agent rebases, uses `--force`, or merges. Each agent pushes with
`git push origin HEAD:refs/heads/<headRefName>`.

### The blind spot clause 2 covers

A count on the tree, fixed in one PR of the stack, stays stale in every PR above. Clause 1
guarantees no agent above sees it: the sentence is not in its diff, and the fix below does not
exist yet when it runs. Measured here on 2026-08-22: a doc stated how many test files the `node`
project had. The PR that fixed it was right for its head. The two PRs above each added a test
file, so each moved the number, and by clause 2 each owned it.

**Every count the batch moves belongs to the parent.** It is the one finding that is not
delegated, because it needs the whole chain at once.

## Step 1: The preamble, distilled once

Without it, N agents derive it N times from cold. Write it to a file with `Write`, and pass the
absolute path. A heredoc breaks on the backticks and `$` of the content. It holds, distilled:

- **The checkable conventions, 40 lines or fewer**, from `CLAUDE.md` and the rules of the folders
  the batch touches, with the line of `findings.md` marked: what a tool checks and what it does not.
- **What was tried and failed** in the area, from the comments of each PR's issue:
  `gh issue view <N> --json comments`.
- **The chain from step 0**, the five clauses of step 0b verbatim, and the hot list as measured.

## Step 2: One worktree per PR

Launch the N agents in one message: one sub-agent per PR, each in a worktree under
`.claude/worktrees/` (in Claude Code, `Agent` with `isolation: "worktree"`). Agents run
`pnpm verify` at the same time and each runs `git add`; a shared tree loses work.

**`pnpm verify` sets the width, not the review.** Each run is four heavy nodes in parallel.
Measured here: with five agents, three of five needed the contention protocol; with four, none
did. Four is the free width. Above it, run in waves.

## Step 3: The contract of each agent

Each agent receives the preamble path, its PR number, `headRefName`, `baseRefName`, the path to
`findings.md`, and its PR's issue pasted whole. It follows the method of `pr-review`, with these
differences:

1. **It stands on the PR branch inside its worktree**: `git fetch origin` and
   `git checkout <headRefName>`. Each PR has its own head, so lanes do not collide. If the main
   checkout stands on one of those branches, the parent moves it before launch.
2. **It runs `pnpm install --frozen-lockfile` first.** The worktree has no `node_modules`.
   Chromium needs no reinstall: its cache belongs to the machine.
3. **It materializes the diff with
   `node .claude/skills/pr-review-batch/scripts/pr-diff.ts <baseRefName> <temp-dir>`.**
4. **The five clauses of step 0b sit above the triage policy.** Three change what `pr-review` would
   do alone: a line that is not `+` goes back as `BELONGS-TO-PR-<N>`, hot-list hunks stay
   small, and an AC to correct goes back as a `DECISION`: no person is in the agent's session.
5. **The domain MCP reads the main checkout, not the worktree.** Inside the worktree, `rg` is the
   truth.
6. **It writes the commit message to a file and commits with `-F`.** No heredoc.
7. **It does not commit a red tree.** If `pnpm verify` stays red after step 4, it reverts what broke
   it, does not push, and says so.
8. **Its report goes to the parent**, in 30 to 50 lines: the verdict first, blockers with
   `file:line`, `BLOCKED` items with who blocked them, `BELONGS-TO-PR-<N>` items, whether
   `pnpm verify` passed first or second, **the exact list of files it touched**, and **the SHA it
   pushed**. Each finding returned unapplied is a `BELONGS-TO-PR-<N>`, a `BLOCKED` or a
   `DECISION` with the old and the new text of the AC. There is no fourth box.
9. **It does not claim which other PRs touch its files.** It cannot know.

## Step 4: The contention protocol

The red here is rarely the PR's. Performance budgets and wall-clock tests (the engine browser
tests) measure the machine, and the machine runs N verifies. Measured on 2026-08-21: three of five
PRs went red on the first run, always in clock tests, always in files the PR did not touch. All
three were fine.

1. Is the failing test in a file the PR touches? Then it is yours: fix it.
2. If not, and it is a budget or a wall clock, run it alone: `pnpm run budgets` for a budget,
   the file for a wall-clock test.
3. Green: continue, and report both runs with the test name.
4. Red again: do not push. Report it as a blocker of the batch, not of the PR.

## Step 5: Converge

The parent does not audit again. It crosses.

- **Verify each push landed.** `git fetch origin`, then compare each remote head with the SHA the
  agent returned.
- **Route each `BELONGS-TO-PR-<N>` and confirm it was applied there.** The target agent is still
  alive: resume it (`SendMessage`) with its worktree in place. Measured: about 100 s per dispatch,
  against 10 to 17 min for the first pass.
- **Measure the hot list again with what the review wrote.** The review creates new overlap: agents
  often end up touching the same doc that no original diff had.
- **Cross each new PR an agent opened against the other heads.** An agent that moved a finding to
  its own PR cannot see that another agent fixed it inside its PR. Measure with
  `git merge-tree --write-tree --name-only origin/<new-pr> origin/<each-head>`. If the new PR's
  diff is contained in another, close it with the measured reason.
- **The counts the batch moves are yours** (clause 2). Sweep the numeric claims about the tree,
  head by head, with a narrow pathspec, and send each owner the measured number.
- **Verify the dismissals, not only the findings.** The expensive case reads like a good finding: a
  🟡 that was not true. Correct it before it ships. If it already became a PR, close that PR.
- **The batch is not closed while a finding is not discharged**, except with `--dry`. The parent
  runs in the main checkout with permissions an agent lacks:
  - Apply each `BLOCKED` yourself. If the hook blocked it, check the branch name first. What you
    cannot apply either makes the run fail.
  - Ask the person each `DECISION` in one round, then apply the text the person approves in the
    PR that found it.
  - Apply a fix the review exposed in a skill or in the repo, not in a PR. It is discharge 3 of
    `no-debt.md`, and the easiest to skip.
- **With `--comment`**, one general comment per PR, headed by the SHA: blockers fixed, improvements
  applied, what went to its own PR with the number, and what forced a spec correction. No inline
  comments on a PR you already fixed.

The report is written in step 8, after step 6.

## Step 6: Bring the stack up to date

A review of a stack ends when the whole stack can merge, not when each PR is green. It runs last,
after every fix. While the conflict is something to avoid, the review bargains with it and leaves
bugs in.

If no PR stacks (every `baseRefName` is `staging`), skip this step and say so in the report. With
`--dry`, write the resolutions in the report instead.

### Measure first, with no checkout

```bash
git fetch origin
git merge-tree --write-tree --name-only origin/<upper> origin/<lower>
```

It answers which files clash without touching the tree, so the parent measures every join at once.
Without `--name-only` it returns the merged tree, and `git show <tree>:<file>` shows the conflict
with its markers. Write each resolution before you hand it out.

Measure the semantic result too. A clean automerge can be wrong: two chains that move the same
count merge without a clash and keep an old number.

### One lane per chain, not per join

The joins of one chain are sequential, so they go to one agent, in order, bottom up. Independent
chains run in parallel. Each lane receives its chain with the SHAs, each measured conflict with
its written resolution, and this contract:

1. **Merge on the target PR's branch**, standing on it.
2. **`git merge`, never `git rebase`, never `--force`.** A rebase rewrites the review commits the
   user just read.
3. **Resolve with the resolution the parent wrote.** If the conflict is not the described one,
   stop and report: something moved between measure and merge.
4. **Edit with a tool that keeps line endings.** In this Git Bash, `sed -i` on a CRLF file turns
   it all to LF, and the diff grows to the whole file. `git diff --stat` after resolving catches
   it; `git checkout --merge <file>` restores the conflict.
5. **`pnpm verify` after each join**, with the step 4 protocol.
6. **Push only to a ref that exists**, checked first with `git ls-remote --heads origin <branch>`.
   This step opens no remote branch and no PR.

### What this step cannot resolve

Two independent chains that touch the same file. That conflict appears only when the second one
reaches `staging`. It goes to the report with its final text already written.

## Step 7: Destroy the worktrees

Check first that each branch of the batch equals its `origin/<headRefName>`. If they differ,
something was not pushed.

```bash
node .claude/skills/pr-review-batch/scripts/clean-worktrees.ts <path> [<path> ...]
```

- **The paths are this batch's, one per agent.** Each agent's notification carries its worktree
  path. The script has no "all" mode: other sessions keep worktrees there too.
- **Never by hand.** On Windows, `git worktree remove` fails with `Directory not empty` on every
  worktree that ran `pnpm install`. The script unregisters, kills what runs inside by worktree
  path, and deletes.
- A review never starts the app. A process alive inside a worktree means an agent left something
  running: report it.
- If it says a worktree is still there, something outside holds a handle, such as the IDE. The
  user closes it.
- If it skips a worktree with uncommitted changes, it exits 1. Do not force it. If the worktree is
  yours, that agent did not close, and that goes first in the report.

## Step 8: The report

In this order, in about 40 lines plus the table:

1. **If something stayed `BLOCKED` and the parent could not apply it, the first line says the run
   failed.**
2. **A table, one row per PR:** number, branch, findings by severity, the review SHA, the merge SHA
   if step 6 touched it, and whether `pnpm verify` passed first or second.
3. **What appeared in more than one PR.** The cross-cutting pattern is the batch's own deliverable.
4. **The new PRs this run opened**, with numbers and their merge order.
5. **What forced a contract correction**, and **which `SKILL.md` this run fixed**, with which rule.
6. **The stack after step 6**: which chain is up to date against which, with which SHA, and each
   conflict with the criterion that resolved it. Next to it, the check: `git log <upper>..<lower>`
   is empty for each chain, and no new remote ref appeared.
7. **What remains between independent chains, with the resolved text.** And the merge order, bottom
   up. Merge commits only: a squash forces a rebase of the PR above.

The report answers one question: **can I merge this now?** If the answer is "yes, except one
conflict", the conflict goes with its final text inside the report.

## What it does not do

- It does not merge into `staging`, and it does not ratify a capability. It does merge upward
  inside the stack, in step 6.
- It does not review a contract that is still text. That is `shape`.
- It does not reimplement the review of one PR. With one open PR, use `pr-review`.
