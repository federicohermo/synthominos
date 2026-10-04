---
name: shape
description: "Interview that shapes work on the instrument until nothing stays silently assumed: an idea, a request, code without a spec, or an existing spec. Use when a request arrives, before the issue or the contract is written. Use also when an investigation, a diagnosis or a review ends in findings the user accepts as a change, and before you ask the user a loose design question. A reading question about the code does not trigger it."
argument-hint: "[idea | request | capability | code area]"
---

# shape: the interview

This skill only interviews. `to-issue` writes the issue and `to-spec` writes the contract. Keep
them apart: if you edit the file while you interview, the user reviews a document that moves while
they still answer.

## The four modes

- **An idea or a request in prose**: interview toward the contract of one capability.
- **Code without a spec**: read the code, state what it does, and ask what it should do.
- **An existing spec**: interrogate it for ambiguity and holes.
- **An issue or a one-off request**: sharpen it until an agent can implement it without guessing.
  Decide if it changes what the instrument does. A feature, a bug, an optimization or a harness
  change get the same interview.

All four are one machine. Interview until the frontier is empty, not until a checklist is full.
Write no production code and edit no spec.

## The mechanics

1. **Work the interview as a tree, in rounds.** The frontier is every question whose
   prerequisites are settled. Ask the whole frontier at once, numbered, and wait. A question that
   depends on an open one goes to the next round.
2. **Give your recommended answer with each question.** The user confirms or corrects it. The
   recommendation is a proposal; the answer is the truth.
3. **If the code answers a question, read the code instead of asking.** The code settles facts,
   not intent. Behavior you find in the code enters as a question, never as a rule, until the
   user confirms it. A bug can look like structure.
4. **Ask the domain before you simulate it.** The `pentomino-domain` MCP runs the real pure
   functions: `describe_piece`, `simulate_board`, `check_invariants`, `find_symbol`.
5. **Numbers before prose.** For a rule with a calculation or a threshold, collect the
   input → expected output pairs first. Then write the EARS rule as their generalization. In the
   other order, you invent examples that fit your wording.
6. **One capability per session.** If the work crosses capabilities, stop and say so. That is
   architecture, not a spec interview.

The interview is done when the frontier is empty and the user confirmed every recommendation.

## What is specific to this instrument

- **Ask every time: does this make the instrument more expressive?** It is an instrument, not a
  game. There is no score and no win condition. A change that makes it harder or more complex
  without more expression is a finding.
- **Can the rule run without React or Web Audio?** If not, it will live in `ui/` and be
  tested only in the `browser` project, through the DOM. Move it into `domain/`, where a `node`
  test exercises it. Decide this here, not during implementation.
- **A fixed value is not invented in the interview.** It comes from the code, from a measurement,
  or it becomes an `OQ-<COD>-###` with who decides it.
- **A perception criterion needs an instrument that measures it.** "It sounds right" or "it looks
  right" closes nothing. Find the measure: a DOM value, an `OfflineAudioContext` render, a value a
  test reads. If none exists, the user decides if the rule stays human judgment.

## What the questions cover

- **Purpose and language**: what the capability does for the instrument, and its own terms.
- **Rules in EARS**, one at a time.
- **Acceptance criteria** in GIVEN/WHEN/THEN with the deciding values. Each criterion states the
  final observable state, never the intermediate event. "The handler runs" is not a criterion;
  "the board holds 3 pieces" is.
- **Edges**: zero, one, the maximum, the value just before the cut, the value that arrives twice,
  the value that arrives out of order. Ask what can go wrong, not what is obvious.
- **Non-goals with teeth**: each one is something an agent would build if nobody forbade it.
- **Contracts and dependencies**: what the capability consumes and produces, from and to which
  capability.

## Where each answer lands

The kind of answer decides where it lands, not the origin of the request.

| What was settled | Lands in |
|---|---|
| a durable rule of the instrument | the capability contract, through `to-spec` |
| what this change touches, with which boundaries | the issue, through `to-issue` |
| something outside the instrument: the harness, a bug, an optimization | the issue only |

The interview writes none of them.

## The state lives in the conversation

- **Terms**: an opinionated glossary. The canonical term, what it is in one or two sentences, and
  the synonyms to avoid.
- **Rules**: in EARS, as they are agreed.
- **Values**: with their number, as they are collected.

## The final interrogation

Before you hand the material over, check four things:

- **Divergence**: can two implementations with different behavior both satisfy this text? Where
  yes, the text is ambiguous. Different internals with the same behavior are freedom, not
  ambiguity.
- **Edges**: zero, negative, huge, duplicate, out of order. A rule answers each one, or it is
  declared out of scope.
- **Verifiability**: an agent can close every rule's criterion, or the rule is declared human
  judgment.
- **Expression**: the change adds expression, or the user accepted the cost explicitly.

## Output

- **Spec modes**: a running summary, organized by the sections of
  `specs/_template/capability-spec.md`, plus the questions that stay open. Then invoke `to-spec`.
  Ambiguity that remains goes to open questions, never to a default value.
- **Issue mode**: the material of the issue: type, whether it touches a spec, criteria, edges,
  out of scope. Then invoke `to-issue`. If it touches a spec, `to-spec` follows `to-issue`.
