# frontier-worker: the prompt of the scheduled routine

A scheduled routine that looks at the issues a person marked for unattended work, claims exactly
one, and runs `implement-backlog` on it. The skill is the work. This file is what the trigger does.
It lives in the repo so that a change to it goes through a PR.

## Wiring, once

Create a routine with:

- **Prompt:** `Follow the instructions in .agents/routines/frontier-worker.md.`
- **Trigger:** a schedule. Once an hour is a sane start.
- **Repository:** this one.

Each run is a fresh session, so no context leaks from one issue to the next. Check how the
platform limits pushes and daily runs when you wire it: those limits are the brake of this routine.

**A person starts it.** A person puts the label `auto-implement` on an issue after
`ticket-readiness-review` says `READY`. The routine never adds that label.

## The label `in-flight`

It says: a run owns this issue now. The routine adds it at the claim. It removes it on a blocker
and on a no-change. On success it stays: the issue is in flight until a person merges the PR.

## Instructions

1. **Look at the frontier.** List the open issues with the label `auto-implement` that:
   - do not carry `in-flight`;
   - have a `Spec:` field that says `none`, or name a spec delta that is in `origin/staging`;
   - have every issue of their `Blocked by:` field resolved. Merged, or closed as `completed`:
     resolved. Closed as `duplicate`: read the issue it points to. Closed as `not_planned`: not
     resolved, a person decides.

   If none qualifies, say so and stop. An empty look is a good run.
2. **Claim exactly one**: the oldest. Add `in-flight` and comment:
   `Claimed by frontier-worker, run:<run-id> claimed_at:<time> expires_at:<time + 2h>`.
   The label is a signal, not a lock: read the issue again, and if another claim came first, remove
   yours and stop. A claim past its `expires_at` with no PR is stale: comment the release and take
   the issue.
3. **Issue the policy.** Write `.agent-runs/<run-id>/policy.json`: the profile `unattended/v1` with
   the roots of the Writes row of the issue.

   ```json
   {
     "base_profile": "unattended/v1",
     "overlay": { "authorized_scope_roots": ["src/circuit"], "max_scope_roots": 1, "allowed_operations": ["M", "A"] }
   }
   ```

   A root is a capability folder, `src/<capability>`, or `mcp-server/src`. If the Writes row holds
   another path, the issue does not qualify: remove `in-flight`, add `needs-refinement`, comment
   why, and stop. Check the file with
   `node .spec-anchored/spec-anchored.ts resolve-policy <file>`.
4. **Start the worker**, as the first message of its session:

   ```text
   implement-backlog issue #<N> --policy <absolute path of policy.json>
   ```

5. **Read the terminal** from `.agent-runs/<run-id>/result.json`, not from the transcript, and
   check it with `node .spec-anchored/spec-anchored.ts validate-result .agent-runs/<run-id>/result.json`.
   The run is done when one of these holds:

   | Terminal | What is true |
   |---|---|
   | `PR_READY_AWAITING_HUMAN` | A PR is open against `staging`, and each criterion has its evidence. CI, the review and the merge belong to a person. |
   | `NAMED_BLOCKER` | The worker commented the blocker on the issue, and `in-flight` is removed |
   | `NO_CHANGE_REQUIRED` | The worker commented the corroborated evidence, `in-flight` is removed, and there is no PR |

One claim, one run, one fresh session for each issue. Never take a second issue in the same run.
