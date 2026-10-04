# Targets and handoffs

The two internal agents work from an input that does not move, each in its own worktree. Their
commits are proposals until the Owner inspects and accepts them.

Every file here lives in `.agent-runs/<run-id>/` of the main checkout. Give the agent the absolute
path of that folder.

## The target: what the Owner gives an agent

`general-target.json` and `mutation-target.json`:

```json
{
  "run_id": "RUN-138-20261004T2130Z",
  "role": "general-code-reviewer",
  "run_folder": "<absolute path of .agent-runs/<run-id>>",
  "base_sha": "<40 hex>",
  "input_candidate_sha": "<40 hex>",
  "branch": "feature/138-node-pins--general",
  "diff_sha256": "<64 hex>",
  "spec_corpus_sha256": "<64 hex>",
  "plan_sha256": "<64 hex>",
  "scope_manifest_sha256": "<64 hex>",
  "policy": "supervised-local/v1",
  "mode": "code"
}
```

- `role` is `general-code-reviewer` or `mutation-hardener`.
- `branch` is the branch the agent creates at the input candidate: the branch of the run plus
  `--general` or `--mutation`. It keeps the prefix of the run's branch, so the hook lets the agent
  write `src/`. Nobody pushes it.
- `diff_sha256` is the SHA-256 of `git diff <base_sha>..<input_candidate_sha>`.
- `policy` is the profile id, or the absolute path of the instance the launcher issued.
- `mode` is `code`, or `no-change` for an evidence target. Only `general-code-reviewer` takes
  `no-change`.

The agent reads `plan.md`, `scope-manifest.json` and `issue.md` from the run folder.

## Dispatch

The agent works in a worktree of its own, under `.claude/worktrees/` of the main checkout. The
hook denies any other place.

- **Claude Code.** Call the agent by its name. Its contract declares `isolation: worktree`, so the
  harness opens the worktree.
- **Codex.** Open the worktree first, then start the agent in it:
  `git worktree add --detach .claude/worktrees/<run-id>-<role> <input_candidate_sha>`.

The prompt of the dispatch is one line: the absolute path of the target file.

When the Owner has taken what it accepts, it removes the worktree and the branch of the agent:

```bash
node .agents/scripts/clean-worktrees.ts <path of the worktree>
git branch -D <branch of the target>
```

## The handoff of `general-code-reviewer`

`general-handoff.json`:

```json
{
  "status": "CODE_HARDENED",
  "input_candidate_sha": "<40 hex>",
  "output_commit_sha": "<40 hex, or null>",
  "changed_paths": ["src/circuit/sequence.ts"],
  "changes": [
    { "path": "src/circuit/sequence.ts", "summary": "<what changed>", "reason": "<the defect it removes>" }
  ],
  "behavioral_impact": "none",
  "verification": [
    { "command": "pnpm verify", "exit_code": 0, "result": "pass" }
  ],
  "remaining_risks": [],
  "owner_review_required": true
}
```

| `status` | Meaning |
|---|---|
| `CODE_HARDENED` | It changed code, and committed |
| `NO_CHANGES_NEEDED` | It found nothing to change |
| `NO_CHANGE_CORROBORATED` | The evidence target holds |
| `NO_CHANGE_BROKEN` | It found a counterexample to the evidence target |
| `NO_CHANGE_UNVERIFIABLE` | It could not check the evidence target |
| `CODE_HARDENING_BLOCKED` | The input is missing or moving, or the effort is not `max`, or the loop makes no progress |
| `SEMANTIC_CHANGE_REQUIRED` | The fix needs a change to what a contract means |
| `SCOPE_EXPANSION_REQUIRED` | The fix needs a path or a permission outside the manifest |
| `ORACLE_REVIEW_REQUIRED` | A test and a contract disagree |
| `DEPENDENCY_APPROVAL_REQUIRED` | The fix needs a dependency nobody approved |

## The handoff of `mutation-hardener`

`mutation-handoff.json`:

```json
{
  "status": "MUTATION_HARDENED",
  "input_candidate_sha": "<40 hex>",
  "output_commit_sha": "<40 hex, or null>",
  "eligible_target": ["src/circuit/sequence.ts"],
  "not_eligible": [
    { "path": "src/board-editing/Board.tsx", "reason": "only the browser project covers it" }
  ],
  "changed_paths": [],
  "changes": [],
  "coverage": { "line_percent": 100, "branch_percent": 100 },
  "mutation": {
    "generated": 0,
    "killed": 0,
    "equivalent_candidates": 0,
    "tooling_limitation_candidates": 0,
    "actionable_survivors": 0
  },
  "dispositions": [],
  "verification": [],
  "remaining_risks": [],
  "owner_review_required": true
}
```

| `status` | Meaning |
|---|---|
| `MUTATION_HARDENED` | The eligible target meets the four numbers of Phase 8 |
| `MUTATION_NOT_APPLICABLE` | No changed file is eligible. The report says why. |
| `MUTANT_DISPOSITION_REQUIRED` | A mutant is a candidate for `equivalent` or `tooling limitation`. A person decides. |
| `MUTATION_HARDENING_BLOCKED` | The loop makes no progress |
| `MUTATION_TOOLING_REQUIRED` | Stryker cannot give a result that repeats, or the effort is not `max` |
| `SEMANTIC_CHANGE_REQUIRED`, `SCOPE_EXPANSION_REQUIRED`, `ORACLE_REVIEW_REQUIRED`, `DEPENDENCY_APPROVAL_REQUIRED` | As above |

Each entry of `dispositions` names one mutant: its file, its line, the mutator, the candidate
class and the reason.

## The disposition of the Owner

`owner-disposition.json` holds one entry for each handoff:

```json
{
  "run_id": "RUN-138-20261004T2130Z",
  "dispositions": [
    {
      "role": "general-code-reviewer",
      "input_candidate_sha": "<40 hex>",
      "output_commit_sha": "<40 hex, or null>",
      "accepted": ["<each change it accepts>"],
      "rejected": [{ "change": "<each change it rejects>", "reason": "<why>" }],
      "integrated_commit_sha": "<40 hex, or null>",
      "reruns": [{ "command": "pnpm verify", "exit_code": 0 }]
    }
  ]
}
```

## When the final candidate is valid

- The Owner accepted each handoff that applies.
- The mutation report names the exact final candidate.
- `pnpm verify` exits 0 on it, and the scope check accepts its diff.
- No edit came after the mutation pass. An edit sends the run back to both passes.

`result.json` binds the final candidate to the three files: `general_hardening_report_sha256`,
`mutation_hardening_report_sha256` and `owner_disposition_sha256`. A `NO_CHANGE_REQUIRED` terminal
carries `no_change_corroboration_sha256`, the hash of `general-handoff.json`.

A review from outside the run is a separate artifact on the PR. It never replaces the inspection
of the Owner.
