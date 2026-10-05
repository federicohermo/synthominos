# The artifacts of a run

Every file of a run lives in `.agent-runs/<run-id>/`, at the root of the checkout of the Owner. Git
ignores the folder. Give an internal agent the absolute path: its worktree is another folder.

| File | Phase | What it holds |
|---|---|---|
| `run-state.json` | 0 | Run id, issue, branch, base commit, mode, the rule files loaded, the model and effort observed |
| `run-log.md` | all | One entry for each phase |
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

The kernel defines the shape of the bundle, the record and the result, and refuses a wrong one
with the name of each field. A valid example of each is in `.spec-anchored/__tests__/cli.test.ts`:
`BUNDLE`, `RECORD` and `RESULT`. This page holds what the kernel cannot know: where each value
comes from in this repo.

`K` below is `node .spec-anchored/spec-anchored.ts`.

## Where each value of the bundle comes from

```bash
RUN=.agent-runs/<run-id>
gh issue view <N> --json body --jq .body > $RUN/issue.md
K canonicalize $RUN/issue.md --allow-hard-breaks      # ticket_body_sha256
K canonicalize $RUN/plan.md                           # plan_sha256
K canonicalize $RUN/scope-manifest.json --kind json   # scope_manifest_sha256
K canonicalize $RUN/spec-corpus.json --kind json      # spec_corpus_sha256
K resolve-policy <profile id | instance file>         # policy_sha256
```

| Field | Value |
|---|---|
| `run_id` | `RUN-<issue>-<UTC time>`, for example `RUN-138-20261004T2130Z` |
| `ticket_ref` | `federicohermo/synthominos#<N>` |
| `base_sha` | The tip of the branch when the run starts: `origin/staging` on a fresh fetch, the spec commit in a supervised run, or the tip of the branch it stacks on |
| `spec_entrypoint` | The contract of the capability in the manifest. A change that touches only `mcp-server/` names the contract of the capability whose functions the tool runs. |
| `spec_pinned_commit` | The commit that holds the effective contract: `origin/staging`, or the spec commit of the run's branch |
| `spec-corpus.json` | An object: the path of each contract the plan reads, and `K canonicalize <path> --allow-hard-breaks` of it |
| `plan_artifact_id` | `issue-comment:<id>` when the plan is a comment on the issue. `run:<run-id>/plan.md` when the person approves it in the session. |
| `semantic_amendment_sha256` | `null`, or the hash of the text of the amendment the person approved |

The plan is hashed in strict mode: write it with no Markdown hard break (two spaces at the end of
a line).

## Where each value of the approval record comes from

| The approval is | `provider` | `approver` | `approval_artifact_id` |
|---|---|---|---|
| A word of the person in the session | `local` | The name of the person | `session:<run-id>` |
| A reply `approved <fingerprint>` on the issue | `github` | The login of the reply | `issue-comment:<id of the reply>` |
| The label `auto-implement`, in an unattended run | `github` | The login that put the label | `label:auto-implement@<issue>` |

## The three hashes of a PR terminal

`general_hardening_report_sha256`, `mutation_hardening_report_sha256` and
`owner_disposition_sha256` are `K canonicalize <file> --kind json` of `general-handoff.json`,
`mutation-handoff.json` and `owner-disposition.json`. A no-change terminal carries
`no_change_corroboration_sha256`, the hash of `general-handoff.json`.
