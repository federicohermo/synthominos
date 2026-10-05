# Implementation protocol

The state machine that every implementation skill runs: `implement-feature`,
`implement-orchestrated` and `implement-backlog`. This file defines the work. The skill is an
adapter: it names who answers each gate in its mode.

It comes from spec-anchored agentic development, at commit `4f8a13e`, adapted to this repo. The
kernel that checks its artifacts is in `.spec-anchored/`.

## Words

- **Run.** One issue, one Owner, one branch, at most one PR.
- **Owner.** The agent that runs the skill. It owns the branch and the terminal, and it decides
  which commit of an internal agent lands.
- **Candidate.** One exact commit of the run's branch.
- **Gate.** A decision that the Owner cannot take alone. The adapter names who takes it.
- **Terminal.** The state a run ends in. There are three.

## The two internal agents

A run calls exactly two agents, in this order: `general-code-reviewer`, then `mutation-hardener`.
Their contracts are `agents/general-code-reviewer.md` and `agents/mutation-hardener.md`.

Both use the model of the Owner, at `effort=max`. No contract pins a model. If the runtime cannot
give `max`, or cannot show the effort it gives, the run blocks. It does not change the model and
does not accept a lower effort.

Reviews of spec conformance, security, performance and architecture are outside this protocol.
`pr-review` and the human do them on the PR.

## Terminals

| Terminal | Meaning |
|---|---|
| `PR_READY_AWAITING_HUMAN` | A PR is open against `staging`, or against the branch it stacks on, with its evidence. A person reviews and merges. |
| `NAMED_BLOCKER` | The run stopped. A comment on the issue names the blocker and its evidence. |
| `NO_CHANGE_REQUIRED` | The repo already does what the issue asks. The evidence is corroborated. There is no PR. |

`validate-result` knows the kinds of blocker, and names them when it refuses one.

A run never says that its PR is merged, deployed or validated in production.

The repo has no duplication tool: where the bundle this protocol comes from asks for a duplication
check, say in the report that it is not applicable.

## Phase 0: preflight

1. Read the gate table of the adapter.
2. Read the root `AGENTS.md`. Read `.agents/rules/truth-layer.md` and `.agents/rules/testing.md`.
   Read `.agents/rules/package-by-feature.md` if the change creates or moves a file of `src/`.
   Read the `AGENTS.md` of each folder the change touches. Write the paths you loaded in
   `run-state.json`.
3. **Find the effective contract.** It is `specs/<capability>/<capability>.md` on
   `origin/staging`. A `draft` contract is authority: `draft` only says that a criterion has no
   test yet.
   - If the issue says `Spec: none`, the contract of the capability the change touches is the
     one on `origin/staging`.
   - If the issue says `Spec: creates`, `modifies` or `deletes`, the spec delta is a commit.
     In a supervised run, `to-spec` writes it as the first commit of the run's branch, before
     this phase. That commit is the effective contract. In every other mode the delta must
     already be in `origin/staging`. If it is not, the terminal is `NAMED_BLOCKER` with
     `SPEC_CHANGE_REQUIRED`.
   - If the issue pins a commit and the contract moved since, compare by meaning. No rule,
     criterion or non-goal that the issue names changed: write `SPEC_REBASED_NO_RELEVANT_CHANGE`
     and go on. One of them changed: `SPEC_STALE`. You cannot tell: a blocker.
4. Confirm the repository, the branch, the base commit, who owns the issue, and the failures
   that exist before the run. The branch starts at `origin/staging`, or, in a lane of
   `implement-batch`, at the branch of the issue before it. Its prefix is the issue type. A
   worktree opens only under `.claude/worktrees/`.
5. Create `.agent-runs/<run-id>/` at the root of the checkout you work in. The run id is `RUN-<issue>-<UTC time>`,
   for example `RUN-138-20261004T2130Z`. Every artifact of the run goes there. Nothing goes under
   `.claude/` or `.codex/`. The folder is ignored by git. Write the branch of the run in
   `run-state.json`, in the field `branch`: the hook finds the run of a PR by it.

Never mix your work with changes of the user that the run does not own.

## Phase 1: the proven delta

Before a plan, write five things: what is expected, what is observed, the evidence, the gap, and
the classification.

If there is no gap, the run is a `NO_CHANGE_CANDIDATE`. Do not write a cosmetic patch. Write an
evidence target: the IDs of the contract, each command with its real output, the places you
searched, the limits of the environment, and one classification:

```text
ALREADY_SATISFIED | STALE_REQUEST | WRONG_SYSTEM | UNVERIFIABLE
```

In Phase 7, `general-code-reviewer` checks that target in no-change mode. Only a corroborated
target becomes `NO_CHANGE_REQUIRED`, and only with `ALREADY_SATISFIED` or `STALE_REQUEST`. The
other two classifications are a `NAMED_BLOCKER`. A no-change target has no mutation pass.

## Phase 2: understand, and resolve each doubt

Read the whole chain: the root context, the folder context, the contract, the issue with its
comments, the code and its tests. Separate four things: facts, decisions someone authorized,
implementation details you can undo, and assumptions nobody authorized.

A doubt that changes the result goes to the provider the adapter names. If the provider is
"abort", the terminal is `NAMED_BLOCKER`. Never guess.

## Phase 3: plan, scope and approval

Write a plan that names:

- the rules and criteria it delivers, and the one outcome of the issue;
- each decision that carries weight, and each detail it leaves open;
- the steps and their order;
- the paths it writes and the git operations it uses;
- the four permissions: dependency, schema, data migration, external side effect;
- for each criterion, the test that proves it and its boundary;
- the mutation target, and whether property tests apply;
- how to undo the change, and the non-goals.

Write the scope manifest. Its schema is [scope-manifest.md](references/scope-manifest.md). The
scope is the intersection of three things: what the issue asks, what the policy allows, and the
paths the plan proposes. Its allowed paths come from the File boundaries of the issue. For a
change inside one capability they are `src/<capability>/**`.

Compute the `APPROVAL-FINGERPRINT`. It is the hash of the approval bundle, which binds the issue
body, the base commit, the effective contract, the plan, the manifest and the policy. The recipe
is in [run-artifacts.md](references/run-artifacts.md).

If one of those inputs changes, the fingerprint changes and the approval is void. A wider scope is
a new manifest, a new fingerprint and a new approval. It is never an edit of a field.

The gate of this phase is the approval of that exact fingerprint. The adapter names who gives it.

## Phase 4: the Owner implements

Work the approved plan on the typed branch, in commits a person can review.

- Write the test first, and see it fail for the expected reason. The rule is
  `.agents/rules/testing.md`.
- A test title cites the criterion it verifies: `AC-<COD>-###`.
- Use only the scripts of `package.json` and the kernel. Do not improvise a tool.
- `specs/` is read-only. One exception: a supervised run may write the semantic amendment that
  the human approved, on the exact paths the manifest grants. Every other mode stops with
  `SPEC_CHANGE_REQUIRED`.
- A new path, dependency, permission, external action or decision that carries weight goes back
  to its gate.

## Phase 5: the baseline evidence

Run the evidence the plan approved, before an internal agent starts:

1. `pnpm verify`, with the output saved to a file in the run folder.
2. The scope check, against the diff from the base commit:

```bash
git diff --name-status -z --find-renames --find-copies <base_sha>..HEAD > .agent-runs/<run-id>/changes.z
node .spec-anchored/spec-anchored.ts validate-scope --manifest .agent-runs/<run-id>/scope-manifest.json \
  --changes .agent-runs/<run-id>/changes.z --nul --profile <policy file>
```

Record each command, its exit code, the output that matters, and each check you did not run. Say
which failures existed before the run and which are new. A required gate stays green.

## Phase 6: durable synchronization

Before the hardening passes, bring the durable artifacts up to date: the docs that the change made
false, the checkboxes of the issue, the `AC → test → result` lines for the PR.

A change to what a contract means goes back to Phase 3: it voids the plan and the approval.

The diff of a run never holds a file of the harness: the scope check refuses it. A rule that the
harness lacks lands in its own `harness/` PR. A supervised Owner opens it in the same run. In every
other mode the Owner proposes it in a comment on the issue.

## Phase 7: general code review and repair

Dispatch `general-code-reviewer` in an isolated worktree, against one exact candidate commit. Give
it the target of [handoffs.md](references/handoffs.md).

For a code target, the agent inspects, edits, verifies and inspects again, with the criteria of
the `general-code-review` skill. It may edit production code and tests inside the scope. It commits
in its worktree and returns a handoff.

For a no-change target, it edits nothing. It returns `NO_CHANGE_CORROBORATED`, or the
counterexample it found.

**A commit of an internal agent never lands by itself.** The Owner must:

1. read the exact diff `input..output`;
2. check the meaning, the scope and the non-goals;
3. accept or reject each material change;
4. bring only the accepted commits to the branch;
5. run the affected checks again;
6. write the handoff and the disposition in the run folder.

`SEMANTIC_CHANGE_REQUIRED`, `SCOPE_EXPANSION_REQUIRED`, `ORACLE_REVIEW_REQUIRED` and
`DEPENDENCY_APPROVAL_REQUIRED` go back to their gate. A loop that makes no progress is a
`NAMED_BLOCKER` with `REPEATED_FAILURE`.

## Phase 8: mutation hardening

Dispatch `mutation-hardener` in a new isolated worktree, against the candidate the Owner accepted.

The eligible target is what `node .agents/scripts/mutation-target.ts <base_sha> --report` prints:
the changed files that the `mutate` list of `stryker.config.json` covers. A changed file of the
product that the list leaves out is a limit of the tool: the agent names it in its report, and the
Owner reviews it.

The agent works until, on the eligible target:

```text
line coverage = 100%
branch coverage = 100%
mutant resolution = 100%
actionable surviving mutants = 0
```

It may edit production code and tests. It may not change a contract, the scope, a threshold, the
mutation config, a rule, a policy, CI or a review criterion to make the gate pass.

It commits in its worktree and returns a handoff. The Owner applies the six steps of Phase 7. A
mutant that the agent calls equivalent, or beyond the tool, needs the review of the Owner and then
of the human: the agent cannot approve its own exception.

With no eligible target the agent returns `MUTATION_NOT_APPLICABLE`, with the evidence. A missing
tool and a loop without progress are blockers.

**An edit by the Owner after it accepts the mutation handoff voids both passes.** The run goes
back to Phase 7, then Phase 8.

## Phase 9: final acceptance and freeze

The Owner confirms that:

- it inspected both handoffs and wrote a disposition for each;
- no agent changed a contract, the scope or a gate;
- every accepted commit is on the branch, and no rejected change is;
- `pnpm verify` exits 0 on the integrated tree, and the scope check accepts its diff;
- the mutation report names this exact candidate;
- the durable artifacts of Phase 6 are up to date.

Then it freezes the base commit, the head commit and the hash of the diff. An edit, a rebase, a
conflict resolution or a regenerated file after the freeze voids the candidate. The run goes back
to Phase 7.

## Phase 10: deliver

Open the PR against `staging`, or against the branch it stacks on, with the body of
[pr-body.md](references/pr-body.md). Write `result.json` and check it:

```bash
node .spec-anchored/spec-anchored.ts validate-result .agent-runs/<run-id>/result.json
```

When the PR opens, the hook gives the run folder to the kernel again: the approval record, the
hashes of the plan, the manifest and the policy, and the scope of the diff from the base commit.
It refuses the PR on a finding, with the words of the kernel.
[Why](../../docs/architecture/decisions/2026-10-05-the-hook-gives-the-run-to-the-kernel.md)

The terminal is `PR_READY_AWAITING_HUMAN`. A blocker that a later review raises brings the Owner
back. A correction to the code runs Phases 5 to 9 again.

## The run folder

`.agent-runs/<run-id>/` holds the state, the log, the approval and scope artifacts, the evidence,
the targets and handoffs, the dispositions, the identity of the final candidate, and
`result.json`. The list is in [run-artifacts.md](references/run-artifacts.md).

The folder is ignored by git. The PR and the issue are the durable public record.

## Rules that hold in every phase

- Work on a typed branch that starts at `origin/staging`, or at the branch it stacks on.
- Never use `--no-verify`. Never merge.
- Never answer your own doubt about meaning.
- Never widen the scope without a new approval.
- Never edit a contract or a gate to turn it green.
- A commit of an internal agent is a proposal until the Owner inspects it.
- A claim needs the output of a command. A sentence is not evidence.
