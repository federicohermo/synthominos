# Technical documentation: Pentomino Games

A musical instrument prototype built on pentominoes. Each piece placed on the board fires a sequence
of five notes. The piece identity and its orientation give the notes.

## Documentation index

### Architecture

- [Overview](./architecture/overview.md): the capabilities, the shell and the stack
- [Directory structure](./architecture/directory-structure.md): what exists, and what is dead
- [Musical model](./architecture/modelo-musical.md): piece → tonic, rotation → scale **or** order by regime, reflection → retrograde
- [Audio](./architecture/audio.md): Web Audio graph, ADSR envelope, lookahead scheduler
- [Constitution](./architecture/constitution.md): the non-negotiable principles
- [Decisions](./architecture/decisions/): why each big choice was made, one ADR per decision

### Development guides

- [Quickstart](./guides/quickstart.md): setup and commands
- [Verification](./guides/verification.md): all of `pnpm verify`, and why each node has its shape
- [Conventions](./guides/conventions.md): how `src/` is organized, geometry, comments, state, language
- [Troubleshooting](./guides/troubleshooting.md): real errors already hit in this repo
- [Domain MCP server](./guides/mcp-domain.md): the tools that run or read the domain, and the resource `pentomino://constantes`

### Infrastructure

- [Deploy](./infra/deploy.md): where the configuration lives, what the build runs, and which of the two branches is published
- [Branches](./infra/branches.md): `staging` integrates and is the default, `main` is the release; the ruleset, and what nobody verifies

### Specs and work

- [Spec rules](../.agents/rules/specs.md): the contract of each capability, `specs/<capability>/<capability>.md`, with its `BR` rules and `AC` criteria
- [Spec template](../specs/_template/capability-spec.md): the shape of a new contract
- [Task-brief template](../.github/ISSUE_TEMPLATE/task-brief.md): the shape of the issue that plans one change
- [GitHub Issues](https://github.com/federicohermo/pentomino-games/issues): planned work and debt without a plan

---

## Tech stack

| Technology | Version | Purpose |
|---|---|---|
| Vite | 7.x | Dev server and bundler |
| React | 19.x | UI library |
| TypeScript | 5.8 | Static types |
| Tailwind CSS | 4.x | Utility-first styles, through `@tailwindcss/vite` |
| Web Audio | n/a | Synthesis and scheduling, no library (`src/`) |

---

## Main commands

```bash
pnpm dev      # Vite dev server
pnpm build    # tsc -b && vite build
pnpm lint     # ESLint (flat config v9)
pnpm preview  # Serves the build from dist/
pnpm test     # Vitest: the two projects, without instrumentation
pnpm suite    # coverage with threshold 100; this is what verify runs
pnpm verify   # lint ‖ typecheck ‖ suite ‖ mcp:test, then the time budgets: the convergence node
pnpm mcp:test # MCP server: typecheck + tests with node --test
```

Vitest runs **two projects with one command**. `*.test.ts` runs in `environment: 'node'` against
`node-web-audio-api`. `*.browser.test.tsx` runs in a real Chromium through Playwright. **None runs
in jsdom**, and this is not pending work. jsdom does not implement Web Audio, and it gives no 2D
canvas, `ResizeObserver` or `matchMedia`. To cover `Spectrum.tsx` with it, a test would have to mock
the exact code it wants to cover. The six components, `App.tsx` and the two hooks have tests: see
[the tests section](./architecture/directory-structure.md#tests).

---

## Environment variables

**None.** The app runs entirely in the client: no backend, no API keys, no endpoints. The deploy
configuration hides no exception: `vercel.json` declares no environment variable.

If one becomes necessary, Vite requires the `VITE_` prefix for the client to see it
(`import.meta.env.VITE_FOO`). The Create React App prefix `REACT_APP_` **does not** work, and it
fails silently.

---

## Quick links

- [AGENTS.md](../AGENTS.md): the guide for agents (Claude Code and Codex), and the authority on how to work in this repo
- [CLAUDE.md](../CLAUDE.md): what applies only to Claude Code
- [vercel.json](../vercel.json): deploy configuration (it lives in the repo root, not here)
