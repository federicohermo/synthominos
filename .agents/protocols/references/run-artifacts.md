# The artifacts of a run

Every file of a run lives in `.agent-runs/<run-id>/`, in the main checkout. Git ignores the
folder. Give an internal agent the absolute path: its worktree is another folder.

| File | Phase | What it holds |
|---|---|---|
| `run-state.json` | 0 | Run id, issue, branch, base commit, mode, the rule files loaded, the model and effort observed |
| `run-log.md` | all | One entry for each phase. The template is in the adapter. |
| `issue.md` | 0 | The body of the issue, as `gh` returns it |
| `evidence-target.md` | 1 | Only for a no-change candidate |
| `plan.md` | 3 | The plan |
| `scope-manifest.json` | 3 | [scope-manifest.md](scope-manifest.md) |
| `spec-corpus.json` | 3 | The hash of each contract the plan reads |
| `approval-bundle.json` | 3 | The input of `build-approval` |
| `approval.json` | 3 | The output of `build-approval`: the canonical bundle and the fingerprint |
| `approval-record.json` | 3 | The approval event |
| `verify-<n>.txt`, `changes.z` | 5, 9 | The output of each `pnpm verify`, and the diff that the scope check reads |
| `general-target.json`, `general-handoff.json` | 7 | [handoffs.md](handoffs.md) |
| `mutation-target.json`, `mutation-handoff.json` | 8 | [handoffs.md](handoffs.md) |
| `owner-disposition.json` | 7, 8 | What the Owner accepted and rejected |
| `result.json` | 10 | The terminal |

`K` below is `node .spec-anchored/spec-anchored.ts`. `gh` is `"/c/Program Files/GitHub CLI/gh.exe"`
when it is not on PATH.

## The hashes of Phase 3

```bash
RUN=.agent-runs/<run-id>
gh issue view <N> --json body --jq .body > $RUN/issue.md
K canonicalize $RUN/issue.md --allow-hard-breaks      # ticket_body_sha256
K canonicalize $RUN/plan.md                           # plan_sha256
K canonicalize $RUN/scope-manifest.json --kind json   # scope_manifest_sha256
git rev-parse origin/staging                          # base_sha, on a fresh fetch
```

The canonical form of a text has no trailing spaces, no blank edges and one final newline. So an
edit that changes only those does not change the hash. A plan with a Markdown hard break (two
spaces at the end of a line) is refused: write the plan without them.

**The contract.** `spec_entrypoint` is the contract of the capability in the manifest:
`specs/<capability>/<capability>.md`. A change that touches only `mcp-server/` names the contract
of the capability whose functions the tool runs.

`spec_pinned_commit` is the commit that holds the effective contract: `origin/staging`, or the
spec commit of the run's branch in a supervised run.

`spec-corpus.json` maps each contract the plan reads to the hash of its text:

```json
{ "specs/circuit/circuit.md": "<K canonicalize specs/circuit/circuit.md --allow-hard-breaks>" }
```

`spec_corpus_sha256` is `K canonicalize $RUN/spec-corpus.json --kind json`.

**The amendment.** `semantic_amendment_sha256` is `null`, or the hash of the text of the amendment
the human approved, in a supervised run.

**The policy.** `policy_sha256` is the hash of the resolved policy, not of the policy file: an
instance resolves to its base profile plus its overlay. A supervised run uses the profile
`supervised-local/v1`. An orchestrated or unattended run uses the instance file its launcher
issued.

```bash
K resolve-policy supervised-local/v1   # prints the policy and policy_sha256
```

`build-approval` computes the hash again and refuses a bundle that carries another one.

## The approval bundle

`approval-bundle.json`. Every field is required, and an unknown field is refused.

```json
{
  "schema_version": 1,
  "run_id": "RUN-138-20261004T2130Z",
  "adapter": "implement-feature",
  "execution_mode": "supervised",
  "policy_profile": "supervised-local/v1",
  "policy_sha256": "<64 hex>",
  "ticket_ref": "federicohermo/synthominos#138",
  "ticket_body_sha256": "<64 hex>",
  "base_sha": "<40 hex>",
  "spec_entrypoint": "specs/circuit/circuit.md",
  "spec_pinned_commit": "<40 hex>",
  "spec_corpus_sha256": "<64 hex>",
  "plan_artifact_id": "issue-comment:<id>",
  "plan_sha256": "<64 hex>",
  "scope_manifest_sha256": "<64 hex>",
  "semantic_amendment_sha256": null
}
```

`plan_artifact_id` is the address of the plan a person approved: `issue-comment:<id>` when the
plan is a comment on the issue, or `run:<run-id>/plan.md` when the person approves it in the
session.

```bash
K build-approval $RUN/approval-bundle.json --policy supervised-local/v1 > $RUN/approval.json
```

The output carries `APPROVAL-FINGERPRINT`. That is the value a person approves.

## The approval record

`approval-record.json` proves the approval event. The bundle proves the content.

```json
{
  "schema_version": 1,
  "approval_fingerprint": "<the fingerprint>",
  "approval_artifact_id": "issue-comment:<id of the reply>",
  "approver": "<GitHub login>",
  "approved_at": "2026-10-04T21:45:00Z",
  "provider": "github",
  "repository": "federicohermo/synthominos",
  "run_id": "RUN-138-20261004T2130Z"
}
```

`provider` is `github` for a reply on the issue, or `local` for an approval in the session. In a
session, `approval_artifact_id` is `session:<run-id>` and `approver` is the name of the person.

```bash
K verify-approval $RUN/approval-record.json --bundle $RUN/approval-bundle.json \
  --policy supervised-local/v1
```

A record for another run, another repository or another fingerprint is refused.

## The result

`result.json` is a strict union: the fields of one terminal, and no other field.

Every terminal carries `schema_version` (1), `run_id`, `issue_ref`, `terminal` and `claim_state`.

| Terminal | `claim_state` | Its fields |
|---|---|---|
| `PR_READY_AWAITING_HUMAN` | `parked` | `pr_url`, `head_sha`, `approval_fingerprint`, `general_hardening_report_sha256`, `mutation_hardening_report_sha256`, `owner_disposition_sha256` |
| `NAMED_BLOCKER` | `released` | `blocker_kind`, `issue_comment_url` |
| `NO_CHANGE_REQUIRED` | `released` | `evidence_target_sha256`, `no_change_corroboration_sha256`, `classification`, `corroborated` (`true`) |

The three hashes of a PR terminal are `K canonicalize <file> --kind json` of
`general-handoff.json`, `mutation-handoff.json` and `owner-disposition.json`.

`issue_comment_url` must point to a comment on the issue of the run. `classification` is
`ALREADY_SATISFIED` or `STALE_REQUEST`. A result that holds the word `merged`, `landed`,
`auto-merged` or `merge_complete` as a value is refused: a person merges.

```bash
K validate-result $RUN/result.json
```
