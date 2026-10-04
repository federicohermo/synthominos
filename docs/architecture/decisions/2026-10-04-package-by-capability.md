# The code is organized by capability, flat

**2026-10-04**

Until today `src/` had one folder per layer: `domain/`, `audio/` and `components/`, with
`types/` and `constants/` folders inside each one. The contracts in `specs/` named no file, so
nothing tied a capability to its code. An agent that edited `src/domain/sequence.ts` could not
tell from the tree that `specs/circuit/circuit.md` governs it.

**Decision: each capability owns `src/<capability>/`, a flat folder with the name of its
contract.** `src/circuit/sequence.ts` is the code of `specs/circuit/circuit.md`. Its tests sit in
`src/circuit/__tests__/`. The shell (`App.tsx`, `main.tsx`, `styles/`, the app-level tests) stays at
the root of `src/`. This is the package-by-feature rule of the
[spec-anchored agentic development](https://github.com/w00fx/spec-anchored-agentic-development)
toolkit. The first plan of the migration kept the layers and dropped this rule, without seeing that
the link to the contracts went with it.

Two decisions come with it:

- **A constant or a type lives in the module that owns it.** The `*.constants.ts` and `*.types.ts`
  files are fused into their owner modules, and the linter rejects a new one.
- **There are no layer rules.** The lint zones between `domain/` and `audio/`, the order between the
  domain modules, the ban on React in two layers, and the rule that a module declares no constant
  are deleted. What they protected is now held by three constraints of the tools: a `.tsx` exports
  only its component, the MCP server loads its imports with plain node, and a test picks its
  project by suffix.

What holds the link:

- **The spec gate** (`.agents/scripts/specs.ts`): a folder under `src/` needs a contract with its
  name, a live contract needs code in its folder, and a capability holds no subfolder but
  `__tests__/`.
- **The generator** (`node .agents/scripts/sync.ts`): it opens `src/<capability>/AGENTS.md` with a
  pointer to the contract, then the rules that cover the folder.

Where a file goes: to the capability whose criteria its tests cite. `board.ts` held two
capabilities, so it was split: the rules of placement stay in `board-editing/placement.ts`, and the
graph the circuit walks moves to `circuit/routing.ts`. Three modules shared a name with a component
of their folder (`board.ts` and `Board.tsx`), which a case-insensitive file system reads as one
name; they took the names `placement.ts`, `playhead-offset.ts` and `spectrum-bars.ts`.

The cost, measured when the decision landed: no rule orders the modules of `src/`, so a cycle passes
lint. A run of `import-x/no-cycle` found no cycle between files. Between capabilities, six pairs
import each other: accessibility ↔ board-editing, board-editing ↔ board-fit, board-editing ↔
musical-model, board-editing ↔ playback, musical-model ↔ pieces, and playback ↔ spectrum. No gate
forbids that today.

One constraint appeared with the fusion. The browser project is the only one that runs
`playback/engine.ts`; when the node project loads it without running its functions, v8 coverage
cannot merge the two statement maps and the gate fails. So a value that another file reads does not
live in `engine.ts`: the tempo values went to `scheduler.ts`, and the analyser settings to
`spectrum/spectrum-bars.ts`.
