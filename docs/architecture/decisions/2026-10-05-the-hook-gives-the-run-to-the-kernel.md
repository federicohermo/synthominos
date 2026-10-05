# The hook gives the run to the kernel when the PR opens

**2026-10-05**

The kernel in `.spec-anchored/` checks the artifacts of a run: the approval, the scope of the
diff, the terminal. Nothing called it. The protocol asked the agent to run its commands, so the
checks ran only if the agent that they judge chose to run them.

**Decision: the `PreToolUse` hook calls the kernel when a PR opens from a product branch.** It
finds the run of the branch in `.agent-runs/`, and it refuses the PR when:

- the approval record does not bind to the bundle, or no policy of the run has the approved hash;
- the plan or the manifest is not the one that was approved;
- the diff from the approved base leaves the manifest or touches the harness.

Two other places were refused:

- **CI.** The run folder is ignored by git, so a runner sees the diff and the PR body, and no
  approval. To check there, a run must publish its artifacts, and the protocol this repo took says
  that the folder stays local.
- **Each edit.** The scope check needs the diff of the whole run. On one edit it can only say that
  the path is inside the manifest, and the branch gate already keeps the product apart.

The cost:

- **The gate is local.** A PR opened from a machine with no hook, or from the GitHub page, is not
  checked.
- **A product branch with no run is warned, not refused.** A person who opens a PR by hand has no
  run. An agent that skips the protocol whole gets the same warning.
- **The hook reads one field the kernel does not define**: `branch` in `run-state.json`. A run
  that does not write it is a branch with no run.
- **The protocol has not run in this repo yet.** The gate is proven on artifacts that its tests
  build with the kernel, not on a real run.
