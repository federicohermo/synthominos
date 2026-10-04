---
paths:
  - "src/**"
---

# Package by capability

Read this before you create or move a file of `src/`. The map of every file is
[directory-structure.md](../../docs/architecture/directory-structure.md).

- **A file lives in the folder of its capability**, `src/<capability>/`, named as the slug of its
  contract in `specs/`. The folder is flat: its only subfolder is `__tests__/`.
- **The shell stays at the root of `src/`**: `App.tsx`, `main.tsx`, `styles/` and `__tests__/`.
- **No folder for a technical layer**: no `components/`, `hooks/`, `utils/`, `domain/` or `ui/`.
- **A constant and a type live in the module that owns them.** The linter rejects a
  `*.constants.ts`, a `*.types.ts`, a `constants/` and a `types/`.
- **A module does not share its stem with a component of its folder.** On a file system that
  ignores case, `board.ts` and `Board.tsx` are one name.

## A new folder is a new capability

A new folder under `src/` is a decision about a boundary, not about filing. Before you create one,
these three must be true:

- Its name is a thing the instrument does, not a kind of data and not a layer.
- It holds the whole slice: the rules, the hooks and the components of that behavior.
- Another capability can finish its own flow without reaching into it for an internal.

Then the contract comes first: the `to-spec` skill writes `specs/<capability>/<capability>.md`. The
spec gate fails on a folder with no contract, and on a contract with no folder.

If a file has no clear home, or one of the three is false, stop and ask the person.
