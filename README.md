# Synthominos

A prototype of a **musical instrument**, not a game with rules to solve. The user places
pentominoes on a board sized to the screen, and each piece fires a five-note arpeggio. A muted piece
keeps its place and its time but does not sound. The board is a **tour**, not a bar: a closed circuit
visits the pieces, and order and silence come from geometry. There is no score and no win. Judge a
feature by one question: does it make the instrument more expressive?

Vite 7 · React 19 · TypeScript 5.8 · Tailwind CSS 4 · Web Audio (no audio library).

## Run it

Vite 7 needs Node ≥ 20.19 or ≥ 22.12. The harness scripts and `mcp:test` need Node ≥ 22.18, because
they run TypeScript without a build. The package manager is **pnpm**, pinned in `packageManager`. npm
leaves a `package-lock.json`, and the deploy can prefer it.

```sh
pnpm install
pnpm exec playwright install chromium   # once per clone
pnpm dev
pnpm verify                             # the gate before a PR
```

Chromium is not in the lockfile, and the `browser` project of Vitest needs it. Without the second line,
the first `verify` of a fresh clone fails. `verify` runs `lint ‖ typecheck ‖ suite ‖ mcp:test`, then
the time budgets alone, and
`suite` gates coverage at 100 on all four metrics. The other scripts are in `package.json`.

## Where to go

| For | File |
|---|---|
| The full technical docs: architecture, guides, infra | [docs/README.md](./docs/README.md) |
| The visual language: the 12 colors and their tonic | [DESIGN.md](./DESIGN.md) |
| Work in the repo: commands, capabilities, rules | [AGENTS.md](./AGENTS.md) |
| The contract of each capability | [specs/](./specs/AGENTS.md) |

Each of those files is the only source of its subject. This README links and does not repeat, so it
is not one more place where information goes stale.
