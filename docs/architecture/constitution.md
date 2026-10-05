# Constitution

Non-negotiable principles. Changing one requires an ADR in [`decisions/`](./decisions/).

## The contract rules

A behavior change changes its spec in the same PR. Each acceptance criterion has a test that
names it. If the code does not meet a criterion, fix the code. Never adjust the spec to match
the code.

## A folder per capability

The code of each capability lives in `src/<capability>/`, a flat folder with the name of its
contract; the spec gate enforces the link. `mcp-server/` imports from `src/` and never the reverse;
`import-x/no-restricted-paths` enforces it.

## A rule of the instrument runs without a browser

A rule of the instrument lives in a `.ts` module with no React, no Web Audio and no DOM, so it runs
in the `node` test project. A rule that needs a browser to run is not a rule of the instrument: it
is presentation.

## Time comes in as a parameter

No rule reads the clock. The audio engine receives the time it schedules for, so a test can
drive it.

## A fixed value lives once

Two copies of a number are not two numbers: they are a bug waiting for someone to change one.

## A closed set is a const object with a derived union

Never a loose string, and never an `enum`: `erasableSyntaxOnly` rejects it.

## The verdict comes from the exit code

Never from a grep of the output. A skipped check is not a green check: each skip states what it
did not look at.

## A run leaves no written work for later

What it finds, it discharges. An issue records the plan of one delivery, never the leftovers of a
run. The doctrine is in `.agents/skills/to-spec/no-debt.md`.
