# No debt

Each skill that writes carries a copy of this file, and the copy in `to-spec` is the canonical
one. A skill is the unit that gets installed: it carries its whole implementation, and no skill
reads this file by path. The generator copies it byte for byte. `shape` and `review-spec-drift`
do not carry it: they write nothing, so they cannot leave debt.

## The rule

**A run does not end by leaving written work for later.** Not in a follow-up section, not in a
criterion no test names, not in an issue opened as a way to finish. What the run finds, the run
discharges, and discharging has a closed list of forms.

| The skills of… | End… |
|---|---|
| **review** (`pr-review`, `pr-review-batch`) | with everything they found discharged, verified, committed and pushed |
| **contract** (`to-spec`) | with the whole behavior of the capability in criteria an agent can close. A gap is an `OQ-<COD>-###`, never an invented value |
| **plan** (`to-issue`) | with the issue published, its boundaries measured against today's tree, and its type and spec declared |
| **implementation** (`implement-feature`, `implement-batch`, `implement-orchestrated`, `implement-backlog`) | with everything the issue asks done, the PR open, and a test that names each criterion it delivers |

**Discharged does not mean put into this PR.** Where the fix lands is a separate decision from
whether it is done. Mixing the two breaks the review.

## What it rests on

A doctrine that no tool can check lasts as long as goodwill. This one rests on something a tool
reads: **each criterion of a `ratified` spec is cited as `AC-<COD>-###` in the title of a test.**
The gate `specs/__tests__/specs.test.ts` enforces it inside `pnpm verify`.

**The anchor changed several times, always for the same reason.** It was a checkbox in a
`tasks.md`, which disappeared with the file and left the rule green forever. **A gate that cannot
fail is not lax: it is a gate turned off that looks on.**

**Today's anchor is stronger than a checkbox.** The person who decides the work is done marks a
checkbox by hand. A test has to be written, runs on every push, and **breaks by itself** when the
code stops meeting the criterion.

**The citation carries the capability code**: `AC-BRD-004`, not the number alone. With a bare
number, the first test would cover the criteria of every capability forever.

**Its ceiling:** the gate checks the citation, not that the test exercises the criterion. It is a
floor. What raises it is the usual discipline: write the test first and watch it fail.

## The five discharges, and there is no sixth

Every finding, doubt and block leaves through one of these five. If your reason not to apply a fix
is not one of them, **there is no reason, and the fix is applied**.

**The destination has zero freedom: later does not exist. The path has high freedom: which of the
five is yours.**

1. **Fixed.** Applied, `pnpm verify` green, committed and pushed. It is the default and needs no
   justification.

   **It lands where it belongs, which is not always the PR under review.** Measured: review defect
   detection falls from **87 % under 100 lines to 28 % over 1000**. A review that absorbs every fix
   degrades its own review.

   | The fix is… | It lands in |
   |---|---|
   | in a line your diff adds or rewrites | **this PR** |
   | in the same file and within the issue's scope | **this PR** |
   | in another file, or out of scope | **its own PR**, opened in this run |
   | about the behavior, not the code | **the capability spec**: discharge 2 |

   The last two rows **postpone nothing**: the work is done now, in its own changeset.

2. **Fixed upstream, now.** The finding belonged to the contract. A fix that fights a criterion
   means **the criterion is wrong**, and it is corrected in this run, in the same PR.

   **The person approves the exact old and new text before the edit.** Only the flows that
   `.agents/rules/truth-layer.md` names write `specs/`. A run with no person to ask does not make
   the edit: it hands both texts to whoever asks the person, and that is discharge 4.

   **Never the other way: the spec is not adjusted to match the code.** If the code does not meet
   a criterion, fix the code. If the criterion no longer describes the instrument, that is a
   design decision and goes through discharge 4.

3. **Fixed the skill that allowed it.** See the loop below. This discharge keeps the second run
   from repeating the finding of the first.

4. **Decided by the user, now, and blocking.** For a **decision**, not a verification: a cost that
   cuts both ways, or a rule nothing fixes yet.

   **`won't fix` lives here, and it is legitimate.** A zero-bug policy does not say "fix
   everything". It says **"fix it now or close it now"**. Closing with the answer written is
   discharging; leaving it open "to see" is not.

   The mark of a legitimate question: **no measurement answers it.** If a five-second `rg` closes
   it, it was not a question.

5. **The run failed.** A tool denied the write and there was no path. **It is not a deliverable
   with a footnote: it is a red.**

## The failure mode of this doctrine is silence, not debt

It is the price, and it is real: **a run forced to fix everything, facing something it cannot fix,
is under pressure not to find it.** "Zero findings" and "zero findings reported" read the same and
are opposites.

So discharge 5 is as valid as discharge 1. **A run that stops and says "blocked, here is the exact
fix" met the doctrine.** The only run that breaks it reports green with something unfixed, and that
includes the run that did not look so it would not have to fix.

Discharge a block like this:

1. **Retry by another path.** If the hook `.agents/scripts/hook.ts` denied it, **check your branch
   name first**. It lets `src/` and `mcp-server/src/` be written only from the prefixes its message
   names. It is the first cause, and the symptom, a denied `Edit`, reads like a permission problem
   and not a naming one. A worktree outside `.claude/worktrees/` is the second cause.
2. If it stays blocked, **the run does not close green**. The report starts with
   `BLOCKED: <what> — <who>` and the exact fix in one copyable line.
3. **Do not open an issue to cover it.** That turns a red into a pending item, which is the
   operation this doctrine forbids.

## Issues are plans, not a dump

An issue is the **small, disposable plan of one change**, in the shape of
`.github/ISSUE_TEMPLATE/task-brief.md`. Legitimate: a request from outside, behavior that will
change, a reported bug. **Not legitimate:** opening one as a way to finish. A finding turned into an
issue is work the run found, understood and decided not to do.

The only exception is discharge 4 with the answer given: **the issue records the user's decision,
not your convenience.**

## The loop: if implementing hurts, the problem is upstream

Doubts are settled when the contract is written and when the work is split. **When implementation
finds a framing problem, the problem belongs to the skill that let it out that way.** Fix both in
the same run. The corrected `SKILL.md` goes in the report as its own section: it is the most
expensive deliverable, and the only one that keeps the finding from coming back.

| What appeared | Which skill to fix |
|---|---|
| a criterion that cannot be seen to fail | `to-spec` |
| a rule of the instrument placed in a component when it could run in a pure `.ts` | `to-spec`: the question of where it runs was asked late |
| a measurement taken in the wrong process: the scheduler's arguments instead of the audio render, `node` instead of `browser` | `to-spec` |
| a criterion that sweeps a directory and lists exceptions without running the sweep | `to-spec`: from memory it comes out short and the criterion is born impossible to pass |
| an identifier the spec writes in `code` that does not exist in the repo | `to-spec`: the prose was written without searching it |
| a spec that names a file or a symbol | `to-spec`: it goes stale with the next refactor |
| a table of values that does not close with itself | `to-spec` and `to-issue`: recompute each row from the rule, and derive the endpoints |
| an issue without file boundaries, or with boundaries not crossed against today's tree | `to-issue` |
| a Read only file that cites by path something the issue renames | `to-issue`: the boundary `rg` also runs over comments |
| a comment or a test outside Writes that explains or builds the rule the issue changes | `to-issue`: the boundary `rg` searches the old rule in words, not only its symbols |
| a bug criterion that asks for a red that does not appear under its own conditions | `to-issue`: the symptom was measured with the excluded case inside |
| an issue that changes what the instrument does and declares `Spec: none` | `to-issue`: the type was chosen without the spec test |
| an issue criterion that contradicts a `ratified` criterion of another capability | `to-issue`: the boundary `rg` did not search the neighbor specs |
| an edge that describes a gesture the instrument does not have, or that another capability forbids | `to-issue`: the boundary `rg` read `ratified` criteria and not edges or `draft` specs |
| a contract that moves a value and does not follow all its readers | `to-issue`: `find_symbol` gave the first reader and the contract was written on that one |
| a list that splits a set and does not sum to the total | `to-issue` |
| a numeric target the issue's proposal does not reach | `to-issue`: the number was written without measuring the proposal |
| a new file the contract implies and Writes does not name | `to-issue` |
| a rule removed that drops an invariant another rule assumed | `to-issue` |
| a test that asserts the rule the issue inverts without naming it | `to-issue`: the inversion was not tested with a patch before publishing |
| a name the issue deletes and a lane in flight uses again | `to-issue`: Verification lacked the `rg` of the name |
| an issue in a batch that reads data no other one delivers | `to-issue`: the drafts were crossed by file and not by what each one assumes |
| an open issue outside the batch that starts from a rule the batch changes | `implement-batch` |
| a harness node green without exercising anything | `implement-feature`: the node's color was read, not its count |
| two lanes that overwrite the same scratch file | `implement-batch`: the prompt did not give each one its own name |
| a number the contract measured well and that aged | `implement-batch`: the base the issue declares was read instead of measuring today |
| a lane that works on another base than the issue's | `implement-batch`: the branch did not start from an explicit base |
| a question to the user that a measurement answered | the skill that asked |
| a generated file whose generator is not in the repo | `implement-feature`, and `to-issue`, which did not put it in Writes |

If the problem fits no row, add the row. This table records what the doctrine has learned, and
it is incomplete on purpose.

## What is not debt

- A Non-goals section. It is a boundary, and it makes the spec reviewable. The test that it
  became debt: does any criterion of this spec depend on it?
- An `OQ-<COD>-###`. It is a declared gap, with who decides it. Debt would be inventing a
  default value for it.
- A `draft` spec with criteria without a test. It is the queue, and the gate counts how many
  are missing on each run. Debt would be a `ratified` spec that lies.
- An open issue not implemented yet. It is the plan.

## What it was checked against

| Piece | Where it comes from |
|---|---|
| the contract lasts and the code answers to it | spec-anchored agentic development |
| the run stops instead of postponing | stop-the-line / andon, from the Toyota Production System |
| fix now or close now, without a backlog | the Zero Bug Policy |
| a gate instead of prose | poka-yoke |
| no "done with an asterisk" | Definition of Done |
| doubts are settled before implementing | shift-left |
| each criterion must be able to fail | the T in INVEST |
| the issue declares its write radius and its commands | the task brief |
| the out-of-scope fix goes to its own PR | PR size data: 87 % → 28 % |
| deliberate debt is the user's decision | Fowler's quadrant |

And one majority convention this repo rejects on purpose: Google recommends a `TODO` with its
bug for what stays out of scope. This repo falsified that with its own data: 137 checkboxes
marked "a person checks it", across 35 specs, and 6 ever closed.

## What a tool checks and what it does not

| Rule | Who |
|---|---|
| Each criterion of a `ratified` spec, cited by a test | `specs/__tests__/specs.test.ts` |
| No `spec.md`, `research.md`, `plan.md` or `tasks.md` | `specs/__tests__/specs.test.ts` |
| Each criterion names a rule its spec declares, and no ID repeats | `specs/__tests__/specs.test.ts` |
| That the test **exercises** the criterion and does not only name it | **prose**: review checks it |
| That a Non-goals section does not hide a criterion | **prose**: review checks it |
| That the skill was fixed when the loop asked for it | **prose**: the report shows it |
| That a finding was not silenced to avoid fixing it | **prose, and nothing can check it** |

The last four are the ceiling this doctrine does not reach, and saying so is part of holding it:
**the gate is a floor.**
