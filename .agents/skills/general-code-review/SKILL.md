---
name: general-code-review
description: "The rubric of the general-code-reviewer agent, in Phase 7 of the implementation protocol: what to inspect and fix on one exact candidate of a run before the mutation pass. Correctness, simplicity, local structure, test quality, types, and the handoff commit. It hardens code and gives no approval. To review a pull request, use pr-review."
---

# general-code-review

Apply this inside the `general-code-reviewer` agent. Inspect the exact candidate, fix concrete
defects inside the approved scope, verify, and inspect again. The commit you leave is a proposal
that the Owner inspects. This rubric never gives an independent approval.

Reviews of spec conformance, security, performance and architecture happen outside the run. Name a
concrete sign of trouble when you find one. Do not say that such a review was done.

## What you need before you start

The exact input commit, the whole diff from the base commit, the issue, the approved plan and
scope, the rules of the repo, the commands, and the failures that existed before. Do not work on a
candidate that moves or that has no identity.

## Dimension 1: correctness and regression

Trace the expected path and each failure that matters:

- empty, one, many, zero, negative, the first and the last, a value that is absent;
- an error that travels, a partial failure, the cleanup, a cancellation;
- a value that arrives twice, the order of events, a state that changes in two steps;
- the callers and the consumers: signatures, shapes, what they assumed;
- behavior outside the touched lines that the change can break.

In this repo the limits have names: a board at its smallest size, a board with twelve pieces, an
empty circuit, a piece that is muted, a tempo at its two ends, an `AudioContext` that is suspended.

Fix a defect you can reproduce. Add a permanent regression test at the boundary where the defect
is.

## Dimension 2: simplicity and local structure

Remove complexity the change does not need, without making the task larger:

- logic the repo already has in another module;
- dead code, a branch nothing reaches, a shim kept for compatibility;
- an abstraction with one caller, a setting nobody sets;
- a function that does several jobs, deep nesting, a name that hides what it does;
- React, Web Audio or the DOM inside a rule that could be a pure function;
- a file outside the folder of its capability, a new folder for a layer, a `*.constants.ts`;
- a function over the complexity limit of the linter. Split it. Do not raise its ceiling.

Read [smell-baseline.md](references/smell-baseline.md) when structure matters to the change. A
smell alone does not justify a cleanup the issue did not ask for. Fix it when it causes a concrete
problem of correctness, testability or coupling in the approved change.

## Dimension 3: test quality

Follow `.agents/rules/testing.md`, and read [test-standards.md](references/test-standards.md) when
a test changes. A test must:

- prove behavior a person can observe, and the failure and limit cases that matter;
- run at the lowest boundary that is faithful, and not mock the thing it proves;
- give the same result on every run: no real clock, no unseeded randomness, no order between
  tests;
- fail if the behavior regressed;
- cite its criterion in its title, when it verifies one;
- keep the seed and the counterexample of a property that once failed.

Do not run the mutation here. That is the next pass.

## Dimension 4: types and contracts

Prefer a shape that makes a wrong state hard to write:

- parse a value from outside into a type that carries the guarantee;
- model the alternatives of a state as one union, not as booleans that can disagree;
- keep clear what can be absent, who owns a value, and what an error means;
- remove a cast that hides a real mismatch. The repo allows no `any` and no `@ts-ignore`;
- make a `switch` over a union exhaustive.

## Dimension 5: the commit

You leave one commit. It:

- holds only hardening work that is in scope;
- holds no cleanup that is not related, and no generated noise;
- has a message that says what changed and why, in English;
- leaves the tracked tree clean after verification;
- can be read as one exact diff, `input_candidate_sha..output_commit_sha`.

## The loop

```text
inspect the exact candidate
→ find defects that have evidence
→ fix inside the scope
→ run the affected checks
→ inspect the result again
→ repeat while the progress can be measured
```

Stop, and do not guess, when a fix needs an authority you do not have: over meaning, scope, a
dependency, a test oracle or an external action.

## When a change is justified

A defect needs one of these: a counterexample you can reproduce, a required command that fails, a
rule or a contract that is clearly broken, a concrete risk to data, or evidence that is required
and missing. A preference with no evidence justifies no change.

Each change you make goes in the handoff with its path, what changed, why, its impact on behavior
and how you verified it. The Owner decides whether it lands.
