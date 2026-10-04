# Branches

This repo has **two shared branches with distinct roles**, and work branches whose prefix says
what kind of change they are. This file says what each one does, what protects it, and what to
do when the hook stops you.

## The two roles

| Branch | Role | Who writes to it |
|---|---|---|
| `staging` | **Integration**, and the repo **default** | each PR from a work branch, and `hotfix:` commits |
| `main` | **Release**: the deploy's production branch | only a promotion PR from `staging` |

The deploy provider's production branch is set **explicitly** to `main`; it is not inherited from
the default. The build configuration lives in [`deploy.md`](./deploy.md).

PRs merge with a merge commit. A squash leaves a commit on `main` that is not on `staging`, and
the next promotion proposes everything again as conflicts.

## Work branches

A work branch leaves `staging` and returns to `staging` through a PR. Its prefix says what kind of
change it is, and the prefix is all the hook checks:

| Prefix | What changes | Touches `src/` |
|---|---|---|
| `feature/` | what the instrument does: creates or modifies a capability; its spec is the first commit | yes |
| `bugfix/` | a bug; it carries a spec only if the bug was an unwritten rule | yes |
| `refactor/` | the shape of the code, not what it does | yes |
| `improvement/` | UI, art, audio or performance, without changing a rule | yes |
| `harness/` | the harness: hooks, skills, rules, CI | no |
| `docs/` | documentation | no |

**A hotfix is not a branch**: it is a commit straight on `staging` whose message starts with
`hotfix:`. That is why the hook lets `staging` write the product.

## The ruleset

`main` is protected by a ruleset (`main-solo-por-pr-verde`, **id 21477023**) with exactly these
rules:

| Rule | Value |
|---|---|
| `pull_request` | on: nobody pushes to `main` directly |
| `required_status_checks` | `[verify]` |
| `bypass_actors` | `[]`: **nobody**, not even the owner |

The id is here because it is what you need to remove it
(`gh api -X DELETE repos/federicohermo/pentomino-games/rulesets/21477023`).

`staging` **has no ruleset**: it receives `hotfix:` commits, and a bypass for any actor other than
the owner does not exist in a personal repo (the API answers `422`, measured on 2026-08-26).

### Why the default branch is `staging`

The GitHub default is not production: it is the **preselected** base of each new PR, what a fresh
`clone` gets, and the branch the deploy provider takes as production if nobody sets one.

The argument is asymmetric:

- With `main` as default, the error is **silent and serious**: a work branch lands straight on the
  release branch. The ruleset does not stop it: it requires a green `verify`, not a source branch.
- With `staging` as default, the error is **visible and harmless**: a promotion PR aimed at
  `staging` breaks nothing and is retargeted in two clicks.

## The two copies the machinery keeps of the model

| Where | What it declares | Branches |
|---|---|---|
| `.github/workflows/verify.yml` | `on.push.branches` | `staging`, `main` |
| `.agents/scripts/policy.ts` | `INTEGRATION_BRANCH` and `RELEASE_BRANCH` | `staging`, `main` |

`verify` runs on both because the published branch cannot be the only one without its own run.
The hook names both because both receive work from others: **it is the same set**. A shared
branch without its own run is the hole this model closes.

[`__tests__/branches-in-sync.test.ts`](../../__tests__/branches-in-sync.test.ts) checks that both
copies say what this document says. It reads from disk, compares text, and needs no network.

## When the hook stops you

`.agents/scripts/hook.ts` runs before each edit, in Claude Code and in Codex. It blocks writing
`src/` or `mcp-server/src/` from a branch without one of the four product prefixes, and from
`main`. The message names the problem. There are two ways out:

```bash
git switch staging && git pull
git switch -c feature/<kebab-description>   # or bugfix/, refactor/, improvement/
```

or, for a one-line fix that does not deserve a branch, commit it on `staging` as `hotfix:`.

The same hook rejects opening a worktree of this repo outside `.claude/worktrees/`, the only
folder `node .agents/scripts/clean-worktrees.ts` sweeps. The Codex app keeps its worktrees in
`~/.codex/worktrees/` and cleans them itself: the hook does not see them and the cleaner does not
touch them.

If the hook cannot read something (git does not answer, the payload does not parse), it lets the
call through and warns. It protects a convention, not a secret.

## What nobody verifies

**That the ruleset is still on.** It lives in the GitHub configuration, not in the repo, and
reading it takes a network call. The repo tests run without network on purpose. The gate checks
the copies in the tree and **states** that it does not check this one.

If someone deletes the ruleset, nothing in the repo turns red. Checking takes one call:

```bash
gh api repos/federicohermo/pentomino-games/rulesets/21477023
```
