---
name: explain
disable-model-invocation: true
description: "EXPLICIT INVOCATION ONLY. After a change is implemented, writes a complete walkthrough of it for a person: what changed, how it runs and why, anchored in the contract, the plan and the diff, as one self-contained interactive HTML page in docs/walkthroughs/, with a quiz. Use when a person must understand a change before they approve it."
argument-hint: "[the work of this session | a diff | a branch | a PR number]"
---

# explain

Write a complete walkthrough of the change the argument names: the work of this session by
default, or a diff, a branch or a PR. A person reads it from start to end and then knows what was
built and why, with nothing that matters left out.

`gh` is not on PATH on this machine. Run it as `"/c/Program Files/GitHub CLI/gh.exe"`.

## Gather the context first

Do not walk the diff blind. Read these, and build the explanation on them:

- **The diff**: what changed.
- **The contract**, `specs/<capability>/<capability>.md`, and **the issue**: what was asked.
- **The approved plan** of the run: the approach that was chosen.
- **The decisions and their costs**: the answers of the person in Phase 2, and the dispositions of
  the Owner. The code does not hold the reason.
- **The constitution**, `docs/architecture/constitution.md`, for the principles the change
  touches.

For work of another session, take the plan from the body of the PR, or from
`.agent-runs/<run-id>/` if the folder is still on this machine. If one of these is not available,
say which sections lack it. Do not rebuild the intent from the code and present it as the plan.

## The bar: every section, not every line

Cover each section below. Explain why a thing is so and how it connects, not each line. If a
paragraph says what the code already says, cut it. Spend the words on what the code does not say:
the reason, the limit, the flow across files, the edge. The page is as long as it must be.

When prose cannot carry a behavior, add a small tool to the page: a stepper, a scrubber over time.
The scheduler, the closed tour and the cycle offsets are behaviors a person must step through.

For a behavior with state, cover these in order, each with its evidence: what triggers it, the
rule, the state that changes, the path it runs (the failure path too), and the edges.

## The sections of the page

Leave a section out only if it truly does not apply, and say so in one line.

1. **Background.** The instrument around the change, from the code and not only from the diff.
   First a part a new reader can skip, then what bears on the change. Give it more weight for work
   of another session.
2. **What the change does.** In prose, against the contract. Two to four paragraphs.
3. **The core idea.** The approach before the details, with one example on small data walked from
   start to end. A reader who stops here leaves with the right model.
4. **Where it lives.** Which capabilities and files the change touches, and where it starts and
   ends.
5. **How it runs.** From the gesture of the player, or the tick of the clock, through the calls,
   in order.
6. **The edges of the system.** What the change uses outside the code: the Web Audio graph, the
   canvas, the browser. What it assumes of each, and what happens when one is missing: an
   `AudioContext` that is suspended, a canvas with no size.
7. **Data.** The types and the shapes the change touches, what goes in and out, and what another
   capability reads from it.
8. **The rules of the instrument.** Each `BR-<COD>-###` the change implements, with the place in
   the code where it lives.
9. **Failure paths.** Each thing that can fail and what happens then. List them all.
10. **Edge cases.** The limits it handles (empty, one, the maximum, twice), and the ones it
    declares out of scope.
11. **What the tests prove.** The map from each `AC-<COD>-###` to its test, and what that test
    shows. Say where "the tests pass" is not the same as "it works": what only an ear or an eye
    can check.
12. **Decisions and why.** Each decision that carries weight: the option taken, the options
    weighed and the cost. This is the section with the most value: the diff threw this reasoning
    away.
13. **What to watch.** A mutant the person accepted, a file the mutation could not reach, a limit
    that will bind when the instrument grows.
14. **Quiz. Do not skip it.** Five to eight questions with options, of medium difficulty: a reader
    must have understood the substance, and there is no trick. Each option shows, on a click, why
    it is right or wrong. Ask about the why and the flow, one or two questions for each main
    section. A page that is only read gives the feeling of understanding. The quiz tests it.

## The format

One self-contained HTML file: CSS and JS inline, no external dependency. It opens from a clone,
with no server.

- **Navigation.** A table of contents with anchors. One long page that works on a narrow screen.
- **Callouts.** A box for a key concept, an invariant, an edge.
- **Diagrams.** A small number of kinds, used again through the page: one for the map, one for the
  flow, one for the shape of data. Each one with example data, drawn as HTML or SVG, never as
  ASCII art. Draw a board as a board.
- **The colors of the instrument** come from `DESIGN.md` when the page shows a piece.
- **Before you finish**, open the file and check that no block shows stray indentation as content.

Write it to `docs/walkthroughs/<YYYY-MM-DD>-<issue-or-feature>.html` and report the path. GitHub
shows an `.html` file as source, so a person reads this one in a browser, from the clone.

The file is documentation, outside the scope of a run: the scope check of a run refuses it. Commit
it on a `docs/` branch with its own PR, or leave it untracked when the person only wants to read
it. A worker with no person in the session does not run this skill.
