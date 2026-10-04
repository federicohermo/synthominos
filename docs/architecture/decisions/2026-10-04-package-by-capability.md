# The code is organized by capability, and the layers live inside

**2026-10-04**

Until today `src/` had one folder per layer: `domain/`, `audio/` and `components/`, with
`types/` and `constants/` folders inside each one. The contracts in `specs/` named no file, so
nothing tied a capability to its code. An agent that edited `src/domain/sequence.ts` could not
tell from the tree that `specs/circuit/circuit.md` governs it.

**Decision: each capability owns `src/<capability>/`, with the name of its contract, and its layers
are subfolders.** `src/circuit/domain/sequence.ts` is the code of `specs/circuit/circuit.md`. The
shell (`App.tsx`, `main.tsx`, `styles/`, the app-level tests) stays at the root of `src/`. This is
the package-by-feature rule of the
[spec-anchored agentic development](https://github.com/w00fx/spec-anchored-agentic-development)
toolkit; the first plan of the migration kept the layers and dropped it, without seeing that the
link went with it.

What holds the link:

- **The spec gate** (`.agents/scripts/specs.ts`): a folder under `src/` needs a contract with its
  name, a live contract needs code in its folder, and each file of a capability sits in a layer
  folder (`domain/`, `audio/`, `ui/`).
- **The generator** (`node .agents/scripts/sync.ts`): it writes `src/<capability>/AGENTS.md`, a
  pointer to the contract, from each contract.
- **The linter**: the layer zones are globs over every capability (`src/*/domain/**`), so the rules
  of spec 005 (#67) hold in each capability with no new zone.

Where a file goes: to the capability whose criteria its tests cite. `board.ts` held two
capabilities, so it was split: the rules of placement stay in `board-editing/`, and the graph the
circuit walks moves to `circuit/domain/routing.ts`.

The cost, measured when the decision landed: four pairs of capabilities import each other
(accessibility ↔ board-editing, board-editing ↔ board-fit, board-editing ↔ playback,
musical-model ↔ pieces). Most of those edges are a `*.constants.ts` or a `*.types.ts` that two
capabilities read. The PR that dissolves those files into their owner modules is where each edge
gets an owner. No gate forbids a cycle between capabilities today.
