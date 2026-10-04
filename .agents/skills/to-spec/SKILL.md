---
name: to-spec
description: "Writes or updates the durable contract of one capability of the instrument, `specs/<capability>/<capability>.md`, with its BR rules and AC criteria. Use when what the instrument does changes (new, changed or removed behavior), before any code changes. Starts from a feature issue, several issues, or a request in prose. To write the issue, use to-issue."
argument-hint: "[issue number | capability | request in prose]"
---

# to-spec: the contract of a capability

One durable contract per capability, and the code answers to it. The spec stays. A difference
between the spec and the code is a finding, never a reason to rewrite the spec.

This skill does not interview: the questions already happened. It turns the material at hand into
the file: a `feature` issue, a `shape` session, notes, or a request in prose. If a section lacks
material, it goes to open questions. Ask nothing here, invent nothing, and fill no default in
silence.

This skill leaves no debt. The doctrine is in [no-debt.md](no-debt.md).

A spec is not an issue. The issue is the disposable plan of one change; the spec is the contract
that stays. Rewrite the issue's criteria as rules and criteria of the capability, with nothing
specific to that delivery.

The contract rules are in `.agents/rules/specs.md`. The shape is in
`specs/_template/capability-spec.md`. This skill does not restate them.

## The three modes

- **Create** (the capability has no spec): fill every section of the template with the settled
  material.
- **Update** (the spec exists): write the delta. New rules and criteria get IDs in continuation.
  Do not renumber or rewrite existing ones unless the interview settled that change. The ID is an
  address: issues and tests point at it. Continue from the highest ID the spec ever had, deleted
  ones included: `git log -p -- <spec>` shows them.
- **Delete** (the behavior leaves the instrument): delete the spec in its own commit. On the same
  branch, delete the code and the tests that cited it. Git keeps the history. If another
  capability depended on this one, update its spec in the same run.

## Several at once

Group the issues by the spec they touch before you write.

Two issues that add IDs to the same spec collide. Each branch continues from the last ID it sees,
and both emit the same one. The gate sees the repeated ID only after the merge, and it does not
see which test now cites another branch's criterion. Choose one exit:

- Split the new IDs between the two before the branches open.
- Write them in order: the second from `staging`, after the first branch merged.

If one of them adds no IDs, for example one that only deletes, no split is needed.

## What does not touch a spec

- **A refactor**: the same behavior in another shape. Branch `refactor/`.
- **A bug** that changes no rule. Branch `bugfix/`.
- **An improvement** that changes no rule: UI, visuals, sound design, performance. Branch
  `improvement/`.
- **The harness and the docs**. Branch `harness/` or `docs/`.

These do touch it: a new rule, a changed fixed value, a removed behavior, an edge nobody wrote.

## Step 1: Choose the capability

List `specs/`: each folder is one capability. Its Purpose and Dependencies say what it decides.
A capability is a slice of what the instrument does, not a layer or a module.

If the change fits none, it can be a new capability: a free three-letter code and an English
folder name. The gate goes red if the code repeats. Before you open it, prove it is not a rule of
an existing one. A capability with one criterion is almost always a rule of another.

The step is done when the target spec path is fixed.

## Step 2: Measure, do not assume

Write the contract against the code, not against memory.

1. Ask `find_symbol` (MCP `pentomino-domain`) what exists today. Ask `describe_piece`,
   `simulate_board` or `check_invariants` before you derive the musical model by hand.
2. Check that an ID is free: `rg -n "AC-<COD>-" specs/ src/ mcp-server/`.
3. **Cite a fixed value by name; do not copy it.** The exact number lives in the code, under
   `<layer>/*.constants.ts`.
4. **A gap is an `OQ-<COD>-###`**, with why it is still open, who decides, and what it blocks.
   Never an invented value.
5. **Measure in the process that runs the behavior.** A rule about sound is measured on an audio
   render, not on the scheduler's arguments. A rule about the screen is measured in the `browser`
   project, not in `node`.

The step is done when every value the rules use is cited or is an open question.

## Step 3: Write the rules and the criteria

What breaks most often:

- **No file paths, no symbol names, no component names.** A spec that names them goes stale with
  the next refactor. They live in the issue and in `docs/`.
- **Rules in EARS**, each with its ID.
- **Each criterion is GIVEN/WHEN/THEN with the deciding values**, names the rules it verifies,
  and an agent closes it. "The board shows the piece" is not a criterion; "after a drop on
  column 3, row 2, the cell holds piece L" is.
- **A criterion an agent cannot see fail verifies nothing.** A perception rule ("it sounds
  right") needs a measure: a DOM value, an `OfflineAudioContext` render, a value a test reads. If
  none exists, declare the rule human judgment, without a criterion.
- **The criterion names the edge, not the happy path.** Zero, one, the maximum, the value just
  before the cut, the value that arrives twice.
- **If a criterion sweeps a directory and lists exceptions, run the sweep before you write the
  list.** From memory the list comes out short, and the criterion is born impossible to pass.
- **Recompute a table of values row by row from the rule, and derive the endpoints.** Do not copy
  them from the request.
- **Retiring is deleting.** A rule or a criterion that leaves the instrument is deleted whole: the
  heading, the text, the open question that closed it, and the test that only cited it. The number
  stays a gap.

## Step 4: The completeness pass

Before you report done, confirm four things:

- Every section of the template is filled, or represented in open questions.
- Every rule has a criterion that verifies it, or is declared human judgment. A rule without a
  criterion is a promise.
- Every fixed value is cited, not copied.
- The spec is layer-agnostic: no paths, no symbol names. Only behavior.

## Step 5: Verify the shape

Run `pnpm verify`. Its suite runs the gate `specs/__tests__/specs.test.ts`. The verdict comes from
the exit code, never from a grep.

The gate checks the frontmatter, that the three-letter code is unique, that no ID repeats, and
that each criterion names a rule the spec declares. For each `draft`, it reports how many criteria
have a test.

**The status starts as `draft`.** It becomes `ratified` when every criterion is cited by a test.
Whoever cites the last one sets it. From then on the gate enforces it: a `ratified` spec with an
uncited criterion is red.

The step is done when `pnpm verify` exits 0.

## Step 6: The branch and the PR

The spec is the first commit of the branch, and it ships in the same PR as the code that meets it.
The prefix comes from the issue type: `feature/<N>-<kebab>`, or `bugfix/<N>-<kebab>` for a bug that
writes an unwritten rule. Without an issue, `feature/<kebab>`.

The merge is the approval. No field records it.

## When the contract and the code disagree

| What happens | What to do |
|---|---|
| the code does not meet a criterion | fix the code, with its test. Never the criterion |
| the criterion no longer describes what the instrument must do | a design decision: ask the user, then edit the spec |
| the behavior exists and is not written | write the rule; the criterion cites the test that already proves it |

Never adjust the spec to match the code. If they differ, that is the finding.

## When you finish

- `pnpm verify` exits 0.
- Each new criterion that already has a test is cited in that test's title:
  `it('AC-BRD-004 — …')`.
- The next step is `implement-feature`, on the same branch.
- If the spec falsified something the docs state in the present tense, update `docs/` and
  `.agents/rules/` in the same run.
