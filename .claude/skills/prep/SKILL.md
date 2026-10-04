---
name: prep
disable-model-invocation: true
description: "EXPLICIT INVOCATION ONLY. Checks that the verification infrastructure the implementation protocol relies on is present and works in this repo: one living instance for each class of metric, each one proven by running it. Repairs what is missing on a harness branch. Use after a toolchain upgrade, on a fresh clone that fails, or before the first unattended run."
argument-hint: "[a class to check, or nothing for all]"
---

# prep

Prepare this repo so that the Owner of a run, the two hardening agents and CI find the
verification they expect. Read before you write. Extend, never replace. Prove each thing by running
it. Change no code of the product.

A class of metric is the requirement. The tool is one instance of it. When this skill ends, each
class has a living instance, or it is declared not applicable with its reason. A class with no
instance and no declaration is a blocker with a name, never a silent gap.

## Phase 0: detect

Find the instance of each class below in `package.json`, `vite.config.ts`, `stryker.config.json`,
`eslint.config.js` and `.github/workflows/`. Report what you find in one short block before you
change anything.

## Phase 1: the classes

Each of these needs a living instance:

- lint and typecheck;
- tests and coverage, for each package of the workspace;
- the gate that ties each criterion of a contract to a test;
- the gate that keeps the generated harness copies equal to their source;
- mutation, on the files a PR changes;
- property tests;
- complexity;
- a secrets scan over the whole history, blocking from its first run;
- an audit of every dependency against the known advisories;
- behavior in a real browser;
- the kernel of the protocol, with its own tests;
- a build.

Declared not applicable, each with its reason:

- **Duplication.** No tool is pinned.
- **Race detection.** The product has one thread.
- **Reference tables and a metrics baseline.** Every gate of this repo is absolute. None compares
  with a stored number.

## Phase 2: prove each instance

Run the command of each instance and keep its exit code and the lines that matter. A config with no
binary is a gate that cannot fire: an instance counts only when it ran.

- For mutation, one small module is enough: `pnpm mutation --mutate src/playback/playhead-offset.ts`
  must end with a score.
- For the kernel, one command of it: `node .spec-anchored/spec-anchored.ts resolve-policy supervised-local/v1`.
- For the browser, a fresh clone needs `pnpm exec playwright install chromium` first.

## Phase 3: repair

If an instance is missing or broken, repair it on a `harness/` branch, with its own PR. The
configs that judge a run are not written by a run.

- Pin each tool to an exact version. Never install a floating latest.
- A secret that the scan finds is an incident: rotate it now. Never add it to an allowlist to turn
  the job green.
- An advisory is fixed by an update inside the declared range, or by an override with its reason.
  Update only the packages on the path of the advisory: a wide update also moves what ships.
- If the environment forbids an install, stop with a named blocker and the exact command to run.
  Leave no half-written config.

## Phase 4: report

One row for each class: its instance, and `ran: exit <n>`, `repaired in <PR>`, `not applicable` or
`blocked: <what>`. Then each decision that waits for the person.

The run is done when each class is proven, repaired, declared or blocked by name.
