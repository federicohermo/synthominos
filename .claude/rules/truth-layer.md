---
paths:
  - "specs/**"
---

# The truth layer

`specs/**` is the truth layer: every verification reads it. A session reads it. Only a named flow
writes it.

| Flow | What it writes | Who decides |
|---|---|---|
| The `to-spec` skill | A new contract, or the delta of a behavior change. It is the first commit of the branch. | The person in the session |
| The gated amendment of a supervised run | The exact paths that the scope manifest grants in `allowed_spec_paths` | The person, who approves the fingerprint |
| The `review-spec-drift` skill | Nothing. It reports. | The person, for each finding |

- **An orchestrated or an unattended run never writes `specs/`.** It stops with
  `SPEC_CHANGE_REQUIRED` and proposes the change in a comment on the issue.
- **`status: ratified` is a write.** A run that cites the last criterion of a contract names the
  status change in its plan, and its manifest grants the path.
- **The code answers to the contract.** If the code fails a criterion, fix the code. If the
  criterion no longer describes the instrument, a person decides.
- **Never edit a contract to match the code, or to turn a gate green.** A contract that is edited
  in silence makes every later check pass and say nothing.
- **A fixture recorded from another system is truth too.**
  `.spec-anchored/__tests__/fixtures/python-kernel.json` holds what the Python kernel answered. A
  case leaves it only with a deliberate change to a rule of the kernel.

If a task seems to need an edit to `specs/` outside these flows, that is the finding. Stop and name
the flow. Do not make the edit.

This repo has no golden tables and no metrics baseline. The kernel names both classes and they
stay empty.
