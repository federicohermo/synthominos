# AGENTS.md

Pointers and traps: what a file cannot tell you about this repo. The contract of each capability
lives in `specs/`. The rules of each folder live in `.agents/rules/` and load on their own.

## What it is

A **musical instrument**, not a game. The user places pentominoes on a board sized to the screen,
and each piece fires a five-note arpeggio. A closed circuit visits the pieces: order and silence
come from geometry. There is no score and no win. Judge a feature by one question: does it make the
instrument more expressive?

## Commands

- **`pnpm verify` is the gate.** Run it before every PR. `package.json` declares its steps, and CI
  runs the same script. Read its verdict from the exit code, never from a grep of the output.
- **pnpm, not npm.** `node_modules` is strict: an import of a transitive dependency fails.
- **Chromium is not in the lockfile**: a fresh clone needs `pnpm exec playwright install chromium`.
- **Node ≥ 22.18** runs the harness scripts and the MCP server as TypeScript, with no build.
- `gh` may be outside PATH on Windows: `"/c/Program Files/GitHub CLI/gh.exe"`.

## Where a file goes

**The folder is the capability.** `src/circuit/` is the code of `specs/circuit/circuit.md`, and its
generated `AGENTS.md` points there. A new file goes in the capability whose rule it implements.
`src/App.tsx` is the shell. `mcp-server/` imports from `src/`, never the reverse.

A rule of the instrument goes in a `.ts` module, which the `node` test project runs. A `.tsx`
exports only its component.

## The rules that are broken most

The linter, the typecheck and the gates state the rest, each with its reason.

- **A test title cites the criterion it verifies**: `AC-<COD>-###`.
- **A test picks its project by its suffix**: `*.browser.test.tsx` runs in Chromium,
  `*.budget.test.ts` runs alone, the rest runs in `node`.
- **No node test imports `playback/engine.ts`.** The coverage of the two projects cannot merge it.
- **Deletions go in their own commit.**
- **Everything written into the repo is English**, in the style of ASD-STE100. The player reads
  Spanish: the strings of the instrument are behavior.
- **Document nothing that a reader can infer from the code**, a config or a contract. A decision
  with a cost goes in a decision record, a trap in the troubleshooting guide.
- **Write no comment by default.** A comment is one fact that the code cannot say, in three lines
  at most: a trap, a constraint from outside the file, the reason for a choice that looks wrong.

## Before a change

**An issue is not a spec.** The issue is the disposable plan of one change, in the
[task-brief](./.github/ISSUE_TEMPLATE/task-brief.md) format, closed by its PR. The spec is the
durable contract of a capability. An issue touches a spec only if it changes what the instrument
does.

1. **Interview** when anything is assumed: skill `shape`. It writes nothing.
2. **Write the issue**: skill `to-issue`.
3. **Write the spec** only when the change creates, modifies or deletes behavior: skill `to-spec`.
   It is the first commit of the `feature/` branch, or `bugfix/` if the bug was an unwritten rule.
4. **Implement**: skill `implement-feature`, test first, through the phases of the
   [implementation protocol](./.agents/protocols/implementation-protocol.md).

- **The code answers to the spec.** If the code fails a criterion, fix the code. If the criterion
  no longer describes the instrument, a person decides.
- **The branch prefix decides who writes `src/` and `mcp-server/src/`**, and a worktree opens only
  under `.claude/worktrees/`. The hook says so when it stops you:
  [branches](./docs/infra/branches.md).
- **A run leaves no written work for later.** Doctrine: `.agents/skills/to-spec/no-debt.md`.

## Ask the domain instead of simulating it

The `pentomino-domain` MCP server (`.mcp.json`) runs the real pure functions, with no build. Ask it
before you derive a rotation by hand, walk the lookahead, touch geometry or the musical model, or
grep for a symbol. Which tool answers which question: [MCP](./docs/guides/mcp-domain.md).

## The harness

`.agents/` is canonical for both Claude Code and Codex. After you edit it or `agents/`, run
`node .agents/scripts/sync.ts` and commit the copies it writes. A run of the implementation
protocol never edits `.agents/`, `agents/`, `policy/` or `.spec-anchored/`: that is a `harness/` PR.

## Documentation

| Document | When to read it |
|---|---|
| [Constitution](./docs/architecture/constitution.md) | The principles that do not bend |
| [Capabilities](./docs/architecture/capabilities.md) | What passes between two capabilities, and which one owns a rule |
| [Decisions](./docs/architecture/decisions/) | Why a big choice was made, and what it cost |
| [Conventions](./docs/guides/conventions.md) | The directives, the writing rules and the glossary |
| [Troubleshooting](./docs/guides/troubleshooting.md) | A trap someone already hit |
| [DESIGN.md](./DESIGN.md) | The visual language |
| [Deploy](./docs/infra/deploy.md) · [Branches](./docs/infra/branches.md) | What lives outside the repo: the hosting, the ruleset |

Work without a plan lives in [GitHub Issues](https://github.com/federicohermo/synthominos/issues),
not in a file.
