# Branches

The repo has two shared branches with distinct roles, and work branches whose prefix says what kind
of change they are.
[The decision](../architecture/decisions/2026-10-04-two-branches-and-staging-is-the-default.md)
says why the branches are two, and why the default is `staging`.

## The two roles

| Branch | Role | Who writes to it |
|---|---|---|
| `staging` | **Integration**, and the repo **default** | each PR from a work branch, and `hotfix:` commits |
| `main` | **Release**: the production branch of the [deploy](./deploy.md) | only a promotion PR from `staging` |

Merge each PR with a merge commit. A squash leaves on `main` a commit that is not on `staging`, and
the next promotion shows the whole history again as conflicts.

A hotfix is not a branch. It is a commit straight on `staging` whose message starts with `hotfix:`.

## Work branches

A work branch leaves `staging` and returns to it through a PR. `.agents/scripts/policy.ts` lists
the prefixes that can write `src/` and `mcp-server/src/`. This table says what each prefix means:

| Prefix | The change |
|---|---|
| `feature/` | what the instrument does: a capability is created or changed, and its spec is the first commit |
| `bugfix/` | a bug; it carries a spec only if the bug was an unwritten rule |
| `refactor/` | the shape of the code, not what it does |
| `improvement/` | UI, art, audio or performance, with no change of a rule |
| `harness/` | the harness: hooks, skills, rules, CI |
| `docs/` | documentation |

## The rulesets of `main`

They live in the settings of the GitHub repository, not in the tree.

| Ruleset | Id | Rules | Who can bypass it |
|---|---|---|---|
| `main-solo-por-pr-verde` | 21477023 | `pull_request`, and `required_status_checks: [verify]` | nobody, not the owner |
| `avoid-deletion` | 21071322 | `deletion` and `non_fast_forward` | the admin role |

`staging` has no ruleset. The id is what a call needs, to read a ruleset or to remove it:

```bash
gh api repos/federicohermo/synthominos/rulesets/21477023
gh api -X DELETE repos/federicohermo/synthominos/rulesets/21477023
```

## The two copies the machinery keeps of the model

| Where | What it declares | Branches |
|---|---|---|
| `.github/workflows/verify.yml` | `on.push.branches` | `staging`, `main` |
| `.agents/scripts/policy.ts` | `INTEGRATION_BRANCH` and `RELEASE_BRANCH` | `staging`, `main` |

[`__tests__/branches-in-sync.test.ts`](../../__tests__/branches-in-sync.test.ts) reads the two files
and this table. It fails when they name different branches, or when a shared branch has no run of
`verify` of its own.

## What nobody verifies

The repo tests run with no network, so they read no setting of GitHub. Nothing in the tree turns
red when one of these changes:

- **That the rulesets are still on.** The first call above checks one.
- **That a PR into `main` comes from `staging`.** The ruleset asks for a green `verify`, not for a
  source branch.
- **The merge method.** The repository and the ruleset allow a squash and a rebase.
- **That `staging` is the default branch**, and that `main` is the production branch of the deploy.

One copy in the tree is also outside the gate: `.github/workflows/hardening.yml` names the same two
branches, and the test does not read it.
