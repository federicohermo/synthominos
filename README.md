# Synthominos

A **musical instrument**, not a game. You place pentominoes on a board sized to the screen, and
each piece fires a five-note arpeggio. A closed circuit visits the pieces, so order and silence
come from geometry. A muted piece keeps its place and its time, and does not sound. There is no
score and no win.

Play it at <https://synthominos.vercel.app>.

Vite 7 · React 19 · TypeScript 5.8 · Tailwind CSS 4 · Web Audio, with no audio library.

## Run it

```sh
pnpm install
pnpm exec playwright install chromium   # once per clone
pnpm dev
pnpm verify                             # the gate before a PR
```

- **Use Node 22.18 or later.** The app needs less. The harness scripts and the MCP server run
  TypeScript with no build, and they need it.
- **Use pnpm.** `packageManager` pins the version.
- **Install Chromium once.** It is not in the lockfile, and the browser tests need it. Without the
  second command, the first `pnpm verify` of a fresh clone fails.

## Where to go

| For | Read |
|---|---|
| Work in the repo: the commands, the architecture, the rules | [AGENTS.md](./AGENTS.md) |
| What the instrument does | [capabilities](./docs/architecture/capabilities.md), and the contracts in [specs/](./specs/) |
| The principles, and why each big choice was made | [constitution](./docs/architecture/constitution.md) · [decisions](./docs/architecture/decisions/) |
| The visual language: the 12 colors and what a cell shows | [DESIGN.md](./DESIGN.md) |
| How code and documents are written | [conventions](./docs/guides/conventions.md) |
| A trap that someone already hit | [troubleshooting](./docs/guides/troubleshooting.md) |
| The hosting and the branches | [deploy](./docs/infra/deploy.md) · [branches](./docs/infra/branches.md) |
