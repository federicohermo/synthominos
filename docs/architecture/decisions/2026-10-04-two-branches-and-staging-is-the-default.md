# Two shared branches, and the default one is `staging`

**Recorded 2026-10-04.** The model dates from 2026-08-25, the day of the ruleset.

Until that day the repo had one branch with two jobs: work landed on `main`, and the hosting
published `main`. Its only ruleset forbade a delete and a forced push. A red `verify` blocked no
merge, so the whole gate gave a color that nobody had to look at.

**Decision: `staging` integrates and `main` is the release.** Work lands on `staging` through a PR.
`main` changes through a promotion PR from `staging`, and a ruleset requires a PR and a green
`verify` there, with no bypass for anyone.

**Decision: the default branch of the repository is `staging`.** The default branch on GitHub is
not production. It is the base that each new PR gets, and what a fresh clone checks out. The
other option was weighed, and the two errors are not equal:

- With `main` as the default, a work branch lands on the release by mistake, with no warning. The
  ruleset does not stop it: it asks for a green `verify`, not for a source branch.
- With `staging` as the default, a promotion PR aims at `staging` by mistake. It breaks nothing, and
  the author aims it again.

**Decision: `staging` has no ruleset.** It takes `hotfix:` commits with no PR. A ruleset with a
bypass for one actor was the other option. GitHub has no such bypass in a personal repository:
the API answers `422`, measured on 2026-08-26.

The cost:

- **Nothing protects `staging`.** A direct push reaches it with no `verify`. The run on the push
  reports after the commit is there.
- **A release is a second PR**, and the published app is behind `staging` until someone opens it.
- **A PR merges with a merge commit, and nothing enforces it.** A squash leaves on `main` a commit
  that is not on `staging`, and the next promotion shows the whole history again as conflicts.
- **The model is written in more than one place.** A workflow and the permission hook cannot
  import a constant from each other. A gate compares the copies, and it cannot read the ruleset.
