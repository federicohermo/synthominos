---
name: pr-review
description: "Reviews one open PR of this repo against its issue, the spec it touches and the repo conventions, then fixes, verifies, commits and pushes to the PR branch. Use when a PR needs its review closed. For two or more PRs at once, use pr-review-batch."
argument-hint: "<PR number> | (empty = the PR of the current branch) [--comment] [--dry]"
---

# pr-review

Find, fix, verify, commit and push to the PR branch. The report is what remains, not the product.

This skill leaves no debt. Every finding leaves by one of the five discharges in
[no-debt.md](no-debt.md), and none of them is "noted for later". The review decides where each
fix lands: inside the PR's scope, in this PR; outside it, in its own PR opened in this run.

The method (axes, confidence filter, triage) is in [findings.md](findings.md).

On Windows `gh` may be outside PATH: run it as `"/c/Program Files/GitHub CLI/gh.exe"` where this
skill writes `gh`. In a cloud session GraphQL answers 403, so `gh pr` and `gh issue` fail: use the
REST API, for example `gh api 'repos/<owner>/<repo>/pulls?state=open'`.

This skill works in the main checkout, on the PR branch. No worktree and no scaffold branch: one
PR needs neither, and the PR branch already carries the prefix the hook accepts.

## Step 0: Which PR, and against which base

`$ARGUMENTS` is the PR number. With no argument, take the PR of the current branch:

```bash
gh pr list --state open --head "$(git branch --show-current)" \
  --json number,headRefName,baseRefName,author,title
```

If there is none, ask which. Do not review `staging` against itself.

1. **`headRefName`**: the prefix says the kind of change; the number, if any, is the issue.
2. **`baseRefName`, which is not `staging` by default.** If the PR stacks on another open PR, a
   diff against `staging` pulls in the lower PR's commits. If the base is another open PR, say so
   in the report. A line that is not `+` in your `pr.diff` is not yours. With two or more PRs in
   the chain, use `pr-review-batch`.
3. **The author.** If it is not you, the run is `--dry`: review and report, write nothing, push
   nothing. You are the login that `gh api user --jq .login` answers: compare it with the PR's
   `author.login`.

With `--dry`, write nothing: no fixes, no PRs, no push.

The step is done when the three facts are written down.

## Step 1: Stand on the PR branch

```bash
git status --short     # must be empty
git fetch origin
```

With no argument you already stand on it; `git pull --ff-only` if the remote moved. With `<N>`:

```bash
git checkout <headRefName> || git checkout -b <headRefName> origin/<headRefName>
```

If another worktree holds the branch, `checkout` fails. That is `BLOCKED`: report the path of the
worktree that holds it. Do not dodge it with another name.

**A PR without a spec is normal** in `bugfix/`, `refactor/`, `improvement/`, `harness/` and
`docs/`. Two cases are findings: a `feature/` with no spec delta, and a PR that changes what the
instrument does without touching the spec. In both the spec is missing: run `to-spec` in this
run.

The step is done when `HEAD` is the PR head and the tree is clean.

## Step 2: Read the contract and the issue

```bash
gh issue view <N>                          # if there is an issue: its criteria and boundaries
cat specs/<capability>/<capability>.md     # if it touches a spec: what must be true
```

Read all that exist. The issue says what was promised this time; the spec says what it is judged
against. With neither, the criteria come from the PR body. A review that reads only the diff
reviews without acceptance criteria, and it still finishes and reports.

## Step 3: Materialize the diff once

```bash
node .claude/skills/pr-review/scripts/pr-diff.ts <baseRefName> <temp-dir>
```

It writes `pr.diff`, `pr.files` and `pr.stat`, prints which axes open, and lists the numeric
claims the diff adds.

- Review only the axes it opens.
- If it flags the diff as large, do not read the whole diff. Triage with `pr.stat` and read file
  by file.

## Step 4: Check each criterion

Check each criterion of the issue and each AC the PR touches against the diff, one by one. **An AC
with no verifiable counterpart in the diff is a finding even if the code is right.** Here that has
a concrete form: no test title cites the AC, or the test that cites it does not exercise it.

The reverse holds too: **an AC that cannot be seen to fail is a finding about the spec.** "The
board shows the piece" is not one; "after a drop on column 3, row 2, the cell holds piece L" is.
Rewrite the criterion in the spec, in this PR, once the person approves its old and new text
(`.agents/rules/truth-layer.md`), and check that the diff meets it. It is also a
correction of `to-spec`: add the rule there, per the loop in `no-debt.md`, and say so in the report.

## Step 5: Find and fix

Use the method of [findings.md](findings.md). What does not bend:

- **Everything you find gets fixed.** The triage table decides where it lands, never whether.
- **Narrow where you search, not what you fix.** Search the diff and what it touches.
- **What falls outside the PR's scope goes to its own PR**, opened in this run from `staging`.
- **Blocked makes the run fail.** If the hook blocked it, check the branch name first.

## Step 6: `pnpm verify` green

```bash
pnpm verify > <temp-dir>/verify.log 2>&1; echo "exit=$?"
```

Read the verdict from the exit code, never from a grep. If it is red:

1. Is the failing test in a file the PR touches? Then it is yours: fix it.
2. If not, and it is a time budget or a wall-clock test, run it alone: `pnpm run budgets` for a
   budget, the file for a wall-clock test. These tests measure the machine, and a busy machine
   fails them.
3. Green alone: continue, and report both runs with the test name.
4. Red again: do not push. Report it.

Do not commit a red tree. Revert what broke it and say so.

## Step 7: Commit and push

Write the commit message to a file with `Write` and pass it with `git commit -F <file>`. A heredoc
breaks on backticks and `$`.

```bash
git push origin HEAD:refs/heads/<headRefName>
```

`HEAD:` is redundant on purpose: it states the target ref, and it fails loud if the branch moved.
No `--force` and no rebase: a rebase rewrites commits the author already read.

**Verify the push landed**: `git fetch origin`, then compare `origin/<headRefName>` with your
SHA. A "pushed" with a remote that did not move is the last silent failure.

With `--comment`, post one general comment on the PR, headed by the SHA, with four sections:
blockers fixed, improvements applied, what went to its own PR (with the number), and what forced
a spec correction. Do not post inline comments on a PR you already fixed.

## Step 8: The report

Check that `HEAD` equals `origin/<headRefName>`. If you moved from another branch to review
`<N>`, go back to it only after this check.

The report, in about 30 lines:

1. **The verdict on the first line**, and whether `pnpm verify` passed on the first run or the
   second. If something stayed `BLOCKED`, the verdict is that the run failed.
2. **The blockers**, with `file:line` and evidence.
3. **What was applied in this PR**, as counts.
4. **What went to its own PR**, with each number and why it did not fit here.
5. **What forced a contract correction**, which travels in this PR.
6. **What stayed `BLOCKED`**, who blocked it, and the exact fix on one line.
7. **Which `SKILL.md` this run fixed**, and with which rule.
8. **The SHA**, and whether the base was another open PR.

The report cannot say "pending". If that word appears, a finding was not discharged: go back to
the table in `findings.md`.

## What it does not do

- It does not merge, and it does not ratify a capability. Whoever cites the last criterion sets
  `ratified`.
- It does not review a contract that is still text. That is `shape`, which runs earlier and costs
  a paragraph.
- It does not update a stack of PRs. That is step 6 of `pr-review-batch`.
