---
paths:
  - "src/**"
---

# Package by capability

Read this before you create or move a file of `src/`. The reason for the layout is in
[the decision](../../docs/architecture/decisions/2026-10-04-package-by-capability.md).

- **A file lives in the folder of the capability whose rule it implements.** The spec gate and
  the linter refuse the shapes this layout forbids, and say why.
- **A module does not share its stem with a component of its folder.** On a file system that
  ignores case, `board.ts` and `Board.tsx` are one name. No tool checks this.

## A new folder is a new capability

A new folder under `src/` is a decision about a boundary, not about filing. Before you create one,
these three must be true:

- Its name is a thing the instrument does, not a kind of data and not a layer.
- It holds the whole slice: the rules, the hooks and the components of that behavior.
- Another capability can finish its own flow without reaching into it for an internal.

Then the contract comes first: the `to-spec` skill writes `specs/<capability>/<capability>.md`. The
spec gate fails on a folder with no contract, and on a contract with no folder.

If a file has no clear home, or one of the three is false, stop and ask the person.
