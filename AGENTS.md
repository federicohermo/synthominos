# AGENTS.md

What a file cannot tell you about this repo. Detail lives in `docs/`; the rules of each subject live in
`.agents/rules/` and load on their own; the contract of each capability lives in `specs/`.

## What it is

A **musical instrument**, not a game. The user places pentominoes on a board sized to the screen,
and each piece fires a five-note arpeggio. A closed tour visits the pieces: order and silence come
from geometry. There is no score and no win. Judge a feature by one question: does it make the
instrument more expressive?

**Stack:** Vite 7 · React 19 · TypeScript 5.8 · Tailwind CSS 4 · Web Audio (no audio library).

## Commands

- **`pnpm verify` is the convergence node.** Run it before every PR; CI runs the same script. It
  runs `lint ‖ typecheck ‖ suite ‖ mcp:test`. `suite` is two Vitest passes; the second one gates
  coverage at **100** on all four metrics, with zero exceptions. Detail:
  [verification](./docs/guides/verification.md).
- **The verdict comes from the exit code**, never from a grep of the output.
- **pnpm, not npm.** `node_modules` is strict: importing a transitive dependency fails on purpose.
- **Chromium is not in the lockfile**: a fresh clone needs `pnpm exec playwright install chromium`.
- **Node ≥ 22.18** runs the harness scripts and the MCP server as TypeScript without a build.

## Architecture

```text
src/<capability>/        one flat folder per contract in specs/, tests in __tests__/
src/App.tsx, main.tsx    the shell; mcp-server/ imports from src/, never the reverse
```

**The folder is the capability.** `src/circuit/` is the code of `specs/circuit/circuit.md`, and its
generated `AGENTS.md` points there. A new file goes in the capability whose rule it implements. A
constant or a type lives in the module that owns it. There is no layer rule: a `.tsx` exports no value
but its component, so logic goes in a `.ts` module, which the `node` project tests. Detail:
[directory structure](./docs/architecture/directory-structure.md) · [constitution](./docs/architecture/constitution.md).

## Rules, and who verifies each

- **Dependency direction is forbidden by path** — `import-x/no-restricted-paths`.
- **No barrels, explicit extensions, no aliases** — every local import ends in `.ts`/`.tsx`; lint.
- **Zero `enum`, zero `any`, zero `@ts-ignore`, no `eslint-disable`** — `erasableSyntaxOnly`,
  lint, `noInlineConfig`. A real exception is a per-file override in `eslint.config.js`.
- **No `.only`, no `.skip`, no test without an assertion** — `@vitest/eslint-plugin`.
- **A comment cites what resolves** — `local/comment-anchor`, `local/comment-shape`.
- **Every criterion of a `ratified` spec is cited by a test title** — `specs/__tests__/specs.test.ts`.
- **Each folder under `src/` is a contract, and it is flat** — the same gate.
- **No `*.constants.ts`, `*.types.ts`, `constants/` or `types/` under `src/`** — lint.
- **The branch prefix decides who writes `src/` and `mcp-server/src/`** — the hook
  `.agents/scripts/hook.ts`. Prefixes and hotfixes: [branches](./docs/infra/branches.md).
- **A worktree of this repo opens only under `.claude/worktrees/`** — the same hook.
- **Generated harness copies match their source** — `node .agents/scripts/sync.ts --check`, in `suite`.
- **No global state**: no Context, Redux or Zustand. **Deletions go in their own commit.**
- **Everything written into the repo is English**, in the style of ASD-STE100.

## Before a change

**An issue is not a spec.** The issue is the disposable plan of one change, in the
[task-brief](./.github/ISSUE_TEMPLATE/task-brief.md) format, closed by its PR. The spec is the
durable contract of a capability. An issue touches a spec only if it changes what the instrument
does.

1. **Interview** when anything is assumed — skill `shape`. It writes nothing.
2. **Write the issue** — skill `to-issue`.
3. **Write the spec** only when the change creates, modifies or deletes behavior — skill
   `to-spec`. It is the first commit of the `feature/` branch, or `bugfix/` if the bug was an
   unwritten rule.
4. **Implement** — skill `implement-feature`, test first, through the phases of the
   [implementation protocol](./.agents/protocols/implementation-protocol.md). The PR states
   `AC-<COD>-### → test → result` for each criterion it touches.

- **The code answers to the spec.** If the code fails a criterion, fix the code. If the criterion
  no longer describes the instrument, a person decides.
- **No spec needed for:** a refactor, a bug that changes no rule, or a UI, art, audio or
  performance improvement. Nor for anything outside `src/`.
- **A run leaves no written work for later.** Doctrine: `.agents/skills/to-spec/no-debt.md`.

## Ask the domain instead of simulating it

The `pentomino-domain` MCP server (`.mcp.json`) runs the real pure functions, with no build. Ask it
before you derive a rotation by hand (`describe_piece`), walk the lookahead (`simulate_board`),
touch geometry or the musical model (`check_invariants`), or grep for a symbol (`find_symbol`).
`mcp-server/` imports symbols of `src/`: changing a signature there can break a tool, and
`pnpm verify` typechecks across that edge. Detail: [MCP](./docs/guides/mcp-domain.md).

## The harness

`.agents/` is canonical for both Claude Code and Codex. After you edit it or `agents/`, run
`node .agents/scripts/sync.ts` and commit the copies it writes. A run of the implementation
protocol never edits `.agents/`, `agents/`, `policy/` or `.spec-anchored/`: that is a `harness/` PR.

## Documentation

| Document | When to read it |
|---|---|
| [Overview](./docs/architecture/overview.md) · [Directory structure](./docs/architecture/directory-structure.md) | The capabilities and the shell; where each thing goes |
| [Musical model](./docs/architecture/modelo-musical.md) · [Audio](./docs/architecture/audio.md) | Piece → tonic, rotation → scale or order; the Web Audio graph and the scheduler |
| [DESIGN.md](./DESIGN.md) | The visual language: the 12 colors and what a cell shows |
| [Constitution](./docs/architecture/constitution.md) · [Decisions](./docs/architecture/decisions/) | Non-negotiable principles, and why each big choice was made |
| [Quickstart](./docs/guides/quickstart.md) · [Verification](./docs/guides/verification.md) | Setup; what `verify` runs and why |
| [Conventions](./docs/guides/conventions.md) · [Troubleshooting](./docs/guides/troubleshooting.md) | How code and docs are written; traps already hit |
| [Deploy](./docs/infra/deploy.md) · [Branches](./docs/infra/branches.md) | Where the deploy lives; the two-branch model |

**Debt without a plan lives in [GitHub Issues](https://github.com/federicohermo/pentomino-games/issues)**,
not in a file. `gh` may be outside PATH on Windows: `"/c/Program Files/GitHub CLI/gh.exe"`.
