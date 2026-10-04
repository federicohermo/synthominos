---
name: review-spec-drift
description: "Audits drift between a capability contract of the instrument and the code that implements it. Reports only: fixes nothing and does not touch the spec. Use from time to time, and always before a capability is ratified."
argument-hint: "[capability | empty = all]"
---

# review-spec-drift: what drifted from the contract

The spec is the truth and the code answers to it, so drift is a bug in the code. The exception is
a contract that aged, and a person decides that.

This skill fixes nothing. It reports.

## Procedure

1. Read the contract `specs/<capability>/<capability>.md` in full: rules and criteria.
2. Read the code that implements it. The contract names no files on purpose, so map it by
   vocabulary: the glossary terms match the names in `src/`. Ask `find_symbol` (MCP
   `pentomino-domain`) to locate each term and its users. Ask `describe_piece`,
   `simulate_board` or `check_invariants` to check a rule about the musical model.
3. Run the gate. It answers part of the question:

   ```bash
   pnpm exec vitest run --project node specs/__tests__/specs.test.ts
   ```

   It reports how many criteria of the capability have no test that cites them. A criterion
   without a test is a suspicion of drift, not drift: it can be implemented and not cited.
4. Look for the four forms, in this order:

   | Form | How it shows |
   |---|---|
   | behavior in the spec that the code lacks | the rule exists; no code and no test does it |
   | behavior in the code that the spec does not anticipate | a branch, a union member or a rejection that no rule names |
   | a value that does not match | the spec states one value and the constant holds another |
   | a criterion cited by a test that does not exercise it | `it('AC-BRD-004 — …')` exists and asserts nothing about that criterion |

   The last form is the one no gate can see, and it is why this skill exists. The gate checks the
   citation, not the exercise.

The procedure is done when each rule and each criterion has a verdict: no drift, or a finding.

## The report

Three bands. Each finding names the rule or the criterion it touches.

- **Critical drift**: the instrument does something the contract forbids, or does not do
  something the contract requires and another capability assumes.
- **Relevant drift**: declared behavior is missing, and nothing breaks today.
- **Cosmetic drift**: the contract aged. A term, or a value that changed with a decision already
  taken.

End with one line: **whether the capability can be ratified**. It can when every criterion is
cited and no critical drift stays open.

## What this skill does not decide

Which of the two is wrong. A value that does not match can be a bug in the code or a contract that
aged, and the difference is a design decision. The report names it and leaves it open. The user
answers. Then the work goes through `to-issue` or `to-spec`.
